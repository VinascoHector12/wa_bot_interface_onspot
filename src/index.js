import { safeInitializeOnce } from './services/whatsapp.js';
import { initReadyHandler } from './handlers/readyHandler.js';
import { initMessageHandler } from './handlers/messageHandler.js';
import { startDashboardServer } from './web/dashboardServer.js';
import { OPENAI_MODEL, OPENAI_API_KEY } from './config.js';
import { checkBridgeHealth } from './services/bridgeClient.js';

console.log('[OpenAI] Modelo:', OPENAI_MODEL || '(no definido)');
console.log('[OpenAI] API key presente:', !!OPENAI_API_KEY);

// Verificar Bridge Service si está habilitado
const USE_BRIDGE = process.env.USE_BRIDGE_SERVICE === 'true';
if (USE_BRIDGE) {
  console.log('[Bridge] Modo habilitado, verificando conexión...');
  checkBridgeHealth().then(healthy => {
    if (healthy) {
      console.log('[Bridge] ✅ Conexión exitosa con bridge service');
    } else {
      console.warn('[Bridge] ⚠️  No se pudo conectar - usando OpenAI como fallback');
    }
  }).catch(err => {
    console.error('[Bridge] ❌ Error verificando salud:', err.message);
  });
} else {
  console.log('[Bridge] Modo deshabilitado - usando OpenAI directo');
}

// Conecta handlers ANTES de iniciar
initReadyHandler();
initMessageHandler();

async function main() {
  startDashboardServer();       // panel
  await safeInitializeOnce();   // inicializa solo una vez (sin relanzar)
}
main().catch(err => {
  console.error('[boot] fatal:', err);
  process.exit(1);
});

// Logs globales para no perder errores silenciosos
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException',  (e) => console.error('[uncaughtException]', e));
