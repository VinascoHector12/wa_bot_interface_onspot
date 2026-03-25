import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'media-suggest.json');
const DEFAULT_TTL_MS = 120000; // 2 min

let cache = { chats: {}, ttlMs: DEFAULT_TTL_MS };
try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch {}
}

function ensureChat(chatId) {
  if (!cache.chats[chatId]) cache.chats[chatId] = { lastSentAt: 0, topics: {} };
  return cache.chats[chatId];
}
function ensureTopicState(chatId, topic) {
  const c = ensureChat(chatId);
  const key = (topic || 'default').toLowerCase().trim();
  if (!c.topics[key]) c.topics[key] = { lastSentAt: 0, sent: {}, lastCandidates: [] };
  return c.topics[key];
}
function idForCandidate(cand) {
  if (cand && typeof cand === 'object') {
    return String(cand.fileRel || cand.file || '');
  }
  return String(cand || '');
}

/**
 * Guarda sugerencias para un chat.
 * - remaining: las que faltan por enviar (best ya se envió)
 * - topic: texto/tópico base (p. ej. "monetizacion")
 * - lastSentAt: timestamp del último envío de imagen (para TTL)
 *
 * NOTA: En esta versión no tocamos lastSentAt aquí, sólo almacenamos
 *       candidatos para depuración. El TTL se actualiza cuando realmente
 *       se envía una imagen vía markImageSent().
 */
export function rememberImageSuggestions(chatId, candidates = [], topic = '') {
  const t = ensureTopicState(chatId, topic);
  t.lastCandidates = (Array.isArray(candidates) ? candidates : []).map(idForCandidate);
  persist();
}

/** ¿Se sugirió recientemente? Evita re-sugerir por TTL ms (default 2min). */
export function recentlySuggested(chatId, ttlMs = cache.ttlMs || DEFAULT_TTL_MS) {
  const c = ensureChat(chatId);
  if (!c?.lastSentAt) return false;
  return (Date.now() - c.lastSentAt) < ttlMs;
}

/** Devuelve el primer candidato NO enviado antes para (chat + tema). */
export function nextUnsentCandidate(chatId, topic, orderedCandidates = []) {
  const t = ensureTopicState(chatId, topic);
  for (const cand of (orderedCandidates || [])) {
    const id = idForCandidate(cand);
    if (!id) continue;
    if (!t.sent[id]) return { candidate: cand, id };
  }
  return null; // ya no quedan candidatos sin enviar
}

/** Marca una imagen como ENVIADA para (chat + tema) y actualiza TTL. */
export function markImageSent(chatId, topic, cand) {
  const id = idForCandidate(cand);
  const c = ensureChat(chatId);
  const t = ensureTopicState(chatId, topic);
  const now = Date.now();
  t.sent[id] = now;
  t.lastSentAt = now;
  c.lastSentAt = now; // usado por recentlySuggested()
  persist();
}

/** Borra el flujo/tema (opcional) */
export function clearImageSuggestions(chatId, { keepMeta = true, topic = null } = {}) {
  const c = ensureChat(chatId);
  if (!topic) {
    if (keepMeta) c.topics = {}; else delete cache.chats[chatId];
  } else {
    const key = topic.toLowerCase().trim();
    delete c.topics[key];
  }
  persist();
}

/** Devuelve el tópico recordado (para copy amigable) */
export function getTopic(chatId, topic = 'default') {
  return (topic || 'default').toLowerCase().trim();
}
