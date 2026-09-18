import {
  createUserSchema,
  loginSchema,
  updateUserSchema,
  updateSettingsSchema,
  UserRole,
  type AppSettings,
  type AppUser,
} from '@sunprime/shared';
import { pool } from '../db.js';
import { getSupabaseAdmin, getSupabaseAnon, invalidateAppUserCache } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';

const USERNAME_EMAIL_DOMAIN = 'pos.sunprime.local';

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    role: row.role as UserRole,
    is_active: Boolean(row.is_active),
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function toInternalEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export async function listUsers(): Promise<AppUser[]> {
  const result = await pool.query(`SELECT * FROM app_users ORDER BY created_at ASC`);
  return result.rows.map(mapUser);
}

export async function loginWithUsername(raw: unknown) {
  const input = loginSchema.parse(raw);
  const identifier = input.username.trim();
  const result = await pool.query(
    `SELECT id, username, email, role, is_active, created_at
     FROM app_users
     WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)
     LIMIT 1`,
    [identifier],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || !row.is_active) {
    throw new HttpError(401, 'Invalid username or password');
  }

  const anon = getSupabaseAnon();
  const { data, error } = await anon.auth.signInWithPassword({
    email: String(row.email),
    password: input.password,
  });
  if (error || !data.session) {
    throw new HttpError(401, 'Invalid username or password');
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: 'bearer',
    user: mapUser(row),
  };
}

export async function createUser(raw: unknown): Promise<AppUser> {
  const input = createUserSchema.parse(raw);
  const username = input.username.trim();
  const email = toInternalEmail(username);

  const taken = await pool.query(
    `SELECT 1 FROM app_users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)`,
    [username, email],
  );
  if (taken.rowCount) {
    throw new HttpError(409, 'Username already exists');
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new HttpError(400, error?.message ?? 'Failed to create user');
  }

  try {
    const result = await pool.query(
      `INSERT INTO app_users (id, username, email, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, role = EXCLUDED.role
       RETURNING *`,
      [data.user.id, username, email, input.role],
    );
    return mapUser(result.rows[0]);
  } catch (err) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw err;
  }
}

export async function updateUser(id: string, raw: unknown): Promise<AppUser> {
  const input = updateUserSchema.parse(raw);
  const existing = await pool.query(`SELECT * FROM app_users WHERE id = $1`, [id]);
  if (!existing.rows[0]) throw new HttpError(404, 'User not found');

  if (input.password) {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.updateUserById(id, { password: input.password });
    if (error) throw new HttpError(400, error.message);
  }

  invalidateAppUserCache(id);

  const result = await pool.query(
    `UPDATE app_users SET
       role = COALESCE($1, role),
       is_active = COALESCE($2, is_active)
     WHERE id = $3
     RETURNING *`,
    [input.role ?? null, input.is_active ?? null, id],
  );
  return mapUser(result.rows[0]);
}

export async function getSettings(): Promise<AppSettings> {
  const result = await pool.query(`SELECT business_name, receipt_contact FROM app_settings WHERE id = 1`);
  const row = result.rows[0] ?? { business_name: 'Sunprime', receipt_contact: '0722932780' };
  return {
    business_name: String(row.business_name),
    receipt_contact: String(row.receipt_contact),
  };
}

export async function updateSettings(raw: unknown): Promise<AppSettings> {
  const input = updateSettingsSchema.parse(raw);
  const result = await pool.query(
    `UPDATE app_settings SET
       business_name = COALESCE($1, business_name),
       receipt_contact = COALESCE($2, receipt_contact),
       updated_at = NOW()
     WHERE id = 1
     RETURNING business_name, receipt_contact`,
    [input.business_name ?? null, input.receipt_contact ?? null],
  );
  return {
    business_name: String(result.rows[0].business_name),
    receipt_contact: String(result.rows[0].receipt_contact),
  };
}
