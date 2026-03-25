import { query } from '../services/postgres.js';

// Keywords por defecto derivadas de KEYWORD_RULES (simples, para text.includes)
const DEFAULT_KEYWORDS = [
  { topic: 'pagos',       keyword: 'pago' },
  { topic: 'pagos',       keyword: 'retiro' },
  { topic: 'pagos',       keyword: 'deposito' },
  { topic: 'pagos',       keyword: 'transferencia' },
  { topic: 'pagos',       keyword: 'saldo' },
  { topic: 'pagos',       keyword: 'pse' },
  { topic: 'pagos',       keyword: 'recarga' },
  { topic: 'cuentas',     keyword: 'cuenta' },
  { topic: 'cuentas',     keyword: 'login' },
  { topic: 'cuentas',     keyword: 'acceso' },
  { topic: 'cuentas',     keyword: 'credencial' },
  { topic: 'cuentas',     keyword: 'usuario' },
  { topic: 'cuentas',     keyword: 'clave' },
  { topic: 'bloqueos',    keyword: 'bloqueado' },
  { topic: 'bloqueos',    keyword: 'suspendido' },
  { topic: 'bloqueos',    keyword: 'baneado' },
  { topic: 'bloqueos',    keyword: 'desbloquear' },
  { topic: 'documentos',  keyword: 'documento' },
  { topic: 'documentos',  keyword: 'firma' },
  { topic: 'documentos',  keyword: 'escanear' },
  { topic: 'documentos',  keyword: 'pdf' },
  { topic: 'documentos',  keyword: 'soporte' },
  { topic: 'ayuda',       keyword: 'ayuda' },
  { topic: 'ayuda',       keyword: 'necesito ayuda' },
  { topic: 'ayuda',       keyword: 'puedes ayudarme' },
  { topic: 'ayuda',       keyword: 'ayudame' },
  { topic: 'token',       keyword: 'token' },
  { topic: 'token',       keyword: '2fa' },
  { topic: 'token',       keyword: 'doble factor' },
  { topic: 'monetizacion',keyword: 'monetizacion' },
  { topic: 'monetizacion',keyword: 'monetizar' },
  { topic: 'monetizacion',keyword: 'ingresos' },
  { topic: 'monetizacion',keyword: 'ganancias' },
  { topic: 'vinculacion', keyword: 'vinculacion' },
  { topic: 'vinculacion', keyword: 'vincular' },
  { topic: 'vinculacion', keyword: 'enlazar' },
  { topic: 'vinculacion', keyword: 'asociar' },
  { topic: 'soporte',     keyword: 'mesa de ayuda' },
  { topic: 'soporte',     keyword: 'servicio al cliente' },
  { topic: 'soporte',     keyword: 'atencion' },
];

export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS "configKeywords" (
      id       SERIAL PRIMARY KEY,
      topic    VARCHAR(100) NOT NULL,
      keyword  VARCHAR(255) NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(topic, keyword)
    )
  `);
}

/** Siembra keywords por defecto solo si la tabla está vacía */
export async function seedDefaultKeywords() {
  const { rows } = await query('SELECT COUNT(*) AS cnt FROM "configKeywords"');
  if (Number(rows[0].cnt) > 0) return;
  for (const { topic, keyword } of DEFAULT_KEYWORDS) {
    await query(
      `INSERT INTO "configKeywords" (topic, keyword) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [topic, keyword]
    );
  }
  console.log('[configKeywords] Sembradas keywords por defecto');
}

export async function listKeywords() {
  const { rows } = await query(
    'SELECT id, topic, keyword, "createdAt" FROM "configKeywords" ORDER BY topic, keyword'
  );
  return rows;
}

export async function addKeyword(topic, keyword) {
  const { rows } = await query(
    `INSERT INTO "configKeywords" (topic, keyword)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [topic.trim().toLowerCase(), keyword.trim().toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function deleteKeyword(id) {
  await query('DELETE FROM "configKeywords" WHERE id = $1', [id]);
}
