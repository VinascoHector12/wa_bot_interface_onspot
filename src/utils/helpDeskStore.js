import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'helpdesk.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ chats: {} }, null, 2));
}
function read() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { chats: {} };
  }
}
function write(db) {
  ensureFile();
  try {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  } catch {}
}

// ➕ Al pedir ayuda, el chat entra o queda en PAUSA por defecto
// extra: { phone, name } — se persiste para mostrar en el panel
export function addHelpRequest(chatId, extra = {}) {
  const db = read();
  if (!db.chats[chatId]) {
    db.chats[chatId] = { chatId, createdAt: Date.now(), paused: true, pausedAt: Date.now() };
  } else {
    db.chats[chatId].paused = true;
    db.chats[chatId].pausedAt = Date.now();
  }
  if (extra.phone) db.chats[chatId].phone = extra.phone;
  if (extra.name)  db.chats[chatId].name  = extra.name;
  write(db);
}
export function removeHelpRequest(chatId) {
  const db = read();
  if (db.chats[chatId]) {
    delete db.chats[chatId];
    write(db);
  }
}
export function listHelpRequests() {
  const db = read();
  return Object.values(db.chats);
}
export function isHelpRequested(chatId) {
  const db = read();
  return Boolean(db.chats[chatId]);
}
export function pauseChat(chatId) {
  const db = read();
  if (!db.chats[chatId]) db.chats[chatId] = { chatId, createdAt: Date.now(), paused: true };
  db.chats[chatId].paused = true;
  db.chats[chatId].pausedAt = Date.now();
  write(db);
}
export function resumeChat(chatId) {
  const db = read();
  if (db.chats[chatId]) {
    db.chats[chatId].paused = false;
    delete db.chats[chatId].pausedAt;
    write(db);
  }
}
export function isPaused(chatId) {
  const db = read();
  return Boolean(db.chats[chatId]?.paused);
}
