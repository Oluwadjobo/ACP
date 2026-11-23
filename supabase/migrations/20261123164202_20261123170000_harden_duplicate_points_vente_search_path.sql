/*
# Harden duplicate point-of-sale lookup

1. Purpose
- Pin the duplicate point-of-sale lookup function to the `public` schema.
- Prevent a mutable session search path from changing which relations or functions the lookup resolves.

2. Modified function
- `public.find_duplicate_points_vente(text, uuid, double precision, double precision, uuid)` keeps its existing signature, return columns, matching rules, and invoker-security behavior.
- Only the function execution setting `search_path = public` is added.

3. Security
- The function remains `STABLE` and is not converted to `SECURITY DEFINER`.
- Existing row-level security and grants are preserved.
- No data rows, columns, constraints, or historical records are changed.
*/

ALTER FUNCTION public.find_duplicate_points_vente(text, uuid, double precision, double precision, uuid)
SET search_path = public;