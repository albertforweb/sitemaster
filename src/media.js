import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { MEDIA_MAX_BYTES, SITES_DIR, SITEMASTER_PUBLIC_BASE_URL, UPLOADS_DIR } from './config.js';
import { createMedia, getMedia } from './db.js';
import { validationError } from './validation.js';

const MIME_EXTENSIONS = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
  ['image/svg+xml', '.svg'],
  ['application/pdf', '.pdf'],
]);

export const ALLOWED_MEDIA_TYPES = [...MIME_EXTENSIONS.keys()];

export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_BYTES, files: 1, fields: 4 },
  fileFilter: (req, file, callback) => {
    if (!MIME_EXTENSIONS.has(file.mimetype)) {
      callback(validationError(`unsupported file type ${file.mimetype}`, 'file'));
      return;
    }
    callback(null, true);
  },
});

/** Strips directory components and control characters from a client filename. */
export function sanitizeFilename(name) {
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const extension = path.extname(base).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const stem = path.basename(base, path.extname(base)).replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return { stem: stem || 'file', extension };
}

export function mediaUrl(filename) {
  return `${SITEMASTER_PUBLIC_BASE_URL}/media/${filename}`;
}

/** Directory that holds the working copy of an asset for a single site. */
export function siteMediaDir(siteSlug) {
  return path.join(SITES_DIR, String(siteSlug || ''), 'media');
}

/**
 * Site-relative URL for an asset copied into a site's working folder. Stored on
 * blocks/settings so published pages can reference media without a hostname.
 */
export function siteMediaUrl(filename) {
  return `media/${path.basename(String(filename || ''))}`;
}

/**
 * Copies a library asset into a site's working folder (copy-on-use) and returns
 * its site-relative URL. Re-using the same asset is idempotent.
 */
export function copyMediaToSite(siteSlug, filename) {
  const safe = path.basename(String(filename || ''));
  if (!safe || safe === '.' || safe === '..') throw validationError('a media filename is required', 'filename');
  const source = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(source)) throw validationError('media file not found in the library', 'filename');
  const directory = siteMediaDir(siteSlug);
  fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
  const target = path.join(directory, safe);
  if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  return { filename: safe, url: siteMediaUrl(safe) };
}

/**
 * Writes an uploaded buffer to the uploads directory and records it. The stored
 * name is random, so a client filename can never influence the path on disk.
 */
export function storeMediaUpload(siteSlug, file) {
  const extension = MIME_EXTENSIONS.get(file.mimetype);
  if (!extension) throw validationError(`unsupported file type ${file.mimetype}`, 'file');
  const { stem } = sanitizeFilename(file.originalname);
  const filename = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.buffer, { mode: 0o640, flag: 'wx' });
  return createMedia(siteSlug, {
    filename,
    originalName: `${stem}${path.extname(file.originalname).toLowerCase()}` || filename,
    mimeType: file.mimetype,
    size: file.size,
    url: mediaUrl(filename),
    altText: typeof file.altText === 'string' ? file.altText.slice(0, 300) : '',
  });
}

export function removeMediaFile(siteSlug, mediaId) {
  const record = getMedia(siteSlug, mediaId);
  if (!record) return null;
  const target = path.join(UPLOADS_DIR, path.basename(record.filename));
  try {
    fs.rmSync(target, { force: true });
  } catch {
    return record;
  }
  return record;
}
