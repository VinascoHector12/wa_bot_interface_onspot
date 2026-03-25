import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_FILE = join(__dirname, '../prompts/training.txt');
let _cache = null;

/**
 * Carga el texto de entrenamiento desde el archivo prompts/training.txt.
 * El resultado se cachea en memoria.
 * Llama a invalidateTrainingCache() si el entrenamiento cambia en caliente.
 */
export function loadTrainingFromDB() {
  if (_cache !== null) return _cache;
  try {
    _cache = readFileSync(TRAINING_FILE, 'utf8');
    console.log(`[training] Cargado desde archivo (${_cache.length} chars)`);
  } catch (err) {
    console.error('[training] Error al cargar archivo de entrenamiento:', err.message);
    _cache = 'Eres un asistente que responde con respeto y brevedad. Si el usuario escribe "ayuda", indica que escalarás a un asesor humano.';
  }
  return _cache;
}

export function invalidateTrainingCache() {
  _cache = null;
}
