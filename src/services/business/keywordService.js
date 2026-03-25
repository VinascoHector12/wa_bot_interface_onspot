/**
 * Servicio de detección y almacenamiento de keywords
 * Business Layer - Maneja la detección de palabras clave, temas y notificaciones de asistencia
 */
import { detectKeywordTopicsAsync } from '../../utils/keywordRules.js';
import { saveKeywordEventsBulk } from '../../db/keywordRepo.js';
import { getNumbersByKeyword } from '../../db/assistanceRepo.js';

/**
 * Detecta keywords en un texto, las guarda en BD y notifica números de asistencia.
 * La keyword 'ayuda' (topic ayuda) NO notifica aquí: la maneja handleHelpRequest.
 */
export async function detectAndSaveKeywords(chatId, phone, text, source = 'text') {
  try {
    const hits = await detectKeywordTopicsAsync(text);

    if (hits.length > 0) {
      await saveKeywordEventsBulk(
        hits.map(h => ({
          chatId,
          phone,
          keyword: h.keyword,
          topic: h.topic,
          source,
          tsMs: Date.now()
        }))
      );

      console.log(`[keywords] Detectadas ${hits.length} keyword(s) en ${source}:`, hits.map(h => h.keyword).join(', '));

      // Notificar números de asistencia para keywords que NO sean 'ayuda'
      // (ayuda es gestionada aparte en handleHelpRequest)
      await notifyAssistanceNumbers(chatId, phone, text, hits);
    }

    return hits;
  } catch (err) {
    console.error(`[keywords:${source}] Error:`, err?.message || err);
    return [];
  }
}

/**
 * Solo detecta keywords sin guardar ni notificar (útil para testing)
 */
export async function detectKeywords(text) {
  return detectKeywordTopicsAsync(text);
}

/**
 * Envía notificación a números de asistencia asociados a cada keyword detectada.
 * Excluye el topic 'ayuda' (manejado en handleHelpRequest con pause de chat).
 */
async function notifyAssistanceNumbers(chatId, phone, text, hits) {
  // Filtrar topic 'ayuda': lo maneja handleHelpRequest
  const nonHelpHits = hits.filter(h => h.topic !== 'ayuda');
  if (!nonHelpHits.length) return;

  let waClient;
  try {
    const { client } = await import('../whatsapp.js');
    waClient = client;
  } catch {
    return;
  }

  const notified = new Set(); // evitar notificar el mismo número dos veces

  for (const { topic, keyword } of nonHelpHits) {
    let numbers;
    try {
      // Buscar por tópico: el asesor registra el tópico ("pagos", "bloqueos", etc.)
      // no la palabra exacta detectada ("saldo", "bloqueado", etc.)
      numbers = await getNumbersByKeyword(topic);
    } catch {
      continue;
    }

    for (const n of numbers) {
      if (notified.has(n.id)) continue;
      notified.add(n.id);

      try {
        let contact = null;
        try { contact = await waClient.getContactById(chatId); } catch {}
        const display = contact?.pushname || phone || chatId;

        const waId = n.phone.includes('@') ? n.phone : `${n.phone}@c.us`;
        const msg =
          `📌 *Alerta de tema: ${topic}*\n` +
          `Contacto: ${display} (${phone})\n` +
          `Palabra detectada: "${keyword}"\n` +
          `Mensaje: "${text.slice(0, 200)}"`;

        await waClient.sendMessage(waId, msg);
        console.log(`[keyword-notify] Notificado ${n.phone} por tópico "${topic}"`);
      } catch (e) {
        console.error(`[keyword-notify] Error enviando a ${n.phone}:`, e.message);
      }
    }
  }
}
