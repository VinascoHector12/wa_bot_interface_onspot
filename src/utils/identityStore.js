import { upsertIdentity, getIdentityByChatId } from '../db/identityRepo.js';
import { extractPhone } from '../core/textUtils.js';

let cache = {};

// Carga lazy desde BD para un chatId (solo si no está en caché)
export async function loadIdentityFromDB(chatId) {
  if (cache[chatId]) return;
  try {
    const rec = await getIdentityByChatId(chatId);
    if (rec) {
      cache[chatId] = {
        chatId: rec.chatId,
        phone: rec.phone ?? extractPhone(chatId),
        isIdentified: !!rec.isIdentified,
        introDone: !!rec.introDone,
        name: rec.name ?? null,
        origin: rec.origin ?? null,
        via: rec.via ?? null,
        expectingOrigin: !!rec.expectingOrigin,
        askedIntroAt: rec.askedIntroAt ? new Date(rec.askedIntroAt).getTime() : 0,
        askCount: rec.askCount ?? 0,
        updatedAt: rec.updatedAt ? new Date(rec.updatedAt).getTime() : Date.now(),
        firstSeen: rec.firstSeen ? new Date(rec.firstSeen).getTime() : Date.now(),
      };
    }
  } catch (err) {
    console.error('[identityStore] loadIdentityFromDB error:', err?.message || err);
  }
}

function persist(rec) {
  if (!rec || !rec.chatId || !rec.updatedAt || !rec.firstSeen) return;
  const phone = rec.phone && !rec.phone.includes('@')
    ? rec.phone
    : extractPhone(rec.chatId);
  upsertIdentity({
    chatId: rec.chatId,
    phone,
    isIdentified: !!rec.isIdentified,
    introDone: !!rec.introDone,
    name: rec.name ?? null,
    origin: rec.origin ?? null,
    via: rec.via ?? null,
    expectingOrigin: !!rec.expectingOrigin,
    askedIntroAt: rec.askedIntroAt || null,
    askCount: rec.askCount ?? 0,
    updatedAt: rec.updatedAt,
    firstSeen: rec.firstSeen
  })
    .then(() => console.log('[identityStore] guardado en BD:', rec.chatId))
    .catch(err => console.error('[identityStore] upsert error:', err?.message || err));
}

export function getIdentity(chatId) {
  return cache[chatId] || {
    chatId,
    phone: extractPhone(chatId),
    // Será true sólo cuando haya NOMBRE (desde WA) y ORIGEN
    isIdentified: false,
    // Se vuelve true cuando hay ambos datos
    introDone: false,
    name: null,                    // nombre/alias (SOLO desde WhatsApp o panel)
    origin: null,                  // 'correo' | 'pagina' | 'instagram/tiktok' | 'otro'
    via: null,                     // 'wa-contact' | 'agent' | ...
    // Ventana para aceptar la respuesta exacta de origen tras el nudge
    expectingOrigin: false,
    askedIntroAt: 0,
    askCount: 0,
    updatedAt: Date.now(),
    firstSeen: Date.now()
  };
}

/* ==================== Sanitización de NOMBRE ==================== */
/**
 * Elimina emojis/símbolos, deja sólo letras+acentos, espacios y (' ’ -),
 * colapsa espacios, aplica Title Case. Si el resultado tiene < 3 caracteres,
 * devuelve null (para NO sobreescribir el nombre existente).
 */
