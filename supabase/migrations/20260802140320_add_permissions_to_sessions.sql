/*
# Add permissions column to sessions table

Stores the user's permissions snapshot at login time so the edge function
can check permissions on every request without re-reading the source table.
*/

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;