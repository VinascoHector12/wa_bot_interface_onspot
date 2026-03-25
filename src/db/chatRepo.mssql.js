import { getPool, sql } from '../services/mssql.js';

function toDateOrNull(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return new Date(Number(v));
  const d = new Date(v); return isNaN(d.getTime()) ? null : d;
}

// Inserta 1 mensaje
export async function insertMessage({ chatId, phone=null, role, msgType='chat', content=null, ts=Date.now() }) {
  const pool = await getPool();
  await pool.request()
    .input('chatId',  sql.NVarChar(64), chatId)
    .input('phone',   sql.NVarChar(32), phone)
    .input('role',    sql.VarChar(10),  role)
    .input('msgType', sql.VarChar(16),  msgType)
    .input('content', sql.NVarChar(sql.MAX), content)
    .input('ts',      sql.DateTime2(3), toDateOrNull(ts))
    .query(`
      INSERT INTO dbo.chatMessages_prod (chatId, phone, role, msgType, content, ts)
      VALUES (@chatId, @phone, @role, @msgType, @content, @ts)
    `);
}

// Insert masivo (para backfill)
export async function bulkInsert(messages = []) {
  if (!messages.length) return;
  const pool = await getPool();
  const table = new sql.Table('chatMessages_prod');
  table.create = false; // ya existe
  table.columns.add('chatId',  sql.NVarChar(64),  { nullable: false });
  table.columns.add('phone',   sql.NVarChar(32),  { nullable: true  });
  table.columns.add('role',    sql.VarChar(10),   { nullable: false });
  table.columns.add('msgType', sql.VarChar(16),   { nullable: false });
  table.columns.add('content', sql.NVarChar(sql.MAX), { nullable: true });
  table.columns.add('ts',      sql.DateTime2(3),  { nullable: false });

  for (const m of messages) {
    table.rows.add(
      m.chatId,
      m.phone ?? null,
      m.role,
      m.msgType ?? 'chat',
      m.content ?? null,
      toDateOrNull(m.ts) ?? new Date()
    );
  }
  await pool.request().bulk(table);
}

/** DAILY: cuenta por día (local) dentro de un rango de timestamps */
export async function getDailyCounts({ fromTs, toTs, chatId = null, phone = null }) {
  const pool = await getPool();
  const req = pool.request()
    .input('fromTs', sql.DateTime2(3), fromTs)      // 'YYYY-MM-DDTHH:mm:ss'
    .input('toTs',   sql.DateTime2(3), toTs)        // exclusivo
    .input('chatId', sql.NVarChar(64), chatId)
    .input('phone',  sql.NVarChar(32), phone);

  const userFilter = `
    AND (@chatId IS NULL OR cm.chatId=@chatId)
    AND (@phone  IS NULL OR cm.phone=@phone)
  `;

  const q = `
    WITH base AS (
      SELECT
        CAST(cm.ts AS date) AS day_local,  -- día local del servidor SQL
        cm.chatId,
        cm.role
      FROM dbo.chatMessages_prod cm
      WHERE cm.ts >= @fromTs AND cm.ts < @toTs
        AND cm.chatId <> 'status@broadcast'        -- ⛔ excluye sistema
      ${userFilter}
    )
    SELECT
      CONVERT(varchar(10), day_local, 23) AS day_local, -- 'YYYY-MM-DD' (texto)
      COUNT(DISTINCT chatId) AS chats,
      SUM(CASE WHEN role='user'      THEN 1 ELSE 0 END) AS user_msgs,
      SUM(CASE WHEN role='assistant' THEN 1 ELSE 0 END) AS assistant_msgs
    FROM base
    GROUP BY day_local
    ORDER BY day_local;
  `;
  const { recordset } = await req.query(q);
  return recordset;
}

/** USERS: totales por chatId dentro del rango, con búsqueda y orden/paginación */
export async function getUserCounts({ fromTs, toTs, search = null, limit = 50, offset = 0, sort = 'total_desc' }) {
  const pool = await getPool();
  const req = pool.request()
    .input('fromTs', sql.DateTime2(3), fromTs)
    .input('toTs',   sql.DateTime2(3), toTs)
    .input('limit',  sql.Int,          limit)
    .input('offset', sql.Int,          offset);

  let whereSearch = '';
  if (search && search.trim()) {
    // Busca por chatId/phone y nombre en identidades y *_prod
    whereSearch = `AND (
      a.chatId LIKE @kw OR a.phone LIKE @kw OR 
      ISNULL(ui.name,'') LIKE @kw OR ISNULL(uip.name,'') LIKE @kw
    )`;
    req.input('kw', sql.NVarChar(100), `%${search.trim()}%`);
  }

  const order =
    sort === 'user_desc'       ? 'user_msgs DESC, assistant_msgs DESC'
  : sort === 'assistant_desc'  ? 'assistant_msgs DESC, user_msgs DESC'
  : sort === 'name_asc'        ? 'name ASC, total DESC'
  :                              'total DESC, user_msgs DESC';

  const q = `
    WITH base AS (
      SELECT cm.chatId, cm.phone, cm.role, cm.ts
      FROM dbo.chatMessages_prod cm
      WHERE cm.ts >= @fromTs AND cm.ts < @toTs
        AND cm.chatId <> 'status@broadcast'        -- ⛔ excluye sistema
    ),
    agg AS (
      SELECT
        b.chatId,
        MAX(b.phone) AS phone,
        SUM(CASE WHEN b.role='user'      THEN 1 ELSE 0 END) AS user_msgs,
        SUM(CASE WHEN b.role='assistant' THEN 1 ELSE 0 END) AS assistant_msgs,
        COUNT(*) AS total,
        MAX(b.ts) AS last_ts
      FROM base b
      GROUP BY b.chatId
    )
    SELECT
      a.chatId,
      a.phone,
      COALESCE(NULLIF(LTRIM(RTRIM(uip.name)), ''), NULLIF(LTRIM(RTRIM(ui.name)), ''))   AS name,
      COALESCE(NULLIF(LTRIM(RTRIM(uip.origin)), ''), NULLIF(LTRIM(RTRIM(ui.origin)), '')) AS origin,
      a.user_msgs,
      a.assistant_msgs,
      a.total,
      CONVERT(varchar(19), a.last_ts, 120) AS last_ts_local -- 'YYYY-MM-DD HH:MM:SS'
    FROM agg a
    LEFT JOIN dbo.usersIdentities_prod      ui  ON ui.chatId  = a.chatId
    LEFT JOIN dbo.usersIdentities_prod uip ON uip.chatId = a.chatId
    WHERE 1=1
      ${whereSearch}
    ORDER BY ${order}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `;
  const { recordset } = await req.query(q);
  return recordset;
}
