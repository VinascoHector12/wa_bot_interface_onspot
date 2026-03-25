import sql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde src/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST || 'DESKTOP-N79IL9B',
  database: process.env.MSSQL_DB || 'WhatsAppBot',
  port: Number(process.env.MSSQL_PORT || 1433),
  options: {
    encrypt: String(process.env.MSSQL_ENCRYPT ?? 'true').toLowerCase() === 'true',
    trustServerCertificate: String(process.env.MSSQL_TRUST_SERVER_CERT ?? 'true').toLowerCase() === 'true'
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let poolPromise;
export function getPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(config);
    pool.on('error', (err) => console.error('[mssql] pool error:', err));
    poolPromise = pool.connect();
  }
  return poolPromise;
}
export { sql };
