// src/scripts/demo-ocr-suggest.js
import path from 'path';
import { suggestMediaForQuery } from '../utils/ocrSuggest.js';

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  console.log(`\n🔎 Query: "${query}"\n`);

  const { best, candidates, all } = await suggestMediaForQuery(query, {
    lang: 'spa+eng',
    force: false,      // poner en true si cambiaste imágenes y quieres refrescar OCR
    maxImages: 200,
    topK: 3
  });

  if (!candidates.length) {
    console.log('⚠️  No encontré coincidencias con el OCR ni por nombre de archivo.');
    console.log('Archivos evaluados:', all.length);
    return;
  }

  console.log('📄 Candidatos (top por score):\n');
  candidates.forEach((c, i) => {
    const preview = (c.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    console.log(`#${i+1} score=${c.score}  file=${c.fileRel}`);
    console.log(`   nombre: ${c.fileName}`);
    console.log(`   OCR: "${preview}${c.text.length > preview.length ? '...' : ''}"\n`);
  });

  if (best) {
    console.log('✅ Sugeriría enviar:', best.fileRel);
  }
  console.log('\nListo.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
