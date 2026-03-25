import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde src/.env
dotenv.config({ path: path.join(__dirname, '.env') });

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const OPENAI_API_KEY = process.env.WA_OPENAI_API_KEY;

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
export const MEDIA_DIR = process.env.MEDIA_DIR ?? path.join(__dirname, 'media');
export const DRIVE_IMAGE_FOLDER_ID = process.env.DRIVE_IMAGE_FOLDER_ID;
export const GOOGLE_DRIVE_KEYFILE = process.env.GOOGLE_DRIVE_KEYFILE;

// Si tienes el .env bien configurado, lo tomará; si no, usa tu fallback actual.
export const ASSISTANCE_NUMBER = process.env.ASSISTANCE_NUMBER; 

// Umbral de tiempo para responder “pendientes” al encender
export const PENDING_THRESHOLD_S = (72 * 60 * 60); //72 horas Pruebas

// Tiempo de pausa por interacción humana
export const HUMAN_TAKEOVER_SECONDS = 60; // 5 min por defecto

// Timestamp del arranque: útil para ignorar backlog en onMessage
export const BOOT_TS = Math.floor(Date.now() / 1000); 

// Historial de mensajes a guardar
export const MAX_HISTORY = 10;

// Puppeteer visible o headless
export const HEADLESS = process.env.HEADLESS;

// === Audio / Speech-to-Text ===
export const ASR_ENABLED = String(process.env.ASR_ENABLED ?? 'true').toLowerCase() === 'true';
export const ASR_MODEL = process.env.ASR_MODEL ?? 'whisper-1'; // o 'gpt-4o-mini-transcribe' / 'gpt-4o-transcribe'
export const ASR_LANG  = process.env.ASR_LANG  ?? ''; // '' = auto-detect; 'es' acelera español

// 🔧 Límites de sugerencia de imágenes (para bajar CPU/IO)
export const MEDIA_SUGGEST_MAX_IMAGES = Number(process.env.MEDIA_SUGGEST_MAX_IMAGES ?? 48);
export const MEDIA_SUGGEST_TOPK = Number(process.env.MEDIA_SUGGEST_TOPK ?? 3);

// Seguridad básica
if (!OPENAI_API_KEY) {
  console.warn('[config] Falta OPENAI_API_KEY en .env');
}
