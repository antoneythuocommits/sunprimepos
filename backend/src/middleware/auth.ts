import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@sunprime/shared';
import { env } from '../config.js';
import { pool, toNumber } from '../db.js';

let supabaseAdmin: SupabaseClient | null = null;
let supabaseAnon: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error('Supabase is not configured');
    }
    supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

export function getSupabaseAnon(): SupabaseClient {
  if (!supabaseAnon) {
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      throw new Error('Supabase is not configured');
    }
    supabaseAnon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAnon;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      supabaseUser?: User;
    }
  }
}

function usernameFromEmail(email: string): string {
  const local = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return local || 'user';
}

async function uniqueUsername(base: string): Promise<string> {
  const cleaned = base.toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user';
  let candidate = cleaned.slice(0, 32);
  for (let i = 0; i < 20; i += 1) {
    const taken = await pool.query(`SELECT 1 FROM app_users WHERE LOWER(username) = LOWER($1)`, [candidate]);
    if (!taken.rowCount) return candidate;
    const suffix = `-${Math.random().toString(36).slice(2, 6)}`;
    candidate = `${cleaned.slice(0, Math.max(1, 32 - suffix.length))}${suffix}`;
  }
  return `${cleaned.slice(0, 20)}-${Date.now().toString(36)}`.slice(0, 32);
}

export async function ensureAppUser(supabaseUser: User, defaultRole: UserRole = UserRole.CASHIER): Promise<AuthUser> {
  const email = supabaseUser.email ?? '';
  const existing = await pool.query(
    `SELECT id, username, email, role, is_active FROM app_users WHERE id = $1`,
    [supabaseUser.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return {
      id: row.id,
      username: String(row.username ?? usernameFromEmail(row.email ?? email)),
      email: row.email,
      role: row.role as UserRole,
      is_active: row.is_active,
    };
  }

  const count = await pool.query(`SELECT COUNT(*)::int AS c FROM app_users`);
  const role = toNumber(count.rows[0]?.c) === 0 ? UserRole.ADMIN : defaultRole;
  const username = await uniqueUsername(usernameFromEmail(email));

  await pool.query(
    `INSERT INTO app_users (id, username, email, role, is_active) VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [supabaseUser.id, username, email, role],
  );

  return { id: supabaseUser.id, username, email, role, is_active: true };
}

const verifiedTokenCache = new Map<string, { user: User; expiresAt: number }>();
const appUserCache = new Map<string, { user: AuthUser; expiresAt: number }>();
const AUTH_CACHE_MS = 60_000;

function tokenExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    const expMs = Number(payload.exp) * 1000;
    if (Number.isFinite(expMs) && expMs > 0) {
      return Math.min(expMs, Date.now() + AUTH_CACHE_MS);
    }
  } catch {
    // fall through
  }
  return Date.now() + AUTH_CACHE_MS;
}

async function getVerifiedUser(token: string): Promise<User | null> {
  const cached = verifiedTokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  verifiedTokenCache.set(token, { user: data.user, expiresAt: tokenExpiryMs(token) });
  return data.user;
}

export function invalidateAppUserCache(userId?: string) {
  if (userId) {
    appUserCache.delete(userId);
    return;
  }
  appUserCache.clear();
}

async function getCachedAppUser(supabaseUser: User): Promise<AuthUser> {
  const cached = appUserCache.get(supabaseUser.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  const appUser = await ensureAppUser(supabaseUser);
  appUserCache.set(supabaseUser.id, { user: appUser, expiresAt: Date.now() + AUTH_CACHE_MS });
  return appUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization token' });
      return;
    }
    const token = header.slice(7);
    const supabaseUser = await getVerifiedUser(token);
    if (!supabaseUser) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const appUser = await getCachedAppUser(supabaseUser);
    if (!appUser.is_active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }
    req.supabaseUser = supabaseUser;
    req.user = appUser;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
