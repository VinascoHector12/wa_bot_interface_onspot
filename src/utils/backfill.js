/**
 * Reconstruye historial de un chat a partir de los últimos N mensajes.
 * Devuelve turnos en formato:
 *   [{ role: 'user' | 'assistant', content: string, ts: number }]
 *
 * - Ignora mensajes con media y vacíos (opcionalmente pone placeholder).
 * - Ordena cronológicamente (viejo -> nuevo).
 * - Incluye `ts` en MILISEGUNDOS (necesario para mostrar la hora en el panel).
 */
export async function backfillHistoryFromChat(
  chat,
  { maxMessages = 10, includeMediaPlaceholder = false } = {}
) {
  // WhatsApp devuelve del más nuevo al más viejo
  const msgs = await chat.fetchMessages({ limit: Math.min(maxMessages, 50) });

  const turns = [];
  for (const m of msgs) {
    const tsMs =
      typeof m.timestamp === 'number' ? m.timestamp * 1000 : Date.now();
    const base = {
      role: m.fromMe ? 'assistant' : 'user',
      ts: tsMs
    };

    // Omitir multimedia real (o agregar placeholder si se solicita)
    if (m.hasMedia) {
      if (includeMediaPlaceholder) {
        turns.push({ ...base, content: '[archivo multimedia recibido]' });
      }
      continue;
    }

    const text = typeof m.body === 'string' ? m.body.trim() : '';
    if (!text) continue;

    turns.push({ ...base, content: text });
  }

  // Orden cronológico (antiguo -> reciente)
  turns.sort((a, b) => a.ts - b.ts);

  // ¡NO borres ts! el panel lo usa para mostrar la hora
  return turns;
}
