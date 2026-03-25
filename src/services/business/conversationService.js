/**
 * Servicio de procesamiento de conversaciones con LLM
 * Business Layer - Maneja la interacción con el modelo de lenguaje
 * Ahora usa el bridge service para integración con el stack multitenant
 */
import { oa } from '../openai.js';
import { OPENAI_MODEL } from '../../config.js';
import { loadTrainingFromDB } from '../../utils/training.js';
import { stripIdentityQuestions } from '../../core/textUtils.js';
import { limitHeavy, yieldToLoop } from '../../utils/concurrency.js';
import { sendMessageToBridge } from '../bridgeClient.js';

const USE_BRIDGE = process.env.USE_BRIDGE_SERVICE === 'true';

// Guard rail para evitar que el LLM pida identidad
const DYNAMIC_GUARD = 'NO te presentes ni pidas nombre u origen del usuario. Nunca incluyas textos como "¿con quién tengo el gusto?" ni "¿cómo llegaste a esta línea?" ni listados 1..4. Responde solo a la consulta. Si falta identidad, el sistema la pedirá por separado.';

/**
 * Genera una respuesta usando el LLM
 * @param {Array} history - Historial de conversación
 * @param {string} systemPrompt - Prompt adicional del sistema (opcional)
 * @param {string} phone - Número de teléfono (requerido para bridge)
 * @param {string} userName - Nombre del usuario (opcional)
 * @returns {Promise<string>} Respuesta generada
 */
export async function generateLLMResponse(history, systemPrompt = null, phone = null, userName = null) {
  // Si está habilitado el bridge y tenemos phone, usar bridge service
  if (USE_BRIDGE && phone) {
    try {
      const lastUserMessage = history.filter(m => m.role === 'user').pop();
      const message = lastUserMessage?.content || '';

      if (message) {
        await yieldToLoop();
        const bridgeReply = await limitHeavy(() =>
          sendMessageToBridge(phone, message, userName || 'Usuario WhatsApp')
        );
        return stripIdentityQuestions(bridgeReply);
      }
    } catch (error) {
      console.warn('[ConversationService] Bridge failed, falling back to OpenAI:', error.message);
    }
  }

  // Flujo directo con OpenAI (fallback o cuando bridge está deshabilitado)
  const trainingText = loadTrainingFromDB();
  const messages = [
    { role: 'system', content: trainingText },
    { role: 'system', content: DYNAMIC_GUARD },
    ...history
  ];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  await yieldToLoop();

  const completion = await limitHeavy(() =>
    oa.chat.completions.create({
      model: OPENAI_MODEL,
      messages
    })
  );

  const reply = completion.choices[0].message.content;
  return stripIdentityQuestions(reply);
}

/**
 * Genera respuesta para texto extraído de imagen (OCR)
 */
export async function generateOCRResponse(history, ocrText, phone = null, userName = null) {
  return generateLLMResponse(
    history,
    'Responde brevemente en base al texto extraído de la imagen del usuario.',
    phone,
    userName
  );
}

/**
 * Genera respuesta para texto transcrito de audio (ASR)
 */
export async function generateASRResponse(history, transcript, phone = null, userName = null) {
  return generateLLMResponse(
    history,
    'Responde brevemente en base a la transcripción de la nota de voz del usuario.',
    phone,
    userName
  );
}

/**
 * Genera respuesta para mensaje de texto simple
 */
export async function generateTextResponse(history, phone = null, userName = null) {
  return generateLLMResponse(history, null, phone, userName);
}
