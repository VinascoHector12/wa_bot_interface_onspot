/**
 * Message Handler - Presentation Layer
 * Solo maneja eventos de WhatsApp y delega al orquestador
 */
import { client } from '../services/whatsapp.js';
import { initMessageBatchService, addMessageToBatch } from '../services/business/messageBatchService.js';
import { processMessage, extractIdentityFromBatch } from '../services/business/messageOrchestrator.js';

const MESSAGE_BATCH_DELAY_MS = parseInt(process.env.MESSAGE_BATCH_DELAY_MS || '60000', 10);

/**
 * Inicializa el handler de mensajes
 */
export function initMessageHandler() {
  // Configurar servicio de batching
  initMessageBatchService({
    delayMs: MESSAGE_BATCH_DELAY_MS,
    onBatchReady: async (chatId, lastMessage, allMessages) => {
      try {
        // Pre-procesar: extraer y guardar respuesta de identidad si existe en el batch
        await extractIdentityFromBatch(allMessages);
        
        // Procesar el último mensaje (que tiene todo el contexto acumulado)
        await processMessage(lastMessage);
      } catch (err) {
        console.error('[MessageHandler] Error procesando mensaje:', err);
      }
    }
  });

  // Registrar listener de eventos
  client.on('message', handleIncomingMessage);
  console.log('[MessageHandler] ✅ Handler registrado');
}

/**
 * Maneja mensaje entrante
 */
async function handleIncomingMessage(msg) {
  try {
    const chatId = msg.fromMe
      ? (msg.to || (await msg.getChat()).id._serialized)
      : msg.from;

    // Filtro básico
    if (chatId === 'status@broadcast' || msg.from === 'status@broadcast') {
      return;
    }

    // Agregar a batch (acumula y procesa después del delay)
    addMessageToBatch(chatId, msg);

  } catch (err) {
    console.error('[MessageHandler] Error manejando mensaje:', err);
  }
}
