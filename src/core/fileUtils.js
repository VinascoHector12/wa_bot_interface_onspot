/**
 * Utilidades de archivos y medios
 * Core Layer - Sin dependencias externas
 */
import fs from 'fs';

/**
 * Asegura que un directorio existe
 */
export function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

/**
 * Obtiene extensión de archivo desde mimetype
 */
export function extFromMime(m) {
  if (!m) return '.bin';
  if (m.includes('jpeg')) return '.jpg';
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  if (m.includes('ogg') || m.includes('opus')) return '.ogg';
  if (m.includes('mp3') || m.includes('mpeg')) return '.mp3';
  if (m.includes('wav')) return '.wav';
  if (m.includes('m4a')) return '.m4a';
  if (m.includes('webm')) return '.webm';
  if (m.includes('mp4')) return '.mp4';
  return '.bin';
}
