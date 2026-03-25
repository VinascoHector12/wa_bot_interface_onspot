const botMessageIds = {};

/** Marca un mensaje (id serializado) como enviado por el bot */
export function registerBotMessage(chatId, msgId) {
  if (!botMessageIds[chatId]) botMessageIds[chatId] = new Set();
  botMessageIds[chatId].add(msgId);
}

/** Devuelve true si ese id fue enviado por el bot */
export function isBotMessage(chatId, msgId) {
  return botMessageIds[chatId]?.has(msgId);
}

/** (opcional) limpieza periódica si lo quieres: */
export function clearBotOutbox() {
  botMessageIds.clear();
}
