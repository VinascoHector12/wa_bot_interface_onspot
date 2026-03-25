import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dir = path.join(__dirname, '..', 'history');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export function getLastProcessedMsgId(chatId) {
  try {
    const file = path.join(dir, `last_processed_${chatId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')).id;
  } catch {
    return null;
  }
}

export function setLastProcessedMsgId(chatId, msgId) {
  const file = path.join(dir, `last_processed_${chatId}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify({ id: msgId }), 'utf8');
  } catch {}
}
