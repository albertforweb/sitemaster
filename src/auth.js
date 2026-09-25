import crypto from 'node:crypto';
import {
  SITEMASTER_CLIENT_ID, SITEMASTER_COOKIE_PATH, SITEMASTER_COOKIE_SECURE, SITEMASTER_CSRF_COOKIE, SITEMASTER_SESSION_COOKIE, IAM_AUTHORIZATION_URL,
  IAM_CLIENT_SECRET, IAM_INTROSPECT_TIMEOUT, IAM_INTROSPECT_URL, IAM_TOKEN_URL, SITEMASTER_CALLBACK_URL,
} from './config.js';

const LOGIN_STATE_TTL = 10 * 60 * 1000;
const SESSION_IDLE_TTL = 30 * 60 * 1000;
const SESSION_ABSOLUTE_TTL = 8 * 60 * 60 * 1000;
const loginStates = new Map();
const sessions = new Map();

function basicCredentials(clientId, secret) {
  return `Basic ${Buffer.from(`${clientId}:${secret}`, 'utf8').toString('base64')}`;
}

function parseCookies(raw) {
  return String(raw || '').split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    const key = part.slice(0, separator).trim();
    try { cookies[key] = decodeURIComponent(part.slice(separator + 1).trim()); } catch { /* ignore malformed cookie */ }
    return cookies;
  }, Object.create(null));
}

function cookieHeader(name, value, maxAge) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${SITEMASTER_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(SITEMASTER_COOKIE_SECURE ? ['Secure'] : []),
    ...(maxAge === undefined ? [] : [`Max-Age=${maxAge}`]),
  ].join('; ');
}

function csrfCookie(value, maxAge) {
  return [
    `${SITEMASTER_CSRF_COOKIE}=${encodeURIComponent(value)}`,
    `Path=${SITEMASTER_COOKIE_PATH}`,
    'SameSite=Lax',
    ...(SITEMASTER_COOKIE_SECURE ? ['Secure'] : []),
    ...(maxAge === undefined ? [] : [`Max-Age=${maxAge}`]),
  ].join('; ');
}

function safeReturnTo(value) {
  if (typeof value !== 'string' || value.startsWith('//')) return '/';
  if (value !== '/' && !value.startsWith('/admin/') && value !== '/admin' && !value.startsWith('/sitemaster/') && value !== '/sitemaster') return '/';
  return value;
}

export function beginAdminLogin(returnTo) {
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const nonce = crypto.randomBytes(24).toString('base64url');
  loginStates.set(state, { verifier, nonce, returnTo: safeReturnTo(returnTo), expiresAt: Date.now() + LOGIN_STATE_TTL });
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: SITEMASTER_CLIENT_ID,
    redirect_uri: SITEMASTER_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid profile email sitemaster:site:read sitemaster:site:manage sitemaster:page:read sitemaster:page:create sitemaster:page:update sitemaster:page:delete sitemaster:content:read sitemaster:content:manage sitemaster:deploy sitemaster:publish',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${IAM_AUTHORIZATION_URL}?${params.toString()}`;
}

export function consumeLoginState(state) {
  const entry = loginStates.get(state);
  loginStates.delete(state);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry;
}

export function getLoginState(state) {
  const entry = loginStates.get(state);
  if (!entry || entry.expiresAt <= Date.now()) {
    loginStates.delete(state);
    return null;
  }
  return entry;
}

export async function exchangeCode(code, verifier) {
  if (!IAM_CLIENT_SECRET) throw new Error('Sitemaster IAM client secret is not configured');
  const response = await fetch(IAM_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicCredentials(SITEMASTER_CLIENT_ID, IAM_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: SITEMASTER_CLIENT_ID, code, redirect_uri: SITEMASTER_CALLBACK_URL, code_verifier: verifier }),
  });
  const tokenSet = await response.json().catch(() => ({}));
  if (!response.ok || !tokenSet.access_token) throw new Error(tokenSet.error_description || 'IAM authorization failed');
  return tokenSet;
}

function createSession(tokenSet) {
  const sessionId = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  sessions.set(sessionId, {
    accessToken: tokenSet.access_token,
    refreshToken: tokenSet.refresh_token || null,
    accessExpiresAt: now + Number(tokenSet.expires_in || 3600) * 1000,
    createdAt: now,
    lastSeenAt: now,
    csrfToken,
  });
  return { sessionId, csrfToken };
}

