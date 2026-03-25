import { client, safeInitialize, getStateSafe } from './whatsapp.js';

export function startWaWatchdog() {
  let backoff = 5_000;          // 5s inicial
  const MAX_BACKOFF = 60_000;   // hasta 60s

  async function tick() {
    const state = await getStateSafe();
    // Estados típicos: 'CONNECTED' | 'OPEN' | 'PAIRING' | 'TIMEOUT' | 'CONFLICT' | 'UNPAIRED' | 'UNLAUNCHED'
    if (!state || /DISCONNECTED|UNPAIRED|UNLAUNCHED|TIMEOUT/i.test(state)) {
      console.warn('[wa] Watchdog: estado', state, '→ reinitialize en', backoff,'ms');
      setTimeout(() => safeInitialize(), 50);       // dispara init
      backoff = Math.min(MAX_BACKOFF, backoff * 2); // exponencial
    } else {
      backoff = 5_000; // sano → resetea backoff
    }
  }

  // cada 20s chequea salud
  const id = setInterval(tick, 20_000);
  console.log('[wa] Watchdog iniciado (20s)');

  // opcional: ping de presencia para mantener sesión viva
  // const pingId = setInterval(() => client.sendPresenceAvailable().catch(()=>{}), 60_000);

  return () => {
    clearInterval(id);
    // clearInterval(pingId);
  };
}
