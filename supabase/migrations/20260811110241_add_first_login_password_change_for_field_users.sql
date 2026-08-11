/*
# Force password change for newly created field accounts

1. New columns
- `commerciaux.must_change_password` (boolean): marks a newly created commercial account that must choose a personal password before using the application.
- `superviseurs.must_change_password` (boolean): marks a newly created supervisor account that must choose a personal password before using the application.

2. Existing data
- Existing commercial and supervisor accounts are initialized to `false` so accounts already in use continue to work without interruption.

3. Account lifecycle
- The application will set the flag to `true` when creating a new commercial or supervisor account.
- Password resets performed by an administrator will also set the flag to `true`.
- A successful personal password change clears the flag.

4. Security
- No new table or public access policy is introduced.
- The edge function remains the only path used by the application to change these password fields.
*/

ALTER TABLE commerciaux
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE superviseurs
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
