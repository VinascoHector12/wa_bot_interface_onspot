import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'humanPause.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ map: {} }, null, 2));
}
function read() {
  ensure();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}
function write(db) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export function setHumanTakeover(chatId) {
  const db = read();
  db.map[chatId] = Date.now();
  write(db);
}
export function getHumanTakeover(chatId) {
  const db = read();
  return db.map[chatId] ?? null;
}
export function clearHumanTakeover(chatId) {
  const db = read();
  if (db.map[chatId]) {
    delete db.map[chatId];
    write(db);
  }
}
