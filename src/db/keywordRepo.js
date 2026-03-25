// src/db/keywordRepo.js
// Reemplaza src/db/keywordRepo.mssql.js  →  PostgreSQL (pg)
import { query } from '../services/postgres.js';

// ─── Helper de formato Bogotá ──────────────────────────────────────────────────
function formatBogotaYmdHms(dateLike = undefined) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

// ─── Crea la tabla si no existe ───────────────────────────────────────────────
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS "keywordEvents" (
      id       BIGSERIAL PRIMARY KEY,
      "chatId" VARCHAR(64)  NOT NULL,
      phone    VARCHAR(32),
      keyword  VARCHAR(255) NOT NULL,
      topic    VARCHAR(100),
      source   VARCHAR(20)  NOT NULL DEFAULT 'text',
      ts       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_keyword_events_chatid ON "keywordEvents" ("chatId");
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_keyword_events_ts ON "keywordEvents" (ts);
  `);
}

// ─── INSERT masivo de keyword events ──────────────────────────────────────────
export async function saveKeywordEventsBulk(items = []) {
  if (!items?.length) return;

  const rows = [];
  const vals = [];
  let pi = 1;

  for (const it of items) {
    const tsLocal = it.tsMs ? new Date(it.tsMs) : new Date();
    rows.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4},$${pi+5})`);
    vals.push(
      it.chatId,
      it.phone    || null,
      it.keyword  || '',
      it.topic    || null,
      it.source   || 'text',
      tsLocal
    );
    pi += 6;
  }

  await query(
    `INSERT INTO "keywordEvents" ("chatId",phone,keyword,topic,source,ts)
     VALUES ${rows.join(',')}`,
    vals
  );
}

// ─── Reporte diario de keywords por tópico ────────────────────────────────────
export async function getKeywordDaily({
  fromTs, toTs, chatId = null, phone = null, topicsCsv = ''
}) {
  const params = [fromTs, toTs];
  let pi = 3;

  const topicsFilter = topicsCsv.trim()
    ? `AND e.topic = ANY(
         SELECT TRIM(t) FROM UNNEST(string_to_array($${pi++}, ',')) AS t
       )`
    : '';
  if (topicsCsv.trim()) params.push(topicsCsv);

  const chatFilter  = chatId !== null ? `AND e."chatId" = $${pi++}` : '';
  const phoneFilter = phone  !== null ? `AND e.phone    = $${pi++}` : '';

  if (chatId !== null) params.push(chatId);
  if (phone  !== null) params.push(phone);

  const { rows } = await query(`
    SELECT
      (e.ts AT TIME ZONE 'America/Bogota')::date  AS day_local,
      e.topic,
      COUNT(*)::int                               AS total
    FROM "keywordEvents" e
    WHERE e.ts >= $1 AND e.ts < $2
      AND COALESCE(e."chatId",'') <> 'status@broadcast'
      ${topicsFilter}
      ${chatFilter}
      ${phoneFilter}
    GROUP BY (e.ts AT TIME ZONE 'America/Bogota')::date, e.topic
    ORDER BY day_local ASC, e.topic ASC
  `, params);

  return rows;
}

// ─── Reporte de keywords por usuario ──────────────────────────────────────────
const TOPICS = [
  'pagos','cuentas','cambiar cuenta','bloqueos','documentos',
  'ayuda','token','monetizacion','vinculacion','soporte'
];

export async function getKeywordUsers({
  fromTs, toTs, search = '', limit = 100, offset = 0,
  sort = 'total_desc', topicsCsv = ''
}) {
  const sortSql = sort === 'name_asc' ? 'total DESC' : 'total DESC'; // extender si hace falta

  // Columnas de suma por tópico (no hay N'...' en pg, solo cadena literal)
  const sumCols = TOPICS
    .map(t => `SUM(CASE WHEN e.topic = '${t.replace(/'/g,"''")}' THEN 1 ELSE 0 END)::int AS "${t}"`)
    .join(',\n             ');

  const params = [fromTs, toTs];
  let pi = 3;

  const topicsFilter = topicsCsv.trim()
    ? `AND e.topic = ANY(
         SELECT TRIM(t) FROM UNNEST(string_to_array($${pi++}, ',')) AS t
       )`
    : '';
  if (topicsCsv.trim()) params.push(topicsCsv);

  let searchFilter = '';
  if (search && search.trim()) {
    searchFilter = `AND (e."chatId" ILIKE $${pi} OR e.phone ILIKE $${pi})`;
    params.push(`%${search.trim()}%`);
    pi++;
  }

  params.push(Math.min(Number(limit || 100), 200));
  params.push(Math.max(Number(offset || 0), 0));
  const limitPh  = pi++;
  const offsetPh = pi++;

  const { rows } = await query(`
    WITH base AS (
      SELECT
        e."chatId",
        e.phone,
        MAX(e.ts)    AS last_ts,
        COUNT(*)::int AS total,
        ${sumCols}
      FROM "keywordEvents" e
      WHERE e.ts >= $1 AND e.ts < $2
        AND COALESCE(e."chatId",'') <> 'status@broadcast'
        ${topicsFilter}
        ${searchFilter}
      GROUP BY e."chatId", e.phone
    )
    SELECT *
    FROM base
    ORDER BY ${sortSql}
    LIMIT $${limitPh} OFFSET $${offsetPh}
  `, params);

  return rows.map(r => ({
    ...r,
    last_ts_local: r.last_ts ? formatBogotaYmdHms(r.last_ts) : null,
  }));
}
