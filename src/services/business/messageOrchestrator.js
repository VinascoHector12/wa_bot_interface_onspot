/**
 * Orquestador de procesamiento de mensajes
 * Business Layer - Coordina todo el flujo de procesamiento de un mensaje
 */
import { client } from '../whatsapp.js';
import { loadChatHistory, saveChatHistory } from '../../utils/historyStore.js';
import { registerBotMessage } from '../../utils/botOutbox.js';
import { setLastProcessedMsgId } from '../../utils/pendingStore.js';
import { ASSISTANCE_NUMBER, MAX_HISTORY, BOOT_TS, ASR_ENABLED } from '../../config.js';
import { getNumbersByKeyword } from '../../db/assistanceRepo.js';
import { backfillHistoryFromChat } from '../../utils/backfill.js';
import { withChatLock, shouldReplyNow, markBotReplied } from '../../utils/locks.js';
import { addHelpRequest, isPaused, pauseChat } from '../../utils/helpDeskStore.js';
import { insertMessage } from '../../db/chatRepo.js';

// Business Services
import { processImageOCR, hasProcessableImage } from './imageProcessingService.js';
import { processAudioASR, hasProcessableAudio } from './audioProcessingService.js';
import { generateOCRResponse, generateASRResponse, generateTextResponse } from './conversationService.js';
import { getUserIdentity, ensureIdentityLoaded, extractNameFromContact, processIdentityResponse, shouldRequestIdentity, buildIdentityNudge, isOnlyOriginResponse, markIdentityAsked } from './identityService.js';
import { detectAndSaveKeywords } from './keywordService.js';
import { maybeSuggestImageForText } from '../../utils/mediaSuggestFlow.js';
import { extractPhone } from '../../core/textUtils.js';

/**
 * Helper para logging seguro a BD
 */
async function logMessageSafe(args) {
  try {
    await insertMessage(args);
  } catch (e) {
    console.error('[chatlog] insert failed', e?.message || e);
  }
}

/**
 * Extrae y guarda respuesta de identidad del batch de mensajes ANTES de procesarlos
 * No genera respuesta al usuario, solo actualiza la identidad
 * @param {Array} messages - Array de mensajes acumulados
 */
export async function extractIdentityFromBatch(messages) {
  if (!messages || messages.length === 0) return;
  
  const firstMsg = messages[0];
  const chatId = firstMsg.fromMe
    ? (firstMsg.to || (await firstMsg.getChat()).id._serialized)
    : firstMsg.from;
  
  // Obtener identidad actual (carga desde BD si no está en caché)
  await ensureIdentityLoaded(chatId);
  let identity = getUserIdentity(chatId);

  // Solo buscar si está esperando respuesta de origen
  if (!identity.expectingOrigin || identity.origin) {
    return;
  }
  
  console.log(`[batch-identity] Buscando respuesta de origen en ${messages.length} mensajes de ${chatId}...`);
  
  // Buscar en todos los mensajes del batch
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const text = msg.body?.trim() || '';
    
    if (msg.fromMe || !text) continue;
    
    let isOriginResponse = false;
    
    // 1. Verificar si es respuesta de origen directa
    if (isOnlyOriginResponse(text)) {
      console.log(`[batch-identity] ✅ Respuesta directa de origen en mensaje ${i + 1}: "${text}"`);
      isOriginResponse = true;
    }
    
    // 2. Verificar si citó el mensaje de opciones
    if (!isOriginResponse && msg.hasQuotedMsg) {
      try {
        const quotedMsg = await msg.getQuotedMessage();
        const quotedText = quotedMsg.body || '';
        
        // Si citó un mensaje que contiene las opciones de origen
        if (quotedText.includes('cómo llegaste a esta línea') || 
            quotedText.includes('Selecciona una opción')) {
          console.log(`[batch-identity] ✅ Usuario citó mensaje de opciones en mensaje ${i + 1}: "${text}"`);
          isOriginResponse = true;
        }
      } catch (err) {
        console.error('[batch-identity] Error verificando mensaje citado:', err);
      }
    }
    
    // Si encontramos respuesta de origen, procesarla
    if (isOriginResponse) {
      const { updated, acknowledged } = processIdentityResponse(chatId, text, identity);
      
      if (acknowledged) {
        console.log(`[batch-identity] ✅ Origen guardado exitosamente`);
        // Actualizar identidad local para la próxima iteración
        identity = updated;
        // Ya no necesitamos seguir buscando
        break;
      }
    }
  }
}

