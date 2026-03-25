import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../services/postgres.js'; // init pool/.env
import { bulkInsert } from '../db/chatRepo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_DIR = path.join(__dirname, '..', 'history');

function parseChatIdFromFile(fileName) {
  // history_573183517214@c.us.json -> 573183517214@c.us
  return fileName.replace(/^history_/, '').replace(/\.json$/,'');
}

(async () => {
  const files = fs.readdirSync(HISTORY_DIR).filter(f => f.startsWith('history_') && f.endsWith('.json'));
  console.log('Backfilling', files.length, 'files...');
  for (const f of files) {
    const full = path.join(HISTORY_DIR, f);
    const arr = JSON.parse(fs.readFileSync(full, 'utf8'));
    const chatId = parseChatIdFromFile(f);
    const phone = chatId.replace('@c.us','');

    const rows = (arr || []).map(m => ({
      chatId,
      phone,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      msgType: 'chat',
      content: m.content ?? null,
      ts: m.ts ?? Date.now()
    }));

    if (rows.length) await bulkInsert(rows);
    console.log('✓', f, rows.length, 'msgs');
  }
  console.log('DONE');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
