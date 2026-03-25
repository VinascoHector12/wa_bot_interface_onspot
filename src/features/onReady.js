import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';

import { client } from '../services/whatsapp.js';
import { oa } from '../services/openai.js';
import { loadChatHistory, saveChatHistory } from '../utils/historyStore.js';
import { backfillHistoryFromChat } from '../utils/backfill.js';
import { getLastProcessedMsgId, setLastProcessedMsgId } from '../utils/pendingStore.js';
import { PENDING_THRESHOLD_S, MAX_HISTORY, OPENAI_MODEL, MEDIA_DIR } from '../config.js';
import { withChatLock, markBotReplied } from '../utils/locks.js';
import { loadTrainingText } from '../utils/training.js';
import { isPaused } from '../utils/helpDeskStore.js';
import { limitHeavy, yieldToLoop } from '../utils/concurrency.js';
import { detectKeywordTopics } from '../utils/keywordRules.js';
import { saveKeywordEventsBulk } from '../db/keywordRepo.js';

const trainingText = loadTrainingText(import.meta.url);
const LANG_PATH = process.env.TESS_LANG_PATH || null;
//Flag opcional vía env para cortar el OCR en el arranque (mejor performance)
const ENABLE_ONREADY_IMAGE_OCR = String(process.env.ENABLE_ONREADY_IMAGE_OCR ?? 'false').toLowerCase() === 'true';

//Parámetros de rendimiento por ENV (sin tocar la lógica)
const STARTUP_SCAN_CONCURRENCY = Math.max(1, Number(process.env.STARTUP_SCAN_CONCURRENCY || 3));
const STARTUP_BATCH_SIZE       = Math.max(10, Number(process.env.STARTUP_BATCH_SIZE || 40));
const STARTUP_RESPITE_MS       = Math.max(0, Number(process.env.STARTUP_RESPITE_MS || 60));

