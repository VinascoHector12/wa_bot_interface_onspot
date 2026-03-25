import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import {
  GOOGLE_DRIVE_KEYFILE,
  DRIVE_IMAGE_FOLDER_ID,
  MEDIA_DIR
} from '../config.js';

const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_DRIVE_KEYFILE,
  scopes: ['https://www.googleapis.com/auth/drive.readonly']
});
export const drive = google.drive({ version: 'v3', auth });

export async function findFirstImageByKeyword(keyword) {
  const folderId = DRIVE_IMAGE_FOLDER_ID;
  const safe = keyword.replace(/'/g, "\\'");
  const q = [
    `'${folderId}' in parents`,
    `and name contains '${safe}'`,
    `and mimeType contains 'image/'`
  ].join(' ');

  const res = await drive.files.list({
    q,
    pageSize: 1,
    fields: 'files(id,name,mimeType)'
  });
  return res.data.files?.[0] ?? null;
}

export async function downloadFileToMedia(file) {
  const destPath = path.join(MEDIA_DIR, file.name);
  await new Promise(async (resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    try {
      const r = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'stream' }
      );
      r.data.pipe(dest);
      dest.on('finish', resolve);
      dest.on('error', reject);
    } catch (e) { reject(e); }
  });
  return destPath;
}
