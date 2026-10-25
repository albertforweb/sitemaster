import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PORT = Number(process.env.PORT || 5000);
export const DB_PATH = process.env.SITEMASTER_DB_PATH || path.join(ROOT_DIR, 'data', 'sitemaster.db');
export const DEPLOYMENTS_DIR = process.env.SITEMASTER_DEPLOYMENTS_DIR || path.join(ROOT_DIR, 'data', 'deployments');
export const UPLOADS_DIR = process.env.SITEMASTER_UPLOADS_DIR || path.join(ROOT_DIR, 'data', 'uploads');
export const SITES_DIR = process.env.SITEMASTER_SITES_DIR || path.join(ROOT_DIR, 'data', 'sites');
export const MEDIA_MAX_BYTES = Number(process.env.SITEMASTER_MEDIA_MAX_BYTES || 8 * 1024 * 1024);
export const CONTENT_PAGE_SIZE = Number(process.env.SITEMASTER_CONTENT_PAGE_SIZE || 20);
export const CONTENT_PAGE_MAX = 100;
export const SITEMASTER_CLIENT_ID = process.env.IAM_CLIENT_ID || 'sitemaster-api';
export const IAM_INTROSPECT_URL = process.env.IAM_INTROSPECT_URL || '';
export const IAM_INTROSPECT_TIMEOUT = Number(process.env.IAM_INTROSPECT_TIMEOUT || 5000);
export const IAM_AUTHORIZATION_URL = process.env.IAM_AUTHORIZATION_URL || 'http://localhost:3000/oauth/authorize';
export const IAM_TOKEN_URL = process.env.IAM_TOKEN_URL || 'http://iam:3000/oauth/token';
export const SITEMASTER_PUBLIC_BASE_URL = (process.env.SITEMASTER_PUBLIC_BASE_URL || 'http://localhost:5001').replace(/\/$/, '');
export const SITEMASTER_CALLBACK_URL = process.env.SITEMASTER_CALLBACK_URL || `${SITEMASTER_PUBLIC_BASE_URL}/admin/callback`;
export const SITEMASTER_COOKIE_PATH = process.env.SITEMASTER_COOKIE_PATH || '/';
export const SITEMASTER_IMPORT_TIMEOUT = Number(process.env.SITEMASTER_IMPORT_TIMEOUT || 8000);
export const SITEMASTER_IMPORT_MAX_BYTES = Number(process.env.SITEMASTER_IMPORT_MAX_BYTES || 2 * 1024 * 1024);
export const SITEMASTER_IMPORT_ORIGIN_MAP = (process.env.SITEMASTER_IMPORT_ORIGIN_MAP || '')
  .split(',').map((pair) => pair.trim()).filter(Boolean).map((pair) => {
    const separator = pair.indexOf('=');
    return separator > 0 ? [pair.slice(0, separator).replace(/\/$/, ''), pair.slice(separator + 1).replace(/\/$/, '')] : null;
  }).filter(Boolean);
export const SITEMASTER_SESSION_COOKIE = process.env.SITEMASTER_SESSION_COOKIE || 'sitemaster_session';
export const SITEMASTER_CSRF_COOKIE = process.env.SITEMASTER_CSRF_COOKIE || 'sitemaster_csrf';
export const SITEMASTER_COOKIE_SECURE = process.env.SITEMASTER_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
export const IAM_VAULTS_FILE = process.env.IAM_VAULTS_FILE || '';
export const ALLOWED_ORIGINS = (process.env.SITEMASTER_ALLOWED_ORIGINS || 'http://localhost:8080')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
export const DEFAULT_SITE_SLUG = process.env.SITEMASTER_DEFAULT_SITE_SLUG || 'mainsite';

function readClientSecret() {
  if (!IAM_VAULTS_FILE) return '';
  try {
    const stat = fs.lstatSync(IAM_VAULTS_FILE);
    if (stat.isSymbolicLink()) return '';
    return JSON.parse(fs.readFileSync(IAM_VAULTS_FILE, 'utf8'))?.clients?.[SITEMASTER_CLIENT_ID]?.clientSecret || '';
  } catch {
    return '';
  }
}

// Explicit environment configuration wins in non-Compose deployments. In the
// local Compose setup the secret is read from IAM's mode-0600 bootstrap vault.
export const IAM_CLIENT_SECRET = process.env.IAM_CLIENT_SECRET || readClientSecret();

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true, mode: 0o750 });
fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o750 });
fs.mkdirSync(SITES_DIR, { recursive: true, mode: 0o750 });
