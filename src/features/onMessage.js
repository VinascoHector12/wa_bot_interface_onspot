import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';
import { client, MessageMedia } from '../services/whatsapp.js';
import { oa } from '../services/openai.js';
import { loadChatHistory, saveChatHistory } from '../utils/historyStore.js';
import { registerBotMessage } from '../utils/botOutbox.js';
import { getLastProcessedMsgId, setLastProcessedMsgId } from '../utils/pendingStore.js';
import { ASSISTANCE_NUMBER, OPENAI_MODEL, MAX_HISTORY, BOOT_TS, MEDIA_DIR, MEDIA_SUGGEST_MAX_IMAGES, MEDIA_SUGGEST_TOPK, ASR_ENABLED } from '../config.js';
import { backfillHistoryFromChat } from '../utils/backfill.js';
import { withChatLock, shouldReplyNow, markBotReplied } from '../utils/locks.js';
import { addHelpRequest, isPaused, pauseChat } from '../utils/helpDeskStore.js';
import { loadTrainingText } from '../utils/training.js';
import { detectKeywordTopics } from '../utils/keywordRules.js';
import { saveKeywordEventsBulk } from '../db/keywordRepo.js';
import dotenv from 'dotenv';
import { limitHeavy, yieldToLoop } from '../utils/concurrency.js';
import { transcribeAudioFile } from '../services/asr.js';
import {
  getIdentity,
  markIdentified
} from '../utils/identityStore.js';
import { maybeSuggestImageForText } from '../utils/mediaSuggestFlow.js';
import { detectImageTopic } from '../utils/imageKeywords.js';
import { insertMessage } from '../db/chatRepo.js';

dotenv.config();

const trainingText = loadTrainingText(import.meta.url);
const LANG_PATH = process.env.TESS_LANG_PATH || null;

const MESSAGE_BATCH_DELAY_MS = parseInt(process.env.MESSAGE_BATCH_DELAY_MS || '60000', 10);

// Map para almacenar temporizadores y mensajes acumulados por chatId
const messageBatchTimers = new Map(); // chatId -> timeoutId
const messageBatchQueue = new Map();  // chatId -> array de mensajes

/* Helpers */
function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
function extFromMime(m) {
  if (!m) return '.bin';
  if (m.includes('jpeg')) return '.jpg';
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  if (m.includes('ogg') || m.includes('opus')) return '.ogg';
  if (m.includes('mp3') || m.includes('mpeg')) return '.mp3';
  if (m.includes('wav')) return '.wav';
  if (m.includes('m4a')) return '.m4a';
  if (m.includes('webm')) return '.webm';
  if (m.includes('mp4')) return '.mp4';
  return '.bin';
}
function trimForPrompt(s, max = 3500) {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/* --- Filtro para eliminar preguntas de identidad del texto del LLM --- */
function stripIdentityQuestions(txt = '') {
  if (!txt) return txt;
  const KEYCAP = String.raw`\uFE0F?\u20E3`;

  const patterns = [
    /¿\s*con qui[eé]n tengo el gusto[\s\S]*?(?:\n|$)/gim,
    /¿\s*c[oó]mo llegaste a esta l[ií]nea[\s\S]*?(?:\n|$)/gim,
    /selecciona una opci[oó]n[\s\S]*?(?:\n|$)/gim,
    /(?:^|\n)\s*1\)\s*correo[\s\S]*?4\)\s*otro[\s\S]*?(?:\n|$)/gim,
    /\(\s*1\s*correo.*?4\s*otro\s*\)/gim,
    /(?:^|\n)\s*1\)\s*.*?(?:\n\s*2\)\s*.*?)(?:\n\s*3\)\s*.*?)(?:\n\s*4\)\s*.*?)(?=\n|$)/gims,
    /(?:^|\n)\s*[1-4]\)\s*[^\n]*\n?/gim,
    new RegExp(String.raw`(?:^|\n)\s*1${KEYCAP}\s*.*?(?:\n\s*2${KEYCAP}\s*.*?)(?:\n\s*3${KEYCAP}\s*.*?)(?:\n\s*4${KEYCAP}\s*.*?)(?=\n|$)`, 'gims'),
    new RegExp(String.raw`(?:^|\n)\s*[1-4]${KEYCAP}\s*[^\n]*\n?`, 'gim')
  ];
  let out = txt;
  for (const re of patterns) out = out.replace(re, '').trim();
  return out || 'Gracias. ¿En qué puedo ayudarte?';
}

