/**
 * Servicio de inicialización al arranque
 * Business Layer - Procesa chats pendientes al inicio
 */
import { client } from '../whatsapp.js';
import { PENDING_THRESHOLD_S } from '../../config.js';
import { getLastProcessedMsgId } from '../../utils/pendingStore.js';
import { isPaused } from '../../utils/helpDeskStore.js';
import { processMessage } from './messageOrchestrator.js';

// Parámetros de concurrencia para el startup
const STARTUP_SCAN_CONCURRENCY = Math.max(1, Number(process.env.STARTUP_SCAN_CONCURRENCY || 3));
const STARTUP_BATCH_SIZE = Math.max(10, Number(process.env.STARTUP_BATCH_SIZE || 40));
const STARTUP_RESPITE_MS = Math.max(0, Number(process.env.STARTUP_RESPITE_MS || 60));

/**
 * Crea un limitador de concurrencia
 */
function createLimiter(max = 5) {
  let running = 0;
  const queue = [];
  
  const next = () => {
    if (running >= max || queue.length === 0) return;
    const { fn, resolve, reject } = queue.shift();
    running++;
    
    Promise.resolve()
      .then(fn)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        next();
      });
  };
  
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

/**
 * Pausa por un tiempo determinado
 */
function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Procesa la inicialización del bot
 */
export async function processStartup() {
  try {
    console.log('[Startup] 🔍 Obteniendo lista de chats...');
    const allChats = await client.getChats();
    console.log('[Startup] 📊 Total chats:', allChats.length);
    
    const chats = allChats
      .filter(c => c?.id?._serialized !== 'status@broadcast')
      .filter(c => !String(c?.id?._serialized || '').endsWith('@newsletter'));
    
    console.log('[Startup] 📊 Chats válidos (sin broadcast/canales):', chats.length);
    
    const now = Math.floor(Date.now() / 1000);
    
    // Prioriza chats con no-leídos (más relevantes) y luego el resto
    const withUnread = chats.filter(c => (c.unreadCount || 0) > 0);
    const others = chats.filter(c => (c.unreadCount || 0) === 0);
    
    console.log('[Startup] 📬 Chats con mensajes no leídos:', withUnread.length);
    console.log('[Startup] 💬 Otros chats:', others.length);
    
    // Limitador de concurrencia
    const limitScan = createLimiter(STARTUP_SCAN_CONCURRENCY);
    
    // Procesar chats con unread primero
    if (withUnread.length > 0) {
      console.log('[Startup] 🚀 Procesando chats con mensajes no leídos...');
      await Promise.all(
        withUnread.map(chat => limitScan(() => processPendingChat(chat, now)))
      );
      console.log('[Startup] ✅ Chats no leídos procesados');
    }
    
    // Procesar otros chats en lotes
    if (others.length > 0) {
      console.log('[Startup] 🔄 Procesando otros chats en lotes...');
      for (let i = 0; i < others.length; i += STARTUP_BATCH_SIZE) {
        const batch = others.slice(i, i + STARTUP_BATCH_SIZE);
        console.log(`[Startup] Lote ${Math.floor(i / STARTUP_BATCH_SIZE) + 1}: procesando ${batch.length} chats...`);
        
        await Promise.all(
          batch.map(chat => limitScan(() => processPendingChat(chat, now)))
        );
        
        // Pausa entre lotes
        if (i + STARTUP_BATCH_SIZE < others.length && STARTUP_RESPITE_MS > 0) {
          await sleep(STARTUP_RESPITE_MS);
        }
      }
      console.log('[Startup] ✅ Otros chats procesados');
    }
    
    console.log('[Startup] 🎉 Inicialización completada');
    
  } catch (err) {
    console.error('[Startup] ❌ Error en startup:', err);
  }
}

/**
 * Procesa un chat individual buscando mensajes pendientes
 */
async function processPendingChat(chat, now) {
  try {
    const chatId = chat.id._serialized;
    
    // Validar chatId (evitar '0@c.us' u otros inválidos)
    if (!chatId || chatId === '0@c.us' || !chatId.includes('@')) {
      console.log(`[Startup] ⚠️  ChatId inválido, omitiendo: ${chatId}`);
      return;
    }
    
    // Omitir si está pausado
    if (isPaused(chatId)) return;
    
    // Obtener último mensaje
    const msgs = await chat.fetchMessages({ limit: 1 });
    const lastMsg = msgs?.[0];
    if (!lastMsg) return;
    
    const lastTs = typeof lastMsg.timestamp === 'number' ? lastMsg.timestamp : 0;
    const lastId = (lastMsg.id && (lastMsg.id._serialized || lastMsg.id.id)) || null;
    
    // Solo pendientes "recientes" y que NO sean del bot
    const ageSeconds = now - lastTs;
    const isRecent = ageSeconds < PENDING_THRESHOLD_S;
    
    if (!isRecent || lastMsg.fromMe) return;
    
    // Evitar duplicados si ya se atendió
    const alreadyProcessed = getLastProcessedMsgId(chatId);
    if (alreadyProcessed === lastId) return;
    
    const lastBody = (lastMsg.body || '').substring(0, 50);
    console.log(`[Startup] 📨 Procesando pendiente ${chatId}: "${lastBody}"`);
    
    // Procesar mensaje usando el orquestador (con flag fromStartup=true)
    await processMessage(lastMsg, { fromStartup: true });
    
    console.log(`[Startup] ✅ Procesado: ${chatId}`);
    
  } catch (err) {
    console.error(`[Startup] ❌ Error ${chat?.id?._serialized}:`, err.message);
  }
}
