import fs from 'fs';
import { oa } from './openai.js';
import { ASR_MODEL, ASR_LANG } from '../config.js';

/**
 * Transcribe un archivo de audio local (ogg/mp3/wav/webm/m4a, etc.)
 * Devuelve texto plano sin saltos extra.
 */
export async function transcribeAudioFile(filePath, { language = ASR_LANG } = {}) {
  const stream = fs.createReadStream(filePath);
  const resp = await oa.audio.transcriptions.create({
    file: stream,
    model: ASR_MODEL,       // 'whisper-1' | 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe'
    language: language || undefined  // fija 'es' para español si quieres forzar
  });
  const text = (resp?.text || '').replace(/\s+\n/g, '\n').trim();
  return text;
}