// [LOG] helper: no rompe el flujo si falla la BD
async function logMessageSafe(args) {
  try { await insertMessage(args); } catch (e) { console.error('[chatlog] insert failed', e?.message || e); }
}

// Procesa todos los mensajes acumulados de un chat
async function processBatchedMessages(chatId) {
  const messages = messageBatchQueue.get(chatId);
  if (!messages || messages.length === 0) return;
  
  console.log(`[batch] 📦 Procesando ${messages.length} mensaje(s) acumulado(s) de ${chatId}`);
  
  // Limpiar temporizador y cola
  messageBatchQueue.delete(chatId);
  messageBatchTimers.delete(chatId);
  
  // Procesar el último mensaje (que contiene todo el contexto acumulado)
  const lastMsg = messages[messages.length - 1];
  await handleSingleMessage(lastMsg);
}

// Handler principal de un mensaje individual
async function handleSingleMessage(msg) {
  try {
    const text = msg.body?.trim() || '';
    const chatId = msg.fromMe
      ? (msg.to || (await msg.getChat()).id._serialized)
      : msg.from;
      
      //Ignorar canal de Estados (no es un chat real)
      if (chatId === 'status@broadcast' || msg.from === 'status@broadcast' || msg.author === 'status@broadcast') {
        return;
      }

      //Ignora backlog (se atiende en onReady)
      if (msg.timestamp && msg.timestamp <= BOOT_TS) return;

      const chat = await msg.getChat();

      // ---------- Identidad ----------
      const phone = chatId.replace('@c.us', '');
      let identity = getIdentity(chatId);

      //Nombre sólo desde pushname (NO usar contact.name)
      try {
        if (!identity.name) {
          const c = await client.getContactById(chatId);
          const push = (c?.pushname || '').trim();
          if (push) {
            identity = markIdentified(chatId, { name: push, phone, via: 'wa-pushname' });
          }
        }
      } catch {}

      //Carga/backfill (historial) y agrega el turno del usuario (ANTES de pausa)
      let hist = loadChatHistory(chatId);
      if (!hist || hist.length === 0) {
        try {
          const reconstructed = await backfillHistoryFromChat(chat, { maxMessages: 10 });
          hist = (reconstructed.length > 0) ? reconstructed.slice(-MAX_HISTORY) : [];
        } catch { hist = []; }
      }

      if (msg.hasQuotedMsg) {
        try {
          const quotedMsg = await msg.getQuotedMessage();
          hist.push({
            role: quotedMsg.fromMe ? 'assistant' : 'user',
            content: quotedMsg.body || '',
            ts: (typeof quotedMsg.timestamp === 'number' ? quotedMsg.timestamp * 1000 : Date.now())
          });
        } catch {}
      }

      if (!msg.fromMe && text) {
        hist.push({ role: 'user', content: text, ts: (typeof msg.timestamp === 'number' ? msg.timestamp * 1000 : Date.now()) });
        saveChatHistory(chatId, hist);

        await logMessageSafe({
          chatId, phone, role: 'user', msgType: msg.type || 'chat',
          content: text || null,
          ts: (typeof msg.timestamp === 'number' ? msg.timestamp * 1000 : Date.now())
        });

        // === Detección y guardado de palabras clave (texto) ===
        try {
          const hits = detectKeywordTopics(text);
          if (hits.length) {
            await saveKeywordEventsBulk(
              hits.map(h => ({
                chatId,
                phone,
                keyword: h.keyword,
                topic: h.topic,
                source: 'text',
                tsMs: (typeof msg.timestamp === 'number' ? msg.timestamp * 1000 : Date.now())
              }))
            );
          }
        } catch (e) {
          console.error('[keywords:text] persist failed', e?.message || e);
        }
      }

      // ---------- Ayuda ----------
      if (/^ayuda!?$/i.test(text)) {
        addHelpRequest(chatId);
        pauseChat(chatId);

        const display = identity?.name ? `${identity.name} - ${phone}` : phone;
        const helpAck = 'Gracias por tu espera. Nuestro asesor intentará comunicarse contigo lo más pronto posible por este mismo chat. Apreciamos tu paciencia y estaremos contigo en breve.';
        await client.sendMessage(chatId, helpAck);
        await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: helpAck, ts: Date.now() });
        try {
          if (ASSISTANCE_NUMBER) {
            const assistanceChat = await client.getChatById(ASSISTANCE_NUMBER);
            await assistanceChat.sendMessage(`El contacto ${display} requiere asistencia.`);
          }
        } catch {}
        setLastProcessedMsgId(chatId, msg.id._serialized);
        markBotReplied(chatId);
        return;
      }

      //Pausa
      if (isPaused(chatId)) return;

      //Solo responder al último (versión robusta)
      try {
        const msgs = await chat.fetchMessages({ limit: 8 });

        const lastInbound = [...msgs].reverse().find(m =>
          !m.fromMe &&
          m.type !== 'notification' &&
          m.from !== 'status@broadcast' &&
          (m.id && (m.id._serialized || m.id.id))
        );

        const latestId = lastInbound?.id?._serialized || lastInbound?.id?.id;

        if (latestId && latestId !== msg.id._serialized) {
          console.log('[only-latest] descartado', { chatId, got: msg.id._serialized, latest: latestId });
          return;
        }
      } catch (e) {
        console.warn('[only-latest] fallo al verificar último mensaje:', e?.message || e);
      }

      //Cooldown
      if (!shouldReplyNow(chatId, 1200)) return;

      //Media entrante:
      if (msg.hasMedia) {
        const allowedAudio = (msg.type === 'ptt' || msg.type === 'audio') && ASR_ENABLED;
        const isImage = (msg.type === 'image');

        if (!isImage && !allowedAudio) {
          let tipo;
          switch (msg.type) {
            case 'audio': tipo = 'audio'; break;
            case 'video': tipo = 'video'; break;
            case 'ptt': tipo = 'nota de voz'; break;
            case 'document': tipo = 'documento'; break;
            default: tipo = 'archivo multimedia';
          }
          const warn = `Por ahora no interpreto archivos de tipo ${tipo}. Si requieres asistencia personalizada, escribe "Ayuda".`;
          await client.sendMessage(msg.from, warn);
          await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: warn, ts: Date.now() });
          return;
        }

        //Dedup de medios
        const already = getLastProcessedMsgId(chatId);
        if (already === msg.id._serialized) return;

        await chat.sendStateTyping();

        // ----- Flujo IMAGEN: OCR + LLM -----
        if (isImage) {
          try {
            const media = await msg.downloadMedia();
            if (!media?.data) {
              const warn = 'No pude descargar la imagen. ¿Podrías reenviarla?';
              await client.sendMessage(chatId, warn);
              await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: warn, ts: Date.now() });
              return;
            }
            const incomingDir = path.join(MEDIA_DIR, 'incoming');
            ensureDir(incomingDir);
            const ext = media.filename ? path.extname(media.filename) : extFromMime(media.mimetype);
            const fname = `img_${Date.now()}_${Math.random().toString(36).slice(2)}${ext || '.jpg'}`;
            const fpath = path.join(incomingDir, fname);
            fs.writeFileSync(fpath, Buffer.from(media.data, 'base64'));
            console.log(`[image-ocr] guardada: ${path.relative(process.cwd(), fpath)} (mime=${media.mimetype || 'unknown'})`);

            //Cede antes de OCR para no bloquear otros eventos
            await yieldToLoop();

            // OCR (limitado)
            const opts = {}; 
            if (LANG_PATH) opts.langPath = LANG_PATH;
            const { data: { text: rawText } } = await limitHeavy(() =>
              Tesseract.recognize(fpath, 'spa+eng', opts)
            );
            const ocrText = (rawText || '').replace(/\s+\n/g, '\n').trim();
            console.log(`[image-ocr] leído (prev 240): "${ocrText.replace(/\s+/g,' ').slice(0,240)}${ocrText.length>240?'…':''}"`);

            // === Keywords desde OCR ===
            try {
              const hits = detectKeywordTopics(ocrText);
              if (hits.length) {
                await saveKeywordEventsBulk(
                  hits.map(h => ({
                    chatId,
                    phone,
                    keyword: h.keyword,
                    topic: h.topic,
                    source: 'image',
                    tsMs: Date.now()
                  }))
                );
              }
            } catch (e) {
              console.error('[keywords:image] persist failed', e?.message || e);
            }

            if (!ocrText) {
              const warn = 'He recibido tu imagen, pero no pude extraer texto legible. Si deseas, descríbeme lo que necesitas y te ayudo.';
              await client.sendMessage(chatId, warn);
              await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: warn, ts: Date.now() });
              setLastProcessedMsgId(chatId, msg.id._serialized);
              markBotReplied(chatId);
              return;
            }

            const ocrSnippet = `Texto extraído de tu imagen:\n"""${trimForPrompt(ocrText, 3500)}"""`;
            hist.push({ role: 'user', content: ocrSnippet, ts: Date.now() });
            saveChatHistory(chatId, hist);

            await logMessageSafe({
              chatId, phone, role: 'user', msgType: 'image',
              content: ocrSnippet, ts: Date.now()
            });

            const dynamicGuard = 'NO te presentes ni pidas nombre u origen del usuario. Nunca incluyas textos como "¿con quién tengo el gusto?" ni "¿cómo llegaste a esta línea?" ni listados 1..4. Responde solo a la consulta. Si falta identidad, el sistema la pedirá por separado.';

            const messages = [
              { role: 'system', content: trainingText },
              { role: 'system', content: dynamicGuard },
              ...hist,
              { role: 'system', content: 'Interpreta el texto extraído de la imagen del usuario y responde de forma clara y breve.' }
            ];

            //Cede antes de LLM
            await yieldToLoop();

            //LLM (limitado)
            const completion = await limitHeavy(() => 
              oa.chat.completions.create({ model: OPENAI_MODEL, messages })
            );
            const reply = completion.choices[0].message.content;

            const cleanReply = stripIdentityQuestions(reply);

            hist.push({ role: 'assistant', content: cleanReply, ts: Date.now() });
            saveChatHistory(chatId, hist);

            await maybeSuggestImageForText(client, chatId, ocrText, hist);

            const sentMsg = await client.sendMessage(chatId, cleanReply);
            registerBotMessage(chatId, sentMsg.id._serialized);

            await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: cleanReply, ts: Date.now() });

            setLastProcessedMsgId(chatId, msg.id._serialized);
            markBotReplied(chatId);
            return;
          } catch (e) {
            console.error('[image-ocr] error procesando imagen:', e);
            const errTxt = 'Hubo un problema al interpretar la imagen. ¿Podrías intentar de nuevo o describirme tu consulta?';
            await client.sendMessage(chatId, errTxt);
            await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: errTxt, ts: Date.now() });
            setLastProcessedMsgId(chatId, msg.id._serialized);
            markBotReplied(chatId);
            return;
          }
        }

        // ----- Flujo AUDIO/PTT: ASR + LLM -----
        if (allowedAudio) {
          try {
            const media = await msg.downloadMedia();
            if (!media?.data) {
              const warn = 'No pude descargar la nota de voz. ¿Podrías reenviarla?';
              await client.sendMessage(chatId, warn);
              await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: warn, ts: Date.now() });
              return;
            }
            const incomingDir = path.join(MEDIA_DIR, 'incoming');
            ensureDir(incomingDir);
            const ext = media.filename ? path.extname(media.filename) : extFromMime(media.mimetype || 'audio/ogg');
            const fname = `aud_${Date.now()}_${Math.random().toString(36).slice(2)}${ext || '.ogg'}`;
            const fpath = path.join(incomingDir, fname);
            fs.writeFileSync(fpath, Buffer.from(media.data, 'base64'));
            console.log(`[audio-asr] guardado: ${path.relative(process.cwd(), fpath)} (mime=${media.mimetype || 'unknown'})`);

            //Cede antes de ASR
            await yieldToLoop();

            //Transcripción (limitada)
            const transcript = await limitHeavy(() => transcribeAudioFile(fpath));
            console.log(`[audio-asr] transcripción (prev 240): "${(transcript || '').replace(/\s+/g,' ').slice(0,240)}${(transcript||'').length>240?'…':''}"`);

            // === Keywords desde ASR ===
            try {
              const hits = detectKeywordTopics(transcript);
              if (hits.length) {
                await saveKeywordEventsBulk(
                  hits.map(h => ({
                    chatId,
                    phone,
                    keyword: h.keyword,
                    topic: h.topic,
                    source: 'audio',
                    tsMs: Date.now()
                  }))
                );
              }
            } catch (e) {
              console.error('[keywords:audio] persist failed', e?.message || e);
            }

            if (!transcript) {
              const warn = 'Recibí tu nota de voz, pero no pude transcribirla. ¿Podrías intentar nuevamente o explicarme por escrito?';
              await client.sendMessage(chatId, warn);
              await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: warn, ts: Date.now() });
              setLastProcessedMsgId(chatId, msg.id._serialized);
              markBotReplied(chatId);
              return;
            }

            const asrSnippet = `Transcripción de tu nota de voz:\n"""${trimForPrompt(transcript, 3500)}"""`;
            hist.push({ role: 'user', content: asrSnippet, ts: Date.now() });
            saveChatHistory(chatId, hist);

            await logMessageSafe({
              chatId, phone, role: 'user', msgType: msg.type || 'ptt',
              content: asrSnippet, ts: Date.now()
            });

            const dynamicGuard = 'NO te presentes ni pidas nombre u origen del usuario. Nunca incluyas textos como "¿con quién tengo el gusto?" ni "¿cómo llegaste a esta línea?" ni listados 1..4. Responde solo a la consulta. Si falta identidad, el sistema la pedirá por separado.';
            const messages = [
              { role: 'system', content: trainingText },
              { role: 'system', content: dynamicGuard },
              ...hist,
              { role: 'system', content: 'Responde brevemente en base a la transcripción de la nota de voz del usuario.' }
            ];

            //Cede antes de LLM
            await yieldToLoop();

            //LLM (limitado)
            const completion = await limitHeavy(() =>
              oa.chat.completions.create({ model: OPENAI_MODEL, messages })
            );
            const reply = completion.choices[0].message.content;
            const cleanReply = stripIdentityQuestions(reply);

            hist.push({ role: 'assistant', content: cleanReply, ts: Date.now() });
            saveChatHistory(chatId, hist);

            await maybeSuggestImageForText(client, chatId, transcript, hist);

            const sentMsg = await client.sendMessage(chatId, cleanReply);
            registerBotMessage(chatId, sentMsg.id._serialized);

            await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: cleanReply, ts: Date.now() });

            setLastProcessedMsgId(chatId, msg.id._serialized);
            markBotReplied(chatId);
            return;
          } catch (e) {
            console.error('[audio-asr] error procesando audio:', e);
            const errTxt = 'Hubo un problema al interpretar tu nota de voz. ¿Puedes intentarlo de nuevo o escribirme tu consulta?';
            await client.sendMessage(chatId, errTxt);
            await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: errTxt, ts: Date.now() });
            setLastProcessedMsgId(chatId, msg.id._serialized);
            markBotReplied(chatId);
            return;
          }
        }
      }

      //Dedup (sin reclamar todavía)
      const already = getLastProcessedMsgId(chatId);
      if (already === msg.id._serialized) return;

      // ---------- Prompt (texto) ----------
      const dynamicGuard = 'NO te presentes ni pidas nombre u origen del usuario. Nunca incluyas textos como "¿con quién tengo el gusto?" ni "¿cómo llegaste a esta línea?" ni listados 1..4. Responde solo a la consulta. Si falta identidad, el sistema la pedirá por separado.';

      const messages = [
        { role: 'system', content: trainingText },
        { role: 'system', content: dynamicGuard },
        ...hist
      ];

      await withChatLock(chatId, async () => {
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 1200));

        //LLM (limitado)
        const completion = await limitHeavy(() => 
          oa.chat.completions.create({ 
            model: OPENAI_MODEL, 
            messages 
          })
        );
        const reply = completion.choices[0].message.content;

        const cleanReply = stripIdentityQuestions(reply);

        hist.push({ role: 'assistant', content: cleanReply, ts: Date.now() });
        saveChatHistory(chatId, hist);

        await maybeSuggestImageForText(client, chatId, text, hist);

        const sentMsg = await client.sendMessage(chatId, cleanReply);
        registerBotMessage(chatId, sentMsg.id._serialized);

        await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: cleanReply, ts: Date.now() });

        setLastProcessedMsgId(chatId, msg.id._serialized);
        markBotReplied(chatId);
      });
    } catch (err) {
      console.error('Error al procesar mensaje', err);
    }
  }

