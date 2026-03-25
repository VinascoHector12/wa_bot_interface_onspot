import { getPool, sql } from '../services/mssql.js';

const UI_TZ = process.env.UI_TZ || 'America/Bogota';

/* ==== helpers ==== */
function toDateOrNull(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  if (typeof v === 'string' && /^\d+$/.test(v)) { const d = new Date(Number(v)); return isNaN(d.getTime()) ? null : d; }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function fmtBogota(dt) {
  if (!dt) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: UI_TZ, day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', hour12:false
  }).format(dt);
}

/* ==== UPSERT ==== */
export async function upsertIdentity(rec) {
  const pool = await getPool();

  const asked   = toDateOrNull(rec.askedIntroAt);     // puede ser null
  const updated = toDateOrNull(rec.updatedAt) || new Date();
  const first   = toDateOrNull(rec.firstSeen) || new Date();

  const q = `
    MERGE dbo.usersIdentities_prod AS T
    USING (SELECT @chatId AS chatId) AS S
      ON (T.chatId = S.chatId)
    WHEN MATCHED THEN UPDATE SET
        phone=@phone, isIdentified=@isIdentified, introDone=@introDone,
        name=@name, origin=@origin, via=@via, expectingOrigin=@expectingOrigin,
        askedIntroAt=@askedIntroAt, askCount=@askCount, updatedAt=@updatedAt
    WHEN NOT MATCHED THEN
      INSERT (chatId, phone, isIdentified, introDone, name, origin, via,
              expectingOrigin, askedIntroAt, askCount, updatedAt, firstSeen)
      VALUES (@chatId, @phone, @isIdentified, @introDone, @name, @origin, @via,
              @expectingOrigin, @askedIntroAt, @askCount, @updatedAt, @firstSeen);
  `;

  await pool.request()
    .input('chatId',          sql.NVarChar(64),  rec.chatId)
    .input('phone',           sql.NVarChar(32),  rec.phone ?? null)
    .input('isIdentified',    sql.Bit,           rec.isIdentified ? 1 : 0)
    .input('introDone',       sql.Bit,           rec.introDone ? 1 : 0)
    .input('name',            sql.NVarChar(200), rec.name ?? null)
    .input('origin',          sql.NVarChar(50),  rec.origin ?? null)
    .input('via',             sql.NVarChar(50),  rec.via ?? null)
    .input('expectingOrigin', sql.Bit,           rec.expectingOrigin ? 1 : 0)
    .input('askedIntroAt',    sql.DateTime2(3),  asked)      // <-- datetime2
    .input('askCount',        sql.Int,           rec.askCount ?? 0)
    .input('updatedAt',       sql.DateTime2(3),  updated)    // <-- datetime2
    .input('firstSeen',       sql.DateTime2(3),  first)      // <-- datetime2
    .query(q);
}

/* ==== GET ==== */
export async function getIdentityByChatId(chatId) {
  const pool = await getPool();
  const { recordset } = await pool.request()
    .input('chatId', sql.NVarChar(64), chatId)
    .query(`
      SELECT chatId, phone, isIdentified, introDone, name, origin, via,
             expectingOrigin, askCount, askedIntroAt, updatedAt, firstSeen
      FROM dbo.usersIdentities_prod WHERE chatId=@chatId
    `);
  const r = recordset[0];
  if (!r) return null;

  // El driver mssql devuelve Date (UTC) para datetime2
  return {
    ...r,
    askedIntroAtText: r.askedIntroAt ? fmtBogota(r.askedIntroAt) : null,
    updatedAtText:    fmtBogota(r.updatedAt),
    firstSeenText:    fmtBogota(r.firstSeen)
  };
}