/**
 * Procesa un mensaje individual (punto de entrada principal)
 * @param {Object} msg - Mensaje de WhatsApp
 * @param {Object} options - Opciones de procesamiento
 * @param {boolean} options.fromStartup - Si viene del startup (para permitir mensajes antiguos)
 */
export async function processMessage(msg, options = {}) {
  const { fromStartup = false } = options;
  
  const text = msg.body?.trim() || '';
  const chatId = msg.fromMe
    ? (msg.to || (await msg.getChat()).id._serialized)
    : msg.from;

  // Filtros básicos
  if (chatId === 'status@broadcast' || msg.from === 'status@broadcast' || msg.author === 'status@broadcast') {
    return;
  }

  // Filtro BOOT_TS: solo para mensajes en vivo (no para startup)
  // El startup usa PENDING_THRESHOLD_S para controlar qué tan antiguos procesar
  if (!fromStartup && msg.timestamp && msg.timestamp <= BOOT_TS) {
    return;
  }

  const chat = await msg.getChat();

  // === 1. GESTIÓN DE IDENTIDAD ===
  // Cargar identidad desde BD si no está en caché
  await ensureIdentityLoaded(chatId);
  let identity = getUserIdentity(chatId);
  // extractNameFromContact también resuelve el teléfono real (corrige @lid)
  identity = await extractNameFromContact(client, chatId, identity);
  const phone = identity.phone || extractPhone(chatId);
  console.log(`[identity] chatId=${chatId} → phone=${phone} name=${identity.name || '(sin nombre)'} origin=${identity.origin || '(sin origen)'}`);

  // === 2. CARGA DE HISTORIAL ===
  let hist = await loadHistoryWithBackfill(chatId, chat);

  // Agregar mensaje citado si existe
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

  // Agregar mensaje actual al historial
  if (!msg.fromMe && text) {
    hist.push({
      role: 'user',
      content: text,
      ts: (typeof msg.timestamp === 'number' ? msg.timestamp * 1000 : Date.now())
    });
    saveChatHistory(chatId, hist);

    await logMessageSafe({
      chatId, phone,
      role: 'user',
      msgType: msg.type || 'chat',
      content: text,
      ts: Date.now()
    });
  }

  // === 3. VERIFICAR SI ESTÁ PAUSADO (HELPDESK) ===
  if (isPaused(chatId)) {
    console.log('[helpdesk] Chat pausado, saltando procesamiento automático');
    return;
  }

  // === 4. PROCESAMIENTO SEGÚN TIPO DE MENSAJE ===
  return withChatLock(chatId, async () => {
    // 4.1 SOLICITUD DE AYUDA
    if (text.toLowerCase().includes('ayuda')) {
      await handleHelpRequest(chatId, phone, text, msg, hist);
      return;
    }

    // 4.2 RESPUESTA DE IDENTIDAD
    if (await handleIdentityResponse(chatId, phone, text, identity, hist, msg)) {
      return;
    }

    // 4.3 PROCESAMIENTO DE IMAGEN (OCR)
    if (hasProcessableImage(msg)) {
      await handleImageMessage(chatId, phone, msg, hist, identity);
      return;
    }

    // 4.4 PROCESAMIENTO DE AUDIO (ASR)
    if (ASR_ENABLED && hasProcessableAudio(msg)) {
      await handleAudioMessage(chatId, phone, msg, hist, identity);
      return;
    }

    // 4.5 PROCESAMIENTO DE TEXTO
    if (text && !msg.fromMe) {
      await handleTextMessage(chatId, phone, text, msg, hist, identity);
      return;
    }
  });
}

/**
 * Carga historial con backfill si es necesario
 */
async function loadHistoryWithBackfill(chatId, chat) {
  let hist = await loadChatHistory(chatId);
  
  if (!hist || hist.length === 0) {
    try {
      const reconstructed = await backfillHistoryFromChat(chat, { maxMessages: 10 });
      hist = (reconstructed.length > 0) ? reconstructed.slice(-MAX_HISTORY) : [];
    } catch {
      hist = [];
    }
  }
  
  return hist;
}

/**
 * Maneja solicitud de ayuda humana
 */
