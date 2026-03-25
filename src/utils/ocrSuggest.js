import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Tesseract from 'tesseract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEDIA_DIR  = path.join(__dirname, '..', 'media');
const CACHE_FILE = path.join(__dirname, '..', '.ocr-cache.json');
const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);

/** Opcional: de dónde descargar modelos de idioma (spa, eng) */
const LANG_PATH = process.env.TESS_LANG_PATH; // p.ej. https://tessdata.projectnaptha.com/4.0.0

/* -------------------------- utils texto -------------------------- */
function normalize(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenize(str = '') {
  return normalize(str).split(/\s+/).filter(Boolean);
}

/* -------------------------- utils fs ----------------------------- */
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }).catch(()=>{}); }

async function listMediaFiles(dir = MEDIA_DIR) {
  await ensureDir(dir);
  const files = (await fs.readdir(dir))
    .map(f => path.join(dir, f))
    .filter(f => exts.has(path.extname(f).toLowerCase()));

  // ✅ Ordena por "reciente primero" para OCR más útil con menos archivos
  files.sort((a, b) => {
    const sa = fsSync.existsSync(a) ? fsSync.statSync(a).mtimeMs : 0;
    const sb = fsSync.existsSync(b) ? fsSync.statSync(b).mtimeMs : 0;
    return sb - sa;
  });
  return files;
}

function loadCache() {
  try {
    if (!fsSync.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fsSync.readFileSync(CACHE_FILE, 'utf8'));
  } catch { return {}; }
}
function saveCache(cache) {
  try { fsSync.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); } catch {}
}

function fileSignature(fp) {
  try {
    const stat = fsSync.statSync(fp);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch { return null; }
}

/* --------------------- filtro por nombre primero ----------------- */
function filterFilesByName(query, files) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  return files.filter(fp => {
    const name = normalize(path.basename(fp));
    // Coincidencia si contiene al menos UN token
    return tokens.some(t => name.includes(t));
  });
}

/* --------------- OCR de un conjunto concreto de files ------------ */
async function ocrFiles(files, { lang = 'spa+eng', force = false } = {}) {
  const cache = loadCache();
  const results = [];

  for (const file of files) {
    const key = path.relative(MEDIA_DIR, file);
    const sig = fileSignature(file);
    let text;

    if (!force && cache[key] && cache[key].size === sig?.size && cache[key].mtimeMs === sig?.mtimeMs) {
      text = cache[key].text;
    } else {
      console.log(`[OCR] leyendo: ${key}`);
      const opts = {};
      if (LANG_PATH) opts.langPath = LANG_PATH;
      const { data: { text: t } } = await Tesseract.recognize(file, lang, opts);
      text = t || '';
      cache[key] = { size: sig?.size, mtimeMs: sig?.mtimeMs, text };
      saveCache(cache);
    }

    results.push({
      file,
      fileName: path.basename(file),
      fileRel: key,
      text,
      textNorm: normalize(text),
      nameNorm: normalize(path.basename(file)),
    });
  }

  return results;
}

/* --------------- índice OCR (opcionalmente acotado) -------------- */
export async function buildOcrIndex({ lang = 'spa+eng', force = false, maxImages = 100, files = null } = {}) {
  const all = files ? files.slice() : await listMediaFiles();
  const limited = all.slice(0, Math.max(1, maxImages)); // ✅ límite estricto
  return ocrFiles(limited, { lang, force });
}

/* ------------------------- scoring simple ------------------------ */
function scoreEntry(query, entry) {
  const q = normalize(query);
  const qTokens = tokenize(query);
  let s = 0;

  if (!q || q.length === 0) return 0;

  // coincidencia por frase completa
  if (entry.textNorm.includes(q)) s += 5;
  if (entry.nameNorm.includes(q)) s += 3;

  // coincidencia por token
  for (const t of qTokens) {
    if (!t) continue;
    if (entry.nameNorm.includes(t)) s += 2;
    if (entry.textNorm.includes(t)) s += 3;
  }
  return s;
}

/* ------------------- API principal (2 etapas) -------------------- */
export async function suggestMediaForQuery(
  query,
  { lang = 'spa+eng', force = false, maxImages = 200, topK = 3 } = {}
) {
  const allFiles = await listMediaFiles();
  // ETAPA 1: prefiltra por NOMBRE
  const nameCandidates = filterFilesByName(query, allFiles);

  let idx;
  if (nameCandidates.length) {
    console.log(`[search] ${nameCandidates.length} candidato(s) por nombre → OCR solo de esos.`);
    idx = await buildOcrIndex({ lang, force, maxImages, files: nameCandidates });
  } else {
    console.log(`[search] sin matches por nombre → OCR de los más recientes (capado en ${maxImages}).`);
    idx = await buildOcrIndex({ lang, force, maxImages, files: allFiles });
  }

  const scored = idx.map(e => ({ ...e, score: scoreEntry(query, e) }));
  scored.sort((a, b) => b.score - a.score);

  const top = scored.filter(e => e.score > 0).slice(0, topK);
  const best = top[0] || null;

  return { best, candidates: top, all: scored, stage: nameCandidates.length ? 'name-first' : 'content-fallback' };
}
