// migrate_mssql_to_postgres.mjs
// ─────────────────────────────────────────────────────────────
// Copia las 3 tablas de SQL Server → PostgreSQL.
// Ejecutar UNA SOLA VEZ desde la raíz del proyecto:
//
//   node migrate_mssql_to_postgres.mjs
//
// Requiere: npm install mssql pg dotenv
// Lee credenciales del archivo src/.env
// ─────────────────────────────────────────────────────────────
import sql  from 'mssql';
import pg   from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'src', '.env') });

// ── Conexión SQL Server (origen) ──────────────────────────────
const mssqlCfg = {
  user:     process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server:   process.env.MSSQL_HOST,
  database: process.env.MSSQL_DB,
  port:     Number(process.env.MSSQL_PORT || 1433),
  options: {
    encrypt:                String(process.env.MSSQL_ENCRYPT             ?? 'true').toLowerCase() === 'true',
    trustServerCertificate: String(process.env.MSSQL_TRUST_SERVER_CERT   ?? 'true').toLowerCase() === 'true',
  },
};

// ── Conexión PostgreSQL (destino) ─────────────────────────────
const pgCfg = {
  host:     process.env.PG_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DB       || 'whatsappbot',
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const BATCH = 500;

// ── Helpers de log ─────────────────────────────────────────────
const tick  = (n, t) => process.stdout.write(`\r   ${n.toLocaleString()} / ${t.toLocaleString()} filas...`);
const ok    = (msg)  => console.log(`\n✔  ${msg}`);
const fail  = (msg)  => console.error(`\n✖  ${msg}`);

// ── Función genérica de copia ──────────────────────────────────
async function copyTable({ mssqlPool, pgClient, srcTable, destTable, selectSql, insertSql, rowMap }) {
  console.log(`\n→ [${srcTable}] → [${destTable}]`);

  const { recordset } = await mssqlPool.request().query(selectSql);
  const total = recordset.length;
  if (total === 0) { console.log('   (vacía, se omite)'); return; }

  for (let i = 0; i < total; i += BATCH) {
    const batch = recordset.slice(i, i + BATCH);

    const placeholders = batch.map((_, ri) => {
      const n = rowMap(batch[0]).length; // nro de columnas
      const start = ri * n + 1;
      return `(${Array.from({length: n}, (_, ci) => `$${start + ci}`).join(',')})`;
    });
    const values = batch.flatMap(row => rowMap(row));

    await pgClient.query(`${insertSql} VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`, values);
    tick(Math.min(i + BATCH, total), total);
  }
  ok(`${total.toLocaleString()} filas migradas`);
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Migración  SQL Server → PostgreSQL');
  console.log('══════════════════════════════════════════');

  // Conectar SQL Server
  process.stdout.write('\nConectando a SQL Server... ');
  const mssqlPool = await new sql.ConnectionPool(mssqlCfg).connect();
  console.log('OK');

  // Conectar PostgreSQL
  process.stdout.write('Conectando a PostgreSQL... ');
  const pgClient = new pg.Client(pgCfg);
  await pgClient.connect();
  console.log('OK');

  try {
    await pgClient.query('BEGIN');

    // ── 1. usersIdentities (sin FK, primero) ──────────────────
    await copyTable({
      mssqlPool, pgClient,
      srcTable:  'usersIdentities_prod',
      destTable: 'usersIdentities',
      selectSql: `
        SELECT chatId, phone, isIdentified, introDone, name, origin, via,
               expectingOrigin, askedIntroAt, askCount, updatedAt, firstSeen
        FROM dbo.usersIdentities_prod
      `,
      insertSql: `
        INSERT INTO "usersIdentities"
          ("chatId",phone,"isIdentified","introDone",name,origin,via,
           "expectingOrigin","askedIntroAt","askCount","updatedAt","firstSeen")
      `,
      rowMap: r => [
        r.chatId,
        r.phone            ?? null,
        r.isIdentified     ? true : false,
        r.introDone        ? true : false,
        r.name             ?? null,
        r.origin           ?? null,
        r.via              ?? null,
        r.expectingOrigin  ? true : false,
        r.askedIntroAt     ?? null,
        r.askCount         ?? 0,
        r.updatedAt        ?? new Date(),
        r.firstSeen        ?? new Date(),
      ],
    });

    // ── 2. chatMessages ───────────────────────────────────────
    await copyTable({
      mssqlPool, pgClient,
      srcTable:  'chatMessages_prod',
      destTable: 'chatMessages',
      selectSql: `
        SELECT chatId, phone, role, msgType, content, ts
        FROM dbo.chatMessages_prod
        ORDER BY id
      `,
      insertSql: `
        INSERT INTO "chatMessages" ("chatId",phone,role,"msgType",content,ts)
      `,
      rowMap: r => [
        r.chatId,
        r.phone   ?? null,
        r.role,
        r.msgType ?? 'chat',
        r.content ?? null,
        r.ts      ?? new Date(),
      ],
    });

    // ── 3. keywordEvents ──────────────────────────────────────
    await copyTable({
      mssqlPool, pgClient,
      srcTable:  'keywordEvents_prod',
      destTable: 'keywordEvents',
      selectSql: `
        SELECT chatId, phone, keyword, topic, source, ts
        FROM dbo.keywordEvents_prod
        ORDER BY id
      `,
      insertSql: `
        INSERT INTO "keywordEvents" ("chatId",phone,keyword,topic,source,ts)
      `,
      rowMap: r => [
        r.chatId,
        r.phone   ?? null,
        r.keyword,
        r.topic   ?? null,
        r.source  ?? null,
        r.ts      ?? new Date(),
      ],
    });

    // ── Reajustar sequences ───────────────────────────────────
    console.log('\n→ Reajustando sequences...');
    await pgClient.query(`
      SELECT setval(
        pg_get_serial_sequence('"chatMessages"', 'id'),
        COALESCE((SELECT MAX(id) FROM "chatMessages"), 1)
      );
    `);
    await pgClient.query(`
      SELECT setval(
        pg_get_serial_sequence('"keywordEvents"', 'id'),
        COALESCE((SELECT MAX(id) FROM "keywordEvents"), 1)
      );
    `);
    ok('Sequences reajustados');

    await pgClient.query('COMMIT');
    console.log('\n🎉  Migración completada.\n');

  } catch (err) {
    await pgClient.query('ROLLBACK');
    fail('Error durante la migración — se hizo ROLLBACK');
    console.error(err);
    process.exit(1);
  } finally {
    await mssqlPool.close();
    await pgClient.end();
  }
}

main();
