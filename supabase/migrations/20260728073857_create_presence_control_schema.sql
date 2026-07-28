/*
# Contrôle de Présence Terrain — Initial Schema

## Overview
This migration creates the complete database schema for a field presence control
application. It allows administrators to manage commercials (sales reps) and points
of sale, and allows commercials to record visits by scanning a QR code at each
location. The system validates that the commercial is physically within 50 meters
of the registered GPS coordinates of the point of sale.

## Tables

### 1. `admins`
Stores administrator accounts. Admins log in with email + password.
- `id` (uuid, primary key)
- `email` (text, unique, not null) — admin login email
- `password_hash` (text, not null) — hashed password (hashed in edge function)
- `full_name` (text, not null) — display name
- `created_at` (timestamptz, default now)

### 2. `commerciaux`
Stores commercial (sales rep) accounts. Commercials log in with an identifiant + password.
- `id` (uuid, primary key)
- `identifiant` (text, unique, not null) — login identifier (username or employee code)
- `password_hash` (text, not null) — hashed password
- `full_name` (text, not null) — display name
- `active` (boolean, default true) — false = disabled, cannot log in
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now)

### 3. `points_vente`
Stores points of sale (retail locations). Each has a unique secure token used inside the QR code.
- `id` (uuid, primary key)
- `code` (text, unique, not null) — human-readable unique code
- `name` (text, not null) — point of sale name
- `address` (text, not null) — street address
- `city` (text, not null) — city
- `latitude` (double precision, not null) — GPS latitude
- `longitude` (double precision, not null) — GPS longitude
- `qr_token` (text, unique, not null) — secure random token embedded in QR code
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now)

### 4. `visites`
Records each validated visit by a commercial at a point of sale.
- `id` (uuid, primary key)
- `commercial_id` (uuid, not null, references commerciaux(id) on delete cascade)
- `point_vente_id` (uuid, not null, references points_vente(id) on delete cascade)
- `visited_at` (timestamptz, not null, default now) — date + time of the visit
- `latitude` (double precision, not null) — commercial's GPS latitude at scan time
- `longitude` (double precision, not null) — commercial's GPS longitude at scan time
- `distance_meters` (double precision, not null) — distance between scan position and registered GPS
- `status` (text, not null, default 'confirmed') — 'confirmed' or 'out_of_zone'
- `created_at` (timestamptz, default now)

## Security (RLS)
All tables have RLS enabled. This app uses a custom auth model (admins and
commerciaux are NOT Supabase auth.users — they live in our own tables with hashed
passwords). The frontend uses the anon key; authentication and all mutations go
through edge functions that validate a session token and use the service role key
(which bypasses RLS). Direct anon access is locked down on admins, commerciaux,
and visites. Only points_vente is readable by anon (commercials need to resolve a
QR token to point info; no sensitive data beyond GPS coords which are needed for
the distance check).

## Important Notes
1. Passwords are hashed server-side in the edge function using a salted SHA-512 hash.
2. The `qr_token` is a cryptographically random string — the QR code contains ONLY
   this token, never the point of sale name, address, or any sensitive data.
3. Double-scan prevention (5 minutes) is enforced in the edge function.
4. All mutations from the frontend go through edge functions that validate the
   session token, preventing browser-side data tampering.
*/

-- ============ ADMINS ============
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ============ COMMERCIAUX ============
CREATE TABLE IF NOT EXISTS commerciaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE commerciaux ENABLE ROW LEVEL SECURITY;

-- ============ POINTS DE VENTE ============
CREATE TABLE IF NOT EXISTS points_vente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  qr_token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE points_vente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_points_vente" ON points_vente;
CREATE POLICY "anon_read_points_vente"
  ON points_vente FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============ VISITES ============
CREATE TABLE IF NOT EXISTS visites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id uuid NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  distance_meters double precision NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE visites ENABLE ROW LEVEL SECURITY;

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_visites_commercial_id ON visites(commercial_id);
CREATE INDEX IF NOT EXISTS idx_visites_point_vente_id ON visites(point_vente_id);
CREATE INDEX IF NOT EXISTS idx_visites_visited_at ON visites(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_vente_qr_token ON points_vente(qr_token);

-- ============ VIEWS (safe projections without password_hash) ============
CREATE OR REPLACE VIEW commerciaux_safe AS
  SELECT id, identifiant, full_name, active, created_at, updated_at
  FROM commerciaux;

CREATE OR REPLACE VIEW admins_view AS
  SELECT id, email, full_name, created_at FROM admins;
