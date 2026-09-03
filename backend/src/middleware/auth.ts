import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@sunprime/shared';
import { env } from '../config.js';
import { pool, toNumber } from '../db.js';

let supabaseAdmin: SupabaseClient | null = null;

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

export interface AuthUser {
  id: string;
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

export async function ensureAppUser(supabaseUser: User, defaultRole: UserRole = UserRole.CASHIER): Promise<AuthUser> {
  const email = supabaseUser.email ?? '';
  const existing = await pool.query(
    `SELECT id, email, role, is_active FROM app_users WHERE id = $1`,
    [supabaseUser.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return {
      id: row.id,
      email: row.email,
      role: row.role as UserRole,
      is_active: row.is_active,
    };
  }

  const count = await pool.query(`SELECT COUNT(*)::int AS c FROM app_users`);
  const role = toNumber(count.rows[0]?.c) === 0 ? UserRole.ADMIN : defaultRole;

  await pool.query(
    `INSERT INTO app_users (id, email, role, is_active) VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [supabaseUser.id, email, role],
  );

  return { id: supabaseUser.id, email, role, is_active: true };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization token' });
      return;
    }
    const token = header.slice(7);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const appUser = await ensureAppUser(data.user);
    if (!appUser.is_active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }
    req.supabaseUser = data.user;
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