async function handleHelpRequest(chatId, phone, text, msg, hist) {
  try {
    // Validar chatId
    if (!chatId || chatId === '0@c.us' || !chatId.includes('@')) {
      console.error('[helpdesk] ChatId inválido:', chatId);
      return;
    }

    // Registrar keyword "ayuda" en BD (antes interceptaba el flujo sin guardar)
    await detectAndSaveKeywords(chatId, phone, text, 'text');

    const contact = await client.getContactById(chatId);
    const display = contact?.pushname || phone;
    
    // Notificar números de asistencia asociados a la keyword 'ayuda' (desde BD)
    const assistanceNums = await getNumbersByKeyword('ayuda').catch(() => []);
    if (assistanceNums.length > 0) {
      for (const n of assistanceNums) {
        try {
          const waId = n.phone.includes('@') ? n.phone : `${n.phone}@c.us`;
          await client.sendMessage(waId, `El contacto ${display} requiere asistencia.`);
        } catch (e) {
          console.error('[helpdesk] Error notificando a', n.phone, e.message);
        }
      }
    } else if (ASSISTANCE_NUMBER && ASSISTANCE_NUMBER !== '0@c.us') {
      // Fallback al número de config si no hay ninguno en BD
      try {
        const assistanceChat = await client.getChatById(ASSISTANCE_NUMBER);
        if (assistanceChat) {
          await assistanceChat.sendMessage(`El contacto ${display} requiere asistencia.`);
        }
      } catch (assistError) {
        console.error('[helpdesk] Error enviando notificación a asistencia:', assistError.message);
      }
    }
    
    addHelpRequest(chatId, {
      name: display,
      phone,
      timestamp: Date.now(),
      lastMessage: text
    });
    
    pauseChat(chatId);
    
    const ack = 'Gracias por tu espera. Nuestro asesor intentará comunicarse contigo lo más pronto posible por este mismo chat. Apreciamos tu paciencia y estaremos contigo en breve.';
    await client.sendMessage(chatId, ack);
    
    hist.push({ role: 'assistant', content: ack, ts: Date.now() });
    saveChatHistory(chatId, hist);
    
    await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: ack, ts: Date.now() });
    setLastProcessedMsgId(chatId, msg.id._serialized);
    markBotReplied(chatId);
  } catch (err) {
    console.error('[helpdesk] Error:', err);
  }
}

/**
 * Maneja respuesta de identidad del usuario
 */
async function handleIdentityResponse(chatId, phone, text, identity, hist, msg) {
  const expectingOrigin = identity.expectingOrigin && !identity.origin;
  const wasMissingOrigin = !identity.origin;

  // Caso 1: respuesta de origen en tiempo real (processMessage llega primero)
  if (expectingOrigin && wasMissingOrigin && isOnlyOriginResponse(text)) {
    const { acknowledged } = processIdentityResponse(chatId, text, identity);

    if (acknowledged) {
      const ack = 'Gracias. ¿En qué puedo ayudarte?';
      await client.sendMessage(chatId, ack);

      hist.push({ role: 'assistant', content: ack, ts: Date.now() });
      saveChatHistory(chatId, hist);

      await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: ack, ts: Date.now() });
      setLastProcessedMsgId(chatId, msg.id._serialized);
      markBotReplied(chatId);
      return true;
    }
  }

  // Caso 2: extractIdentityFromBatch ya procesó el origen — evitar pasar el dígito al LLM
  if (!wasMissingOrigin && isOnlyOriginResponse(text)) {
    const ack = 'Gracias. ¿En qué puedo ayudarte?';
    await client.sendMessage(chatId, ack);

    hist.push({ role: 'assistant', content: ack, ts: Date.now() });
    saveChatHistory(chatId, hist);

    await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: ack, ts: Date.now() });
    setLastProcessedMsgId(chatId, msg.id._serialized);
    markBotReplied(chatId);
    return true;
  }

  return false;
}

/**
 * Maneja mensaje con imagen (OCR)
 */
