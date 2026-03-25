// Normaliza: minúsculas + quita acentos + quita signos/puntuación → colapsa espacios
export function normalize(str = '') {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')   // quita acentos
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')                 // deja solo letras/números/espacios
    .replace(/\s+/g, ' ')
    .trim();
}

// Palabras clave que activan la búsqueda de imágenes (amplía cuando quieras)
const RAW_IMAGE_KEYWORDS = [
  'monetizacion','monetización','pago','pagos','penalidad','penalidades',
  'infraccion','infracciones','suspension','suspensión','retiro','retiros',
  'token','verificacion','verificación','vinculacion','vinculación','cuenta','cuentas',
  'perdida','cierre','cambiar'
];

const IMAGE_KEYWORDS = new Set(RAW_IMAGE_KEYWORDS.map(k => normalize(k)));

export function extractImageKeywords(text = '') {
  const tokens = normalize(text).split(/\s+/).filter(Boolean);
  const hits = Array.from(new Set(tokens.filter(t => IMAGE_KEYWORDS.has(t))));
  return hits;
}

/** Devuelve { keywords, topic } donde topic es un string unificado para el flujo de medios */
export function detectImageTopic(text = '') {
  const keywords = extractImageKeywords(text);
  return { keywords, topic: keywords.length ? keywords.join(' ') : null };
}
