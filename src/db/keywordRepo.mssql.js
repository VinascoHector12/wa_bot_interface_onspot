// Persistencia y consultas para keywordEvents SIN dependencias externas.
// Usa getPool()/sql desde src/services/mssql.js y genera timestamps en hora local (America/Bogota).
import { sql, getPool } from '../services/mssql.js';

// Helper: 'YYYY-MM-DD HH:mm:ss' en America/Bogota
function formatBogotaYmdHms(dateLike = undefined) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
    const get = (type) => parts.find(p => p.type === type)?.value || '';
  const y = get('year'), mo = get('month'), da = get('day');
  const h = get('hour'), mi = get('minute'), se = get('second');
  return `${y}-${mo}-${da} ${h}:${mi}:${se}`;
}

// Inserta múltiples eventos. items: { chatId, phone, keyword, topic, source, tsMs? }[]
export async function saveKeywordEventsBulk(items = []) {
  if (!items?.length) return;
  //Para bulk, usa 'schema.table' (sin nombre de base) para que use la DB del pool actual
  const table = new sql.Table('dbo.keywordEvents_prod');
  table.create = false;
  table.columns.add('chatId',  sql.NVarChar(64), { nullable: false });
  table.columns.add('phone',   sql.NVarChar(32), { nullable: true  });
  table.columns.add('keyword', sql.NVarChar(64), { nullable: false });
  table.columns.add('topic',   sql.NVarChar(64), { nullable: true  });
  table.columns.add('source',  sql.NVarChar(32), { nullable: true  });
  table.columns.add('ts',      sql.DateTime2,    { nullable: false });

  for (const it of items) {
    const tsLocal = formatBogotaYmdHms(it.tsMs ? new Date(it.tsMs) : undefined);
    table.rows.add(
      it.chatId,
      it.phone || null,
      it.keyword || '',
      it.topic || null,
      it.source || 'text',
      tsLocal
    );
  }
  const pool = await getPool();
  await pool.request().bulk(table);
}

// === Reportes ===

export async function getKeywordDaily({ fromTs, toTs, chatId = null, phone = null, topicsCsv = '' }) {
  const q = `
    WITH topics AS (
      SELECT LTRIM(RTRIM(value)) AS t
      FROM STRING_SPLIT(@topicsCsv, ',')
    )
    SELECT
      CAST(e.ts AS DATE) AS day_local,
      e.topic,
      COUNT(*)          AS total
    FROM dbo.keywordEvents_prod e
    WHERE e.ts >= @fromTs AND e.ts < @toTs
      AND ISNULL(e.chatId,'') <> 'status@broadcast'        -- ⛔ excluye sistema
      AND (@chatId IS NULL OR e.chatId = @chatId)
      AND (@phone  IS NULL OR e.phone  = @phone)
      AND (
        @topicsCsv = '' OR
        EXISTS (SELECT 1 FROM topics WHERE topics.t = e.topic)
      )
    GROUP BY CAST(e.ts AS DATE), e.topic
    ORDER BY day_local ASC, e.topic ASC;
  `;
  const pool = await getPool();
  const req = pool.request();
  req.input('fromTs', sql.DateTime2, fromTs);
  req.input('toTs',   sql.DateTime2, toTs);
  req.input('chatId', sql.NVarChar(64), chatId);
  req.input('phone',  sql.NVarChar(32), phone);
  req.input('topicsCsv', sql.NVarChar(400), topicsCsv || '');
  const rs = await req.query(q);
  return rs.recordset;
}

const TOPICS = ['pagos','cuentas','cambiar cuenta','bloqueos','documentos','ayuda','token','monetizacion','vinculacion','soporte'];

export async function getKeywordUsers({
  fromTs, toTs, search = '', limit = 100, offset = 0, sort = 'total_desc', topicsCsv = ''
}) {
  const sortSql = ({
    'total_desc': 'total DESC',
    'name_asc': 'name ASC',
  })[sort] || 'total DESC';

  const sumCols = TOPICS
    .map(t => `SUM(CASE WHEN e.topic = N'${t}' THEN 1 ELSE 0 END) AS [${t}]`)
    .join(',\n             ');

  const q = `
    WITH topics AS (
      SELECT LTRIM(RTRIM(value)) AS t
      FROM STRING_SPLIT(@topicsCsv, ',')
    ),
    base AS (
      SELECT e.chatId, e.phone, MAX(e.ts) AS last_ts, COUNT(*) AS total,
             ${sumCols}
      FROM dbo.keywordEvents_prod e
      WHERE e.ts >= @fromTs AND e.ts < @toTs
        AND ISNULL(e.chatId,'') <> 'status@broadcast'      -- ⛔ excluye sistema
        AND (
          @topicsCsv = '' OR
          EXISTS (SELECT 1 FROM topics WHERE topics.t = e.topic)
        )
        AND (
          @search = '' OR
          e.chatId LIKE @searchLike OR
          e.phone  LIKE @searchLike
        )
      GROUP BY e.chatId, e.phone
    )
    SELECT *
    FROM base
    ORDER BY ${sortSql}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `;
  const pool = await getPool();
  const req = pool.request();
  req.input('fromTs', sql.DateTime2, fromTs);
  req.input('toTs',   sql.DateTime2, toTs);
  req.input('search', sql.NVarChar(128), search || '');
  req.input('searchLike', sql.NVarChar(128), `%${search || ''}%`);
  req.input('limit',  sql.Int, Math.min(Number(limit || 100), 200));
  req.input('offset', sql.Int, Math.max(Number(offset || 0), 0));
  req.input('topicsCsv', sql.NVarChar(400), topicsCsv || '');
  const rs = await req.query(q);

  // Formato local (America/Bogota)  
  return rs.recordset.map(r => ({
    ...r,
    last_ts_local: r.last_ts ? formatBogotaYmdHms(r.last_ts) : null
  }));
}
