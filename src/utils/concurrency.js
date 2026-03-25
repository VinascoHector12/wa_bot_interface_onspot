// Limita trabajos PESADOS (OCR/ASR/LLM) y permite ceder el event loop sin cambiar la lógica de negocio.
// Usa ENV para tunear sin tocar código:
//   HEAVY_CONCURRENCY=2     → cuántos OCR/ASR/LLM en paralelo máximo (2 por defecto)
//   YIELD_MS=0              → pausa mínima para ceder al loop (0..5 ms recomendado)

const HEAVY = Math.max(1, Number(process.env.HEAVY_CONCURRENCY || 2));
const YIELD_MS = Math.max(0, Number(process.env.YIELD_MS || 0));

function createLimiter(max = 2) {
  let running = 0; const q = [];
  const next = () => {
    if (running >= max || q.length === 0) return;
    const { fn, res, rej } = q.shift(); running++;
    Promise.resolve()
      .then(fn)
      .then(res)
      .catch(rej)
      .finally(() => { running--; next(); });
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

export const limitHeavy = createLimiter(HEAVY);

// Cede el event loop para que los "message" entrantes no se queden atrás
export function yieldToLoop(ms = YIELD_MS) {
  return new Promise(r => setTimeout(r, ms));
}
