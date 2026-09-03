import {
  createUserSchema,
  updateUserSchema,
  updateSettingsSchema,
  UserRole,
  type AppSettings,
  type AppUser,
} from '@sunprime/shared';
import { pool } from '../db.js';
import { getSupabaseAdmin } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    email: String(row.email),
    role: row.role as UserRole,
    is_active: Boolean(row.is_active),
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export async function listUsers(): Promise<AppUser[]> {
  const result = await pool.query(`SELECT * FROM app_users ORDER BY created_at ASC`);
  return result.rows.map(mapUser);
}

export async function createUser(raw: unknown): Promise<AppUser> {
  const input = createUserSchema.parse(raw);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new HttpError(400, error?.message ?? 'Failed to create user');
  }

  const result = await pool.query(
    `INSERT INTO app_users (id, email, role, is_active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role
     RETURNING *`,
    [data.user.id, input.email, input.role],
  );
  return mapUser(result.rows[0]);
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
