/**
 * Servicio de acumulación de mensajes (Message Batching)
 * Business Layer - Gestiona la cola y temporizadores de mensajes
 */

// Map para almacenar temporizadores y mensajes acumulados por chatId
const messageBatchTimers = new Map(); // chatId -> timeoutId
const messageBatchQueue = new Map();  // chatId -> array de mensajes

/**
 * Configuración del servicio
 */
let config = {
  delayMs: 60000, // 1 minuto por defecto
  onBatchReady: null // callback cuando el batch está listo
};

/**
 * Inicializa el servicio de batching
 */
export function initMessageBatchService(options = {}) {
  config = { ...config, ...options };
  console.log(`[MessageBatchService] Inicializado con delay de ${config.delayMs}ms`);
}

/**
 * Agrega un mensaje a la cola y gestiona el temporizador
 */
export function addMessageToBatch(chatId, message) {
  console.log(`[batch] 📨 Mensaje recibido de ${chatId}: "${(message.body || '').substring(0, 50)}..."`);

  // Cancelar temporizador anterior si existe
  const existingTimer = messageBatchTimers.get(chatId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    console.log(`[batch] ⏱️  Cancelando temporizador anterior para ${chatId}`);
  }

  // Agregar mensaje a la cola
  if (!messageBatchQueue.has(chatId)) {
    messageBatchQueue.set(chatId, []);
  }
  messageBatchQueue.get(chatId).push(message);

  const queueLength = messageBatchQueue.get(chatId).length;
  console.log(`[batch] 📥 Cola de ${chatId} ahora tiene ${queueLength} mensaje(s)`);

  // Configurar nuevo temporizador
  const timer = setTimeout(() => {
    processBatch(chatId);
  }, config.delayMs);

  messageBatchTimers.set(chatId, timer);
  console.log(`[batch] ⏰ Temporizador configurado para ${chatId} (${config.delayMs}ms)`);
}

/**
 * Procesa el batch de mensajes acumulados
 */
function processBatch(chatId) {
  const messages = messageBatchQueue.get(chatId);
  if (!messages || messages.length === 0) return;

  console.log(`[batch] 📦 Procesando ${messages.length} mensaje(s) acumulado(s) de ${chatId}`);

  // Limpiar temporizador y cola
  messageBatchQueue.delete(chatId);
  messageBatchTimers.delete(chatId);

  // Llamar callback con los mensajes
  if (config.onBatchReady) {
    const lastMessage = messages[messages.length - 1];
    config.onBatchReady(chatId, lastMessage, messages);
  }
}

/**
 * Limpia recursos (útil para testing o shutdown)
 */
export function clearAllBatches() {
  for (const timer of messageBatchTimers.values()) {
    clearTimeout(timer);
  }
  messageBatchTimers.clear();
  messageBatchQueue.clear();
}

/**
 * Obtiene el estado actual de un chat
 */
export function getBatchStatus(chatId) {
  return {
    hasTimer: messageBatchTimers.has(chatId),
    messageCount: messageBatchQueue.get(chatId)?.length || 0,
    messages: messageBatchQueue.get(chatId) || []
  };
}