export function establishSession(res, tokenSet) {
  const session = createSession(tokenSet);
  res.setHeader('Set-Cookie', [
    cookieHeader(SITEMASTER_SESSION_COOKIE, session.sessionId, Math.floor(SESSION_ABSOLUTE_TTL / 1000)),
    csrfCookie(session.csrfToken, Math.floor(SESSION_ABSOLUTE_TTL / 1000)),
  ]);
  return session;
}

export function clearSession(req, res) {
  const sessionId = parseCookies(req.headers.cookie)[SITEMASTER_SESSION_COOKIE];
  if (sessionId) sessions.delete(sessionId);
  res.setHeader('Set-Cookie', [cookieHeader(SITEMASTER_SESSION_COOKIE, '', 0), csrfCookie('', 0)]);
}

export function adminSession(req) {
  const sessionId = parseCookies(req.headers.cookie)[SITEMASTER_SESSION_COOKIE];
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session) return null;
  const now = Date.now();
  if (now - session.lastSeenAt > SESSION_IDLE_TTL || now - session.createdAt > SESSION_ABSOLUTE_TTL) {
    sessions.delete(sessionId);
    return null;
  }
  session.lastSeenAt = now;
  return { ...session, sessionId };
}

export async function refreshSession(session) {
  if (!session?.refreshToken || !IAM_CLIENT_SECRET) return null;
  const response = await fetch(IAM_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicCredentials(SITEMASTER_CLIENT_ID, IAM_CLIENT_SECRET), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: SITEMASTER_CLIENT_ID, refresh_token: session.refreshToken }),
  });
  const tokenSet = await response.json().catch(() => ({}));
  if (!response.ok || !tokenSet.access_token) return null;
  sessions.set(session.sessionId, { ...session, accessToken: tokenSet.access_token, refreshToken: tokenSet.refresh_token || session.refreshToken, accessExpiresAt: Date.now() + Number(tokenSet.expires_in || 3600) * 1000 });
  return tokenSet.access_token;
}

export async function introspectToken(token) {
  if (!token || !IAM_INTROSPECT_URL || !IAM_CLIENT_SECRET) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IAM_INTROSPECT_TIMEOUT);
  try {
    const response = await fetch(IAM_INTROSPECT_URL, {
      method: 'POST',
      headers: {
        Authorization: basicCredentials(SITEMASTER_CLIENT_ID, IAM_CLIENT_SECRET),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ token }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const claims = await response.json();
    if (!claims?.active || claims.aud !== SITEMASTER_CLIENT_ID || !claims.sub) return null;
    return {
      subject: String(claims.sub),
      username: claims.username || null,
      roles: Array.isArray(claims.roles) ? claims.roles.filter((role) => typeof role === 'string') : [],
      permissions: Array.isArray(claims.permissions) ? claims.permissions.filter((permission) => typeof permission === 'string') : [],
      clientId: claims.client_id || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') && header.length <= 4096 ? header.slice(7).trim() : null;
  const session = token ? null : adminSession(req);
  if (!token && !session) return res.status(401).json({ error: 'Authentication required' });
  let auth = await introspectToken(token || session.accessToken);
  if (!auth && session) auth = await introspectToken(await refreshSession(session));
  if (!auth) return res.status(401).json({ error: 'Authentication required' });
  req.auth = auth;
  req.authSession = session;
  res.set('Cache-Control', 'no-store');
  return next();
}

export function requireCsrf(req, res, next) {
  if (!req.authSession || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookies = parseCookies(req.headers.cookie);
  if (!req.authSession.csrfToken || cookies[SITEMASTER_CSRF_COOKIE] !== req.authSession.csrfToken || req.get('X-CSRF-Token') !== req.authSession.csrfToken) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  return next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth?.permissions.includes(permission)) {
      console.warn(JSON.stringify({ event: 'authorization_denied', permission, subject: req.auth?.subject || null, requestId: req.id }));
      return res.status(403).json({ error: 'Insufficient Sitemaster permission' });
    }
    return next();
  };
}

export function requestId() {
  return crypto.randomUUID();
}
