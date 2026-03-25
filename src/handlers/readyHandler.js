/**
 * Ready Handler - Presentation Layer  
 * Solo maneja el evento 'ready' y delega al servicio de inicio
 */
import { client } from '../services/whatsapp.js';

/**
 * Inicializa el handler de ready
 */
export function initReadyHandler() {
  client.on('ready', handleReady);
  console.log('[ReadyHandler] ✅ Handler registrado');
}

/**
 * Maneja evento ready
 */
async function handleReady() {
  console.log('✅ WhatsApp listo');
  
  try {
    // Importación dinámica para evitar dependencias circulares
    const { processStartup } = await import('../services/business/startupService.js');
    await processStartup();
  } catch (err) {
    console.error('[ReadyHandler] Error en startup:', err);
  }
}
