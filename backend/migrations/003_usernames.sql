-- Username login for POS users (Supabase still stores a backing email)

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE app_users
SET username = LOWER(split_part(email, '@', 1))
WHERE username IS NULL OR BTRIM(username) = '';

WITH ranked AS (
  SELECT
    id,
    username,
    ROW_NUMBER() OVER (PARTITION BY LOWER(username) ORDER BY created_at ASC, id ASC) AS rn
  FROM app_users
)
UPDATE app_users u
SET username = ranked.username || '-' || SUBSTR(REPLACE(u.id::text, '-', ''), 1, 4)
FROM ranked
WHERE u.id = ranked.id AND ranked.rn > 1;

ALTER TABLE app_users ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_idx
  ON app_users (LOWER(username));
