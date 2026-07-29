/*
# Fix visites table: make commercial_id nullable

## Overview
The `visites` table was created with `commercial_id uuid NOT NULL`. This breaks
superviseur visits because superviseurs don't have a `commercial_id` — they have
a `superviseur_id`. Every insert from a superviseur was silently failing the
NOT NULL constraint, so no visits were recorded.

## Changes
- ALTER `visites.commercial_id` to be nullable (superviseurs don't have one)
- Backfill: existing visites already have commercial_id set, no data loss

## Important Notes
1. This is a non-destructive change — only relaxes a constraint.
2. Either `commercial_id` or `superviseur_id` will be set, never both.
*/

ALTER TABLE visites ALTER COLUMN commercial_id DROP NOT NULL;
