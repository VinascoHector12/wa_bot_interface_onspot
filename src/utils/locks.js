const inflight = new Set();
const lastReplyAt = new Map();

/**
 * Evita que dos flujos (onReady/onMessage) procesen el mismo chat a la vez.
 * Si ya hay un procesamiento en curso para ese chat, la llamada se ignora.
 */
export async function withChatLock(chatId, fn) {
  if (inflight.has(chatId)) return;
  inflight.add(chatId);
  try {
    return await fn();
  } finally {
    inflight.delete(chatId);
  }
}

/**
 * Ventana de enfriamiento para no responder varias veces seguidas.
 * Devuelve true si se debe responder ahora; false si aún está en cooldown.
 */
export function shouldReplyNow(chatId, windowMs = 30000) {
  const now = Date.now();
  const last = lastReplyAt.get(chatId) || 0;
  if (now - last < windowMs) return false;
  lastReplyAt.set(chatId, now);
  return true;
}

/** Marca explícitamente que el bot acaba de responder (útil tras enviar el mensaje). */
export function markBotReplied(chatId) {
  lastReplyAt.set(chatId, Date.now());
}
