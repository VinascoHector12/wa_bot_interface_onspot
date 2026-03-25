/**
 * Bridge Client - Cliente HTTP para comunicarse con el whatsapp_bridge_service
 * Reemplaza las llamadas directas a OpenAI
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Cargar .env desde el directorio correcto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '../.env') });

const BRIDGE_URL = process.env.BRIDGE_SERVICE_URL || 'http://localhost:3005';
const API_KEY = process.env.WHATSAPP_API_KEY;

if (!API_KEY) {
  console.error('⚠️  WHATSAPP_API_KEY no está configurada en .env');
}

/**
 * Envía un mensaje al bridge service y obtiene la respuesta del LLM
 * @param {string} phone - Número de teléfono del usuario (sin @c.us)
 * @param {string} message - Mensaje del usuario
 * @param {string} userName - Nombre del usuario (opcional)
 * @returns {Promise<string>} Respuesta del LLM
 */
export async function sendMessageToBridge(phone, message, userName = 'Usuario WhatsApp') {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/whatsapp/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        phone,
        message,
        userName
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bridge service error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.answer;

  } catch (error) {
    console.error('[BridgeClient] Error calling bridge service:', error);
    
    // Fallback: si el bridge falla, lanzar error para que el flujo normal continúe
    throw new Error(`No se pudo procesar el mensaje: ${error.message}`);
  }
}

/**
 * Verifica si el bridge service está disponible
 * @returns {Promise<boolean>}
 */
export async function checkBridgeHealth() {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/health`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === 'healthy' && 
           data.databases?.auth === 'connected' && 
           data.databases?.chat === 'connected';

  } catch (error) {
    console.error('[BridgeClient] Health check failed:', error.message);
    return false;
  }
}
