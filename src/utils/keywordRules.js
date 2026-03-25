// Reglas robustas de palabras clave (regex) y detector multimatch.
// NO altera el flujo del bot: solo detecta y devuelve coincidencias.
// La palabra "ayuda" se registra pero NUNCA dispara acciones aquí.

export const KEYWORD_RULES = [
  // === Bancario / Pagos ===
  { topic: 'pagos', patterns: [
    /\bpag(o|os|ar|ué|ue|aron)\b/i,
    /\bretir(ar|o|os|e|é)\b/i,
    /\bdeposit(o|ar|os|e|é)\b/i,
    /\btransferenc/i,
    /\bsaldo(s)?\b/i,
    /\bpse\b/i,
    /\brecarg(a|ar|o)s?\b/i,
  ]},

  // === Cuentas / Acceso ===
  { topic: 'cuentas', patterns: [
    /\bcuent(a|as|o)\b/i,
    /\blogin\b/i,
    /\binicio\s+de\s+ses(i|í)on\b/i,
    /\bacces(o)\b/i,
    /\bcredencial(es)?\b/i,
    /\busuari[oa]s?\b/i,
    /\brestaur(ar|o)\s+contrase(n|ñ)a\b/i,
    /\bclave(s)?\b/i,
  ]},

  // === Bloqueos / Suspensión ===
  { topic: 'bloqueos', patterns: [
    /bloque(ad|o|ada|ado|é)/i,
    /suspendid/i,
    /\bsuspensi[oó]n\b/i,
    /\bban(nead|e[ao])?\b/i,
    /\bdesbloque(ar|o)\b/i,
  ]},

  // === Documentos / Firma ===
  { topic: 'documentos', patterns: [
    /document(os|o)/i,
    /\bfirm(a|ar)\b/i,
    /firma\s+digital/i,
    /escane(ar|o)/i,
    /\bpdf\b/i,
    /\bsoport(es|e)\b/i,
  ]},

  // === Ayuda (⚠️ registrar sin afectar flujo) ===
  { topic: 'ayuda', patterns: [
    /\bayuda\b/i,
    /\bnecesito\s+ayuda\b/i,
    /\brequiero\s+ayuda\b/i,
    /\bpuede\s+ayudarme\b/i,
    /\bayud[ae]me\b/i,
  ]},

  // === Token ===
  { topic: 'token', patterns: [
    /\btoken(s|es)?\b/i,
    /\bc[oó]dig(o|os)\s+de\s+verificaci[oó]n\b/i,
    /\b2fa\b/i,
    /\bdoble\s+factor\b/i,
  ]},

  // === Monetización ===
  { topic: 'monetizacion', patterns: [
    /monetizaci[oó]n/i,
    /monetizar/i,
    /\bingres(os)?\b/i,
    /\bgananci(as|a)\b/i,
  ]},

  // === Vinculación (linking) ===
  { topic: 'vinculacion', patterns: [
    /vinculaci[oó]n/i,
    /vincular/i,
    /\benlaz(ar|e|o)\b/i,
    /\basociar\b/i,
    /\brelacionar\b/i,
  ]},

  // === Soporte ===
  { topic: 'soporte', patterns: [
    /\bsoport(e|es)\b/i,
    /\bmesa\s+de\s+ayuda\b/i,
    /\bservicio\s+al\s+cliente\b/i,
    /\batenci[oó]n\b/i,
  ]},
];

// Devuelve TODAS las coincidencias en el texto:
// [{ topic:'pagos', keyword:'saldo' }, ...]
export function detectKeywordTopics(messageText = '') {
  const text = String(messageText || '').toLowerCase();
  if (!text) return [];

  const matches = [];
  for (const rule of KEYWORD_RULES) {
    for (const rx of rule.patterns) {
      const m = text.match(rx);
      if (m) {
        matches.push({ topic: rule.topic, keyword: (m[0] || '').trim() });
        break; // una coincidencia por topic es suficiente
      }
    }
  }
  return matches;
}

// ─── Detección dinámica desde BD ─────────────────────────────────────────────

let _dbCache = null;
let _dbCacheTs = 0;
const DB_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function invalidateKeywordCache() {
  _dbCache = null;
  _dbCacheTs = 0;
}

async function loadDBKeywords() {
  if (_dbCache && Date.now() - _dbCacheTs < DB_CACHE_TTL) return _dbCache;
  try {
    const { listKeywords } = await import('../db/configKeywordsRepo.js');
    _dbCache = await listKeywords();
    _dbCacheTs = Date.now();
    return _dbCache;
  } catch {
    return null;
  }
}

/**
 * Versión async que usa palabras clave de BD si existen,
 * con fallback al KEYWORD_RULES hardcodeado.
 */
export async function detectKeywordTopicsAsync(messageText = '') {
  const text = String(messageText || '').toLowerCase();
  if (!text) return [];

  const dbKeywords = await loadDBKeywords();

  if (dbKeywords && dbKeywords.length > 0) {
    const seen = new Set();
    const matches = [];
    for (const { topic, keyword } of dbKeywords) {
      if (!seen.has(topic) && text.includes(keyword.toLowerCase())) {
        seen.add(topic);
        matches.push({ topic, keyword });
      }
    }
    return matches;
  }

  // Fallback a reglas hardcodeadas
  return detectKeywordTopics(messageText);
}
