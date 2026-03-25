import { MAX_HISTORY } from '../config.js';
import { getRecentHistory } from '../db/chatRepo.js';

// Cache en memoria por sesión para evitar re-lecturas a BD en el mismo flujo
const cache = new Map();

export async function loadChatHistory(chatId) {
  if (cache.has(chatId)) return cache.get(chatId);
  try {
    const rows = await getRecentHistory(chatId, MAX_HISTORY);
    cache.set(chatId, rows);
    return rows;
  } catch {
    cache.set(chatId, []);
    return [];
  }
}

export function saveChatHistory(chatId, history) {
  const trimmed = Array.isArray(history)
    ? (history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history)
    : [];
  cache.set(chatId, trimmed);
  // Los mensajes ya se persisten individualmente en BD via insertMessage/logMessageSafe
}
