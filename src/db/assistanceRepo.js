import { query } from '../services/postgres.js';

export async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS "assistanceNumbers" (
      id      SERIAL PRIMARY KEY,
      phone   VARCHAR(50)  NOT NULL UNIQUE,
      name    VARCHAR(100) NOT NULL DEFAULT '',
      active  BOOLEAN      NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "assistanceKeywords" (
      id        SERIAL PRIMARY KEY,
      "numberId" INT NOT NULL REFERENCES "assistanceNumbers"(id) ON DELETE CASCADE,
      keyword   VARCHAR(255) NOT NULL,
      UNIQUE("numberId", keyword)
    )
  `);
}

/** Lista todos los números con sus keywords asociadas */
export async function listNumbers() {
  const { rows: nums } = await query(
    'SELECT id, phone, name, active, "createdAt" FROM "assistanceNumbers" ORDER BY "createdAt" DESC'
  );
  const { rows: kws } = await query(
    'SELECT "numberId", keyword FROM "assistanceKeywords" ORDER BY keyword'
  );
  return nums.map(n => ({
    ...n,
    keywords: kws.filter(k => k.numberId === n.id).map(k => k.keyword)
  }));
}

export async function addNumber(phone, name) {
  const { rows } = await query(
    'INSERT INTO "assistanceNumbers" (phone, name) VALUES ($1, $2) RETURNING *',
    [phone.trim(), (name || '').trim()]
  );
  return { ...rows[0], keywords: [] };
}

export async function deleteNumber(id) {
  await query('DELETE FROM "assistanceNumbers" WHERE id = $1', [id]);
}

export async function toggleNumber(id, active) {
  await query('UPDATE "assistanceNumbers" SET active = $2 WHERE id = $1', [id, active]);
}

export async function addKeywordToNumber(numberId, keyword) {
  await query(
    `INSERT INTO "assistanceKeywords" ("numberId", keyword)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [numberId, keyword.trim().toLowerCase()]
  );
}

export async function removeKeywordFromNumber(numberId, keyword) {
  await query(
    'DELETE FROM "assistanceKeywords" WHERE "numberId" = $1 AND keyword = $2',
    [numberId, keyword.trim().toLowerCase()]
  );
}

/**
 * Siembra el número de asistencia del .env si la tabla está vacía.
 * Lo agrega con la keyword 'ayuda' para mantener el comportamiento actual.
 */
export async function seedFromEnv(rawPhone) {
  if (!rawPhone) return;
  const { rows } = await query('SELECT COUNT(*) AS cnt FROM "assistanceNumbers"');
  if (Number(rows[0].cnt) > 0) return;

  // Normalizar: quitar @c.us si viene con sufijo
  const phone = rawPhone.replace(/@c\.us$/, '').trim();
  if (!phone) return;

  const { rows: inserted } = await query(
    'INSERT INTO "assistanceNumbers" (phone, name) VALUES ($1, $2) RETURNING id',
    [phone, 'Principal']
  );
  if (inserted.length > 0) {
    await query(
      `INSERT INTO "assistanceKeywords" ("numberId", keyword) VALUES ($1, 'ayuda') ON CONFLICT DO NOTHING`,
      [inserted[0].id]
    );
  }
  console.log(`[assistanceRepo] Sembrado número desde env: ${phone}`);
}

/** Devuelve los números activos asociados a una keyword dada */
export async function getNumbersByKeyword(keyword) {
  const { rows } = await query(`
    SELECT n.id, n.phone, n.name
    FROM "assistanceNumbers" n
    JOIN "assistanceKeywords" k ON k."numberId" = n.id
    WHERE n.active = TRUE
      AND LOWER(k.keyword) = LOWER($1)
  `, [keyword]);
  return rows;
}