//wireOnMessage con acumulación de mensajes
export function wireOnMessage() {
  client.on('message', async (msg) => {
    try {
      const chatId = msg.fromMe
        ? (msg.to || (await msg.getChat()).id._serialized)
        : msg.from;
      
      //Ignorar canal de Estados
      if (chatId === 'status@broadcast' || msg.from === 'status@broadcast' || msg.author === 'status@broadcast') {
        return;
      }

      //Ignora backlog
      if (msg.timestamp && msg.timestamp <= BOOT_TS) return;

      console.log(`[batch] 📨 Mensaje recibido de ${chatId}: "${(msg.body || '').substring(0, 50)}..."`);

      //Cancelar temporizador anterior si existe
      const existingTimer = messageBatchTimers.get(chatId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        console.log(`[batch] ⏱️  Cancelando temporizador anterior para ${chatId}`);
      }

      //Agregar mensaje a la cola
      if (!messageBatchQueue.has(chatId)) {
        messageBatchQueue.set(chatId, []);
      }
      messageBatchQueue.get(chatId).push(msg);

      const queueLength = messageBatchQueue.get(chatId).length;
      console.log(`[batch] 📥 Cola de ${chatId} ahora tiene ${queueLength} mensaje(s)`);

      //Configurar nuevo temporizador
      const timer = setTimeout(() => {
        processBatchedMessages(chatId);
      }, MESSAGE_BATCH_DELAY_MS);

      messageBatchTimers.set(chatId, timer);
      console.log(`[batch] ⏰ Temporizador configurado para ${chatId} (${MESSAGE_BATCH_DELAY_MS}ms)`);

    } catch (err) {
      console.error('[batch] Error al manejar mensaje:', err);
    }
  });
}