function toTitleCase(s='') {
  return s.split(/\s+/).map(w => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : '').join(' ');
}
function sanitizeNameOrNull(raw) {
  if (!raw) return null;
  let s = String(raw).normalize('NFC');
  // quita todo excepto letras (con acentos), marcas, espacios y apóstrofos/guiones comunes
  s = s.replace(/[^\p{L}\p{M}\s'’-]/gu, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length < 3) return null;
  return toTitleCase(s);
}

/* ==================== Flags derivados ==================== */
function recomputeFlags(cur, patch) {
  const name   = patch.name   ?? cur.name;
  const origin = patch.origin ?? cur.origin;
  const isIdentified = Boolean(name && origin);
  const introDone = isIdentified ? true : cur.introDone;
  return { isIdentified, introDone };
}

export function setIdentity(chatId, patch) {
  const cur = getIdentity(chatId);

  // Clonamos y limpiamos 'name' si viene en el patch
  const next = { ...patch };
  if (Object.prototype.hasOwnProperty.call(next, 'name')) {
    const cleaned = sanitizeNameOrNull(next.name);
    if (cleaned) {
      next.name = cleaned;
    } else {
      // si el nombre propuesto es inválido, NO tocar el nombre actual
      delete next.name;
    }
  }

  const flags = recomputeFlags(cur, next);
  cache[chatId] = { ...cur, ...next, ...flags, updatedAt: Date.now() };
  persist(cache[chatId]);
  return cache[chatId];
}

export const markIdentified = (chatId, data = {}) => setIdentity(chatId, data);

// No fuerces introDone si falta nombre u origen
export const markIntroDone = (chatId) => {
  const cur = getIdentity(chatId);
  if (cur.name && cur.origin) return setIdentity(chatId, { introDone: true });
  return cur; // sin cambios si falta info
};

export const clearIdentification = (chatId) =>
  setIdentity(chatId, { introDone:false, isIdentified:false, name:null, origin:null, via:null, expectingOrigin:false });

/* ==================== Detección nombre y origen desde TEXTO ==================== */
/* NOTA IMPORTANTE:
   Mantenemos utilidades para detectar ORIGEN desde el texto, pero
   A PARTIR DE AHORA NO USAMOS EL NOMBRE DETECTADO EN TEXTO.
   El nombre sólo se fija desde WhatsApp (contact.name/pushname) o manualmente en el panel.
*/
function normalize(s=''){
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/[^\p{L}\p{N}\s]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const STOPWORDS = new Set([
  'hola','buenas','buenos','dias','tardes','noches',
  'gracias','ok','vale','listo','bueno','hey','que','qué','mas','más',
  'si','sí','no','por','favor','ayuda','quiero','necesito','pregunta','consulta'
]);

const ORIGIN_MAP = {
  'correo': 'correo', 'email': 'correo', 'correo electronico': 'correo', 'electronico': 'correo', 'mail': 'correo',
  'pagina': 'pagina', 'pagina web': 'pagina', 'web': 'pagina', 'site': 'pagina', 'sitio': 'pagina',
  'directamente desde la pagina': 'pagina', 'desde la pagina': 'pagina',
  'instagram': 'instagram/tiktok', 'tiktok': 'instagram/tiktok', 'ig': 'instagram/tiktok',
  'otro': 'otro'
};

const NAME_WITH_VERB_RE = /\b(?:soy|me llamo|mi nombre es)\s+([a-zñáéíóú ]{2,40})\b/i;
const ONLY_DIGIT_OPTION_RE = /\b(?:opcion|opción)?\s*([1-4])\b/i;
const CLEAN_NAME_RE = /^[a-zñáéíóú]+(?:\s+[a-zñáéíóú]+){0,2}$/i; // 1 a 3 palabras

function looksLikeStandaloneName(nrm) {
  if (!nrm) return false;
  const words = nrm.split(' ');
  if (words.length === 0 || words.length > 3) return false;
  if (words.every(w => STOPWORDS.has(w))) return false;
  if (/\d/.test(nrm)) return false;
  if (ORIGIN_MAP[nrm]) return false;
  return CLEAN_NAME_RE.test(nrm);
}

function originFromDigit(d) {
  return ({ '1':'correo', '2':'pagina', '3':'instagram/tiktok', '4':'otro' }[d]) || null;
}
function originFromText(nrm) {
  for (const key of Object.keys(ORIGIN_MAP)) {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${k}\\b`, 'i');
    if (re.test(nrm)) return ORIGIN_MAP[key];
  }
  return null;
}

export function extractNameAndOrigin(text='') {
  const n = normalize(text);
  let name = null, origin = null;
  if (!n) return { name, origin };

  // Detectamos nombre PERO **NO** se usará para guardar (sólo por compatibilidad).
  const m1 = NAME_WITH_VERB_RE.exec(text);
  if (m1) {
    const rawName = m1[1].replace(/\s+/g, ' ').trim();
    const nrmName = normalize(rawName);
    if (looksLikeStandaloneName(nrmName)) name = rawName;
  }
  if (!origin) {
    const m2 = ONLY_DIGIT_OPTION_RE.exec(n);
    if (m2) origin = originFromDigit(m2[1]);
  }
  if (!origin) {
    const o = originFromText(n);
    if (o) origin = o;
  }
  // Si todo el mensaje parece sólo un nombre, lo detectamos, pero reiteramos: NO se guardará.
  if (!name && looksLikeStandaloneName(n)) {
    name = n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return { name, origin };
}

/* ==================== Nudge (pedir SOLO lo que falta) ==================== */
//const INTRO_ASK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
const INTRO_ASK_COOLDOWN_MS = 3 * 60 * 1000; // 3min

export function missingIdentityField(identity) {
  // Origen no requerido para este bot
  return null;
}

export function shouldNudgeForIdentity(text, identity) {
  const need = missingIdentityField(identity);
  if (!need) return false;
  const now = Date.now();
  if (identity.askedIntroAt && (now - identity.askedIntroAt) < INTRO_ASK_COOLDOWN_MS) return false;
  return need; // 'origin'
}

/**
 * Marca que se pidió info al usuario.
 * Si el campo es 'origin' (o no se envía), activa expectingOrigin=true para aceptar
 * sólo una respuesta exacta del origen en el siguiente mensaje.
 */
export function markIntroAsked(chatId, field = 'origin') {
  const id = getIdentity(chatId);
  const patch = {
    askedIntroAt: Date.now(),
    askCount: (id.askCount || 0) + 1
  };
  if (field === 'origin') {
    patch.expectingOrigin = true;
  }
  return setIdentity(chatId, patch);
}

export function buildNudgeText(identity) {
  const need = missingIdentityField(identity);
  if (need === 'origin') return `🙋‍♀️ Y cuéntame, ¿cómo llegaste a esta línea de comunicación? Selecciona una opción:\n
    1️⃣ Correo electrónico
    2️⃣ Directamente desde la página
    3️⃣ Instagram/Tiktok
    4️⃣ Otro`;
  return null;
}
