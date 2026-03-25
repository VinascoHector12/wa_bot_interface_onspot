/**
 * Servicio de procesamiento de audio (ASR - Automatic Speech Recognition)
 * Business Layer - Maneja transcripción de notas de voz
 */
import fs from 'fs';
import path from 'path';
import { MEDIA_DIR } from '../../config.js';
import { ensureDir, extFromMime } from '../../core/fileUtils.js';
import { trimForPrompt } from '../../core/textUtils.js';
import { limitHeavy, yieldToLoop } from '../../utils/concurrency.js';
import { transcribeAudioFile } from '../asr.js';

/**
 * Procesa un audio y extrae el texto mediante ASR
 * @param {Object} msg - Mensaje de WhatsApp con audio
 * @returns {Promise<{transcript: string, filePath: string}>}
 */
export async function processAudioASR(msg) {
  // Descargar audio
  const media = await msg.downloadMedia();
  if (!media?.data) {
    throw new Error('No se pudo descargar el audio');
  }

  // Guardar audio temporalmente
  const incomingDir = path.join(MEDIA_DIR, 'incoming');
  ensureDir(incomingDir);
  
  const ext = media.filename ? path.extname(media.filename) : extFromMime(media.mimetype || 'audio/ogg');
  const fname = `aud_${Date.now()}_${Math.random().toString(36).slice(2)}${ext || '.ogg'}`;
  const fpath = path.join(incomingDir, fname);
  
  fs.writeFileSync(fpath, Buffer.from(media.data, 'base64'));
  console.log(`[audio-asr] guardado: ${path.relative(process.cwd(), fpath)} (mime=${media.mimetype || 'unknown'})`);

  // Ceder control antes de ASR
  await yieldToLoop();

  // Transcripción (limitada por concurrencia)
  const transcript = await limitHeavy(() => transcribeAudioFile(fpath));
  console.log(`[audio-asr] transcripción (prev 240): "${(transcript || '').replace(/\s+/g, ' ').slice(0, 240)}${(transcript || '').length > 240 ? '…' : ''}"`);

  if (!transcript) {
    throw new Error('No se pudo transcribir el audio');
  }

  return {
    transcript,
    filePath: fpath,
    trimmed: trimForPrompt(transcript, 3500)
  };
}

/**
 * Valida si un mensaje tiene audio procesable
 */
export function hasProcessableAudio(msg) {
  return (msg.type === 'ptt' || msg.type === 'audio') && msg.hasMedia;
}
