import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { upsertIdentity } from '../db/identityRepo.js';
import '../services/postgres.js'; // init pool

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.join(__dirname, '..', 'data', 'identities.json');

(async () => {
  const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const entries = Object.values(all || {});
  console.log('Seeding', entries.length, 'identities...');
  for (const rec of entries) {
    if (!rec?.chatId) continue;
    const seed = {
      chatId: rec.chatId,
      phone: rec.phone ?? rec.chatId.replace('@c.us',''),
      isIdentified: !!rec.isIdentified,
      introDone: !!rec.introDone,
      name: rec.name ?? null,
      origin: rec.origin ?? null,
      via: rec.via ?? null,
      expectingOrigin: !!rec.expectingOrigin,
      askedIntroAt: rec.askedIntroAt ?? null,
      askCount: rec.askCount ?? 0,
      updatedAt: rec.updatedAt ?? Date.now(),
      firstSeen: rec.firstSeen ?? Date.now()
    };
    await upsertIdentity(seed);
  }
  console.log('OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
