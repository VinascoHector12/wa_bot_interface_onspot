// src/services/whatsapp.js
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import { HEADLESS, MEDIA_DIR } from '../config.js';

export { MessageMedia };
export const onlineContacts = new Set();

/** Flags seguros; no relanzan procesos extra y mejoran estabilidad en Windows */
const PUP_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage'
];

/** Cliente WA: sin executablePath forzado ni rutas locales obligatorias */
export const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'bot-onspot' }),
  puppeteer: {
    headless: HEADLESS,
    args: PUP_ARGS,
    timeout: 0,
    // Mejora compatibilidad/oclusiones en headful
    defaultViewport: null,
    ignoreHTTPSErrors: true
  },
  takeoverOnConflict: true,
  takeoverTimeoutMs: 5000,
  // Evita bucles de reintento internos; preferimos el control manual
  // restartOnAuthFail: false, // <- descomenta si tu versión lo soporta y lo prefieres
  qrMaxRetries: 0, // mostrar QR hasta que se escanee
  // ✅ Cachea la webapp local para arrancar más rápido
  webVersionCache: { type: 'local' }
});

/* ===== Eventos (solo logging; NO re-inicializan) ===== */
client.on('qr', (qr) => {
  console.log('[wa] QR recibido. Escanéalo para iniciar sesión.');
  try { qrcode.generate(qr, { small: true }); } catch {}
});
client.on('authenticated', () => console.log('[wa] ✅ Auth OK'));
client.on('auth_failure', (m) => console.error('[wa] ❌ Auth failure:', m));
client.on('ready', () => console.log('[wa] ✅ READY (cliente operativo)'));
client.on('change_state', (s) => console.log('[wa] state ->', s));
client.on('loading_screen', (p, m) => console.log('[wa] loading:', p, m));
client.on('disconnected', (reason) => {
  console.error('[wa] 🔌 Disconnected:', reason);
  // IMPORTANTE: no relanzamos aquí ni en ningún otro lugar
  // Solo liberamos la promesa para permitir un reintento MANUAL (safeInitializeOnce)
  _initPromise = null;
});

/* Carpeta media */
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/* ===== Inicialización "una sola vez" =====
   - Si ya se llamó, reutiliza la MISMA promesa (no abre nuevas pestañas)
   - Si falla o se desconecta, podrás reintentar manualmente cuando quieras
*/
let _initPromise = null;
export function safeInitializeOnce() {
  if (_initPromise) return _initPromise;
  console.log('[wa] initialize() once');
  _initPromise = client.initialize().catch(err => {
    console.error('[wa] initialize() error:', err);
    _initPromise = null; // permite intento manual posterior si tú lo decides
    throw err;
  });
  return _initPromise;
}

/* Estado tolerante a errores (por si quieres inspeccionarlo externamente) */
export async function getStateSafe() {
  try { return await client.getState(); }
  catch { return 'DISCONNECTED'; }
}
