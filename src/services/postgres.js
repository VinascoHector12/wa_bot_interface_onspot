// src/services/postgres.js
// Reemplaza src/services/mssql.js
// Driver: pg (node-postgres)  →  npm install pg
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ─── Pool de conexiones ────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DB       || 'whatsappbot',
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max:               10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => console.error('[postgres] pool error:', err));

// Exportamos getPool() con la misma firma que mssql.js para no romper nada
export function getPool() { return pool; }

// Helper de queries directo (usado internamente en los repos)
export async function query(text, params = []) {
  return pool.query(text, params);
}