/* ================= Helpers ================= */
function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
function extFromMime(m) {
  if (!m) return '.bin';
  if (m.includes('jpeg')) return '.jpg';
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  return '.bin';
}
function trimForPrompt(s, max = 3500) {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}
// Concurrencia limitada y respiritos entre lotes (no agresivo)
function sleep(ms = 0) { return new Promise(r => setTimeout(r, ms)); }
function createLimiter(max = 5) {
  let running = 0; const q = [];
  const next = () => {
    if (running >= max || q.length === 0) return;
    const { fn, res, rej } = q.shift(); running++;
    Promise.resolve()
      .then(fn)
      .then((v) => res(v))
      .catch(rej)
      .finally(() => { running--; next(); });
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}
// ⬇️ Ajustamos concurrencia de escaneo por ENV (tu valor por defecto era 5)
const limitScan = createLimiter(STARTUP_SCAN_CONCURRENCY);

/* --- Filtro para eliminar preguntas de identidad / listados 1..4 del LLM --- */
function stripIdentityQuestions(txt = '') {
  if (!txt) return txt;
  // Keycap digits 1️⃣..4️⃣ = "1\uFE0F?\u20E3"
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

// Guard rail igual al de onMessage: no pidas nombre ni origen ni te presentes
const dynamicGuard =
  'NO te presentes ni pidas nombre u origen del usuario. Nunca incluyas textos como "¿con quién tengo el gusto?" ni "¿cómo llegaste a esta línea?" ni listados 1..4. Responde solo a la consulta. Si falta identidad, el sistema la pedirá por separado.';

/* ================= onReady ================= */
export function wireOnReady() {
  client.on('ready', async () => {
    console.log('✅ WhatsApp listo');

    try {
      const chats = (await client.getChats())
        .filter(c => c?.id?._serialized !== 'status@broadcast');  // ⛔ fuera estados
      const now = Math.floor(Date.now() / 1000);

      // Prioriza chats con no-leídos (más relevantes) y luego el resto
      const withUnread = chats.filter(c => (c.unreadCount || 0) > 0);
      const others    = chats.filter(c => (c.unreadCount || 0) === 0);

      const processChat = async (chat) => {
        //Cede al loop antes de cada chat para no bloquear mensajes en vivo
        await yieldToLoop();

        const chatId = chat.id._serialized;

        //Guard 1: si el chat está pausado, omite
        if (isPaused(chatId)) return;

        const msgs = await chat.fetchMessages({ limit: 1 });
        const lastMsg = msgs?.[0];
        if (!lastMsg) return;

        const lastBody = (lastMsg.body || '').trim();
        const lastTs   = typeof lastMsg.timestamp === 'number' ? lastMsg.timestamp : 0;
        const lastId   = (lastMsg.id && (lastMsg.id._serialized || lastMsg.id.id)) || null;

        // Solo pendientes "recientes" y que NO sean del bot
        const isRecent = (now - lastTs) < PENDING_THRESHOLD_S;
        if (!isRecent || lastMsg.fromMe) return;

        // Evitar duplicados si ya se atendió
        const alreadyProcessed = getLastProcessedMsgId(chatId);
        if (alreadyProcessed === lastId) return;

        await withChatLock(chatId, async () => {
          // Doble verificación dentro del lock
          const againProcessed = getLastProcessedMsgId(chatId);
          if (againProcessed === lastId) return;

          //Guard 2 (re-chequeo dentro del lock): si entre tanto se pausó, no respondas
          if (isPaused(chatId)) return; // no marcamos como procesado para que quede pendiente al despausar

          // Reconstruye historial (contexto)
          let hist = loadChatHistory(chatId);
          try {
            const reconstructed = await backfillHistoryFromChat(chat, { maxMessages: 10 });
            if (reconstructed.length > 0) {
              const trimmed = reconstructed.slice(-MAX_HISTORY);
              saveChatHistory(chatId, trimmed);
              hist = trimmed;
            } else {
              hist = hist || [];
            }
          } catch {
            hist = hist || [];
          }

          // Inserta el último turno del usuario (si es texto y no está ya)
          if (lastBody) {
            const lastTurn = hist[hist.length - 1];
            if (!(lastTurn && lastTurn.role === 'user' && (lastTurn.content || '').trim() === lastBody)) {
              hist.push({
                role: 'user',
                content: lastBody,
                ts: (typeof lastTs === 'number' ? lastTs * 1000 : Date.now())
              });
              saveChatHistory(chatId, hist);
            }
          }

          try {
            // === Ramas por tipo de mensaje ===
            if (lastMsg.type === 'image') {
              if (!ENABLE_ONREADY_IMAGE_OCR) {
                // ⚠️ Si no queremos gastar CPU en el arranque, avisamos y salimos
                await chat.sendMessage('📩 He visto tu imagen/documento anterior. Para ayudarte más rápido, cuéntame en un mensaje qué necesitas y te respondo.');
                setLastProcessedMsgId(chatId, lastId);
                markBotReplied(chatId);
                return;
              }

              // Re-chequeo ultra-tardío por si se pausó justo ahora
              if (isPaused(chatId)) return;

              // ----- Flujo IMAGEN: OCR + LLM -----
              console.log(`[onReady] Pendiente de imagen en ${chatId}. Descargando…`);
              const media = await lastMsg.downloadMedia(); // { data(base64), mimetype, filename }
              if (!media?.data) {
                console.warn(`[onReady] No pude descargar imagen para ${chatId}`);
                // Reclamar para no quedar en loop
                setLastProcessedMsgId(chatId, lastId);
                markBotReplied(chatId);
                return;
              }

              // Guardar temporalmente
              const incomingDir = path.join(MEDIA_DIR, 'incoming');
              ensureDir(incomingDir);
              const ext   = media.filename ? path.extname(media.filename) : extFromMime(media.mimetype);
              const fname = `backfill_${Date.now()}_${Math.random().toString(36).slice(2)}${ext || '.jpg'}`;
              const fpath = path.join(incomingDir, fname);
              fs.writeFileSync(fpath, Buffer.from(media.data, 'base64'));
              console.log(`[onReady:image] guardada: ${path.relative(process.cwd(), fpath)} (mime=${media.mimetype || 'unknown'})`);

              // OCR (limitado: no más de HEAVY_CONCURRENCY simultáneos)
              const opts = {}; if (LANG_PATH) opts.langPath = LANG_PATH;
              const { data: { text: rawText } } = await limitHeavy(() =>
                Tesseract.recognize(fpath, 'spa+eng', opts)
              );

              const ocrText = (rawText || '').replace(/\s+\n/g, '\n').trim();
              console.log(`[onReady:image] OCR (prev 240): "${ocrText.replace(/\s+/g,' ').slice(0,240)}${ocrText.length>240?'…':''}"`);

              // === Keywords desde OCR (igual que onMessage; fuente: image) ===
              try {
                const phone = chatId.replace('@c.us', '');
                const hits = detectKeywordTopics(ocrText);
                if (hits.length) {
                  await saveKeywordEventsBulk(
                    hits.map(h => ({
                      chatId,
                      phone,
                      keyword: h.keyword,
                      topic: h.topic,
                      source: 'image',
                      tsMs: (typeof lastTs === 'number' ? lastTs * 1000 : Date.now())
                    }))
                  );
                }
              } catch (e) {
                console.error('[keywords:image:onReady] persist failed', e?.message || e);
              }

              if (!ocrText) {
                await client.sendMessage(chatId, 'He recibido tu imagen anterior, pero no pude extraer texto legible. Si deseas, descríbeme lo que necesitas y te ayudo.');
                setLastProcessedMsgId(chatId, lastId);
                markBotReplied(chatId);
                return;
              }

              // Añadir OCR al historial como turno del usuario
              const ocrSnippet = trimForPrompt(ocrText, 3500);
              hist.push({ role: 'user', content: `Texto extraído de tu imagen:\n"""${ocrSnippet}"""`, ts: Date.now() });
              saveChatHistory(chatId, hist);

              // Preparar prompt y responder (re-chequeo de pausa justo antes)
              if (isPaused(chatId)) return;

              //LLM limitado por el mismo semáforo pesado
              const messagesForAI = [
                { role: 'system', content: trainingText },
                { role: 'system', content: dynamicGuard },
                ...hist,
                { role: 'system', content: 'Interpreta el texto extraído de la imagen del usuario y responde de forma clara y breve.' }
              ];
              const completion = await limitHeavy(() =>
                oa.chat.completions.create({ model: OPENAI_MODEL, messages: messagesForAI })
              );
              const reply = completion.choices[0].message.content;
              const cleanReply = stripIdentityQuestions(reply);

              hist.push({ role: 'assistant', content: cleanReply, ts: Date.now() });
              saveChatHistory(chatId, hist);

              await client.sendMessage(chatId, cleanReply);
              console.log(`🟢 Respondido backlog de IMAGEN en ${chatId}`);

              //Reclamar SOLO después de responder
              setLastProcessedMsgId(chatId, lastId);
              markBotReplied(chatId);
              return;
            }

            if (lastMsg.type === 'chat') {
              // ----- Flujo TEXTO -----
              if (isPaused(chatId)) return;

              // === Keywords desde texto (igual que onMessage; fuente: text) ===
              try {
                const phone = chatId.replace('@c.us', '');
                const hits = detectKeywordTopics(lastBody);
                if (hits.length) {
                  await saveKeywordEventsBulk(
                    hits.map(h => ({
                      chatId,
                      phone,
                      keyword: h.keyword,
                      topic: h.topic,
                      source: 'text',
                      tsMs: (typeof lastTs === 'number' ? lastTs * 1000 : Date.now())
                    }))
                  );
                }
              } catch (e) {
                console.error('[keywords:text:onReady] persist failed', e?.message || e);
              }

              const messagesForAI = [
                { role: 'system', content: trainingText },
                { role: 'system', content: dynamicGuard },
                ...hist
              ];
              //LLM limitado por el semáforo pesado
              const completion = await limitHeavy(() =>
                oa.chat.completions.create({ model: OPENAI_MODEL, messages: messagesForAI })
              );
              const reply = completion.choices[0].message.content;
              const cleanReply = stripIdentityQuestions(reply);

              hist.push({ role: 'assistant', content: cleanReply, ts: Date.now() });
              saveChatHistory(chatId, hist);

              await client.sendMessage(chatId, cleanReply);
              console.log(`🟢 Respondido pendiente de TEXTO en ${chatId}`);

              //Reclamar SOLO después de responder
              setLastProcessedMsgId(chatId, lastId);
              markBotReplied(chatId);
              return;
            }

            // Otros tipos (audio, ptt, video, doc): por ahora se ignoran en onReady
            setLastProcessedMsgId(chatId, lastId);
            markBotReplied(chatId);
          } catch (err) {
            console.error('❌ Error respondiendo automáticamente:', err);
            // No reclamamos si hubo error para reintentar en el próximo arranque
          }
        });
      };

      //Procesa rápido los no-leídos con concurrencia limitada
      await Promise.all(withUnread.map(ch => limitScan(() => processChat(ch))));

      //Luego el resto en lotes con “respirito” entre lotes (suave con WA Web)
      const BATCH = STARTUP_BATCH_SIZE; // ajustable por ENV
      for (let i = 0; i < others.length; i += BATCH) {
        const slice = others.slice(i, i + BATCH);
        await Promise.all(slice.map(ch => limitScan(() => processChat(ch))));
        await sleep(STARTUP_RESPITE_MS); // micro-respiro
      }
    } catch (e) {
      console.error('❌ Error al escanear pendientes:', e);
    }
  });
}
