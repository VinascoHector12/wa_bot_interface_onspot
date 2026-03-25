// src/db/identityRepo.js
// Reemplaza src/db/identityRepo.mssql.js  →  PostgreSQL (pg)
import { query } from '../services/postgres.js';

const UI_TZ = process.env.UI_TZ || 'America/Bogota';

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    timeZone: UI_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(dt);
}

// ─── UPSERT (equivale al MERGE de T-SQL) ──────────────────────────────────────
export async function upsertIdentity(rec) {
  const asked   = toDateOrNull(rec.askedIntroAt);
  const updated = toDateOrNull(rec.updatedAt) || new Date();
  const first   = toDateOrNull(rec.firstSeen) || new Date();

  await query(`
    INSERT INTO "usersIdentities"
      ("chatId", phone, "isIdentified", "introDone", name, origin, via,
       "expectingOrigin", "askedIntroAt", "askCount", "updatedAt", "firstSeen")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT ("chatId") DO UPDATE SET
      phone             = EXCLUDED.phone,
      "isIdentified"    = EXCLUDED."isIdentified",
      "introDone"       = EXCLUDED."introDone",
      name              = EXCLUDED.name,
      origin            = EXCLUDED.origin,
      via               = EXCLUDED.via,
      "expectingOrigin" = EXCLUDED."expectingOrigin",
      "askedIntroAt"    = EXCLUDED."askedIntroAt",
      "askCount"        = EXCLUDED."askCount",
      "updatedAt"       = EXCLUDED."updatedAt"
      -- firstSeen NO se actualiza en update (solo en insert)
  `, [
    rec.chatId,
    rec.phone           ?? null,
    rec.isIdentified    ? true : false,
    rec.introDone       ? true : false,
    rec.name            ?? null,
    rec.origin          ?? null,
    rec.via             ?? null,
    rec.expectingOrigin ? true : false,
    asked,
    rec.askCount        ?? 0,
    updated,
    first,
  ]);
}

// ─── GET por chatId ────────────────────────────────────────────────────────────
export async function getIdentityByChatId(chatId) {
  const { rows } = await query(`
    SELECT "chatId", phone, "isIdentified", "introDone", name, origin, via,
           "expectingOrigin", "askCount", "askedIntroAt", "updatedAt", "firstSeen"
    FROM "usersIdentities"
    WHERE "chatId" = $1
  `, [chatId]);

  const r = rows[0];
  if (!r) return null;

  return {
    ...r,
    askedIntroAtText: r.askedIntroAt ? fmtBogota(r.askedIntroAt) : null,
    updatedAtText:    fmtBogota(r.updatedAt),
    firstSeenText:    fmtBogota(r.firstSeen),
  };
}