async function handleImageMessage(chatId, phone, msg, hist, identity) {
  try {
    if (!shouldReplyNow(chatId, 1200)) return;
    
    const { text: ocrText, trimmed } = await processImageOCR(msg);
    
    // Detectar keywords
    await detectAndSaveKeywords(chatId, phone, ocrText, 'image');
    
    if (!ocrText.trim()) {
      const warn = 'Recibí tu imagen pero no pude extraer texto. ¿Podrías enviarla de nuevo o explicarme por escrito?';
      await client.sendMessage(chatId, warn);
      await logMessageSafe({ chatId, phone, role: 'assistant', msgType: 'chat', content: warn, ts: Date.now() });
      setLastProcessedMsgId(chatId, msg.id._serialized);
      markBotReplied(chatId);
      return;
    }
    
    const ocrSnippet = `Texto extraído de tu imagen:\n"""${trimmed}"""`;
    hist.push({ role: 'user', content: ocrSnippet, ts: Date.now() });
    saveChatHistory(chatId, hist);
    
    await logMessageSafe({
      chatId, phone,
      role: 'user',
      msgType: msg.type || 'image',
      content: ocrSnippet,
      ts: Date.now()
    });
    
    // Generar respuesta
    const userName = identity?.name || 'Usuario WhatsApp';
    const reply = await generateOCRResponse(hist, ocrText, phone, userName);
    await sendReplyWithIdentityCheck(chatId, phone, reply, ocrText, msg, hist, identity);
    
  } catch (err) {
    console.error('[image-ocr] Error:', err);
    await sendErrorMessage(chatId, phone, 'imagen');
  }
}

/**
 * Maneja mensaje con audio (ASR)
 */
async function handleAudioMessage(chatId, phone, msg, hist, identity) {
  try {
    if (!shouldReplyNow(chatId, 1200)) return;
    
    const { transcript, trimmed } = await processAudioASR(msg);
    
    // Detectar keywords
    await detectAndSaveKeywords(chatId, phone, transcript, 'audio');
    
    const asrSnippet = `Transcripción de tu nota de voz:\n"""${trimmed}"""`;
    hist.push({ role: 'user', content: asrSnippet, ts: Date.now() });
    saveChatHistory(chatId, hist);
    
    await logMessageSafe({
      chatId, phone,
      role: 'user',
      msgType: msg.type || 'ptt',
      content: asrSnippet,
      ts: Date.now()
    });
    
    // Generar respuesta
    const userName = identity?.name || 'Usuario WhatsApp';
    const reply = await generateASRResponse(hist, transcript, phone, userName);
    await sendReplyWithIdentityCheck(chatId, phone, reply, transcript, msg, hist, identity);
    
  } catch (err) {
    console.error('[audio-asr] Error:', err);
    await sendErrorMessage(chatId, phone, 'nota de voz');
  }
}

/**
 * Maneja mensaje de texto simple
 */
async function handleTextMessage(chatId, phone, text, msg, hist, identity) {
  try {
    // Detectar keywords
    await detectAndSaveKeywords(chatId, phone, text, 'text');
    
    // Generar respuesta
    const userName = identity?.name || 'Usuario WhatsApp';
    const reply = await generateTextResponse(hist, phone, userName);
    await sendReplyWithIdentityCheck(chatId, phone, reply, text, msg, hist, identity);
    
  } catch (err) {
    console.error('[text-processing] Error:', err);
  }
}
  
/**
 * Envía respuesta y verifica si debe pedir identidad
 */
async function sendReplyWithIdentityCheck(chatId, phone, reply, originalText, msg, hist, identity) {
  hist.push({ role: 'assistant', content: reply, ts: Date.now() });
  saveChatHistory(chatId, hist);
  
  await maybeSuggestImageForText(client, chatId, originalText, hist);
  
  const sentMsg = await client.sendMessage(chatId, reply);
  registerBotMessage(chatId, sentMsg.id._serialized);
  
  await logMessageSafe({
    chatId, phone,
    role: 'assistant',
    msgType: 'chat',
    content: reply,
    ts: Date.now()
  });
  
  // Verificar si debe pedir identidad
  const needIdentity = shouldRequestIdentity(originalText, identity);
  if (needIdentity) {
    const nudge = buildIdentityNudge(identity);
    if (nudge) {
      await client.sendMessage(chatId, nudge);
      await logMessageSafe({
        chatId, phone,
        role: 'assistant',
        msgType: 'chat',
        content: nudge,
        ts: Date.now()
      });
      markIdentityAsked(chatId, 'origin');
    }
  }
  
  setLastProcessedMsgId(chatId, msg.id._serialized);
  markBotReplied(chatId);
}

/**
 * Envía mensaje de error genérico
 */
async function sendErrorMessage(chatId, phone, mediaType) {
  const errTxt = `Hubo un problema al interpretar tu ${mediaType}. ¿Puedes intentarlo de nuevo o escribirme tu consulta?`;
  await client.sendMessage(chatId, errTxt);
  await logMessageSafe({
    chatId, phone,
    role: 'assistant',
    msgType: 'chat',
    content: errTxt,
    ts: Date.now()
  });
}
