import { MessageMedia } from '../services/whatsapp.js';
import { suggestMediaForQuery } from './ocrSuggest.js';
import {
  rememberImageSuggestions,
  recentlySuggested,
  nextUnsentCandidate,
  markImageSent
} from './mediaSuggestStore.js';
import { saveChatHistory } from './historyStore.js';
import { MEDIA_SUGGEST_MAX_IMAGES, MEDIA_SUGGEST_TOPK } from '../config.js';
import { detectImageTopic } from './imageKeywords.js';

/**
 * Dado un texto (mensaje o transcripción), detecta keywords y, si aplica,
 * sugiere y envía UNA imagen relacionada. Actualiza historial y TTL anti-spam.
 *
 * @returns {Promise<boolean>} true si envió imagen, false si no.
 */
export async function maybeSuggestImageForText(client, chatId, text, hist, { lang = 'spa+eng' } = {}) {
  const { keywords, topic } = detectImageTopic(text);
  if (!topic) return false;                 // no hay keywords
  if (recentlySuggested(chatId)) return false; // TTL activo → no spamear

  console.log(`[media-suggest] query="${text}" → keywords=[${keywords.join(', ')}] (topic="${topic}")`);

  try {
    const { best, candidates } = await suggestMediaForQuery(topic, {
      lang,
      force: false,
      maxImages: MEDIA_SUGGEST_MAX_IMAGES,
      topK: MEDIA_SUGGEST_TOPK
    });

    if (best || (candidates && candidates.length)) {
      // Orden: best primero + resto sin duplicar
      const ordered = [];
      if (best) ordered.push(best);
      if (candidates?.length) {
        for (const c of candidates) {
          if (!best || (c.file !== best.file && c.fileRel !== best.fileRel)) {
            ordered.push(c);
          }
        }
      }

      // Elegir el primer candidato NO enviado antes para este chat+tema
      const pick = nextUnsentCandidate(chatId, topic, ordered);
      if (pick?.candidate) {
        const sel = pick.candidate;
        console.log(`[media-suggest] next unsent → ${sel.fileRel || sel.file}`);
        const media = MessageMedia.fromFilePath(sel.file);
        await client.sendMessage(chatId, media); // sin caption
        hist.push({ role: 'assistant', content: '📎 Imagen relacionada', ts: Date.now() });
        saveChatHistory(chatId, hist);

        // Marca como enviada y actualiza TTL anti-spam
        markImageSent(chatId, topic, sel);
        // (opcional) almacena últimos candidatos
        rememberImageSuggestions(chatId, ordered, topic);
        return true;
      }
      console.log('[media-suggest] no quedan imágenes nuevas para este tema; no se envía nada');
      return false;
    } else {
      console.log('[media-suggest] no se hallaron candidatos para:', topic);
      return false;
    }
  } catch (e) {
    console.error('[media] Error sugiriendo/enviando imagen', e);
    return false;
  }
}
