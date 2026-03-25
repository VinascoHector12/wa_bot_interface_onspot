export function sleep(ms = 0) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Limitador de concurrencia simple.
 *  usage:
 *    const run = createLimiter(2);
 *    await run(() => tareaAsync());
 */
export function createLimiter(max = 2) {
  let running = 0;
  const queue = [];

  async function next() {
    if (running >= max || queue.length === 0) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    try {
      const res = await fn();
      resolve(res);
    } catch (e) {
      reject(e);
    } finally {
      running--;
      next();
    }
  }

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

/**
 * withTimeout(() => promesa(), 10000, 'Etiqueta')
 * Rechaza si la promesa no resuelve en el tiempo dado.
 */
export async function withTimeout(makePromise, ms = 10000, label = 'op') {
  let to;
  try {
    const waiter = new Promise((_, rej) => {
      to = setTimeout(() => rej(new Error(`${label} timeout (${ms}ms)`)), ms);
    });
    const res = await Promise.race([makePromise(), waiter]);
    return res;
  } finally {
    if (to) clearTimeout(to);
  }
}
