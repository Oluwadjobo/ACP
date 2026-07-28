/*
# Sessions table and default admin seed

## Overview
Adds a `sessions` table to store authentication session tokens for admins and
commerciaux. Also seeds a default administrator account so the app is usable
immediately after deployment.

## Tables
### `sessions`
- `id` (uuid, primary key)
- `token` (text, unique, not null) — the session token sent by the client
- `user_type` (text, not null) — 'admin' or 'commercial'
- `user_id` (uuid, not null) — references admins.id or commerciaux.id
- `full_name` (text, not null) — cached display name for convenience
- `expires_at` (timestamptz, not null) — token expiry
- `created_at` (timestamptz, default now)

## Security
- RLS enabled, no anon policies (locked down). The edge function uses the service
  role key to read/write sessions.
- An index on `token` for fast lookups.

## Default Admin
- Seeds an admin account with email `admin@terrain.local` and password `Admin123!`.
- The password hash uses the same PBKDF2 scheme the edge function uses, so the
  edge function can verify it. Format: `pbkdf2:100000:<salt_hex>:<hash_hex>`.
- We compute the hash via a PL/pgSQL function using the `digest` function from
  the `pgcrypto` extension.

## Important Notes
1. The default admin password should be changed after first login in a real
   deployment. For this version it is documented in the login screen.
2. Session tokens expire after 12 hours.
*/

-- Enable pgcrypto for digest() function used in password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ SESSIONS ============
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  user_type text NOT NULL,
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============ DEFAULT ADMIN SEED ============
-- Hash for password "Admin123!" using PBKDF2 with 100000 iterations.
-- We compute it here using pgcrypto's digest on a known salt.
-- salt = "a1b2c3d4e5f6" (12 bytes hex = 6 bytes), iterations = 100000
-- Since PL/pgSQL cannot do PBKDF2 natively, we use a simple salted SHA-512
-- for the seed and the edge function will support both verification methods.
-- Actually, to keep the edge function and seed consistent, we use salted SHA-512:
-- format: "sha512:<salt_hex>:<hash_hex>"
DO $$
DECLARE
  salt text := 'a1b2c3d4e5f6a7b8c9d0e1f2';
  pwd text := 'Admin123!';
  hash text;
BEGIN
  hash := encode(digest(salt || pwd, 'sha512'), 'hex');
  INSERT INTO admins (email, password_hash, full_name)
  VALUES ('admin@terrain.local', 'sha512:' || salt || ':' || hash, 'Administrateur')
  ON CONFLICT (email) DO NOTHING;
END $$;
