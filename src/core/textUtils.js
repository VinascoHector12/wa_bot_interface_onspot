/**
 * Utilidades de procesamiento de texto
 * Core Layer - Sin dependencias externas
 */

/**
 * Normaliza texto para comparaciones
 */
export function normalizeText(s = '') {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Recorta texto para prompts de LLM
 */
export function trimForPrompt(s, max = 3500) {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * Elimina preguntas de identidad del texto del LLM
 */
export function stripIdentityQuestions(txt = '') {
  if (!txt) return txt;
  const KEYCAP = String.raw`\uFE0F?\u20E3`;

  const patterns = [
    /¿\s*con qui[eé]n tengo el gusto[\s\S]*?(?:\n|$)/gim,
    /¿\s*c[oó]mo llegaste a esta l[ií]nea[\s\S]*?(?:\n|$)/gim,
    /selecciona una opci[oó]n[\s\S]*?(?:\n|$)/gim,
    /(?:^|\n)\s*1\)\s*correo[\s\S]*?4\)\s*otro[\s\S]*?(?:\n|$)/gim,
    /\(\s*1\s*correo.*?4\s*otro\s*\)/gim,
    /(?:^|\n)\s*1\)\s*.*?(?:\n\s*2\)\s*.*?)(?:\n\s*3\)\s*.*?)(?:\n\s*4\)\s*.*?)(?=\n|$)/gims,
    /(?:^|\n)\s*[1-4]\)\s*[^\n]*\n?/gim,
    new RegExp(String.raw`(?:^|\n)\s*1${KEYCAP}\s*.*?(?:\n\s*2${KEYCAP}\s*.*?)(?:\n\s*3${KEYCAP}\s*.*?)(?:\n\s*4${KEYCAP}\s*.*?)(?=\n|$)`, 'gims'),
    new RegExp(String.raw`(?:^|\n)\s*[1-4]${KEYCAP}\s*[^\n]*\n?`, 'gim')
  ];
  
  let out = txt;
  for (const re of patterns) out = out.replace(re, '').trim();
  return out || 'Gracias. ¿En qué puedo ayudarte?';
}

/**
 * Extrae el número de teléfono de un chatId (soporta @c.us y @lid)
 */
export function extractPhone(chatId = '') {
  const at = chatId.indexOf('@');
  return at > 0 ? chatId.slice(0, at) : chatId;
}

/**
 * Detecta si un texto es solo una respuesta de origen
 */
export function isPureOriginReply(text) {
  const ORIGIN_SINGLE_TOKENS = new Set(['correo', 'email', 'mail', 'pagina', 'web', 'site', 'sitio', 'instagram', 'tiktok', 'ig', 'otro']);
  const ORIGIN_FULL_PHRASES = new Set(['desde la pagina', 'directamente desde la pagina']);
  const OPTION_ONLY_RE = /^(?:opcion|opción)?\s*[1-4]$/i;
  
  const n = normalizeText(text);
  if (!n) return false;
  if (OPTION_ONLY_RE.test(n)) return true;
  if (ORIGIN_SINGLE_TOKENS.has(n)) return true;
  if (ORIGIN_FULL_PHRASES.has(n)) return true;
  return false;
}
