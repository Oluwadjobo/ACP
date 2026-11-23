/**
 * Tests for the permission normalization logic.
 *
 * These tests verify the principle of least privilege:
 * - A regular admin with NULL permissions gets NO permissions (not all).
 * - A regular admin with explicitly disabled permissions keeps them disabled.
 * - Field roles (superviseur, commercial, agent_livreur) retain their documented defaults.
 * - Unknown permissions are never activated.
 */

const FIELD_PERMISSIONS = [
  "scan", "create_point_vente", "record_vente", "create_promesse",
  "control_terrain", "view_history", "view_ventes_non_realisees",
  "use_geolocation",
  "search_point_vente", "navigate_to_point_vente",
] as const;

const AGENT_LIVREUR_PERMISSIONS = [
  "view_commandes_livraison", "view_commande_detail", "validate_livraison",
  "view_historique_livraisons",
  "search_point_vente", "navigate_to_point_vente",
] as const;

const DASHBOARD_PERMISSIONS = [
  "view_dashboard", "view_carte", "manage_secteurs", "manage_commerciaux",
  "manage_superviseurs", "manage_admins", "manage_produits", "manage_points_vente",
  "manage_bons_livraison", "view_visites", "view_ventes", "view_controles",
  "manage_agents_livreur",
] as const;

const ALL_PERMISSIONS = [...FIELD_PERMISSIONS, ...AGENT_LIVREUR_PERMISSIONS, ...DASHBOARD_PERMISSIONS];

// Mirror the production defaults: regular admins get NO permissions by default.
const DEFAULT_ADMIN_PERMS: Record<string, boolean> = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, false]));
function buildDefaultPermissions(activePerms: string[]): Record<string, boolean> {
  return Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, activePerms.includes(p)]));
}

type UserType = "admin" | "commercial" | "superviseur" | "agent_livreur";

function getDefaultPermissions(userType: UserType): Record<string, boolean> {
  if (userType === "admin") return { ...DEFAULT_ADMIN_PERMS };
  if (userType === "superviseur") return buildDefaultPermissions(
    ["scan", "create_point_vente", "record_vente", "create_promesse", "control_terrain", "view_history", "view_ventes_non_realisees", "search_point_vente", "navigate_to_point_vente"]
  );
  if (userType === "agent_livreur") return buildDefaultPermissions(
    ["view_commandes_livraison", "view_commande_detail", "validate_livraison", "view_historique_livraisons", "search_point_vente", "navigate_to_point_vente"]
  );
  return buildDefaultPermissions(
    ["scan", "create_point_vente", "record_vente", "view_history", "search_point_vente", "navigate_to_point_vente"]
  );
}

function normalizePermissions(raw: unknown, userType: UserType): Record<string, boolean> {
  const defaults = getDefaultPermissions(userType);
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;
  const result: Record<string, boolean> = {};
  for (const perm of ALL_PERMISSIONS) {
    result[perm] = obj[perm] === true;
  }
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in result)) result[k] = v;
  }
  return result;
}

function assertAllFalse(perms: Record<string, boolean>, message: string): void {
  for (const [k, v] of Object.entries(perms)) {
    if (v !== false) throw new Error(`${message}: ${k} should be false but is ${v}`);
  }
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

Deno.test("admin with NULL permissions gets NO permissions (least privilege)", () => {
  const result = normalizePermissions(null, "admin");
  assertAllFalse(result, "NULL admin permissions should yield all-false");
});

Deno.test("admin with undefined permissions gets NO permissions", () => {
  const result = normalizePermissions(undefined, "admin");
  assertAllFalse(result, "undefined admin permissions should yield all-false");
});

Deno.test("admin with empty object permissions gets NO permissions", () => {
  const result = normalizePermissions({}, "admin");
  assertAllFalse(result, "empty object admin permissions should yield all-false");
});

Deno.test("admin with explicitly disabled permissions keeps them disabled", () => {
  const input = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, false]));
  input.view_dashboard = false;
  input.manage_admins = false;
  const result = normalizePermissions(input, "admin");
  assertEquals(result.view_dashboard, false, "view_dashboard must stay false");
  assertEquals(result.manage_admins, false, "manage_admins must stay false");
});

Deno.test("admin with explicitly enabled permissions keeps them enabled", () => {
  const input = { view_dashboard: true, manage_commerciaux: true };
  const result = normalizePermissions(input, "admin");
  assertEquals(result.view_dashboard, true, "view_dashboard must stay true");
  assertEquals(result.manage_commerciaux, true, "manage_commerciaux must stay true");
  assertEquals(result.manage_admins, false, "manage_admins must default to false");
});

Deno.test("admin does not get unknown permissions activated", () => {
  const input = { view_dashboard: true, fake_permission: true };
  const result = normalizePermissions(input, "admin");
  assertEquals(result.view_dashboard, true, "view_dashboard must stay true");
  assertEquals("fake_permission" in result, false, "fake_permission must not appear in result");
});

Deno.test("superviseur with NULL permissions gets documented defaults", () => {
  const result = normalizePermissions(null, "superviseur");
  assertEquals(result.scan, true, "superviseur default scan");
  assertEquals(result.control_terrain, true, "superviseur default control_terrain");
  assertEquals(result.view_dashboard, false, "superviseur should not have view_dashboard");
  assertEquals(result.manage_admins, false, "superviseur should not have manage_admins");
});

Deno.test("commercial with NULL permissions gets documented defaults", () => {
  const result = normalizePermissions(null, "commercial");
  assertEquals(result.scan, true, "commercial default scan");
  assertEquals(result.record_vente, true, "commercial default record_vente");
  assertEquals(result.control_terrain, false, "commercial should not have control_terrain");
  assertEquals(result.view_dashboard, false, "commercial should not have view_dashboard");
});

Deno.test("agent_livreur with NULL permissions gets documented defaults", () => {
  const result = normalizePermissions(null, "agent_livreur");
  assertEquals(result.view_commandes_livraison, true, "agent_livreur default view_commandes_livraison");
  assertEquals(result.validate_livraison, true, "agent_livreur default validate_livraison");
  assertEquals(result.scan, false, "agent_livreur should not have scan");
  assertEquals(result.view_dashboard, false, "agent_livreur should not have view_dashboard");
});

Deno.test("field role with explicitly disabled permission keeps it disabled", () => {
  const input = { scan: false, record_vente: true };
  const result = normalizePermissions(input, "commercial");
  assertEquals(result.scan, false, "explicitly disabled scan must stay false");
  assertEquals(result.record_vente, true, "explicitly enabled record_vente must stay true");
  assertEquals(result.view_history, false, "missing view_history defaults to false for commercial");
});

Deno.test("field role with explicitly enabled unknown permission does not get it", () => {
  const input = { scan: true, fake_perm: true };
  const result = normalizePermissions(input, "commercial");
  assertEquals(result.scan, true, "scan must stay true");
  assertEquals("fake_perm" in result, false, "fake_perm must not appear");
});
