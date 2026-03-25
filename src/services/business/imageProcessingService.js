/**
 * Servicio de procesamiento de imágenes (OCR)
 * Business Layer - Maneja extracción de texto de imágenes
 */
import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';
import { MEDIA_DIR } from '../../config.js';
import { ensureDir, extFromMime } from '../../core/fileUtils.js';
import { trimForPrompt } from '../../core/textUtils.js';
import { limitHeavy, yieldToLoop } from '../../utils/concurrency.js';

const LANG_PATH = process.env.TESS_LANG_PATH || null;

/**
 * Procesa una imagen y extrae el texto mediante OCR
 * @param {Object} msg - Mensaje de WhatsApp con imagen
 * @param {string} lang - Idioma para Tesseract (default: 'spa+eng')
 * @returns {Promise<{text: string, filePath: string}>}
 */
export async function processImageOCR(msg, lang = 'spa+eng') {
  // Descargar imagen
  const media = await msg.downloadMedia();
  if (!media?.data) {
    throw new Error('No se pudo descargar la imagen');
  }

  // Guardar imagen temporalmente
  const incomingDir = path.join(MEDIA_DIR, 'incoming');
  ensureDir(incomingDir);
  
  const ext = media.filename ? path.extname(media.filename) : extFromMime(media.mimetype);
  const fname = `img_${Date.now()}_${Math.random().toString(36).slice(2)}${ext || '.jpg'}`;
  const fpath = path.join(incomingDir, fname);
  
  fs.writeFileSync(fpath, Buffer.from(media.data, 'base64'));
  console.log(`[image-ocr] guardada: ${path.relative(process.cwd(), fpath)} (mime=${media.mimetype || 'unknown'})`);

  // Ceder control antes de OCR
  await yieldToLoop();

  // OCR (limitado por concurrencia)
  const result = await limitHeavy(() =>
    Tesseract.recognize(fpath, lang, LANG_PATH ? { langPath: LANG_PATH } : {})
  );

  const extractedText = result.data.text || '';
  console.log(`[image-ocr] texto (prev 200): "${extractedText.replace(/\s+/g, ' ').slice(0, 200)}${extractedText.length > 200 ? '…' : ''}"`);

  return {
    text: extractedText,
    filePath: fpath,
    trimmed: trimForPrompt(extractedText, 3500)
  };
}

/**
 * Valida si un mensaje tiene imagen procesable
 */
export function hasProcessableImage(msg) {
  return msg.type === 'image' && msg.hasMedia;
}
