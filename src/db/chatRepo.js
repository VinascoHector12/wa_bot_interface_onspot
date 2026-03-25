// src/db/chatRepo.js
// Reemplaza src/db/chatRepo.mssql.js  →  PostgreSQL (pg)
import { query } from '../services/postgres.js';

// ─── Helper ───────────────────────────────────────────────────────────────────
function toDateOrNull(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return new Date(Number(v));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Crea la tabla si no existe ───────────────────────────────────────────────
export async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS "chatMessages" (
      id       BIGSERIAL PRIMARY KEY,
      "chatId" VARCHAR(64)  NOT NULL,
      phone    VARCHAR(32),
      role     VARCHAR(10)  NOT NULL,
      "msgType" VARCHAR(16) NOT NULL DEFAULT 'chat',
      content  TEXT,
      ts       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chatid ON "chatMessages" ("chatId");
  `);
}

// ─── Inserta 1 mensaje ─────────────────────────────────────────────────────────
export async function insertMessage({
  chatId, phone = null, role, msgType = 'chat', content = null, ts = Date.now()
}) {
  await query(
    `INSERT INTO "chatMessages" ("chatId", phone, role, "msgType", content, ts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [chatId, phone, role, msgType, content, toDateOrNull(ts) ?? new Date()]
  );
}

// ─── GET historial reciente de un chat ────────────────────────────────────────
export async function getRecentHistory(chatId, limit = 10) {
  const { rows } = await query(
    `SELECT role, content, ts
     FROM "chatMessages"
     WHERE "chatId" = $1
     ORDER BY ts DESC
     LIMIT $2`,
    [chatId, limit]
  );
  return rows
    .reverse()
    .map(r => ({
      role: r.role,
      content: r.content || '',
      ts: r.ts instanceof Date ? r.ts.getTime() : Number(r.ts)
    }));
}

// ─── Insert masivo (backfill) ──────────────────────────────────────────────────
export async function bulkInsert(messages = []) {
  if (!messages.length) return;

  // Construye un INSERT multi-fila en un único round-trip
  const cols  = ['chatId', 'phone', 'role', 'msgType', 'content', 'ts'];
  const rows  = [];
  const vals  = [];
  let   pi    = 1;

  for (const m of messages) {
    rows.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4},$${pi+5})`);
    vals.push(
      m.chatId,
      m.phone   ?? null,
      m.role,
      m.msgType ?? 'chat',
      m.content ?? null,
      toDateOrNull(m.ts) ?? new Date()
    );
    pi += 6;
  }

  await query(
    `INSERT INTO "chatMessages" ("chatId",phone,role,"msgType",content,ts)
     VALUES ${rows.join(',')}`,
    vals
  );
}

// ─── DAILY: mensajes por día ───────────────────────────────────────────────────
export async function getDailyCounts({ fromTs, toTs, chatId = null, phone = null }) {
  const params = [fromTs, toTs];
  let pi = 3;

  const userFilter = [
    chatId !== null ? `AND cm."chatId" = $${pi++}` : '',
    phone  !== null ? `AND cm.phone    = $${pi++}` : '',
  ].join('\n');

  if (chatId !== null) params.push(chatId);
  if (phone  !== null) params.push(phone);

  const { rows } = await query(`
    WITH base AS (
      SELECT
        (cm.ts AT TIME ZONE 'America/Bogota')::date AS day_local,
        cm."chatId",
        cm.role
      FROM "chatMessages" cm
      WHERE cm.ts >= $1 AND cm.ts < $2
        AND cm."chatId" <> 'status@broadcast'
      ${userFilter}
    )
    SELECT
      TO_CHAR(day_local, 'YYYY-MM-DD')                              AS day_local,
      COUNT(DISTINCT "chatId")::int                                 AS chats,
      SUM(CASE WHEN role = 'user'      THEN 1 ELSE 0 END)::int     AS user_msgs,
      SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END)::int     AS assistant_msgs
    FROM base
    GROUP BY day_local
    ORDER BY day_local
  `, params);

  return rows;
}

// ─── USERS: totales por chatId, con búsqueda y paginación ─────────────────────
export async function getUserCounts({
  fromTs, toTs, search = null, limit = 50, offset = 0, sort = 'total_desc'
}) {
  const order =
    sort === 'user_desc'      ? 'user_msgs DESC, assistant_msgs DESC'
  : sort === 'assistant_desc' ? 'assistant_msgs DESC, user_msgs DESC'
  : sort === 'name_asc'       ? 'name ASC, total DESC'
  :                             'total DESC, user_msgs DESC';

  const params = [fromTs, toTs];
  let pi = 3;

  let whereSearch = '';
  if (search && search.trim()) {
    whereSearch = `AND (
      a."chatId" ILIKE $${pi}   OR
      a.phone    ILIKE $${pi}   OR
      COALESCE(ui.name,'')  ILIKE $${pi}
    )`;
    params.push(`%${search.trim()}%`);
    pi++;
  }

  params.push(limit, offset);
  const limitPh  = pi++;
  const offsetPh = pi++;

  const { rows } = await query(`
    WITH base AS (
      SELECT cm."chatId", cm.phone, cm.role, cm.ts
      FROM "chatMessages" cm
      WHERE cm.ts >= $1 AND cm.ts < $2
        AND cm."chatId" <> 'status@broadcast'
    ),
    agg AS (
      SELECT
        b."chatId",
        MAX(b.phone)                                                AS phone,
        SUM(CASE WHEN b.role='user'      THEN 1 ELSE 0 END)::int   AS user_msgs,
        SUM(CASE WHEN b.role='assistant' THEN 1 ELSE 0 END)::int   AS assistant_msgs,
        COUNT(*)::int                                               AS total,
        MAX(b.ts)                                                   AS last_ts
      FROM base b
      GROUP BY b."chatId"
    )
    SELECT
      a."chatId",
      a.phone,
      NULLIF(TRIM(COALESCE(ui.name,'')),  '')                      AS name,
      NULLIF(TRIM(COALESCE(ui.origin,'')), '')                     AS origin,
      a.user_msgs,
      a.assistant_msgs,
      a.total,
      TO_CHAR(
        a.last_ts AT TIME ZONE 'America/Bogota',
        'YYYY-MM-DD HH24:MI:SS'
      )                                                             AS last_ts_local
    FROM agg a
    LEFT JOIN "usersIdentities" ui ON ui."chatId" = a."chatId"
    WHERE 1=1
      ${whereSearch}
    ORDER BY ${order}
    LIMIT $${limitPh} OFFSET $${offsetPh}
  `, params);

  return rows;
}
