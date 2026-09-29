import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Expose-Headers": "X-Records-Received, X-Reported-Total, X-Pages-Fetched, X-Page-Size, X-Truncated",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SESSION_TTL_HOURS = 12;
const DOUBLE_SCAN_MINUTES = 5;
const MAX_DISTANCE_METERS = 30;
const MAX_GPS_ACCURACY_METERS = 15;

const VENTE_NON_REALISEE_MOTIFS = [
  "Rupture de stock",
  "Refus du client",
  "Manque de trésorerie",
  "Client absent",
  "Client déjà suffisamment approvisionné",
  "Fermeture exceptionnelle",
  "Concurrence",
  "Autre",
];

const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_RULE_MESSAGE = `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MINUTES = 15;

const CONTROLE_NOTATIONS = ["excellent", "bon", "moyen", "faible", "critique"];
const BL_STATUTS = ["en_attente", "livre", "partiel", "annule"];

const SECTEUR_PALETTE = [
  "#E63946", "#1D6FB8", "#2A9D3F", "#F18E00", "#7B2CBF",
  "#06A6A6", "#D81B8A", "#F1C40F", "#7B4A2B", "#17A2B8",
];

function colorDistance(a: string, b: string): number {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return Math.sqrt(
    Math.pow(pa[0] - pb[0], 2) + Math.pow(pa[1] - pb[1], 2) + Math.pow(pa[2] - pb[2], 2)
  );
}

function pickSecteurColor(usedColors: string[]): string {
  if (usedColors.length === 0) return SECTEUR_PALETTE[0];
  let best = SECTEUR_PALETTE[0];
  let bestDist = -1;
  for (const candidate of SECTEUR_PALETTE) {
    if (!usedColors.includes(candidate)) {
      const minDist = Math.min(...usedColors.map((c) => colorDistance(candidate, c)));
      if (minDist > bestDist) { best = candidate; bestDist = minDist; }
    }
  }
  if (usedColors.includes(best)) {
    best = SECTEUR_PALETTE[0];
    bestDist = -1;
    for (const candidate of SECTEUR_PALETTE) {
      const minDist = Math.min(...usedColors.map((c) => colorDistance(candidate, c)));
      if (minDist > bestDist) { best = candidate; bestDist = minDist; }
    }
  }
  return best;
}

// ============ PERMISSION CATALOG ============

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

const DEFAULT_ADMIN_PERMS: Record<string, boolean> = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true]));
const DEFAULT_SUPERVISEUR_PERMS: Record<string, boolean> = Object.fromEntries(
  ["scan", "create_point_vente", "record_vente", "create_promesse", "control_terrain", "view_history", "view_ventes_non_realisees", "search_point_vente", "navigate_to_point_vente"].map((p) => [p, true])
);
const DEFAULT_COMMERCIAL_PERMS: Record<string, boolean> = Object.fromEntries(
  ["scan", "create_point_vente", "record_vente", "view_history", "search_point_vente", "navigate_to_point_vente"].map((p) => [p, true])
);
const DEFAULT_AGENT_LIVREUR_PERMS: Record<string, boolean> = Object.fromEntries(
  ["view_commandes_livraison", "view_commande_detail", "validate_livraison", "view_historique_livraisons", "search_point_vente", "navigate_to_point_vente"].map((p) => [p, true])
);

type UserType = "admin" | "commercial" | "superviseur" | "agent_livreur";

function getDefaultPermissions(userType: UserType): Record<string, boolean> {
  if (userType === "admin") return { ...DEFAULT_ADMIN_PERMS };
  if (userType === "superviseur") return { ...DEFAULT_SUPERVISEUR_PERMS };
  if (userType === "agent_livreur") return { ...DEFAULT_AGENT_LIVREUR_PERMS };
  return { ...DEFAULT_COMMERCIAL_PERMS };
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

async function getUserPermissions(userType: UserType, userId: string): Promise<Record<string, boolean>> {
  const table = userType === "admin" ? "admins" : userType === "superviseur" ? "superviseurs" : userType === "agent_livreur" ? "agents_livreur" : "commerciaux";
  const { data } = await supabase.from(table).select("permissions").eq("id", userId).maybeSingle();
  return normalizePermissions(data?.permissions, userType);
}

// ============ TEAM HELPERS ============

async function getTeamByCode(code: string) {
  const { data, error } = await supabase.from("teams").select("*").eq("code", code).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function listTeams() {
  const { data, error } = await supabase.from("teams").select("*").order("created_at", { ascending: true });
  if (error) return [];
  return data || [];
}

const POS_QUERY_PAGE_SIZE = 500;
const RELATED_ID_BATCH_SIZE = 100;

interface PosPagination {
  recordsReceived: number;
  reportedTotal: number;
  pagesFetched: number;
  pageSize: number;
  truncated: boolean;
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>
): Promise<{ data: T[]; error: { message: string } | null; pagination: PosPagination }> {
  const rows: T[] = [];
  let pagesFetched = 0;
  let reportedTotal: number | null = null;

  for (let from = 0; ; from += POS_QUERY_PAGE_SIZE) {
    const { data, error, count } = await loadPage(from, from + POS_QUERY_PAGE_SIZE - 1);
    if (error) {
      return {
        data: rows,
        error,
        pagination: {
          recordsReceived: rows.length,
          reportedTotal: count ?? reportedTotal ?? rows.length,
          pagesFetched,
          pageSize: POS_QUERY_PAGE_SIZE,
          truncated: true,
        },
      };
    }

    if (count !== null && count !== undefined) reportedTotal = count;
    const page = data || [];
    if (page.length > 0) pagesFetched++;
    rows.push(...page);
    if (reportedTotal !== null) {
      if (rows.length >= reportedTotal || page.length === 0) break;
    } else if (page.length < POS_QUERY_PAGE_SIZE) {
      break;
    }
  }

  const total = reportedTotal ?? rows.length;
  return {
    data: rows,
    error: null,
    pagination: {
      recordsReceived: rows.length,
      reportedTotal: total,
      pagesFetched,
      pageSize: POS_QUERY_PAGE_SIZE,
      truncated: rows.length < total,
    },
  };
}

function uniqueById<T extends Record<string, unknown>>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = String(row.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function fetchRowsForIds<T>(
  ids: string[],
  loadPage: (batch: string[], from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += RELATED_ID_BATCH_SIZE) {
    const batch = ids.slice(index, index + RELATED_ID_BATCH_SIZE);
    const result = await fetchAllRows((from, to) => loadPage(batch, from, to));
    if (result.error) return { data: rows, error: result.error };
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}

async function getTeamPOS(teamId: string) {
  const result = await fetchAllRows((from, to) => supabase
    .from("points_vente")
    .select("id, code, name, address, city, latitude, longitude, secteur_id, team_id, active, created_by, created_by_role, created_at", { count: "exact" })
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to));
  return { ...result, data: uniqueById(result.data as Record<string, unknown>[]) };
}

async function getPOSWithGPS(teamId: string | null) {
  let query = supabase.from("points_vente").select("id", { count: "exact", head: true })
    .not("latitude", "is", null).not("longitude", "is", null)
    .gte("latitude", -90).lte("latitude", 90)
    .gte("longitude", -180).lte("longitude", 180)
    .or("latitude.neq.0,longitude.neq.0");
  if (teamId) query = query.eq("team_id", teamId);
  const { count, error } = await query;
  return { count: count || 0, error };
}

function getCreatedPOSByCommercial(points: Record<string, unknown>[], commercialId: string, teamId: string): Record<string, unknown>[] {
  return uniqueById(points.filter((point) => point.created_by === commercialId
    && point.created_by_role === "commercial" && point.team_id === teamId));
}

function getVisitedPOS(visits: Record<string, unknown>[]): Set<string> {
  return new Set(visits
    .map((visit) => visit.point_vente_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0));
}

function paginationHeaders(pagination: PosPagination): HeadersInit {
  return {
    "X-Records-Received": String(pagination.recordsReceived),
    "X-Reported-Total": String(pagination.reportedTotal),
    "X-Pages-Fetched": String(pagination.pagesFetched),
    "X-Page-Size": String(pagination.pageSize),
    "X-Truncated": String(pagination.truncated),
  };
}

// ============ CRYPTO HELPERS ============

async function sha512(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const PBKDF2_ITERATIONS = 150000;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2Hash(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-512" },
    key, 512
  );
  return toHex(bits);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID().replace(/-/g, "");
  const h = await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt}:${h}`;
}

async function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; legacy: boolean }> {
  if (!stored || typeof stored !== "string") return { ok: false, legacy: false };
  const parts = stored.split(":");
  if (parts[0] === "pbkdf2" && parts.length === 4) {
    const iterations = parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return { ok: false, legacy: false };
    const computed = await pbkdf2Hash(password, parts[2], iterations);
    return { ok: constantTimeEquals(computed, parts[3]), legacy: false };
  }
  if (parts[0] === "sha512" && parts.length === 3) {
    const computed = await sha512(parts[1] + password);
    return { ok: constantTimeEquals(computed, parts[2]), legacy: true };
  }
  return { ok: false, legacy: false };
}

/** Verifies a password and transparently upgrades a legacy hash to PBKDF2. */
async function checkPassword(password: string, stored: string, table: string, id: string): Promise<boolean> {
  const result = await verifyPassword(password, stored);
  if (result.ok && result.legacy) {
    try {
      const upgraded = await hashPassword(password);
      await supabase.from(table).update({ password_hash: upgraded }).eq("id", id);
    } catch { /* upgrade is best effort; never block a valid sign-in */ }
  }
  return result.ok;
}

// ============ LOGIN RATE LIMITING ============

// A search term is interpolated into a PostgREST filter expression, where a comma
// starts a new condition and a dot separates column from operator. Stripping the
// grammar characters keeps the caller from adding conditions of their own.
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,.()"'\\*:%]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return req.headers.get("cf-connecting-ip")?.slice(0, 64) || "unknown";
}

// The per-IP counter is keyed on a header the caller controls, so it is paired with
// a counter scoped to the identifier alone under a reserved `ip` value. Rotating
// X-Forwarded-For no longer resets the guessing budget for a given account.
const IDENTIFIER_SCOPE = "__identifier__";
const LOGIN_MAX_ATTEMPTS_PER_IDENTIFIER = 30;

async function isScopeLocked(identifier: string, ip: string): Promise<boolean> {
  const { data } = await supabase.from("login_attempts")
    .select("locked_until").eq("identifier", identifier).eq("ip", ip).maybeSingle();
  if (!data?.locked_until) return false;
  return new Date(data.locked_until).getTime() > Date.now();
}

async function isLoginLocked(identifier: string, ip: string): Promise<boolean> {
  if (await isScopeLocked(identifier, ip)) return true;
  return await isScopeLocked(identifier, IDENTIFIER_SCOPE);
}

async function bumpLoginFailure(identifier: string, ip: string, maxAttempts: number): Promise<void> {
  const now = Date.now();
  const windowMs = LOGIN_WINDOW_MINUTES * 60 * 1000;
  const { data } = await supabase.from("login_attempts")
    .select("id, attempts, first_attempt").eq("identifier", identifier).eq("ip", ip).maybeSingle();
  if (!data) {
    await supabase.from("login_attempts").upsert({
      identifier, ip, attempts: 1, first_attempt: new Date(now).toISOString(),
    }, { onConflict: "identifier,ip" });
    return;
  }
  const withinWindow = new Date(data.first_attempt).getTime() > now - windowMs;
  const attempts = withinWindow ? Number(data.attempts) + 1 : 1;
  const updates: Record<string, unknown> = {
    attempts,
    updated_at: new Date(now).toISOString(),
    locked_until: attempts >= maxAttempts ? new Date(now + windowMs).toISOString() : null,
  };
  if (!withinWindow) updates.first_attempt = new Date(now).toISOString();
  await supabase.from("login_attempts").update(updates).eq("id", data.id);
}

async function recordLoginFailure(identifier: string, ip: string): Promise<void> {
  await bumpLoginFailure(identifier, ip, LOGIN_MAX_ATTEMPTS);
  await bumpLoginFailure(identifier, IDENTIFIER_SCOPE, LOGIN_MAX_ATTEMPTS_PER_IDENTIFIER);
}

async function clearLoginFailures(identifier: string, ip: string): Promise<void> {
  await supabase.from("login_attempts").delete().eq("identifier", identifier).in("ip", [ip, IDENTIFIER_SCOPE]);
}

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateQrToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateBlNumero(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BL-${ymd}-${rand}`;
}

// ============ SESSION HELPERS ============

interface SessionData {
  id: string;
  token: string;
  user_type: UserType;
  user_id: string;
  full_name: string;
  team_id: string | null;
  expires_at: string;
  permissions: Record<string, boolean>;
}

async function createSession(
  userType: UserType, userId: string, fullName: string,
  permissions: Record<string, boolean>, teamId: string | null
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("sessions").insert({
    token, user_type: userType, user_id: userId, full_name: fullName,
    expires_at: expiresAt, permissions, team_id: teamId,
  });
  if (error) throw new Error("Failed to create session");
  return token;
}

async function getSession(token: string): Promise<SessionData | null> {
  const { data, error } = await supabase.from("sessions").select("*").eq("token", token).maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("sessions").delete().eq("id", data.id);
    return null;
  }
  const perms = await getUserPermissions(data.user_type as UserType, data.user_id);
  return { ...data, permissions: perms } as SessionData;
}

async function updateSessionTeam(token: string, teamId: string | null): Promise<SessionData | null> {
  const { error } = await supabase.from("sessions").update({ team_id: teamId }).eq("token", token);
  if (error) return null;
  return await getSession(token);
}

// ============ GEO HELPERS ============

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// ============ HIERARCHY HELPERS (tenant-aware) ============

async function getCommercialSecteur(commercialId: string, teamId: string | null): Promise<{ secteur_id: string | null; superviseur_id: string | null }> {
  let query = supabase.from("commerciaux").select("superviseur_id").eq("id", commercialId);
  if (teamId) query = query.eq("team_id", teamId);
  const { data } = await query.maybeSingle();
  const superviseur_id = data?.superviseur_id ?? null;
  let assignedQuery = supabase.from("commercial_tournees").select("secteur_id").eq("commercial_id", commercialId).limit(1);
  if (teamId) assignedQuery = assignedQuery.eq("team_id", teamId);
  const { data: assigned } = await assignedQuery.maybeSingle();
  if (assigned?.secteur_id) return { secteur_id: assigned.secteur_id, superviseur_id };
  if (superviseur_id) {
    let tltQuery = supabase.from("team_leader_tournees").select("secteur_id").eq("superviseur_id", superviseur_id).limit(1);
    if (teamId) tltQuery = tltQuery.eq("team_id", teamId);
    const { data: tlt } = await tltQuery.maybeSingle();
    return { secteur_id: tlt?.secteur_id ?? null, superviseur_id };
  }
  return { secteur_id: null, superviseur_id };
}

async function getSuperviseurSecteur(superviseurId: string, teamId: string | null): Promise<string | null> {
  let query = supabase.from("team_leader_tournees").select("secteur_id").eq("superviseur_id", superviseurId).limit(1);
  if (teamId) query = query.eq("team_id", teamId);
  const { data } = await query.maybeSingle();
  return data?.secteur_id ?? null;
}

async function getPointVenteSecteur(pointVenteId: string, teamId: string | null): Promise<string | null> {
  let query = supabase.from("points_vente").select("secteur_id").eq("id", pointVenteId);
  if (teamId) query = query.eq("team_id", teamId);
  const { data } = await query.maybeSingle();
  return data?.secteur_id ?? null;
}

async function getAssignedPOSForCommercial(commercialId: string, teamId: string | null, includeActivity = true) {
  if (!teamId) {
    return { points: null, secteurs: null, pagination: null, error: "Une équipe est requise pour résoudre les POS affectés" };
  }
  const [{ data: commercial, error: commercialError }, assignmentResult] = await Promise.all([
    supabase.from("commerciaux").select("id, team_id").eq("id", commercialId).maybeSingle(),
    fetchAllRows((from, to) => supabase
      .from("commercial_tournees")
      .select("secteur_id")
      .eq("commercial_id", commercialId)
      .eq("team_id", teamId)
      .order("secteur_id", { ascending: true })
      .range(from, to)),
  ]);
  if (commercialError) return { points: null, secteurs: null, pagination: null, error: "Erreur lors de la validation du commercial" };
  if (!commercial || commercial.team_id !== teamId) {
    return { points: null, secteurs: null, pagination: null, error: "Le commercial n'appartient pas à l'équipe demandée" };
  }
  if (assignmentResult.error) return { points: null, secteurs: null, pagination: assignmentResult.pagination, error: "Erreur lors de la récupération des tournées" };

  const secteurIds = [...new Set(assignmentResult.data.map((row: Record<string, unknown>) => String(row.secteur_id)))];
  if (secteurIds.length === 0) {
    return {
      points: [],
      secteurs: [],
      pagination: assignmentResult.pagination,
      error: null,
    };
  }

  const secteurResult = await fetchAllRows((from, to) => supabase
    .from("secteurs")
    .select("id, nom, code, color_code, team_id", { count: "exact" })
    .in("id", secteurIds)
    .eq("team_id", teamId)
    .order("id", { ascending: true })
    .range(from, to));
  const secteurs = secteurResult.data;
  const secteursError = secteurResult.error;
  if (secteursError) return { points: null, secteurs: null, pagination: null, error: "Erreur lors de la récupération des tournées" };
  const validSecteurIds = secteurs.map((secteur: Record<string, unknown>) => String(secteur.id));
  if (validSecteurIds.length === 0) {
    return {
      points: [],
      secteurs: [],
      pagination: { recordsReceived: 0, reportedTotal: 0, pagesFetched: 0, pageSize: POS_QUERY_PAGE_SIZE, truncated: false },
      error: null,
    };
  }

  const pointQuery = (from: number, to: number) => {
    let query = supabase
      .from("points_vente")
      .select("id, code, name, address, city, latitude, longitude, secteur_id, team_id, active, created_by, created_by_role, created_at", { count: "exact" })
      .in("secteur_id", validSecteurIds)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    query = query.eq("team_id", teamId);
    return query;
  };
  const pointResult = await fetchAllRows(pointQuery);
  if (pointResult.error) return { points: null, secteurs: null, pagination: pointResult.pagination, error: "Erreur lors de la récupération des points de vente" };
  const pointsById = uniqueById(pointResult.data as Record<string, unknown>[]);
  const deduplicatedPointResult = { ...pointResult, data: pointsById };

  const pointIds = pointsById.map((point: Record<string, unknown>) => String(point.id));
  const secteurMap = new Map((secteurs || []).map((secteur: Record<string, unknown>) => [String(secteur.id), secteur]));
  if (!includeActivity) {
    const points = pointsById.map((point: Record<string, unknown>) => {
      const secteur = point.secteur_id ? secteurMap.get(String(point.secteur_id)) : null;
      return {
        ...point,
        secteur_nom: secteur?.nom ?? null,
        secteur_code: secteur?.code ?? null,
        secteur_color: secteur?.color_code ?? null,
        derniere_visite: null,
        derniere_vente: null,
        vente_status: null,
        statut: "non_visite",
      };
    });
    return { points, secteurs: secteurs || [], pagination: pointResult.pagination, error: null };
  }

  const visitsResult = await fetchRowsForIds(pointIds, (batch, from, to) => supabase
    .from("visites")
    .select("id, point_vente_id, visited_at, vente_status", { count: "exact" })
    .in("point_vente_id", batch)
    .eq("commercial_id", commercialId)
    .eq("team_id", teamId)
    .order("visited_at", { ascending: false })
    .range(from, to));
  const visits = visitsResult.data;
  const visitsError = visitsResult.error;
  if (visitsError) return { points: null, secteurs: null, pagination: null, error: "Erreur lors de la récupération des visites" };

  const salesResult = await fetchRowsForIds(pointIds, (batch, from, to) => supabase
    .from("ventes")
    .select("id, point_vente_id, created_at", { count: "exact" })
    .in("point_vente_id", batch)
    .eq("commercial_id", commercialId)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .range(from, to));
  const sales = salesResult.data;
  const salesError = salesResult.error;
  if (salesError) return { points: null, secteurs: null, pagination: null, error: "Erreur lors de la récupération des ventes" };

  const visitByPoint = new Map<string, Record<string, unknown>>();
  for (const visit of (visits || []) as Record<string, unknown>[]) {
    const pointId = String(visit.point_vente_id);
    if (!visitByPoint.has(pointId)) visitByPoint.set(pointId, visit);
  }
  const enrichedPoints = deduplicatedPointResult.data.map((point: Record<string, unknown>) => {
    const pointId = String(point.id);
    const latestVisit = visitByPoint.get(pointId);
    const secteur = point.secteur_id ? secteurMap.get(String(point.secteur_id)) : null;
    const latestSale = (sales || []).find((sale: Record<string, unknown>) => String(sale.point_vente_id) === pointId);
    return {
      ...point,
      secteur_nom: secteur?.nom ?? null,
      secteur_code: secteur?.code ?? null,
      secteur_color: secteur?.color_code ?? null,
      derniere_visite: latestVisit?.visited_at ?? null,
      derniere_vente: latestSale?.created_at ?? null,
      vente_status: latestVisit?.vente_status ?? null,
      statut: latestVisit ? "visite" : "non_visite",
    };
  });

  return { points: enrichedPoints, secteurs: secteurs || [], pagination: pointResult.pagination, error: null };
}

async function getAssignedPOSForSupervisor(supervisorId: string, teamId: string | null) {
  if (!teamId) {
    return { points: null, secteurs: null, pagination: null, error: "Une équipe est requise pour résoudre les POS affectés" };
  }
  const { data: supervisor, error: supervisorError } = await supabase.from("superviseurs")
    .select("id, team_id").eq("id", supervisorId).maybeSingle();
  if (supervisorError) return { points: null, secteurs: null, pagination: null, error: "Erreur lors de la validation du superviseur" };
  if (!supervisor || supervisor.team_id !== teamId) {
    return { points: null, secteurs: null, pagination: null, error: "Le superviseur n'appartient pas à l'équipe demandée" };
  }
  const assignmentResult = await fetchAllRows((from, to) => supabase
    .from("team_leader_tournees")
    .select("secteur_id")
    .eq("superviseur_id", supervisorId)
    .eq("team_id", teamId)
    .order("secteur_id", { ascending: true })
    .range(from, to));
  if (assignmentResult.error) return { points: null, secteurs: null, pagination: assignmentResult.pagination, error: "Erreur lors de la récupération des tournées" };
  const secteurIds = [...new Set(assignmentResult.data.map((row: Record<string, unknown>) => String(row.secteur_id)))];
  if (secteurIds.length === 0) return { points: [], secteurs: [], pagination: assignmentResult.pagination, error: null };
  const secteurResult = await fetchAllRows((from, to) => supabase
    .from("secteurs")
    .select("id, nom, code, color_code, team_id", { count: "exact" })
    .in("id", secteurIds)
    .eq("team_id", teamId)
    .order("id", { ascending: true })
    .range(from, to));
  if (secteurResult.error) return { points: null, secteurs: null, pagination: null, error: "Erreur lors de la récupération des tournées" };
  const validSecteurIds = secteurResult.data.map((row: Record<string, unknown>) => String(row.id));
  if (validSecteurIds.length === 0) return { points: [], secteurs: [], pagination: assignmentResult.pagination, error: null };
  const pointResult = await fetchAllRows((from, to) => supabase
    .from("points_vente")
    .select("id, code, name, address, city, latitude, longitude, secteur_id, team_id, active, created_by, created_by_role, created_at", { count: "exact" })
    .in("secteur_id", validSecteurIds)
    .eq("team_id", teamId)
    .order("id", { ascending: true })
    .range(from, to));
  if (pointResult.error) return { points: null, secteurs: null, pagination: pointResult.pagination, error: "Erreur lors de la récupération des points de vente" };
  return {
    points: uniqueById(pointResult.data as Record<string, unknown>[]),
    secteurs: secteurResult.data,
    pagination: pointResult.pagination,
    error: null,
  };
}

// ============ ROUTE HANDLER ============

async function handleRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/auth-api/, "");
  const method = req.method;

  // ---------- TEAMS LIST (public, for team selection page) ----------
  if (path === "/teams" && method === "GET") {
    const teams = await listTeams();
    return jsonResponse(teams);
  }

  // ---------- LOGIN ----------
  if (path === "/login" && method === "POST") {
    const { login, password, team_code } = await req.json();
    if (!login || !password) return jsonError(400, "Identifiant et mot de passe requis");
    const normalizedLogin = login.trim();
    const clientIp = getClientIp(req);
    const rateKey = normalizedLogin.toLowerCase();
    if (await isLoginLocked(rateKey, clientIp)) {
      return jsonError(429, `Trop de tentatives de connexion. Réessayez dans ${LOGIN_WINDOW_MINUTES} minutes.`);
    }
    const failLogin = async () => {
      await recordLoginFailure(rateKey, clientIp);
      return jsonError(401, "Identifiants incorrects");
    };

    // Resolve team if team_code is provided
    let requestedTeamId: string | null = null;
    if (team_code) {
      const team = await getTeamByCode(team_code.trim().toUpperCase());
      if (!team) return jsonError(400, "Équipe introuvable");
      requestedTeamId = team.id;
    }

    // Try admin
    const { data: admin } = await supabase.from("admins").select("*").eq("email", normalizedLogin.toLowerCase()).maybeSingle();
    if (admin) {
      if (await checkPassword(password, admin.password_hash, "admins", admin.id)) {
        await clearLoginFailures(rateKey, clientIp);
        const permissions = normalizePermissions(admin.permissions, "admin");
        // Super admin: team_id from request (or null for global). Regular admin: must match their team.
        let sessionTeamId: string | null;
        if (admin.role === "super_admin") {
          sessionTeamId = requestedTeamId; // null = global view
        } else {
          // Regular admin: verify team match
          if (requestedTeamId && admin.team_id && requestedTeamId !== admin.team_id) {
            return jsonError(403, "Vous n'êtes pas autorisé à accéder à cet espace.");
          }
          sessionTeamId = admin.team_id;
        }
        const token = await createSession("admin", admin.id, admin.full_name, permissions, sessionTeamId);
        let teamCode: string | null = null;
        let teamColor: string | null = null;
        if (sessionTeamId) {
          const { data: teamData } = await supabase.from("teams").select("code, color").eq("id", sessionTeamId).maybeSingle();
          teamCode = teamData?.code ?? null;
          teamColor = teamData?.color ?? null;
        }
        return jsonResponse({
          token, userType: "admin", fullName: admin.full_name, userId: admin.id,
          mustChangePassword: admin.must_change_password ?? false, permissions,
          teamId: sessionTeamId, role: admin.role || "admin", teamCode, teamColor,
        });
      }
      return await failLogin();
    }

    // Try superviseur
    const { data: sup } = await supabase.from("superviseurs").select("*").eq("identifiant", normalizedLogin).maybeSingle();
    if (sup) {
      if (await checkPassword(password, sup.password_hash, "superviseurs", sup.id)) {
        // Account state is only revealed once the password is proven correct.
        if (!sup.active) return jsonError(403, "Ce compte est désactivé. Contactez votre administrateur.");
        await clearLoginFailures(rateKey, clientIp);
        // Verify team membership
        if (requestedTeamId && sup.team_id && requestedTeamId !== sup.team_id) {
          return jsonError(403, "Vous n'êtes pas autorisé à accéder à cet espace.");
        }
        const permissions = normalizePermissions(sup.permissions, "superviseur");
        const token = await createSession("superviseur", sup.id, sup.full_name, permissions, sup.team_id);
        let teamCode: string | null = null;
        let teamColor: string | null = null;
        if (sup.team_id) {
          const { data: teamData } = await supabase.from("teams").select("code, color").eq("id", sup.team_id).maybeSingle();
          teamCode = teamData?.code ?? null;
          teamColor = teamData?.color ?? null;
        }
        return jsonResponse({
          token, userType: "superviseur", fullName: sup.full_name, userId: sup.id,
          mustChangePassword: sup.must_change_password ?? false, permissions, teamId: sup.team_id, role: "superviseur", teamCode, teamColor,
        });
      }
      return await failLogin();
    }

    // Try commercial
    const { data: commercial } = await supabase.from("commerciaux").select("*").eq("identifiant", normalizedLogin).maybeSingle();
    if (commercial) {
      if (await checkPassword(password, commercial.password_hash, "commerciaux", commercial.id)) {
        // Account state is only revealed once the password is proven correct.
        if (!commercial.active) return jsonError(403, "Ce compte est désactivé. Contactez votre administrateur.");
        await clearLoginFailures(rateKey, clientIp);
        // Verify team membership
        if (requestedTeamId && commercial.team_id && requestedTeamId !== commercial.team_id) {
          return jsonError(403, "Vous n'êtes pas autorisé à accéder à cet espace.");
        }
        const permissions = normalizePermissions(commercial.permissions, "commercial");
        const token = await createSession("commercial", commercial.id, commercial.full_name, permissions, commercial.team_id);
        let teamCode: string | null = null;
        let teamColor: string | null = null;
        if (commercial.team_id) {
          const { data: teamData } = await supabase.from("teams").select("code, color").eq("id", commercial.team_id).maybeSingle();
          teamCode = teamData?.code ?? null;
          teamColor = teamData?.color ?? null;
        }
        return jsonResponse({
          token, userType: "commercial", fullName: commercial.full_name, userId: commercial.id,
          mustChangePassword: commercial.must_change_password ?? false, permissions, teamId: commercial.team_id, role: "commercial", teamCode, teamColor,
        });
      }
      return await failLogin();
    }
    // Try agent livreur
    const { data: agent } = await supabase.from("agents_livreur").select("*").eq("identifiant", normalizedLogin).maybeSingle();
    if (agent) {
      if (await checkPassword(password, agent.password_hash, "agents_livreur", agent.id)) {
        if (!agent.active) return jsonError(403, "Ce compte est désactivé. Contactez votre administrateur.");
        await clearLoginFailures(rateKey, clientIp);
        if (requestedTeamId && agent.team_id && requestedTeamId !== agent.team_id) {
          return jsonError(403, "Vous n'êtes pas autorisé à accéder à cet espace.");
        }
        const permissions = normalizePermissions(agent.permissions, "agent_livreur");
        const token = await createSession("agent_livreur", agent.id, agent.full_name, permissions, agent.team_id);
        let teamCode: string | null = null;
        let teamColor: string | null = null;
        if (agent.team_id) {
          const { data: teamData } = await supabase.from("teams").select("code, color").eq("id", agent.team_id).maybeSingle();
          teamCode = teamData?.code ?? null;
          teamColor = teamData?.color ?? null;
        }
        return jsonResponse({
          token, userType: "agent_livreur", fullName: agent.full_name, userId: agent.id,
          mustChangePassword: agent.must_change_password ?? false, permissions, teamId: agent.team_id, role: "agent_livreur", teamCode, teamColor,
        });
      }
      return await failLogin();
    }
    return await failLogin();
  }

  if (path === "/logout" && method === "POST") {
    const token = getBearerToken(req);
    if (token) await supabase.from("sessions").delete().eq("token", token);
    return jsonResponse({ success: true });
  }

  if (path === "/me" && method === "GET") {
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Non authentifié");
    const session = await getSession(token);
    if (!session) return jsonError(401, "Session expirée");
    let role = session.user_type;
    let mustChangePassword = false;
    let teamCode: string | null = null;
    let teamColor: string | null = null;
    if (session.user_type === "admin") {
      const { data: adminData } = await supabase.from("admins").select("role, team_id, must_change_password").eq("id", session.user_id).maybeSingle();
      role = adminData?.role || "admin";
      mustChangePassword = adminData?.must_change_password ?? false;
    } else {
      const userTable = session.user_type === "superviseur" ? "superviseurs" : session.user_type === "agent_livreur" ? "agents_livreur" : "commerciaux";
      const { data: userData } = await supabase.from(userTable).select("must_change_password").eq("id", session.user_id).maybeSingle();
      mustChangePassword = userData?.must_change_password ?? false;
    }
    if (session.team_id) {
      const { data: teamData } = await supabase.from("teams").select("code, color").eq("id", session.team_id).maybeSingle();
      teamCode = teamData?.code ?? null;
      teamColor = teamData?.color ?? null;
    }
    return jsonResponse({
      userType: session.user_type, userId: session.user_id,
      fullName: session.full_name, permissions: session.permissions,
      mustChangePassword, teamId: session.team_id, role, teamCode, teamColor,
    });
  }

  // ---------- SWITCH TEAM (super admin only) ----------
  if (path === "/switch-team" && method === "POST") {
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Non authentifié");
    const session = await getSession(token);
    if (!session) return jsonError(401, "Session expirée");
    if (session.user_type !== "admin") return jsonError(403, "Réservé au super administrateur");
    // Verify admin is super_admin
    const { data: adminData } = await supabase.from("admins").select("role").eq("id", session.user_id).maybeSingle();
    if (adminData?.role !== "super_admin") return jsonError(403, "Réservé au super administrateur");
    const { team_id } = await req.json();
    if (team_id === null || team_id === "global") {
      // Switch to global view
      await updateSessionTeam(token, null);
      return jsonResponse({ success: true, teamId: null });
    }
    // Verify team exists
    const { data: team } = await supabase.from("teams").select("id").eq("id", team_id).maybeSingle();
    if (!team) return jsonError(404, "Équipe introuvable");
    await updateSessionTeam(token, team_id);
    return jsonResponse({ success: true, teamId: team_id });
  }

  // ---------- AUTHED ROUTES ----------
  const token = getBearerToken(req);
  if (!token) return jsonError(401, "Non authentifié");
  const session = await getSession(token);
  if (!session) return jsonError(401, "Session expirée");

  const userTable = session.user_type === "admin" ? "admins" : session.user_type === "superviseur" ? "superviseurs" : session.user_type === "agent_livreur" ? "agents_livreur" : "commerciaux";
  if (path === "/change-password" && method === "POST") {
    const { newPassword } = await req.json();
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
    const password_hash = await hashPassword(newPassword);
    const { error } = await supabase.from(userTable).update({ password_hash, must_change_password: false }).eq("id", session.user_id);
    if (error) return jsonError(500, "Erreur lors du changement de mot de passe");
    return jsonResponse({ success: true });
  }
  const { data: pendingPasswordUser } = await supabase.from(userTable).select("must_change_password").eq("id", session.user_id).maybeSingle();
  if (pendingPasswordUser?.must_change_password && path !== "/change-password") {
    return jsonError(403, "Vous devez changer votre mot de passe avant de continuer");
  }

  const perms = (session.permissions as Record<string, boolean>) || {};
  const teamId = session.team_id;
  function hasPermission(p: string): boolean {
    return perms[p] === true;
  }
  function requirePermission(p: string): Response | null {
    if (hasPermission(p)) return null;
    return jsonError(403, "Vous n'avez pas l'autorisation d'effectuer cette action");
  }

  // ===== ADMIN ROUTES =====
  if (session.user_type === "admin") {
    // Fetch admin role to determine if super_admin
    const { data: adminRecord } = await supabase.from("admins").select("role, team_id, must_change_password").eq("id", session.user_id).maybeSingle();
    if (!adminRecord) return jsonError(401, "Session expirée");
    const adminRole = adminRecord.role || "admin";
    const adminTeamId = adminRecord.team_id || null;

    // A pending password change is enforced server-side, not only by the UI.
    if (adminRecord.must_change_password && path !== "/change-password") {
      return jsonError(403, "Vous devez changer votre mot de passe avant de continuer");
    }

    // A non-super administrator without a team would otherwise bypass every team filter.
    if (adminRole !== "super_admin" && !adminTeamId) {
      return jsonError(403, "Votre compte n'est rattaché à aucune équipe. Contactez le super administrateur.");
    }

    // Effective team: super_admin uses session.team_id (can be null for global), regular admin uses their fixed team_id
    const effectiveTeamId = adminRole === "super_admin" ? teamId : adminTeamId;

    // Permissions stored on the administrator record are authoritative for every
    // administrator except the super administrator.
    function requireAnyAdminPermission(...ps: string[]): Response | null {
      if (adminRole === "super_admin") return null;
      if (ps.some((p) => perms[p] === true)) return null;
      return jsonError(403, "Vous n'avez pas l'autorisation d'effectuer cette action");
    }

    // Only a super administrator may act on another super administrator's account.
    async function guardSuperAdminTarget(targetId: string): Promise<Response | null> {
      if (adminRole === "super_admin") return null;
      const { data } = await supabase.from("admins").select("role").eq("id", targetId).maybeSingle();
      if (data?.role === "super_admin") {
        return jsonError(403, "Vous n'avez pas l'autorisation d'effectuer cette action");
      }
      return null;
    }

    if (path === "/diagnostics/commercial-points-vente" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      if (!effectiveTeamId) return jsonError(400, "Sélectionnez une équipe avant de lancer le diagnostic");

      const { commercial_id: commercialId } = await req.json();
      if (typeof commercialId !== "string" || !commercialId) return jsonError(400, "Commercial requis");
      const { data: commercial, error: commercialError } = await supabase
        .from("commerciaux")
        .select("id, full_name, team_id, superviseur_id, active")
        .eq("id", commercialId)
        .eq("team_id", effectiveTeamId)
        .maybeSingle();
      if (commercialError) return jsonError(500, "Erreur lors de la récupération du commercial");
      if (!commercial) return jsonError(404, "Commercial introuvable dans l'équipe sélectionnée");

      let supervisorName: string | null = null;
      if (commercial.superviseur_id) {
        const { data: supervisor, error: supervisorError } = await supabase
          .from("superviseurs")
          .select("full_name")
          .eq("id", commercial.superviseur_id)
          .eq("team_id", effectiveTeamId)
          .maybeSingle();
        if (supervisorError) return jsonError(500, "Erreur lors de la récupération du superviseur");
        supervisorName = supervisor?.full_name ?? null;
      }
      const [{ data: team, error: teamError }, commercialPoints] = await Promise.all([
        supabase.from("teams").select("code, name").eq("id", effectiveTeamId).maybeSingle(),
        getAssignedPOSForCommercial(String(commercial.id), effectiveTeamId, false),
      ]);
      if (teamError) return jsonError(500, "Erreur lors de la récupération de l'équipe");
      if (commercialPoints.error || !commercialPoints.points || !commercialPoints.secteurs || !commercialPoints.pagination) {
        return jsonError(500, commercialPoints.error || "Erreur lors de la récupération des points de vente");
      }

      return jsonResponse({
        commercial: {
          id: commercial.id,
          full_name: commercial.full_name,
          team_id: commercial.team_id,
          team_code: team?.code ?? null,
          team_name: team?.name ?? null,
          active: commercial.active,
          superviseur_id: commercial.superviseur_id,
          superviseur_nom: supervisorName,
          secteurs: commercialPoints.secteurs.map((secteur: Record<string, unknown>) => ({
            id: secteur.id,
            nom: secteur.nom ?? null,
            code: secteur.code ?? null,
          })),
        },
        points: commercialPoints.points,
        pagination: commercialPoints.pagination,
      });
    }

    // --- SECTEURS CRUD ---
    if (path === "/secteurs" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_secteurs", "manage_commerciaux", "manage_superviseurs", "manage_points_vente", "view_carte", "view_dashboard", "view_visites"); if (denied) return denied; }
      const result = await fetchAllRows((from, to) => {
        let query = supabase.from("secteurs").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        return query;
      });
      if (result.error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(uniqueById(result.data as Record<string, unknown>[]));
    }
    if (path === "/secteurs" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_secteurs"); if (denied) return denied; }
      const { nom, code, description, color_code } = await req.json();
      if (!nom || !code) return jsonError(400, "Nom et code requis");
      const insertData: Record<string, unknown> = {
        code: code.trim().toUpperCase(), nom: nom.trim(),
        description: description?.trim() || null,
      };
      if (effectiveTeamId) insertData.team_id = effectiveTeamId;
      // Auto-assign color within the team's existing colors
      let usedColors: string[] = [];
      if (effectiveTeamId) {
        const { data: existing } = await supabase.from("secteurs").select("color_code").eq("team_id", effectiveTeamId);
        usedColors = (existing ?? []).map((r: Record<string, unknown>) => String(r.color_code)).filter(Boolean);
      } else {
        const { data: existing } = await supabase.from("secteurs").select("color_code");
        usedColors = (existing ?? []).map((r: Record<string, unknown>) => String(r.color_code)).filter(Boolean);
      }
      const finalColor = (typeof color_code === "string" && /^#[0-9A-Fa-f]{6}$/.test(color_code))
        ? color_code : pickSecteurColor(usedColors);
      insertData.color_code = finalColor;
      const { data, error } = await supabase.from("secteurs").insert(insertData).select("*").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Ce code existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/secteurs/") && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_secteurs"); if (denied) return denied; }
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.nom !== undefined) updates.nom = body.nom.trim();
      if (body.code !== undefined) updates.code = body.code.trim().toUpperCase();
      if (body.description !== undefined) updates.description = body.description?.trim() || null;
      if (body.actif !== undefined) updates.actif = body.actif;
      if (typeof body.color_code === "string" && /^#[0-9A-Fa-f]{6}$/.test(body.color_code)) updates.color_code = body.color_code;
      let query = supabase.from("secteurs").update(updates).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Ce code existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Secteur introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/secteurs/") && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_secteurs"); if (denied) return denied; }
      const id = path.split("/")[2];
      let query = supabase.from("secteurs").delete().eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- COMMERCIAUX CRUD ---
    if (path === "/commerciaux" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_commerciaux", "view_visites", "view_ventes", "view_dashboard", "view_carte", "view_controles", "manage_bons_livraison"); if (denied) return denied; }
      const commercialResult = await fetchAllRows((from, to) => {
        let query = supabase.from("commerciaux")
          .select("id, identifiant, full_name, active, telephone, superviseur_id, team_id, created_at, updated_at, permissions", { count: "exact" })
          .order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        return query;
      });
      if (commercialResult.error) return jsonError(500, "Erreur de lecture");
      const enriched = await Promise.all(commercialResult.data.map(async (c: Record<string, unknown>) => {
        let superviseur_nom = null;
        if (c.superviseur_id) {
          let query = supabase.from("superviseurs").select("full_name").eq("id", c.superviseur_id);
          if (c.team_id) query = query.eq("team_id", c.team_id);
          const { data: sup, error: supervisorError } = await query.maybeSingle();
          if (supervisorError) throw new Error("Erreur lors de la récupération du superviseur");
          superviseur_nom = sup?.full_name ?? null;
        }
        if (!c.team_id) return { ...c, superviseur_nom, secteur_nom: null, tournees: [] };
        const assignments = await fetchAllRows((from, to) => supabase.from("commercial_tournees")
          .select("secteur_id, secteurs!inner(nom, code, team_id)", { count: "exact" })
          .eq("commercial_id", c.id).eq("team_id", c.team_id).eq("secteurs.team_id", c.team_id)
          .order("secteur_id", { ascending: true }).range(from, to));
        if (assignments.error) throw new Error("Erreur lors de la récupération des tournées");
        const tournees = assignments.data.map((row: Record<string, unknown>) => {
          const secteur = row.secteurs as Record<string, unknown> | null;
          return { secteur_id: String(row.secteur_id), nom: secteur?.nom ?? null, code: secteur?.code ?? null };
        });
        return { ...c, superviseur_nom, secteur_nom: tournees[0]?.nom ?? null, tournees };
      }));
      return jsonResponse(enriched);
    }
    if (path === "/commerciaux" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_commerciaux"); if (denied) return denied; }
      const { identifiant, full_name, password, telephone, superviseur_id, secteur_ids } = await req.json();
      if (!identifiant || !full_name || !password) return jsonError(400, "Identifiant, nom et mot de passe requis");
      if (password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      if (!superviseur_id) return jsonError(400, "Un superviseur de rattachement est obligatoire");
      if (!Array.isArray(secteur_ids) || secteur_ids.length === 0) return jsonError(400, "Au moins une tournée affectée est obligatoire");
      const password_hash = await hashPassword(password);
      const insertData: Record<string, unknown> = { identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash, must_change_password: true };
      if (telephone) insertData.telephone = telephone.trim();
      if (superviseur_id) insertData.superviseur_id = superviseur_id;
      if (effectiveTeamId) insertData.team_id = effectiveTeamId;
      const { data, error } = await supabase.from("commerciaux").insert(insertData).select("id, identifiant, full_name, active, telephone, superviseur_id, team_id, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      const assignments = secteur_ids.map((secteur_id: string) => ({ commercial_id: data.id, secteur_id, ...(effectiveTeamId ? { team_id: effectiveTeamId } : {}) }));
      const { error: assignmentError } = await supabase.from("commercial_tournees").insert(assignments);
      if (assignmentError) return jsonError(500, "Erreur lors de l'affectation des tournées");
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/commerciaux/") && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_commerciaux"); if (denied) return denied; }
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.identifiant !== undefined) updates.identifiant = body.identifiant.trim();
      if (body.active !== undefined) updates.active = body.active;
      if (body.telephone !== undefined) updates.telephone = body.telephone?.trim() || null;
      if (body.superviseur_id !== undefined) updates.superviseur_id = body.superviseur_id || null;
      if (body.secteur_ids !== undefined && Array.isArray(body.secteur_ids) && body.secteur_ids.length === 0) return jsonError(400, "Au moins une tournée affectée est obligatoire");
      let query = supabase.from("commerciaux").update(updates).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query.select("id, identifiant, full_name, active, telephone, superviseur_id, created_at, updated_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Commercial introuvable");
      if (Array.isArray(body.secteur_ids)) {
        let remove = supabase.from("commercial_tournees").delete().eq("commercial_id", id);
        if (effectiveTeamId) remove = remove.eq("team_id", effectiveTeamId);
        const { error: removeError } = await remove;
        if (removeError) return jsonError(500, "Erreur lors de la mise à jour des tournées");
        const assignments = body.secteur_ids.map((secteur_id: string) => ({ commercial_id: id, secteur_id, ...(effectiveTeamId ? { team_id: effectiveTeamId } : {}) }));
        const { error: assignmentError } = await supabase.from("commercial_tournees").insert(assignments);
        if (assignmentError) return jsonError(500, "Erreur lors de la mise à jour des tournées");
      }
      return jsonResponse(data);
    }
    if (path.startsWith("/commerciaux/") && path.endsWith("/reset-password") && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_commerciaux"); if (denied) return denied; }
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      const password_hash = await hashPassword(password);
      let query = supabase.from("commerciaux").update({ password_hash, must_change_password: true, updated_at: new Date().toISOString() }).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }
    if (path.startsWith("/commerciaux/") && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_commerciaux"); if (denied) return denied; }
      const id = path.split("/")[2];
      let query = supabase.from("commerciaux").delete().eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- SUPERVISEURS CRUD ---
    if (path === "/superviseurs" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_superviseurs", "view_controles", "view_dashboard", "view_visites"); if (denied) return denied; }
      const supervisorResult = await fetchAllRows((from, to) => {
        let query = supabase.from("superviseurs")
          .select("id, identifiant, full_name, active, telephone, team_id, created_at, updated_at, permissions", { count: "exact" })
          .order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        return query;
      });
      if (supervisorResult.error) return jsonError(500, "Erreur de lecture");
      const enriched = await Promise.all(supervisorResult.data.map(async (s: Record<string, unknown>) => {
        if (!s.team_id) return { ...s, tournees: [] };
        const assignmentResult = await fetchAllRows((from, to) => supabase.from("team_leader_tournees")
          .select("secteur_id, secteurs!inner(nom, code, team_id)", { count: "exact" })
          .eq("superviseur_id", s.id).eq("team_id", s.team_id).eq("secteurs.team_id", s.team_id)
          .order("secteur_id", { ascending: true }).range(from, to));
        if (assignmentResult.error) throw new Error("Erreur lors de la récupération des tournées du superviseur");
        const tournees = assignmentResult.data.map((t: Record<string, unknown>) => ({
          secteur_id: t.secteur_id,
          nom: (t.secteurs as Record<string, unknown> | null)?.nom ?? null,
          code: (t.secteurs as Record<string, unknown> | null)?.code ?? null,
        }));
        return { ...s, tournees };
      }));
      return jsonResponse(enriched);
    }
    if (path === "/superviseurs" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_superviseurs"); if (denied) return denied; }
      const { identifiant, full_name, password, telephone, secteur_ids } = await req.json();
      if (!identifiant || !full_name || !password) return jsonError(400, "Identifiant, nom et mot de passe requis");
      if (password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      if (!Array.isArray(secteur_ids) || secteur_ids.length === 0) return jsonError(400, "Au moins une tournée affectée est obligatoire");
      const password_hash = await hashPassword(password);
      const insertData: Record<string, unknown> = { identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash, must_change_password: true };
      if (telephone) insertData.telephone = telephone.trim();
      if (effectiveTeamId) insertData.team_id = effectiveTeamId;
      const { data, error } = await supabase.from("superviseurs").insert(insertData).select("id, identifiant, full_name, active, telephone, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      const tltData = secteur_ids.map((sid: string) => ({ superviseur_id: data.id, secteur_id: sid, ...(effectiveTeamId ? { team_id: effectiveTeamId } : {}) }));
      await supabase.from("team_leader_tournees").insert(tltData);
      if (secteur_ids.length > 0) await supabase.from("superviseurs").update({ secteur_id: secteur_ids[0] }).eq("id", data.id);
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/superviseurs/") && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_superviseurs"); if (denied) return denied; }
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.identifiant !== undefined) updates.identifiant = body.identifiant.trim();
      if (body.active !== undefined) updates.active = body.active;
      if (body.telephone !== undefined) updates.telephone = body.telephone?.trim() || null;
      if (body.secteur_ids !== undefined && Array.isArray(body.secteur_ids)) {
        // Confirm the supervisor belongs to the caller's team BEFORE any destructive write.
        let ownerCheck = supabase.from("superviseurs").select("id").eq("id", id);
        if (effectiveTeamId) ownerCheck = ownerCheck.eq("team_id", effectiveTeamId);
        const { data: owned } = await ownerCheck.maybeSingle();
        if (!owned) return jsonError(404, "Team Leader introuvable");
        let tltDelete = supabase.from("team_leader_tournees").delete().eq("superviseur_id", id);
        if (effectiveTeamId) tltDelete = tltDelete.eq("team_id", effectiveTeamId);
        await tltDelete;
        if (body.secteur_ids.length > 0) {
          const tltData = body.secteur_ids.map((sid: string) => ({ superviseur_id: id, secteur_id: sid, ...(effectiveTeamId ? { team_id: effectiveTeamId } : {}) }));
          await supabase.from("team_leader_tournees").insert(tltData);
          updates.secteur_id = body.secteur_ids[0];
        } else {
          updates.secteur_id = null;
        }
      }
      let query = supabase.from("superviseurs").update(updates).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query.select("id, identifiant, full_name, active, telephone, created_at, updated_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Team Leader introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/superviseurs/") && path.endsWith("/reset-password") && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_superviseurs"); if (denied) return denied; }
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      const password_hash = await hashPassword(password);
      let query = supabase.from("superviseurs").update({ password_hash, must_change_password: true, updated_at: new Date().toISOString() }).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }
    if (path.startsWith("/superviseurs/") && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_superviseurs"); if (denied) return denied; }
      const id = path.split("/")[2];
      let query = supabase.from("superviseurs").delete().eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- ADMINS CRUD ---
    if (path === "/admins" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_admins"); if (denied) return denied; }
      // Super admin sees all; regular admin sees only their team
      let query = supabase.from("admins").select("id, email, full_name, role, team_id, must_change_password, created_at, permissions").order("created_at", { ascending: false });
      if (adminRole !== "super_admin" && adminTeamId) query = query.eq("team_id", adminTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }
    if (path === "/admins" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_admins"); if (denied) return denied; }
      const { email, full_name, password, role, team_id } = await req.json();
      if (!email || !full_name || !password) return jsonError(400, "Email, nom et mot de passe requis");
      if (password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      if (adminRole === "super_admin" && role !== "super_admin" && !team_id) {
        return jsonError(400, "Une équipe doit être choisie pour un administrateur d'équipe");
      }
      const password_hash = await hashPassword(password);
      const insertData: Record<string, unknown> = {
        email: email.trim().toLowerCase(), full_name: full_name.trim(),
        password_hash, must_change_password: true,
        role: adminRole === "super_admin" && role === "super_admin" ? "super_admin" : "admin",
      };
      // Super admin can assign any team_id; regular admin can only create in their team
      if (adminRole === "super_admin") {
        if (team_id) insertData.team_id = team_id;
        // super_admin with no team_id = global admin
      } else if (adminTeamId) {
        insertData.team_id = adminTeamId;
      }
      const { data, error } = await supabase.from("admins").insert(insertData).select("id, email, full_name, role, team_id, must_change_password, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet email existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/admins/") && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_admins"); if (denied) return denied; }
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.email !== undefined) updates.email = body.email.trim().toLowerCase();
      if (body.role !== undefined && adminRole === "super_admin") {
        updates.role = body.role === "super_admin" ? "super_admin" : "admin";
      }
      if (body.team_id !== undefined && adminRole === "super_admin") updates.team_id = body.team_id || null;
      const superGuard = await guardSuperAdminTarget(id);
      if (superGuard) return superGuard;
      let query = supabase.from("admins").update(updates).eq("id", id);
      if (adminRole !== "super_admin" && adminTeamId) query = query.eq("team_id", adminTeamId);
      const { data, error } = await query.select("id, email, full_name, role, team_id, must_change_password, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet email existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Administrateur introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/admins/") && path.endsWith("/reset-password") && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_admins"); if (denied) return denied; }
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      const superGuard = await guardSuperAdminTarget(id);
      if (superGuard) return superGuard;
      const password_hash = await hashPassword(password);
      let query = supabase.from("admins").update({ password_hash, must_change_password: true }).eq("id", id);
      if (adminRole !== "super_admin" && adminTeamId) query = query.eq("team_id", adminTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }
    if (path.startsWith("/admins/") && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_admins"); if (denied) return denied; }
      const id = path.split("/")[2];
      if (id === session.user_id) return jsonError(400, "Vous ne pouvez pas supprimer votre propre compte");
      const superGuard = await guardSuperAdminTarget(id);
      if (superGuard) return superGuard;
      let query = supabase.from("admins").delete().eq("id", id);
      if (adminRole !== "super_admin" && adminTeamId) query = query.eq("team_id", adminTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- PRODUITS CRUD ---
    if (path === "/produits" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_produits", "view_ventes", "manage_bons_livraison", "view_visites"); if (denied) return denied; }
      let query = supabase.from("produits").select("id, nom, created_at").order("nom", { ascending: true });
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }
    if (path === "/produits" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_produits"); if (denied) return denied; }
      const { nom } = await req.json();
      if (!nom) return jsonError(400, "Nom du produit requis");
      const insertData: Record<string, unknown> = { nom: nom.trim() };
      if (effectiveTeamId) insertData.team_id = effectiveTeamId;
      const { data, error } = await supabase.from("produits").insert(insertData).select("id, nom, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Ce produit existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/produits/") && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_produits"); if (denied) return denied; }
      const id = path.split("/")[2];
      let query = supabase.from("produits").delete().eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- POINTS DE VENTE CRUD ---
    if (path === "/points-vente" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_points_vente", "view_carte", "view_visites", "view_dashboard"); if (denied) return denied; }
      // Admin filters: active status, secteur, search by name/code/city
      const activeFilter = url.searchParams.get("active");
      const secteurFilter = url.searchParams.get("secteur_id");
      const searchQ = sanitizeSearchTerm((url.searchParams.get("q") || "").trim());
      const diagnosticMode = url.searchParams.get("diagnostic") === "true";
      const commercialId = url.searchParams.get("commercial_id");
      if (commercialId) {
        let assignmentTeamId = effectiveTeamId;
        if (!assignmentTeamId) {
          const { data: commercial, error: commercialError } = await supabase
            .from("commerciaux")
            .select("team_id")
            .eq("id", commercialId)
            .maybeSingle();
          if (commercialError) return jsonError(500, "Erreur lors de la validation du commercial");
          assignmentTeamId = commercial?.team_id ?? null;
        }
        const assigned = await getAssignedPOSForCommercial(commercialId, assignmentTeamId, false);
        if (assigned.error || !assigned.points || !assigned.pagination) {
          return jsonError(assigned.error?.includes("n'appartient") ? 403 : 500, assigned.error || "Erreur lors de la récupération des POS affectés");
        }
        const assignedPoints = assigned.points as Record<string, unknown>[];
        const filteredAssigned = assignedPoints.filter((point) => {
          if (activeFilter === "true" && point.active !== true) return false;
          if (activeFilter === "false" && point.active !== false) return false;
          if (secteurFilter && point.secteur_id !== secteurFilter) return false;
          if (searchQ) {
            const term = normalizeAccents(searchQ);
            return [point.name, point.code, point.city].some((value) => normalizeAccents(String(value || "")).includes(term));
          }
          return true;
        });
        return jsonResponse(filteredAssigned, 200, diagnosticMode ? paginationHeaders(assigned.pagination) : undefined);
      }
      // Don't use PostgREST ilike for search — it's accent-sensitive and misses
      // names like "La Fraîcheur" when the user types "fraicheur".
      // The frontend already does accent-insensitive filtering client-side.
      const buildPointsQuery = (from: number, to: number) => {
        let pvQuery = supabase.from("points_vente").select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
        if (effectiveTeamId) pvQuery = pvQuery.eq("team_id", effectiveTeamId);
        if (activeFilter === "true") pvQuery = pvQuery.eq("active", true);
        if (activeFilter === "false") pvQuery = pvQuery.eq("active", false);
        if (secteurFilter) pvQuery = pvQuery.eq("secteur_id", secteurFilter);
        if (searchQ) pvQuery = pvQuery.or(`name.ilike.%${searchQ}%,code.ilike.%${searchQ}%,city.ilike.%${searchQ}%`);
        return pvQuery;
      };
      const pointsResult = await fetchAllRows(buildPointsQuery);
      const points = pointsResult.data;
      const pvError = pointsResult.error;
      if (pvError) return jsonError(500, "Erreur de lecture");
      const secteurIds = [...new Set((points || []).map((p: Record<string, unknown>) => p.secteur_id).filter(Boolean))] as string[];
      const secteurMap: Record<string, Record<string, unknown>> = {};
      if (secteurIds.length > 0) {
        const secteurResult = await fetchRowsForIds(secteurIds, (batch, from, to) => {
          let query = supabase.from("secteurs").select("id, nom, code, color_code", { count: "exact" }).in("id", batch).range(from, to);
          if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
          return query;
        });
        if (secteurResult.error) return jsonError(500, "Erreur lors de la récupération des secteurs POS");
        for (const s of secteurResult.data as Record<string, unknown>[]) secteurMap[String(s.id)] = s;
      }
      // Fetch commercial names per secteur via commercial_tournees
      const commercialMap: Record<string, string> = {};
      if (secteurIds.length > 0) {
        const assignmentResult = await fetchRowsForIds(secteurIds, (batch, from, to) => {
          let query = supabase.from("commercial_tournees").select("secteur_id, commercial:commerciaux(full_name)", { count: "exact" })
            .in("secteur_id", batch).order("secteur_id", { ascending: true }).range(from, to);
          if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
          return query;
        });
        if (assignmentResult.error) return jsonError(500, "Erreur lors de la récupération des affectations POS");
        for (const row of assignmentResult.data as Record<string, unknown>[]) {
          const sid = String(row.secteur_id);
          const commercial = row.commercial as Record<string, unknown> | null;
          if (commercial?.full_name && !commercialMap[sid]) commercialMap[sid] = String(commercial.full_name);
        }
      }
      // Resolve created_by IDs to names
      const creatorIds = [...new Set((points || []).map((p: Record<string, unknown>) => p.created_by).filter(Boolean))] as string[];
      const creatorMap: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const creatorResults = await Promise.all([
          fetchRowsForIds(creatorIds, (batch, from, to) => supabase.from("commerciaux").select("id, full_name", { count: "exact" }).in("id", batch).range(from, to)),
          fetchRowsForIds(creatorIds, (batch, from, to) => supabase.from("superviseurs").select("id, full_name", { count: "exact" }).in("id", batch).range(from, to)),
          fetchRowsForIds(creatorIds, (batch, from, to) => supabase.from("admins").select("id, full_name", { count: "exact" }).in("id", batch).range(from, to)),
        ]);
        if (creatorResults.some((result) => result.error)) return jsonError(500, "Erreur lors de la récupération des créateurs POS");
        for (const result of creatorResults) {
          for (const creator of result.data as Record<string, unknown>[]) creatorMap[String(creator.id)] = String(creator.full_name);
        }
      }
      const enriched = (points || []).map((p: Record<string, unknown>) => {
        const secteur = p.secteur_id ? secteurMap[String(p.secteur_id)] ?? null : null;
        const commercial_nom = p.secteur_id ? commercialMap[String(p.secteur_id)] ?? null : null;
        const created_by_name = p.created_by ? creatorMap[String(p.created_by)] ?? null : null;
        return { ...p, secteur_nom: secteur?.nom ?? null, secteur_code: secteur?.code ?? null, secteur_color: secteur?.color_code ?? null, commercial_nom, created_by_name };
      });
      return jsonResponse(enriched, 200, diagnosticMode ? paginationHeaders(pointsResult.pagination) : undefined);
    }
    if (path === "/points-vente" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      const { name, address, city, latitude, longitude, secteur_id, frigo_comtesse } = await req.json();
      if (!name || !address || !city || latitude == null || longitude == null) return jsonError(400, "Tous les champs sont requis");
      // Anti-duplication: check for probable duplicates before creating
      const { data: dups } = await supabase.rpc("find_duplicate_points_vente", {
        p_name: name.trim(), p_team_id: effectiveTeamId,
        p_latitude: Number(latitude), p_longitude: Number(longitude),
      });
      if (dups && dups.length > 0) {
        return jsonError(409, JSON.stringify({ duplicates: dups }));
      }
      const code = "PV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const qr_token = generateQrToken();
      const insertData: Record<string, unknown> = { code, name: name.trim(), address: address.trim(), city: city.trim(), latitude: Number(latitude), longitude: Number(longitude), qr_token };
      if (secteur_id) insertData.secteur_id = secteur_id;
      if (frigo_comtesse !== undefined && frigo_comtesse !== null) insertData.frigo_comtesse = frigo_comtesse;
      if (effectiveTeamId) insertData.team_id = effectiveTeamId;
      const { data, error } = await supabase.from("points_vente").insert(insertData).select("*").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Code déjà existant"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/points-vente/") && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.address !== undefined) updates.address = body.address.trim();
      if (body.city !== undefined) updates.city = body.city.trim();
      if (body.latitude !== undefined) updates.latitude = Number(body.latitude);
      if (body.longitude !== undefined) updates.longitude = Number(body.longitude);
      if (body.secteur_id !== undefined) updates.secteur_id = body.secteur_id || null;
      if (body.frigo_comtesse !== undefined) updates.frigo_comtesse = body.frigo_comtesse === null ? null : Boolean(body.frigo_comtesse);
      let query = supabase.from("points_vente").update(updates).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) return jsonError(500, "Erreur lors de la modification");
      if (!data) return jsonError(404, "Point de vente introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/points-vente/") && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      const id = path.split("/")[2];
      // Check if POS has history before deleting
      const historyTables = ["visites", "ventes", "controles_terrain", "promesses_achat", "bons_livraison", "commandes", "livraisons"];
      let hasHistory = false;
      for (const tbl of historyTables) {
        let hq = supabase.from(tbl).select("id", { count: "exact", head: true }).eq("point_vente_id", id);
        if (effectiveTeamId) hq = hq.eq("team_id", effectiveTeamId);
        const { count } = await hq;
        if (count && count > 0) { hasHistory = true; break; }
      }
      if (hasHistory) {
        return jsonError(409, "Ce point de vente possède un historique. Désactivez-le plutôt que de le supprimer.");
      }
      let query = supabase.from("points_vente").delete().eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }
    // --- BULK ACTIVATE/DEACTIVATE POINTS DE VENTE ---
    if (path === "/points-vente/bulk" && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      const { ids, active } = await req.json();
      if (!Array.isArray(ids) || ids.length === 0) return jsonError(400, "Ids requis");
      if (typeof active !== "boolean") return jsonError(400, "Le paramètre active est requis");
      let query = supabase.from("points_vente").update({ active, updated_at: new Date().toISOString() }).in("id", ids);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la mise à jour");
      return jsonResponse({ success: true, count: ids.length });
    }
    // --- BULK DELETE POINTS DE VENTE (only zero-history) ---
    if (path === "/points-vente/bulk" && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      const { ids } = await req.json();
      if (!Array.isArray(ids) || ids.length === 0) return jsonError(400, "Ids requis");
      // Check each POS for history; refuse if any has history
      const historyTables = ["visites", "ventes", "controles_terrain", "promesses_achat", "bons_livraison", "commandes", "livraisons"];
      for (const id of ids) {
        for (const tbl of historyTables) {
          let hq = supabase.from(tbl).select("id", { count: "exact", head: true }).eq("point_vente_id", id);
          if (effectiveTeamId) hq = hq.eq("team_id", effectiveTeamId);
          const { count } = await hq;
          if (count && count > 0) {
            return jsonError(409, "Un ou plusieurs points de vente possèdent un historique. Désactivez-les plutôt.");
          }
        }
      }
      let query = supabase.from("points_vente").delete().in("id", ids);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true, count: ids.length });
    }
    // --- CHECK FOR DUPLICATES BEFORE CREATION ---
    if (path === "/points-vente/check-duplicates" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      const { name, latitude, longitude } = await req.json();
      if (!name) return jsonError(400, "Nom requis");
      const { data: dups } = await supabase.rpc("find_duplicate_points_vente", {
        p_name: name.trim(), p_team_id: effectiveTeamId,
        p_latitude: latitude != null ? Number(latitude) : null,
        p_longitude: longitude != null ? Number(longitude) : null,
      });
      return jsonResponse({ duplicates: dups || [] });
    }

    // --- DASHBOARD STATS ---
    if (path === "/dashboard" && method === "GET") {
      { const denied = requireAnyAdminPermission("view_dashboard"); if (denied) return denied; }
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      async function countWithTeam(table: string, extraFilters: Record<string, unknown> = {}) {
        let query = supabase.from(table).select("*", { count: "exact", head: true });
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        for (const [k, v] of Object.entries(extraFilters)) {
          query = query.eq(k, v);
        }
        const { count } = await query;
        return count || 0;
      }

      async function countActivePOS() {
        let query = supabase.from("points_vente").select("id", { count: "exact", head: true })
          .or("active.eq.true,active.is.null");
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        const { count, error } = await query;
        if (error) throw new Error("Erreur lors du comptage des POS actifs");
        return count || 0;
      }

      const [
        totalCommerciaux, totalSuperviseurs, totalSecteurs, totalPointsVente,
        totalPointsVenteActifs, totalPointsVenteDesactives, totalPointsVenteAvecGps,
        visitesToday, outOfZoneToday, promessesToday,
        ventesRealisees, ventesNonRealisees,
        blEnAttente, blLivres, blPartiels, blAnnules,
        controlesToday, lastVisiteRaw
      ] = await Promise.all([
        countWithTeam("commerciaux"),
        countWithTeam("superviseurs"),
        countWithTeam("secteurs"),
        countWithTeam("points_vente"),
        countActivePOS(),
        countWithTeam("points_vente", { active: false }),
        getPOSWithGPS(effectiveTeamId).then(({ count, error }) => {
          if (error) throw new Error("Erreur lors du comptage des POS avec GPS");
          return count;
        }),
        (async () => { let q = supabase.from("visites").select("*", { count: "exact", head: true }).gte("visited_at", todayIso); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("visites").select("*", { count: "exact", head: true }).eq("status", "out_of_zone").gte("visited_at", todayIso); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("promesses_achat").select("*", { count: "exact", head: true }).gte("created_at", todayIso); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("visites").select("*", { count: "exact", head: true }).eq("vente_status", "vente_realisee").gte("visited_at", todayIso); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("visites").select("*", { count: "exact", head: true }).eq("vente_status", "vente_non_realisee").gte("visited_at", todayIso); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "en_attente"); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "livre"); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "partiel"); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "annule"); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("controles_terrain").select("*", { count: "exact", head: true }).gte("created_at", todayIso); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { count } = await q; return count || 0; })(),
        (async () => { let q = supabase.from("visites").select("visited_at").order("visited_at", { ascending: false }).limit(1); if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId); const { data } = await q.maybeSingle(); return data; })(),
      ]);

      return jsonResponse({
        totalCommerciaux, totalSuperviseurs, totalSecteurs, totalPointsVente,
        totalPointsVenteActifs, totalPointsVenteDesactives,
        totalPointsVenteAvecGps, totalPointsVenteSansGps: Math.max(0, totalPointsVente - totalPointsVenteAvecGps),
        visitesToday, outOfZoneToday, promessesToday,
        ventesRealisees, ventesNonRealisees,
        blEnAttente, blLivres, blPartiels, blAnnules,
        controlesToday, lastVisite: lastVisiteRaw?.visited_at || null,
      });
    }

    // --- ALL VISITES (admin) ---
    if (path === "/visites" && method === "GET") {
      { const denied = requireAnyAdminPermission("view_visites"); if (denied) return denied; }
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("visites").select(`id, visited_at, latitude, longitude, accuracy, distance_meters, status, vente_status, motif, user_role,
          commercial:commerciaux(full_name), superviseur:superviseurs(full_name), point_vente:points_vente(name, city)`, { count: "exact" })
        .order("visited_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error, count } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- ALL PROMESSES (admin) ---
    if (path === "/promesses" && method === "GET") {
      { const denied = requireAnyAdminPermission("view_visites"); if (denied) return denied; }
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("promesses_achat").select(`id, produits, quantite, date_previsionnelle, montant_estime, responsable, observations, created_at,
          superviseur:superviseurs(full_name), point_vente:points_vente(name, city)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error, count } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- ALL VENTES (admin) ---
    if (path === "/ventes" && method === "GET") {
      { const denied = requireAnyAdminPermission("view_ventes"); if (denied) return denied; }
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("ventes").select(`id, visite_id, commercial_id, superviseur_id, point_vente_id, secteur_id, montant_total, observation, created_at,
          commercial:commerciaux(full_name), superviseur:superviseurs(full_name), point_vente:points_vente(name, city, address),
          lignes:vente_lignes(produit_id, produit_nom, quantite, observation)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error, count } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- ALL BONS LIVRAISON (admin) ---
    if (path === "/bons-livraison" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_bons_livraison"); if (denied) return denied; }
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("bons_livraison").select(`id, numero, vente_id, commercial_id, superviseur_id, point_vente_id, secteur_id, statut, commentaire, date_livraison, created_at,
          commercial:commerciaux(full_name), superviseur:superviseurs(full_name), point_vente:points_vente(name, city, address),
          lignes:bl_lignes(produit_nom, quantite, unite, observation)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error, count } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }
    if (path.startsWith("/bons-livraison/") && path.endsWith("/statut") && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_bons_livraison"); if (denied) return denied; }
      const id = path.split("/")[2];
      const { statut, commentaire } = await req.json();
      if (!BL_STATUTS.includes(statut)) return jsonError(400, "Statut invalide");
      const updates: Record<string, unknown> = { statut };
      if (commentaire !== undefined) updates.commentaire = commentaire?.trim() || null;
      if (statut === "livre") updates.date_livraison = new Date().toISOString();
      let query = supabase.from("bons_livraison").update(updates).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la mise à jour");
      return jsonResponse({ success: true });
    }

    // --- PERMISSIONS MANAGEMENT ---
    if (path === "/permissions" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_admins"); if (denied) return denied; }
      const userType = url.searchParams.get("type") as UserType | null;
      const userId = url.searchParams.get("id");
      if (!userType || !userId) return jsonError(400, "Type et id requis");
      const table = userType === "admin" ? "admins" : userType === "superviseur" ? "superviseurs" : userType === "agent_livreur" ? "agents_livreur" : "commerciaux";
      if (userType === "admin" && adminRole !== "super_admin") {
        return jsonError(403, "Seul le super administrateur peut gérer les permissions des administrateurs");
      }
      let query = supabase.from(table).select("permissions").eq("id", userId);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data } = await query.maybeSingle();
      return jsonResponse({ permissions: normalizePermissions(data?.permissions, userType) });
    }
    if (path === "/permissions" && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_admins"); if (denied) return denied; }
      const { userType, userId, permissions } = await req.json();
      if (!userType || !userId) return jsonError(400, "Type et id requis");
      const table = userType === "admin" ? "admins" : userType === "superviseur" ? "superviseurs" : userType === "agent_livreur" ? "agents_livreur" : "commerciaux";
      if (userType === "admin" && adminRole !== "super_admin") {
        return jsonError(403, "Seul le super administrateur peut gérer les permissions des administrateurs");
      }
      if (userType === "admin" && userId === session.user_id) {
        return jsonError(400, "Vous ne pouvez pas modifier vos propres permissions");
      }
      const normalized = normalizePermissions(permissions, userType as UserType);
      let query = supabase.from(table).update({ permissions: normalized }).eq("id", userId);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la mise à jour des permissions");
      return jsonResponse({ success: true, permissions: normalized });
    }
    if (path === "/permissions/catalog" && method === "GET") {
      return jsonResponse({ field: [...FIELD_PERMISSIONS], dashboard: [...DASHBOARD_PERMISSIONS] });
    }

    // --- ALL CONTROLES TERRAIN (admin) ---
    if (path === "/controles-terrain" && method === "GET") {
      { const denied = requireAnyAdminPermission("view_controles"); if (denied) return denied; }
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("controles_terrain").select(`id, superviseur_id, point_vente_id, visite_id, secteur_id, notation, presence_comtesse, disponibilite, visibilite, merchandising, presence_concurrents, commentaires, recommandations, actions_correctives, created_at,
          superviseur:superviseurs(full_name), point_vente:points_vente(name, city, address)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error, count } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- AGENTS LIVREUR CRUD (admin) ---
    if (path === "/agents-livreur" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_agents_livreur"); if (denied) return denied; }
      let query = supabase
        .from("agents_livreur")
        .select("id, identifiant, full_name, active, telephone, team_id, permissions, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data: agents, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      // Fetch associated commerciaux for each agent
      const agentIds = (agents || []).map((a: Record<string, unknown>) => a.id);
      let assocData: Record<string, unknown>[] = [];
      if (agentIds.length > 0) {
        let assocQuery = supabase
          .from("commercial_agent_livreur")
          .select("agent_livreur_id, commercial_id, commerciaux:commerciaux(id, full_name, identifiant)")
          .in("agent_livreur_id", agentIds);
        if (effectiveTeamId) assocQuery = assocQuery.eq("team_id", effectiveTeamId);
        const { data: assocs } = await assocQuery;
        assocData = assocs || [];
      }
      const enriched = (agents || []).map((a: Record<string, unknown>) => {
        const commerciaux = assocData
          .filter((r: Record<string, unknown>) => r.agent_livreur_id === a.id)
          .map((r: Record<string, unknown>) => r.commerciaux)
          .filter(Boolean);
        return { ...a, commerciaux };
      });
      return jsonResponse(enriched);
    }
    if (path === "/agents-livreur" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_agents_livreur"); if (denied) return denied; }
      const { identifiant, full_name, password, telephone, commercial_ids } = await req.json();
      if (!identifiant || !full_name || !password) return jsonError(400, "Identifiant, nom et mot de passe requis");
      if (password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      const password_hash = await hashPassword(password);
      const insertData: Record<string, unknown> = {
        identifiant: identifiant.trim(), full_name: full_name.trim(),
        password_hash, telephone: telephone?.trim() || null,
        permissions: DEFAULT_AGENT_LIVREUR_PERMS,
      };
      if (effectiveTeamId) insertData.team_id = effectiveTeamId;
      const { data: agent, error } = await supabase.from("agents_livreur").insert(insertData).select("id, identifiant, full_name, active, telephone, team_id, permissions, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      // Associate commerciaux
      if (Array.isArray(commercial_ids) && commercial_ids.length > 0 && agent) {
        const assocRows = commercial_ids.map((cid: string) => ({
          commercial_id: cid, agent_livreur_id: agent.id,
          ...(effectiveTeamId ? { team_id: effectiveTeamId } : {}),
        }));
        await supabase.from("commercial_agent_livreur").insert(assocRows);
      }
      return jsonResponse(agent, 201);
    }
    if (path.startsWith("/agents-livreur/") && method === "PUT") {
      { const denied = requireAnyAdminPermission("manage_agents_livreur"); if (denied) return denied; }
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.telephone !== undefined) updates.telephone = body.telephone?.trim() || null;
      if (body.active !== undefined) updates.active = !!body.active;
      let query = supabase.from("agents_livreur").update(updates).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query.select("id, identifiant, full_name, active, telephone, team_id, permissions, created_at, updated_at").maybeSingle();
      if (error) return jsonError(500, "Erreur lors de la modification");
      if (!data) return jsonError(404, "Agent livreur introuvable");
      // Update associations if provided
      if (Array.isArray(body.commercial_ids)) {
        await supabase.from("commercial_agent_livreur").delete().eq("agent_livreur_id", id);
        if (body.commercial_ids.length > 0) {
          const assocRows = body.commercial_ids.map((cid: string) => ({
            commercial_id: cid, agent_livreur_id: id,
            ...(effectiveTeamId ? { team_id: effectiveTeamId } : {}),
          }));
          await supabase.from("commercial_agent_livreur").insert(assocRows);
        }
      }
      return jsonResponse(data);
    }
    if (path.startsWith("/agents-livreur/") && path.endsWith("/reset-password") && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_agents_livreur"); if (denied) return denied; }
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      const password_hash = await hashPassword(password);
      let query = supabase.from("agents_livreur").update({ password_hash, must_change_password: true }).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }
    if (path.startsWith("/agents-livreur/") && method === "DELETE") {
      { const denied = requireAnyAdminPermission("manage_agents_livreur"); if (denied) return denied; }
      const id = path.split("/")[2];
      let query = supabase.from("agents_livreur").delete().eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- ADMIN: LIST COMMANDES ---
    if (path === "/commandes" && method === "GET") {
      let query = supabase
        .from("commandes")
        .select(`id, code, point_vente_id, commercial_id, agent_livreur_id, secteur_id, team_id, statut, date_commande, date_livraison, agent_validation_at, observation, created_at, updated_at,
          commercial:commerciaux(full_name), agent_livreur:agents_livreur(full_name), point_vente:points_vente(name, city, address, latitude, longitude),
          lignes:commande_lignes(produit_id, produit_nom, quantite, unite, observation)`, { count: "exact" })
        .order("created_at", { ascending: false });
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error, count } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0 });
    }

    // --- ADMIN: UPDATE COMMANDE STATUT ---
    if (path.startsWith("/commandes/") && path.endsWith("/statut") && method === "PUT") {
      const id = path.split("/")[2];
      const { statut } = await req.json();
      const validStatuses = ["enregistree", "en_attente_livraison", "en_cours_livraison", "livree", "annulee", "non_livree"];
      if (!validStatuses.includes(statut)) return jsonError(400, "Statut invalide");
      let existingQuery = supabase.from("commandes").select("id, statut").eq("id", id);
      if (effectiveTeamId) existingQuery = existingQuery.eq("team_id", effectiveTeamId);
      const { data: existing } = await existingQuery.maybeSingle();
      if (!existing) return jsonError(404, "Commande introuvable");
      const updates: Record<string, unknown> = { statut, updated_at: new Date().toISOString() };
      if (statut === "livree") { updates.date_livraison = new Date().toISOString(); updates.agent_validation_at = new Date().toISOString(); }
      let query = supabase.from("commandes").update(updates).eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la mise à jour");
      await supabase.from("commande_status_history").insert({
        commande_id: id, ancien_statut: existing.statut, nouveau_statut: statut,
        modifie_par: session.full_name, user_role: "admin",
        ...(effectiveTeamId ? { team_id: effectiveTeamId } : {}),
      });
      return jsonResponse({ success: true });
    }

    // --- ADMIN: TEAM STATS (per-user performance) ---
    if (path === "/team-stats" && method === "GET") {
      { const denied = requireAnyAdminPermission("view_dashboard"); if (denied) return denied; }

      const dateStart = url.searchParams.get("date_start");
      const dateEnd = url.searchParams.get("date_end");
      const startIso = dateStart ? new Date(dateStart + "T00:00:00").toISOString() : null;
      const endIso = dateEnd ? new Date(dateEnd + "T23:59:59").toISOString() : null;

      const commerciauxResult = await fetchAllRows((from, to) => {
        let query = supabase.from("commerciaux").select("id, full_name, active, team_id", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        return query;
      });
      const visitesResult = await fetchAllRows((from, to) => {
        let query = supabase.from("visites").select("id, team_id, commercial_id, superviseur_id, point_vente_id, vente_status, visited_at, status", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        if (startIso) query = query.gte("visited_at", startIso);
        if (endIso) query = query.lte("visited_at", endIso);
        return query;
      });
      const ventesResult = await fetchAllRows((from, to) => {
        let query = supabase.from("ventes").select("id, team_id, commercial_id, superviseur_id, created_at", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        if (startIso) query = query.gte("created_at", startIso);
        if (endIso) query = query.lte("created_at", endIso);
        return query;
      });
      const pointsResult = effectiveTeamId
        ? await getTeamPOS(effectiveTeamId)
        : await fetchAllRows((from, to) => supabase.from("points_vente")
          .select("id, team_id, active, latitude, longitude, created_by, created_by_role, created_at", { count: "exact" })
          .order("id").range(from, to));
      const agentsResult = await fetchAllRows((from, to) => {
        let query = supabase.from("agents_livreur").select("id, full_name, active", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        return query;
      });
      const commandesResult = await fetchAllRows((from, to) => {
        let query = supabase.from("commandes").select("id, team_id, agent_livreur_id, commercial_id, statut, point_vente_id, created_at", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        if (startIso) query = query.gte("created_at", startIso);
        if (endIso) query = query.lte("created_at", endIso);
        return query;
      });
      const livraisonsResult = await fetchAllRows((from, to) => {
        let query = supabase.from("livraisons").select("id, team_id, agent_livreur_id, point_vente_id, created_at", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        if (startIso) query = query.gte("created_at", startIso);
        if (endIso) query = query.lte("created_at", endIso);
        return query;
      });
      const superviseursResult = await fetchAllRows((from, to) => {
        let query = supabase.from("superviseurs").select("id, full_name, active, team_id", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        return query;
      });
      const controlesResult = await fetchAllRows((from, to) => {
        let query = supabase.from("controles_terrain").select("id, team_id, superviseur_id, created_at", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        if (startIso) query = query.gte("created_at", startIso);
        if (endIso) query = query.lte("created_at", endIso);
        return query;
      });
      const pvCreatedResult = await fetchAllRows((from, to) => {
        let query = supabase.from("points_vente").select("id, team_id, created_by, created_by_role, created_at", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        if (startIso) query = query.gte("created_at", startIso);
        if (endIso) query = query.lte("created_at", endIso);
        return query;
      });
      let promQuery = supabase.from("promesses_achat").select("id, created_at");
      if (effectiveTeamId) promQuery = promQuery.eq("team_id", effectiveTeamId);
      if (startIso) promQuery = promQuery.gte("created_at", startIso);
      if (endIso) promQuery = promQuery.lte("created_at", endIso);
      const { count: promesseCount } = await promQuery;

      const blsResult = await fetchAllRows((from, to) => {
        let query = supabase.from("bons_livraison").select("id, statut, created_at", { count: "exact" }).order("id").range(from, to);
        if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
        if (startIso) query = query.gte("created_at", startIso);
        if (endIso) query = query.lte("created_at", endIso);
        return query;
      });
      const dataResults = [commerciauxResult, visitesResult, ventesResult, pointsResult, agentsResult, commandesResult, livraisonsResult, superviseursResult, controlesResult, pvCreatedResult, blsResult];
      if (dataResults.some((result) => result.error)) return jsonError(500, "Erreur lors de la récupération des statistiques de l'équipe");
      const commerciaux = commerciauxResult.data;
      const visites = visitesResult.data;
      const ventes = ventesResult.data;
      const pvCount = uniqueById(pointsResult.data as Record<string, unknown>[]).length;
      const agentsLivreur = agentsResult.data;
      const commandes = commandesResult.data;
      const livraisons = livraisonsResult.data;
      const superviseurs = superviseursResult.data;
      const controles = controlesResult.data;
      const pvCreated = pvCreatedResult.data as Record<string, unknown>[];
      const bls = blsResult.data;

      const [assignedCommercialRows, createdCommercialRows] = await Promise.all([
        Promise.all((commerciaux || []).map(async (commercial: Record<string, unknown>) => {
          const result = await getAssignedPOSForCommercial(String(commercial.id), String(commercial.team_id || ""), false);
          if (result.error || !result.points) throw new Error(result.error || "Erreur lors de la récupération des POS affectés");
          return [String(commercial.id), new Set((result.points as Record<string, unknown>[]).map((point) => String(point.id)))] as const;
        })),
        Promise.resolve((commerciaux || []).map((commercial: Record<string, unknown>) => [
          String(commercial.id),
          getCreatedPOSByCommercial(pvCreated, String(commercial.id), String(commercial.team_id)).length,
        ] as const)),
      ]);
      const assignedCommercialIds = new Map(assignedCommercialRows);
      const createdCommercialCounts = new Map(createdCommercialRows);
      const assignedSupervisorRows = await Promise.all((superviseurs || []).map(async (supervisor: Record<string, unknown>) => {
        const result = await getAssignedPOSForSupervisor(String(supervisor.id), String(supervisor.team_id || ""));
        if (result.error || !result.points) throw new Error(result.error || "Erreur lors de la récupération des POS affectés");
        return [String(supervisor.id), new Set((result.points as Record<string, unknown>[]).map((point) => String(point.id)))] as const;
      }));
      const assignedSupervisorIds = new Map(assignedSupervisorRows);
      const commercialStats = (commerciaux || []).map((c: Record<string, unknown>) => {
        const cId = String(c.id);
        const cVisites = (visites || []).filter((v: Record<string, unknown>) => v.commercial_id === cId && v.team_id === c.team_id);
        const cVentes = (ventes || []).filter((v: Record<string, unknown>) => v.commercial_id === cId && v.team_id === c.team_id);
        const distinctPdv = getVisitedPOS(cVisites as Record<string, unknown>[]).size;
        const pdvCreated = createdCommercialCounts.get(cId) ?? 0;
        return {
          id: cId,
          full_name: String(c.full_name),
          active: !!c.active,
          points_vente: distinctPdv,
          points_vente_visites: distinctPdv,
          points_vente_affectes: assignedCommercialIds.get(cId)?.size ?? 0,
          points_vente_crees: pdvCreated,
          visites: cVisites.length,
          ventes: cVentes.length,
          ventes_non_realisees: cVisites.filter((v: Record<string, unknown>) => v.vente_status === "vente_non_realisee").length,
          promesses: cVisites.filter((v: Record<string, unknown>) => v.vente_status === "promesse_achat").length,
        };
      });

      const agentStats = (agentsLivreur || []).map((a: Record<string, unknown>) => {
        const aId = String(a.id);
        const aCommandes = (commandes || []).filter((c: Record<string, unknown>) => c.agent_livreur_id === aId && c.team_id === a.team_id);
        const aLivraisons = (livraisons || []).filter((l: Record<string, unknown>) => l.agent_livreur_id === aId && l.team_id === a.team_id);
        const distinctPdv = new Set(aLivraisons.map((l: Record<string, unknown>) => String(l.point_vente_id)).filter(Boolean)).size;
        return {
          id: aId,
          full_name: String(a.full_name),
          active: !!a.active,
          points_vente: distinctPdv,
          points_vente_livres: distinctPdv,
          commandes: aCommandes.length,
          livrees: aCommandes.filter((c: Record<string, unknown>) => c.statut === "livree").length,
          en_cours: aCommandes.filter((c: Record<string, unknown>) => c.statut !== "livree" && c.statut !== "annulee").length,
          livraisons: aLivraisons.length,
        };
      });

      const superviseurStats = (superviseurs || []).map((s: Record<string, unknown>) => {
        const sId = String(s.id);
        const sVisites = (visites || []).filter((v: Record<string, unknown>) => v.superviseur_id === sId && v.team_id === s.team_id);
        const sVentes = (ventes || []).filter((v: Record<string, unknown>) => v.superviseur_id === sId && v.team_id === s.team_id);
        const sControles = (controles || []).filter((c: Record<string, unknown>) => c.superviseur_id === sId && c.team_id === s.team_id);
        const distinctPdv = getVisitedPOS(sVisites as Record<string, unknown>[]).size;
        const pdvCreated = uniqueById(pvCreated.filter((p) => p.created_by === sId
          && p.created_by_role === "superviseur" && p.team_id === s.team_id)).length;
        return {
          id: sId,
          full_name: String(s.full_name),
          active: !!s.active,
          points_vente: distinctPdv,
          points_vente_visites: distinctPdv,
          points_vente_affectes: assignedSupervisorIds.get(sId)?.size ?? 0,
          points_vente_crees: pdvCreated,
          visites: sVisites.length,
          ventes: sVentes.length,
          controles: sControles.length,
        };
      });

      const allVisitedPvIds = getVisitedPOS(visites as Record<string, unknown>[]);
      const visitesNonValidees = (visites || []).filter((v: Record<string, unknown>) => v.status === "out_of_zone").length;

      return jsonResponse({
        totals: {
          points_vente: pvCount,
          points_vente_visites: allVisitedPvIds.size,
          visites: visites?.length || 0,
          visites_non_validees: visitesNonValidees,
          ventes: ventes?.length || 0,
          commandes: commandes?.length || 0,
          livraisons: livraisons?.length || 0,
          controles: controles?.length || 0,
          promesses: promesseCount || 0,
          bl_en_attente: (bls || []).filter((b: Record<string, unknown>) => b.statut === "en_attente").length,
          bl_livres: (bls || []).filter((b: Record<string, unknown>) => b.statut === "livre").length,
          bl_partiels: (bls || []).filter((b: Record<string, unknown>) => b.statut === "partiel").length,
          bl_annules: (bls || []).filter((b: Record<string, unknown>) => b.statut === "annule").length,
        },
        commerciaux: commercialStats,
        agents_livreur: agentStats,
        superviseurs: superviseurStats,
      });
    }
  }
  if (session.user_type === "commercial" || session.user_type === "superviseur") {
    const userId = session.user_id;
    const userRole = session.user_type as "commercial" | "superviseur";
    const userTeamId = session.team_id;

    // --- RESOLVE QR TOKEN ---
    if (path === "/resolve-qr" && method === "POST") {
      const denied = requirePermission("scan"); if (denied) return denied;
      const { qr_token } = await req.json();
      if (!qr_token) return jsonError(400, "Token QR requis");
      let query = supabase.from("points_vente").select("id, name, address, city, latitude, longitude").eq("qr_token", qr_token.trim());
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query.maybeSingle();
      if (error || !data) return jsonError(404, "QR Code invalide ou point de vente introuvable");
      return jsonResponse(data);
    }

    // --- RECORD VISIT ---
    if (path === "/visites" && method === "POST") {
      const denied = requirePermission("scan"); if (denied) return denied;
      const { point_vente_id, latitude, longitude, accuracy } = await req.json();
      if (!point_vente_id || latitude == null || longitude == null) return jsonError(400, "Données de visite incomplètes");
      let pvQuery = supabase.from("points_vente").select("id, latitude, longitude, name").eq("id", point_vente_id);
      if (userTeamId) pvQuery = pvQuery.eq("team_id", userTeamId);
      const { data: pv, error: pvError } = await pvQuery.maybeSingle();
      if (pvError || !pv) return jsonError(404, "Point de vente introuvable");
      const distance = haversineMeters(Number(latitude), Number(longitude), pv.latitude, pv.longitude);
      const acc = accuracy != null ? Number(accuracy) : null;

      if (acc != null && acc > MAX_GPS_ACCURACY_METERS) {
        return jsonResponse({ status: "poor_gps", accuracy: acc, message: "Signal GPS insuffisant. Veuillez patienter quelques secondes ou vous déplacer dans une zone mieux couverte avant de réessayer." }, 200);
      }

      if (distance > MAX_DISTANCE_METERS) {
        const insertData: Record<string, unknown> = { point_vente_id, latitude: Number(latitude), longitude: Number(longitude), accuracy: acc, distance_meters: distance, status: "out_of_zone", vente_status: "out_of_zone", user_role: userRole };
        if (userRole === "commercial") insertData.commercial_id = userId; else insertData.superviseur_id = userId;
        if (userTeamId) insertData.team_id = userTeamId;
        await supabase.from("visites").insert(insertData);
        return jsonResponse({ status: "out_of_zone", distance, accuracy: acc, message: "Vous êtes situé à plus de 30 mètres du point de vente. Rapprochez-vous puis réessayez.", debug: { userLat: Number(latitude), userLon: Number(longitude), pointName: pv.name } }, 200);
      }

      const fiveMinAgo = new Date(Date.now() - DOUBLE_SCAN_MINUTES * 60 * 1000).toISOString();
      let dedupQuery = supabase.from("visites").select("id, visited_at").eq("point_vente_id", point_vente_id).gte("visited_at", fiveMinAgo).order("visited_at", { ascending: false }).limit(1);
      if (userRole === "commercial") dedupQuery = dedupQuery.eq("commercial_id", userId); else dedupQuery = dedupQuery.eq("superviseur_id", userId);
      if (userTeamId) dedupQuery = dedupQuery.eq("team_id", userTeamId);
      const { data: recent } = await dedupQuery.maybeSingle();
      if (recent) return jsonResponse({ status: "duplicate", message: `Une visite a déjà été enregistrée à ce point il y a moins de ${DOUBLE_SCAN_MINUTES} minutes.`, lastVisit: recent.visited_at }, 200);

      const insertData: Record<string, unknown> = { point_vente_id, latitude: Number(latitude), longitude: Number(longitude), accuracy: acc, distance_meters: distance, status: "confirmed", vente_status: "confirmed", user_role: userRole };
      if (userRole === "commercial") insertData.commercial_id = userId; else insertData.superviseur_id = userId;
      if (userTeamId) insertData.team_id = userTeamId;
      const { data: visit, error: insertError } = await supabase.from("visites").insert(insertData).select("id, visited_at, distance_meters, status, vente_status").maybeSingle();
      if (insertError) {
        console.error("visite insert failed", insertError);
        return jsonError(500, "Erreur lors de l'enregistrement de la visite");
      }
      return jsonResponse({ status: "confirmed", distance, accuracy: acc, visit }, 201);
    }

    // --- FINALIZE VISIT ---
    if (path === "/visites/finalize" && method === "POST") {
      const denied = requirePermission("scan"); if (denied) return denied;
      const { visite_id, vente_status, motif } = await req.json();
      if (!visite_id || !vente_status) return jsonError(400, "Visite et statut de vente requis");
      const validStatuses = ["vente_realisee", "vente_non_realisee"];
      if (userRole === "superviseur") validStatuses.push("promesse_achat");
      if (!validStatuses.includes(vente_status)) return jsonError(400, "Statut de vente invalide");
      if (vente_status === "vente_non_realisee") {
        if (!motif || !motif.trim()) return jsonError(400, "Un motif est obligatoire pour une vente non réalisée");
        if (!VENTE_NON_REALISEE_MOTIFS.includes(motif.trim())) return jsonError(400, "Motif invalide");
      }
      const updates: Record<string, unknown> = { vente_status };
      if (vente_status === "vente_non_realisee") updates.motif = motif.trim();
      const ownerFilter: Record<string, unknown> = userRole === "commercial" ? { id: visite_id, commercial_id: userId } : { id: visite_id, superviseur_id: userId };
      if (userTeamId) ownerFilter.team_id = userTeamId;
      const { data: existing } = await supabase.from("visites").select("id, status, vente_status").match(ownerFilter).maybeSingle();
      if (!existing) return jsonError(404, "Visite introuvable");
      // Only a visit whose GPS check passed, and which has not already been closed,
      // may be finalized. Re-checked in the UPDATE itself so a concurrent call cannot slip through.
      if (existing.status !== "confirmed") {
        return jsonError(409, "Cette visite n'a pas été validée sur le terrain et ne peut pas être finalisée.");
      }
      if (existing.vente_status !== "confirmed") {
        return jsonError(409, "Cette visite a déjà été finalisée.");
      }
      const { data: updated, error } = await supabase.from("visites").update(updates)
        .eq("id", visite_id).eq("status", "confirmed").eq("vente_status", "confirmed")
        .select("id").maybeSingle();
      if (error) return jsonError(500, "Erreur lors de la finalisation");
      if (!updated) return jsonError(409, "Cette visite a déjà été finalisée.");
      return jsonResponse({ success: true, visite_id, vente_status });
    }

    // --- CREATE VENTE (with multi-product lignes + auto BL) ---
    if (path === "/ventes" && method === "POST") {
      const denied = requirePermission("record_vente"); if (denied) return denied;
      const { visite_id, point_vente_id: bodyPointVenteId, lignes, livraison_immediate, observation } = await req.json();
      if (!visite_id || !bodyPointVenteId || !Array.isArray(lignes) || lignes.length === 0)
        return jsonError(400, "Visite, point de vente et au moins une ligne de produit requis");

      for (const l of lignes) {
        if (!l.produit_id || typeof l.produit_id !== "string")
          return jsonError(400, "Chaque ligne doit référencer un produit du catalogue");
        if (!Number.isFinite(Number(l.quantite)) || Number(l.quantite) <= 0)
          return jsonError(400, "La quantité doit être supérieure à zéro");
      }

      const produitIds = [...new Set(lignes.map((l: Record<string, unknown>) => String(l.produit_id)))];
      let produitQuery = supabase.from("produits").select("id, nom").in("id", produitIds);
      if (userTeamId) produitQuery = produitQuery.eq("team_id", userTeamId);
      const { data: validProduits, error: produitError } = await produitQuery;
      if (produitError) return jsonError(500, "Erreur lors de la vérification des produits");
      const validMap = new Map((validProduits ?? []).map((p: Record<string, unknown>) => [String(p.id), String(p.nom)]));
      for (const id of produitIds) {
        if (!validMap.has(id)) return jsonError(400, "Un produit sélectionné n'existe pas dans le catalogue");
      }

      const ownerFilter: Record<string, unknown> = userRole === "commercial" ? { id: visite_id, commercial_id: userId } : { id: visite_id, superviseur_id: userId };
      if (userTeamId) ownerFilter.team_id = userTeamId;
      const { data: visite } = await supabase.from("visites").select("id, status, point_vente_id").match(ownerFilter).maybeSingle();
      if (!visite) return jsonError(404, "Visite introuvable");
      if (visite.status !== "confirmed") {
        return jsonError(409, "Cette visite n'a pas été validée sur le terrain.");
      }
      // The sale belongs to the point de vente whose presence was actually proven by the
      // visit, never to one named by the caller.
      const point_vente_id = String(visite.point_vente_id);
      if (String(bodyPointVenteId) !== point_vente_id) {
        return jsonError(409, "Ce point de vente ne correspond pas à celui de la visite.");
      }
      const { data: venteExistante } = await supabase.from("ventes").select("id").eq("visite_id", visite_id).maybeSingle();
      if (venteExistante) return jsonError(409, "Une vente a déjà été enregistrée pour cette visite.");

      let secteur_id: string | null = null;
      if (userRole === "commercial") {
        const info = await getCommercialSecteur(userId, userTeamId);
        secteur_id = info.secteur_id;
      } else {
        secteur_id = await getSuperviseurSecteur(userId, userTeamId);
      }
      if (!secteur_id) secteur_id = await getPointVenteSecteur(point_vente_id, userTeamId);

      const venteInsert: Record<string, unknown> = {
        visite_id, point_vente_id, montant_total: 0,
        observation: observation?.trim() || null,
      };
      if (userRole === "commercial") venteInsert.commercial_id = userId; else venteInsert.superviseur_id = userId;
      if (secteur_id) venteInsert.secteur_id = secteur_id;
      if (userTeamId) venteInsert.team_id = userTeamId;
      const { data: vente, error: venteError } = await supabase.from("ventes").insert(venteInsert).select("id, created_at").maybeSingle();
      if (venteError?.code === "23505") return jsonError(409, "Une vente a déjà été enregistrée pour cette visite.");
      if (venteError || !vente) return jsonError(500, "Erreur lors de la création de la vente");

      const lignesData = lignes.map((l: Record<string, unknown>) => ({
        vente_id: vente.id,
        produit_id: String(l.produit_id),
        produit_nom: validMap.get(String(l.produit_id)) || String(l.produit_nom || "").trim(),
        quantite: Number(l.quantite) || 1,
        prix_unitaire: 0,
        montant: 0,
        observation: l.observation?.trim() || null,
        ...(userTeamId ? { team_id: userTeamId } : {}),
      }));
      const { error: lignesError } = await supabase.from("vente_lignes").insert(lignesData);
      if (lignesError) return jsonError(500, "Erreur lors de l'enregistrement des lignes");

      const blNumero = generateBlNumero();
      const blInsert: Record<string, unknown> = {
        numero: blNumero, vente_id: vente.id, point_vente_id,
        statut: livraison_immediate ? "livre" : "en_attente",
      };
      if (userRole === "commercial") blInsert.commercial_id = userId; else blInsert.superviseur_id = userId;
      if (secteur_id) blInsert.secteur_id = secteur_id;
      if (livraison_immediate) blInsert.date_livraison = new Date().toISOString();
      if (userTeamId) blInsert.team_id = userTeamId;
      const { data: bl, error: blError } = await supabase.from("bons_livraison").insert(blInsert).select("id, numero").maybeSingle();
      if (blError) return jsonError(500, "Erreur lors de la création du bon de livraison");

      const blLignesData = lignes.map((l: Record<string, unknown>) => ({
        bl_id: bl!.id,
        produit_id: String(l.produit_id),
        produit_nom: validMap.get(String(l.produit_id)) || String(l.produit_nom || "").trim(),
        quantite: Number(l.quantite) || 1,
        unite: "unité",
        observation: l.observation?.trim() || null,
        ...(userTeamId ? { team_id: userTeamId } : {}),
      }));
      await supabase.from("bl_lignes").insert(blLignesData);

      await supabase.from("visites").update({ vente_status: livraison_immediate ? "vente_livraison" : "vente_realisee" }).eq("id", visite_id);

      return jsonResponse({ id: vente.id, bl_id: bl!.id, bl_numero: bl!.numero, created_at: vente.created_at }, 201);
    }

    // --- CREATE PROMESSE D'ACHAT (superviseur only) ---
    if (path === "/promesses" && method === "POST" && userRole === "superviseur") {
      const denied = requirePermission("create_promesse"); if (denied) return denied;
      const { visite_id, point_vente_id: bodyPointVenteId, produits, quantite, date_previsionnelle, montant_estime, responsable, observations } = await req.json();
      if (!visite_id || !bodyPointVenteId || !produits) return jsonError(400, "Visite, point de vente et produits requis");
      let visQuery = supabase.from("visites").select("id, status, vente_status, point_vente_id").eq("id", visite_id).eq("superviseur_id", userId);
      if (userTeamId) visQuery = visQuery.eq("team_id", userTeamId);
      const { data: visite } = await visQuery.maybeSingle();
      if (!visite) return jsonError(404, "Visite introuvable");
      if (visite.status !== "confirmed") return jsonError(409, "Cette visite n'a pas été validée sur le terrain.");
      if (visite.vente_status !== "confirmed") return jsonError(409, "Cette visite a déjà été finalisée.");
      // The promise is filed against the visited point de vente, not one named by the caller.
      const point_vente_id = String(visite.point_vente_id);
      if (String(bodyPointVenteId) !== point_vente_id) {
        return jsonError(409, "Ce point de vente ne correspond pas à celui de la visite.");
      }
      await supabase.from("visites").update({ vente_status: "promesse_achat" })
        .eq("id", visite_id).eq("status", "confirmed").eq("vente_status", "confirmed");
      const insertData: Record<string, unknown> = {
        visite_id, superviseur_id: userId, point_vente_id,
        produits: Array.isArray(produits) ? produits.join(", ") : produits.trim(),
        quantite: Number(quantite) || 1, date_previsionnelle: date_previsionnelle || null,
        montant_estime: montant_estime ? Number(montant_estime) : null,
        responsable: responsable?.trim() || null, observations: observations?.trim() || null,
      };
      if (userTeamId) insertData.team_id = userTeamId;
      const { data, error } = await supabase.from("promesses_achat").insert(insertData).select("id, created_at").maybeSingle();
      if (error) return jsonError(500, "Erreur lors de l'enregistrement de la promesse");
      return jsonResponse(data, 201);
    }

    // --- CREATE CONTROLE TERRAIN (superviseur only) ---
    if (path === "/controles-terrain" && method === "POST" && userRole === "superviseur") {
      const denied = requirePermission("control_terrain"); if (denied) return denied;
      const { point_vente_id, visite_id, notation, presence_comtesse, disponibilite, visibilite, merchandising, presence_concurrents, commentaires, recommandations, actions_correctives } = await req.json();
      if (!point_vente_id || !notation) return jsonError(400, "Point de vente et notation requis");
      if (!CONTROLE_NOTATIONS.includes(notation)) return jsonError(400, "Notation invalide");
      let pvCheck = supabase.from("points_vente").select("id, secteur_id").eq("id", point_vente_id);
      if (userTeamId) pvCheck = pvCheck.eq("team_id", userTeamId);
      const { data: pvExists } = await pvCheck.maybeSingle();
      if (!pvExists) return jsonError(404, "Point de vente introuvable");
      // A control may only be attached to a visit the caller actually made.
      let linkedVisiteId: string | null = null;
      if (visite_id) {
        let visCheck = supabase.from("visites").select("id").eq("id", visite_id).eq("superviseur_id", userId);
        if (userTeamId) visCheck = visCheck.eq("team_id", userTeamId);
        const { data: ownVisite } = await visCheck.maybeSingle();
        if (!ownVisite) return jsonError(404, "Visite introuvable");
        linkedVisiteId = String(ownVisite.id);
      }
      const secteur_id = pvExists.secteur_id || await getSuperviseurSecteur(userId, userTeamId);
      const insertData: Record<string, unknown> = {
        superviseur_id: userId, point_vente_id, visite_id: linkedVisiteId, secteur_id,
        notation, presence_comtesse: !!presence_comtesse, disponibilite: !!disponibilite,
        visibilite: !!visibilite, merchandising: !!merchandising, presence_concurrents: !!presence_concurrents,
        commentaires: commentaires?.trim() || null, recommandations: recommandations?.trim() || null,
        actions_correctives: actions_correctives?.trim() || null,
      };
      if (userTeamId) insertData.team_id = userTeamId;
      const { data, error } = await supabase.from("controles_terrain").insert(insertData).select("id, created_at").maybeSingle();
      if (error) return jsonError(500, "Erreur lors de l'enregistrement du contrôle");
      return jsonResponse(data, 201);
    }

    // --- MY VISITES ---
    if (path === "/mes-visites" && method === "GET") {
      const denied = requirePermission("view_history"); if (denied) return denied;
      let query = supabase.from("visites").select(`id, visited_at, latitude, longitude, accuracy, distance_meters, status, vente_status, motif, user_role, point_vente:points_vente(name, city, address)`).order("visited_at", { ascending: false });
      if (userRole === "commercial") query = query.eq("commercial_id", userId); else query = query.eq("superviseur_id", userId);
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- MY CONTROLES (superviseur) ---
    if (path === "/mes-controles" && method === "GET" && userRole === "superviseur") {
      const denied = requirePermission("control_terrain"); if (denied) return denied;
      let query = supabase
        .from("controles_terrain").select(`id, notation, presence_comtesse, disponibilite, visibilite, merchandising, presence_concurrents, commentaires, recommandations, actions_correctives, created_at, point_vente:points_vente(name, city, address)`)
        .eq("superviseur_id", userId).order("created_at", { ascending: false });
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- MY BONS LIVRAISON (commercial) ---
    if (path === "/mes-bons-livraison" && method === "GET" && userRole === "commercial") {
      const denied = requirePermission("record_vente"); if (denied) return denied;
      let query = supabase
        .from("bons_livraison").select(`id, numero, statut, commentaire, date_livraison, created_at, point_vente:points_vente(name, city, address), lignes:bl_lignes(produit_nom, quantite, unite)`)
        .eq("commercial_id", userId).order("created_at", { ascending: false });
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- VENTES NON REALISEES (superviseur) ---
    if (path === "/ventes-non-realisees" && method === "GET" && userRole === "superviseur") {
      const denied = requirePermission("view_ventes_non_realisees"); if (denied) return denied;
      let commQuery = supabase.from("commerciaux").select("id").eq("superviseur_id", userId);
      if (userTeamId) commQuery = commQuery.eq("team_id", userTeamId);
      const { data: commerciaux } = await commQuery;
      if (!commerciaux || commerciaux.length === 0) return jsonResponse([]);
      const commIds = commerciaux.map((c: Record<string, unknown>) => c.id);
      let query = supabase
        .from("visites").select(`id, visited_at, motif, user_role, commercial:commerciaux(full_name), point_vente:points_vente(name, city, address)`)
        .in("commercial_id", commIds).eq("vente_status", "vente_non_realisee").order("visited_at", { ascending: false });
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- PRODUITS LIST ---
    if (path === "/produits" && method === "GET") {
      let query = supabase.from("produits").select("id, nom").order("nom", { ascending: true });
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- SEARCH POINTS DE VENTE ---
    if (path === "/search-points-vente" && method === "GET") {
      const denied = requirePermission("search_point_vente"); if (denied) return denied;
      const q = sanitizeSearchTerm((url.searchParams.get("q") || "").trim());
      if (!q || q.length < 2) return jsonResponse([]);
      if (!userTeamId) return jsonError(400, "Une équipe est requise pour rechercher les POS");
      const qNorm = normalizeAccents(q);
      const result = await fetchAllRows((from, to) => supabase
        .from("points_vente")
        .select("id, code, name, address, city, latitude, longitude, secteur_id, team_id", { count: "exact" })
        .eq("team_id", userTeamId)
        .order("id", { ascending: true })
        .range(from, to));
      if (result.error) return jsonError(500, "Erreur de recherche");
      const filtered = uniqueById(result.data as Record<string, unknown>[]).filter((p: Record<string, unknown>) => {
        const name = normalizeAccents(String(p.name || ""));
        const code = normalizeAccents(String(p.code || ""));
        const city = normalizeAccents(String(p.city || ""));
        const address = normalizeAccents(String(p.address || ""));
        return name.includes(qNorm) || code.includes(qNorm) || city.includes(qNorm) || address.includes(qNorm);
      }).slice(0, 20);
      return jsonResponse(filtered);
    }

    // --- CREATE COMMANDE (commercial) ---
    if (path === "/commandes" && method === "POST" && userRole === "commercial") {
      const { point_vente_id, lignes, observation } = await req.json();
      if (!point_vente_id || !Array.isArray(lignes) || lignes.length === 0)
        return jsonError(400, "Point de vente et au moins une ligne de produit requis");
      for (const l of lignes) {
        if (!l.produit_nom || typeof l.produit_nom !== "string" || !l.produit_nom.trim())
          return jsonError(400, "Chaque ligne doit avoir un nom de produit");
        if (!Number.isFinite(Number(l.quantite)) || Number(l.quantite) <= 0)
          return jsonError(400, "La quantité doit être supérieure à zéro");
      }
      // Verify point de vente belongs to user's team
      let pvQuery = supabase.from("points_vente").select("id, secteur_id").eq("id", point_vente_id);
      if (userTeamId) pvQuery = pvQuery.eq("team_id", userTeamId);
      const { data: pv, error: pvError } = await pvQuery.maybeSingle();
      if (pvError || !pv) return jsonError(404, "Point de vente introuvable");
      const code = "CMD-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const secteur_id = pv.secteur_id || (await getCommercialSecteur(userId, userTeamId)).secteur_id;
      // Find associated agent livreur(s)
      let agentQuery = supabase
        .from("commercial_agent_livreur")
        .select("agent_livreur_id")
        .eq("commercial_id", userId);
      if (userTeamId) agentQuery = agentQuery.eq("team_id", userTeamId);
      const { data: agentAssocs } = await agentQuery;
      const agent_livreur_id = agentAssocs && agentAssocs.length > 0 ? agentAssocs[0].agent_livreur_id : null;
      const cmdInsert: Record<string, unknown> = {
        code, point_vente_id, commercial_id: userId,
        agent_livreur_id, secteur_id,
        statut: "enregistree", observation: observation?.trim() || null,
      };
      if (userTeamId) cmdInsert.team_id = userTeamId;
      const { data: cmd, error: cmdError } = await supabase.from("commandes").insert(cmdInsert).select("id, code, created_at").maybeSingle();
      if (cmdError) { if (cmdError.code === "23505") return jsonError(409, "Code commande déjà existant"); return jsonError(500, "Erreur lors de la création de la commande"); }
      const lignesData = lignes.map((l: Record<string, unknown>) => ({
        commande_id: cmd!.id,
        produit_id: l.produit_id || null,
        produit_nom: String(l.produit_nom).trim(),
        quantite: Number(l.quantite) || 1,
        unite: l.unite || "unité",
        observation: l.observation?.trim() || null,
        ...(userTeamId ? { team_id: userTeamId } : {}),
      }));
      const { error: lignesError } = await supabase.from("commande_lignes").insert(lignesData);
      if (lignesError) return jsonError(500, "Erreur lors de l'enregistrement des lignes");
      await supabase.from("commande_status_history").insert({
        commande_id: cmd!.id, ancien_statut: null, nouveau_statut: "enregistree",
        modifie_par: session.full_name, user_role: "commercial",
        ...(userTeamId ? { team_id: userTeamId } : {}),
      });
      return jsonResponse({ id: cmd!.id, code: cmd!.code, created_at: cmd!.created_at }, 201);
    }

    // --- MY COMMANDES (commercial) ---
    if (path === "/mes-commandes" && method === "GET" && userRole === "commercial") {
      let query = supabase
        .from("commandes")
        .select(`id, code, point_vente_id, statut, date_commande, date_livraison, observation, created_at,
          point_vente:points_vente(name, city, address, latitude, longitude),
          lignes:commande_lignes(produit_id, produit_nom, quantite, unite, observation)`)
        .eq("commercial_id", userId)
        .order("created_at", { ascending: false });
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- SECTEURS LIST (only the field user's assigned tournées) ---
    if (path === "/secteurs" && method === "GET") {
      const denied = requirePermission("create_point_vente");
      if (denied) return denied;
      if (userRole !== "commercial" && userRole !== "superviseur") return jsonError(403, "Rôle non autorisé");
      if (!userTeamId) return jsonError(400, "Une équipe est requise pour récupérer les tournées affectées");
      const assignmentTable = userRole === "commercial" ? "commercial_tournees" : "team_leader_tournees";
      const ownerColumn = userRole === "commercial" ? "commercial_id" : "superviseur_id";
      const assignmentResult = await fetchAllRows((from, to) => supabase.from(assignmentTable).select("secteur_id", { count: "exact" })
        .eq(ownerColumn, session.user_id).eq("team_id", userTeamId).order("secteur_id").range(from, to));
      if (assignmentResult.error) return jsonError(500, "Erreur lors de la récupération des tournées");
      const secteurIds = [...new Set(assignmentResult.data.map((row: Record<string, unknown>) => String(row.secteur_id)))];
      if (secteurIds.length === 0) return jsonResponse([]);
      const secteurResult = await fetchRowsForIds(secteurIds, (batch, from, to) => supabase.from("secteurs").select("*", { count: "exact" })
        .in("id", batch).eq("team_id", userTeamId).eq("actif", true).order("created_at", { ascending: false }).range(from, to));
      if (secteurResult.error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(uniqueById(secteurResult.data as Record<string, unknown>[]));
    }

    // --- MES TOURNEES (commercial + superviseur) ---
    if (path === "/mes-tournees" && method === "GET") {
      if (userRole === "agent_livreur") {
        let commandesQuery = supabase.from("commandes").select("id, statut, secteur_id, created_at", { count: "exact" })
          .eq("agent_livreur_id", userId).order("created_at", { ascending: false });
        if (userTeamId) commandesQuery = commandesQuery.eq("team_id", userTeamId);
        const commandesResult = await fetchAllRows((from, to) => commandesQuery.range(from, to));
        if (commandesResult.error) return jsonError(500, "Erreur de lecture");
        const secteurIds = [...new Set(commandesResult.data.map((row: Record<string, unknown>) => row.secteur_id).filter(Boolean).map(String))];
        if (secteurIds.length === 0) return jsonResponse([]);
        const secteursResult = await fetchRowsForIds(secteurIds, (batch, from, to) => {
          let query = supabase.from("secteurs").select("*", { count: "exact" }).in("id", batch).order("nom", { ascending: true }).range(from, to);
          if (userTeamId) query = query.eq("team_id", userTeamId);
          return query;
        });
        if (secteursResult.error) return jsonError(500, "Erreur de lecture");
        const sectors = uniqueById(secteursResult.data as Record<string, unknown>[]);
        return jsonResponse(sectors.map((sector) => {
          const sectorCommands = commandesResult.data.filter((row: Record<string, unknown>) => row.secteur_id === sector.id);
          const delivered = sectorCommands.filter((row: Record<string, unknown>) => row.statut === "livree").length;
          const pending = sectorCommands.filter((row: Record<string, unknown>) => row.statut !== "livree" && row.statut !== "annulee").length;
          return {
            id: String(sector.id),
            nom: sector.nom,
            code: sector.code,
            color_code: sector.color_code,
            actif: sector.actif,
            total_commandes: sectorCommands.length,
            livrees: delivered,
            en_cours: pending,
            restantes: pending,
            statut: delivered === 0 ? "a_venir" : delivered >= sectorCommands.length ? "terminee" : "en_cours",
          };
        }));
      }
      if (userRole !== "commercial" && userRole !== "superviseur") return jsonError(403, "Rôle non autorisé");
      if (!userTeamId) return jsonError(400, "Une équipe est requise pour récupérer les tournées affectées");
      const assignmentTable = userRole === "commercial" ? "commercial_tournees" : "team_leader_tournees";
      const ownerColumn = userRole === "commercial" ? "commercial_id" : "superviseur_id";
      const assignmentResult = await fetchAllRows((from, to) => supabase.from(assignmentTable).select("secteur_id", { count: "exact" })
        .eq(ownerColumn, userId).eq("team_id", userTeamId).order("secteur_id").range(from, to));
      if (assignmentResult.error) return jsonError(500, "Erreur lors de la récupération des tournées");
      const secteurIds = [...new Set(assignmentResult.data.map((row: Record<string, unknown>) => String(row.secteur_id)))];
      if (secteurIds.length === 0) return jsonResponse([]);
      const secteursResult = await fetchRowsForIds(secteurIds, (batch, from, to) => supabase.from("secteurs").select("*", { count: "exact" })
        .in("id", batch).eq("team_id", userTeamId).order("nom", { ascending: true }).range(from, to));
      if (secteursResult.error) return jsonError(500, "Erreur de lecture");
      const secteurs = uniqueById(secteursResult.data as Record<string, unknown>[]);
      // For each secteur, count PVs and visits
      const result = await Promise.all(secteurs.map(async (sec: Record<string, unknown>) => {
        const secId = String(sec.id);
        let pvQ = supabase.from("points_vente").select("id", { count: "exact", head: true }).eq("secteur_id", secId);
        pvQ = pvQ.eq("team_id", userTeamId);
        const { count: totalPv, error: pvError } = await pvQ;
        if (pvError) throw new Error("Erreur lors du comptage des POS de tournée");

        let visQ = supabase.from("visites").select("id, point_vente_id, vente_status, visited_at", { count: "exact" }).eq("secteur_id", secId);
        if (userRole === "commercial") visQ = visQ.eq("commercial_id", userId);
        else visQ = visQ.eq("superviseur_id", userId);
        visQ = visQ.eq("team_id", userTeamId);
        const visitesResult = await fetchAllRows((from, to) => visQ.order("id").range(from, to));
        if (visitesResult.error) throw new Error("Erreur lors de la récupération des visites de tournée");
        const visList = visitesResult.data as Record<string, unknown>[];
        const visitedPvIds = getVisitedPOS(visList);
        const ventesRealisees = visList.filter((v: Record<string, unknown>) => v.vente_status === "vente_realisee" || v.vente_status === "vente_livraison").length;
        const ventesNonRealisees = visList.filter((v: Record<string, unknown>) => v.vente_status === "vente_non_realisee").length;
        const promesses = visList.filter((v: Record<string, unknown>) => v.vente_status === "promesse_achat").length;

        // Livraisons for this secteur
        let livQ = supabase.from("livraisons").select("id, statut_final", { count: "exact", head: true }).eq("secteur_id", secId);
        if (userRole === "commercial") livQ = livQ.eq("commercial_id", userId);
        livQ = livQ.eq("team_id", userTeamId);
        const { count: livraisonsCount } = await livQ;

        let blQ = supabase.from("bons_livraison").select("id, statut", { count: "exact", head: true }).eq("secteur_id", secId);
        if (userRole === "commercial") blQ = blQ.eq("commercial_id", userId);
        blQ = blQ.eq("team_id", userTeamId);
        const { count: blCount } = await blQ;

        const visitedCount = visitedPvIds.size;
        const total = totalPv || 0;
        const statut = visitedCount === 0 ? "a_venir" : visitedCount >= total ? "terminee" : "en_cours";

        return {
          id: secId,
          nom: sec.nom,
          code: sec.code,
          color_code: sec.color_code,
          actif: sec.actif,
          total_points_vente: total,
          points_visites: visitedCount,
          points_restants: Math.max(0, total - visitedCount),
          visites: visList.length,
          ventes_realisees: ventesRealisees,
          ventes_non_realisees: ventesNonRealisees,
          promesses: promesses,
          livraisons: livraisonsCount || 0,
          bl_total: blCount || 0,
          statut,
        };
      }));
      return jsonResponse(result);
    }

    // --- TOURNEE DETAIL (commercial + superviseur) ---
    if (path.startsWith("/tournee-detail/") && method === "GET") {
      if (userRole !== "commercial" && userRole !== "superviseur") return jsonError(403, "Rôle non autorisé");
      if (!userTeamId) return jsonError(400, "Une équipe est requise pour récupérer la tournée");
      const secteurId = path.split("/")[2];
      // Verify assignment
      const assignmentTable = userRole === "commercial" ? "commercial_tournees" : "team_leader_tournees";
      const ownerColumn = userRole === "commercial" ? "commercial_id" : "superviseur_id";
      let assignQ = supabase.from(assignmentTable).select("secteur_id").eq(ownerColumn, userId).eq("secteur_id", secteurId);
      assignQ = assignQ.eq("team_id", userTeamId);
      const { data: assignment, error: assignmentError } = await assignQ.maybeSingle();
      if (assignmentError) return jsonError(500, "Erreur lors de la vérification de l'affectation");
      if (!assignment) return jsonError(403, "Cette tournée ne vous est pas affectée");

      const { data: secteur, error: secteurError } = await supabase.from("secteurs").select("*").eq("id", secteurId).eq("team_id", userTeamId).maybeSingle();
      if (secteurError) return jsonError(500, "Erreur lors de la récupération de la tournée");
      if (!secteur) return jsonError(404, "Tournée introuvable");

      const pointResult = await fetchAllRows((from, to) => supabase.from("points_vente")
        .select("id, code, name, address, city, latitude, longitude, secteur_id, team_id", { count: "exact" })
        .eq("secteur_id", secteurId).eq("team_id", userTeamId)
        .order("id", { ascending: true }).range(from, to));
      if (pointResult.error) return jsonError(500, "Erreur lors de la récupération des POS de la tournée");
      const points = uniqueById(pointResult.data as Record<string, unknown>[]);
      const pvIds = points.map((point) => String(point.id));
      const visitsResult = await fetchRowsForIds(pvIds, (batch, from, to) => {
        let query = supabase.from("visites").select("id, point_vente_id, visited_at, vente_status, status, motif, user_role", { count: "exact" })
          .in("point_vente_id", batch).eq("team_id", userTeamId).order("visited_at", { ascending: false }).range(from, to);
        if (userRole === "commercial") query = query.eq("commercial_id", userId);
        else query = query.eq("superviseur_id", userId);
        return query;
      });
      if (visitsResult.error) return jsonError(500, "Erreur lors de la récupération des visites de tournée");
      const salesResult = await fetchRowsForIds(pvIds, (batch, from, to) => {
        let query = supabase.from("ventes").select("id, point_vente_id, created_at", { count: "exact" })
          .in("point_vente_id", batch).eq("team_id", userTeamId).order("created_at", { ascending: false }).range(from, to);
        if (userRole === "commercial") query = query.eq("commercial_id", userId);
        else query = query.eq("superviseur_id", userId);
        return query;
      });
      if (salesResult.error) return jsonError(500, "Erreur lors de la récupération des ventes de tournée");
      const blResult = await fetchRowsForIds(pvIds, (batch, from, to) => {
        let query = supabase.from("bons_livraison").select("id, numero, point_vente_id, statut, date_livraison", { count: "exact" })
          .in("point_vente_id", batch).eq("team_id", userTeamId).order("date_livraison", { ascending: false }).range(from, to);
        if (userRole === "commercial") query = query.eq("commercial_id", userId);
        else query = query.eq("superviseur_id", userId);
        return query;
      });
      if (blResult.error) return jsonError(500, "Erreur lors de la récupération des bons de livraison de tournée");
      const visites = visitsResult.data as Record<string, unknown>[];
      const ventes = salesResult.data as Record<string, unknown>[];
      const bls = blResult.data as Record<string, unknown>[];

      const visByPv = new Map<string, Record<string, unknown>>();
      for (const v of (visites || []) as Record<string, unknown>[]) {
        const pvId = String(v.point_vente_id);
        if (!visByPv.has(pvId)) visByPv.set(pvId, v);
      }
      const venteByPv = new Set((ventes || []).map((v: Record<string, unknown>) => String(v.point_vente_id)));
      const blByPv = new Map<string, Record<string, unknown>>();
      for (const bl of (bls || []) as Record<string, unknown>[]) {
        if (!blByPv.has(String(bl.point_vente_id))) blByPv.set(String(bl.point_vente_id), bl);
      }

      const enrichedPoints = points.map((p: Record<string, unknown>) => {
        const pId = String(p.id);
        const lastVisite = visByPv.get(pId);
        return {
          ...p,
          visite: lastVisite ? {
            visited_at: lastVisite.visited_at,
            vente_status: lastVisite.vente_status,
            status: lastVisite.status,
            motif: lastVisite.motif,
          } : null,
          vente_realisee: venteByPv.has(pId),
          bl: blByPv.get(pId) || null,
        };
      });

      return jsonResponse({
        secteur,
        points: enrichedPoints,
        stats: {
          total: enrichedPoints.length,
          visites: enrichedPoints.filter((p) => p.visite).length,
          restants: enrichedPoints.filter((p) => !p.visite).length,
          ventes: venteByPv.size,
          bl_livres: (bls || []).filter((b: Record<string, unknown>) => b.statut === "livre").length,
          bl_en_attente: (bls || []).filter((b: Record<string, unknown>) => b.statut === "en_attente").length,
        },
      });
    }

    // --- MES POINTS DE VENTE (commercial + superviseur) ---
    if (path === "/mes-points-vente" && method === "GET") {
      if (userRole === "commercial") {
        const result = await getAssignedPOSForCommercial(userId, userTeamId);
        if (result.error || !result.points || !result.pagination) {
          return jsonError(500, result.error || "Erreur lors de la récupération des points de vente");
        }
        return jsonResponse(result.points, 200, paginationHeaders(result.pagination));
      }
      if (userRole !== "superviseur") return jsonError(403, "Rôle non autorisé");
      const result = await getAssignedPOSForSupervisor(userId, userTeamId);
      if (result.error || !result.points || !result.secteurs || !result.pagination) {
        return jsonError(500, result.error || "Erreur lors de la récupération des points de vente");
      }
      const points = result.points as Record<string, unknown>[];
      const pvIds = points.map((point) => String(point.id));
      const secteurMap = new Map((result.secteurs as Record<string, unknown>[])
        .map((secteur) => [String(secteur.id), secteur]));
      const visitsResult = await fetchRowsForIds(pvIds, (batch, from, to) => supabase
        .from("visites")
        .select("id, point_vente_id, visited_at, vente_status", { count: "exact" })
        .in("point_vente_id", batch)
        .eq("superviseur_id", userId)
        .eq("team_id", userTeamId!)
        .order("visited_at", { ascending: false })
        .range(from, to));
      if (visitsResult.error) return jsonError(500, "Erreur lors de la récupération des visites");
      const salesResult = await fetchRowsForIds(pvIds, (batch, from, to) => supabase
        .from("ventes")
        .select("id, point_vente_id, created_at", { count: "exact" })
        .in("point_vente_id", batch)
        .eq("superviseur_id", userId)
        .eq("team_id", userTeamId!)
        .order("created_at", { ascending: false })
        .range(from, to));
      if (salesResult.error) return jsonError(500, "Erreur lors de la récupération des ventes");
      const visites = visitsResult.data as Record<string, unknown>[];
      const ventes = salesResult.data as Record<string, unknown>[];

      const visByPv = new Map<string, Record<string, unknown>>();
      for (const v of (visites || []) as Record<string, unknown>[]) {
        const pvId = String(v.point_vente_id);
        if (!visByPv.has(pvId)) visByPv.set(pvId, v);
      }
      const venteByPv = new Set((ventes || []).map((v: Record<string, unknown>) => String(v.point_vente_id)));

      const enriched = points.map((p: Record<string, unknown>) => {
        const pId = String(p.id);
        const lastVisite = visByPv.get(pId);
        const secteur = p.secteur_id ? secteurMap[String(p.secteur_id)] ?? null : null;
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          secteur_id: p.secteur_id,
          team_id: p.team_id,
          active: p.active,
          created_by: p.created_by,
          created_by_role: p.created_by_role,
          created_at: p.created_at,
          address: p.address,
          city: p.city,
          latitude: p.latitude,
          longitude: p.longitude,
          secteur_nom: secteur?.nom ?? null,
          secteur_code: secteur?.code ?? null,
          secteur_color: secteur?.color_code ?? null,
          derniere_visite: lastVisite?.visited_at ?? null,
          derniere_vente: venteByPv.has(pId) ? (ventes || []).find((v: Record<string, unknown>) => String(v.point_vente_id) === pId)?.created_at ?? null : null,
          vente_status: lastVisite?.vente_status ?? null,
          statut: lastVisite ? "visite" : "non_visite",
        };
      });
      return jsonResponse(enriched, 200, paginationHeaders(result.pagination));
    }

    // --- CREATE POINT DE VENTE (field users) ---
    if (path === "/points-vente" && method === "POST") {
      const denied = requirePermission("create_point_vente"); if (denied) return denied;
      const { name, address, city, latitude, longitude, secteur_id, frigo_comtesse } = await req.json();
      if (!name || !address || !city || latitude == null || longitude == null || !secteur_id) return jsonError(400, "Tous les champs sont requis, y compris la tournée");
      const assignmentTable = userRole === "commercial" ? "commercial_tournees" : "team_leader_tournees";
      const ownerColumn = userRole === "commercial" ? "commercial_id" : "superviseur_id";
      let assignmentQuery = supabase.from(assignmentTable).select("secteur_id").eq(ownerColumn, session.user_id).eq("secteur_id", secteur_id);
      if (userTeamId) assignmentQuery = assignmentQuery.eq("team_id", userTeamId);
      const { data: assignment, error: assignmentError } = await assignmentQuery.maybeSingle();
      if (assignmentError) return jsonError(500, "Erreur lors de la vérification de la tournée");
      if (!assignment) return jsonError(403, "Cette tournée ne vous est pas affectée");
      // Anti-duplication: check for probable duplicates before creating
      const { data: dups } = await supabase.rpc("find_duplicate_points_vente", {
        p_name: name.trim(), p_team_id: userTeamId,
        p_latitude: Number(latitude), p_longitude: Number(longitude),
      });
      if (dups && dups.length > 0) {
        return jsonError(409, JSON.stringify({ duplicates: dups }));
      }
      const code = "PV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const qr_token = generateQrToken();
      const insertData: Record<string, unknown> = { code, name: name.trim(), address: address.trim(), city: city.trim(), latitude: Number(latitude), longitude: Number(longitude), qr_token, secteur_id, created_by: userId, created_by_role: userRole };
      if (frigo_comtesse !== undefined && frigo_comtesse !== null) insertData.frigo_comtesse = frigo_comtesse;
      if (userTeamId) insertData.team_id = userTeamId;
      // The QR secret is deliberately left out of the response: a field user never needs it.
      const { data, error } = await supabase.from("points_vente").insert(insertData).select("id, code, name, address, city, latitude, longitude, secteur_id, team_id, frigo_comtesse, created_by, created_by_role, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Code déjà existant"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }

    // --- GEOLOCALISATION SANS CAMERA ---
    // Returns the list of points de vente within a given radius (meters)
    // of the user's GPS position. Gated by the "use_geolocation" permission.
    if (path === "/geoloc-nearby" && method === "POST") {
      const denied = requirePermission("use_geolocation"); if (denied) return denied;
      const { latitude, longitude, radius } = await req.json();
      if (typeof latitude !== "number" || typeof longitude !== "number") return jsonError(400, "Coordonnées GPS invalides");
      if (!userTeamId) return jsonError(400, "Une équipe est requise pour rechercher les POS proches");
      const maxRadius = Math.min(Math.max(typeof radius === "number" ? radius : 500, 50), 5000);
      const pointResult = await fetchAllRows((from, to) => supabase.from("points_vente")
        .select("id, code, name, address, city, latitude, longitude, secteur_id, qr_token, team_id", { count: "exact" })
        .eq("team_id", userTeamId).order("id", { ascending: true }).range(from, to));
      if (pointResult.error) return jsonError(500, "Erreur de lecture");
      const nearby = uniqueById(pointResult.data as Record<string, unknown>[])
        .filter((p: Record<string, unknown>) => typeof p.latitude === "number" && typeof p.longitude === "number")
        .map((p: Record<string, unknown>) => ({
          ...p,
          distance_meters: haversineMeters(latitude, longitude, p.latitude as number, p.longitude as number),
        }))
        .filter((p: Record<string, unknown> & { distance_meters: number }) => p.distance_meters <= maxRadius)
        .sort((a: { distance_meters: number }, b: { distance_meters: number }) => a.distance_meters - b.distance_meters)
        .slice(0, 20);
      return jsonResponse(nearby);
    }

    // --- RECORD VISIT VIA GEOLOCALISATION ---
    // Validates presence without a QR scan: the user selects a nearby point
    // and the server checks the GPS distance just like a scan-based visit.
    if (path === "/geoloc-visit" && method === "POST") {
      const denied = requirePermission("use_geolocation"); if (denied) return denied;
      const { point_vente_id, latitude, longitude, accuracy } = await req.json();
      if (!point_vente_id || typeof latitude !== "number" || typeof longitude !== "number") return jsonError(400, "Paramètres invalides");
      let pvQuery = supabase.from("points_vente").select("id, name, latitude, longitude, qr_token").eq("id", point_vente_id);
      if (userTeamId) pvQuery = pvQuery.eq("team_id", userTeamId);
      const { data: pv, error: pvError } = await pvQuery.maybeSingle();
      if (pvError || !pv) return jsonError(404, "Point de vente introuvable");
      const distance = haversineMeters(latitude, longitude, pv.latitude, pv.longitude);
      const MAX_DISTANCE = 30;
      if (distance > MAX_DISTANCE) {
        return jsonResponse({
          status: "out_of_zone",
          distance,
          message: `Vous êtes à ${distance} m du point de vente. Rapprochez-vous à moins de ${MAX_DISTANCE} m.`,
          debug: { userLat: latitude, userLon: longitude, pointName: pv.name },
        });
      }
      // Check for duplicate visit today
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      let dupQuery = supabase.from("visites").select("id, visited_at").eq("point_vente_id", point_vente_id).gte("visited_at", todayStart.toISOString());
      if (userRole === "commercial") {
        dupQuery = dupQuery.eq("commercial_id", userId);
      } else {
        dupQuery = dupQuery.eq("superviseur_id", userId);
      }
      const { data: existing } = await dupQuery.maybeSingle();
      if (existing) {
        return jsonResponse({
          status: "duplicate",
          message: "Vous avez déjà visité ce point de vente aujourd'hui.",
          visit: { id: existing.id, visited_at: existing.visited_at, distance_meters: distance, status: "duplicate", vente_status: null },
        });
      }
      const insertData: Record<string, unknown> = {
        point_vente_id,
        latitude,
        longitude,
        accuracy: typeof accuracy === "number" ? accuracy : null,
        distance_meters: distance,
        status: "confirmed",
        user_role: userRole,
      };
      if (userRole === "commercial") insertData.commercial_id = userId;
      else insertData.superviseur_id = userId;
      if (userTeamId) insertData.team_id = userTeamId;
      const { data: visit, error: visitError } = await supabase.from("visites").insert(insertData).select("id, visited_at, distance_meters, status").maybeSingle();
      if (visitError) return jsonError(500, "Erreur lors de l'enregistrement de la visite");
      return jsonResponse({
        status: "confirmed",
        distance,
        visit: { id: visit.id, visited_at: visit.visited_at, distance_meters: visit.distance_meters, status: visit.status, vente_status: null },
        pointName: pv.name,
      });
    }
  }

  // ===== AGENT LIVREUR ROUTES =====
  if (session.user_type === "agent_livreur") {
    const userId = session.user_id;
    const userTeamId = session.team_id;

    // --- LIST COMMANDES TO DELIVER ---
    if (path === "/mes-commandes-livraison" && method === "GET") {
      const denied = requirePermission("view_commandes_livraison"); if (denied) return denied;
      let query = supabase
        .from("commandes")
        .select(`id, code, point_vente_id, commercial_id, agent_livreur_id, statut, date_commande, date_livraison, agent_validation_at, observation, created_at,
          commercial:commerciaux(full_name),
          point_vente:points_vente(name, city, address, latitude, longitude),
          lignes:commande_lignes(produit_id, produit_nom, quantite, unite, observation)`)
        .eq("agent_livreur_id", userId)
        .order("created_at", { ascending: false });
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- COMMANDE DETAIL ---
    if (path.startsWith("/commandes/") && method === "GET") {
      const denied = requirePermission("view_commande_detail"); if (denied) return denied;
      const id = path.split("/")[2];
      let query = supabase
        .from("commandes")
        .select(`id, code, point_vente_id, commercial_id, agent_livreur_id, statut, date_commande, date_livraison, agent_validation_at, observation, created_at, updated_at,
          commercial:commerciaux(full_name),
          point_vente:points_vente(name, city, address, latitude, longitude),
          lignes:commande_lignes(produit_id, produit_nom, quantite, unite, observation),
          history:commande_status_history(ancien_statut, nouveau_statut, modifie_par, user_role, created_at)`)
        .eq("id", id)
        .eq("agent_livreur_id", userId);
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query.maybeSingle();
      if (error) return jsonError(500, "Erreur de lecture");
      if (!data) return jsonError(404, "Commande introuvable");
      return jsonResponse(data);
    }

    // --- VALIDATE LIVRAISON ---
    if (path.startsWith("/commandes/") && path.endsWith("/valider-livraison") && method === "POST") {
      const denied = requirePermission("validate_livraison"); if (denied) return denied;
      const id = path.split("/")[2];
      const { statut, commentaire } = await req.json();
      const validStatuses = ["livree", "non_livree"];
      if (!validStatuses.includes(statut)) return jsonError(400, "Statut invalide. Utilisez 'livree' ou 'non_livree'.");
      let existingQuery = supabase
        .from("commandes")
        .select("id, statut, point_vente_id, commercial_id, agent_livreur_id")
        .eq("id", id)
        .eq("agent_livreur_id", userId);
      if (userTeamId) existingQuery = existingQuery.eq("team_id", userTeamId);
      const { data: existing, error: existError } = await existingQuery.maybeSingle();
      if (existError || !existing) return jsonError(404, "Commande introuvable");
      if (existing.statut === "livree" || existing.statut === "annulee") return jsonError(409, "Cette commande a déjà été traitée.");
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        statut, updated_at: now, agent_validation_at: now,
        ...(statut === "livree" ? { date_livraison: now } : {}),
      };
      const { error: updateError } = await supabase.from("commandes").update(updates).eq("id", id).eq("agent_livreur_id", userId);
      if (updateError) return jsonError(500, "Erreur lors de la validation");
      // Create livraison traceability record
      await supabase.from("livraisons").insert({
        commande_id: id, agent_livreur_id: userId,
        point_vente_id: existing.point_vente_id, commercial_id: existing.commercial_id,
        statut_final: statut, date_livraison: now,
        commentaire: commentaire?.trim() || null,
        ...(userTeamId ? { team_id: userTeamId } : {}),
      });
      // Record status history
      await supabase.from("commande_status_history").insert({
        commande_id: id, ancien_statut: existing.statut, nouveau_statut: statut,
        modifie_par: session.full_name, user_role: "agent_livreur",
        ...(userTeamId ? { team_id: userTeamId } : {}),
      });
      return jsonResponse({ success: true, statut, date_livraison: statut === "livree" ? now : null });
    }

    // --- HISTORIQUE LIVRAISONS ---
    if (path === "/historique-livraisons" && method === "GET") {
      const denied = requirePermission("view_historique_livraisons"); if (denied) return denied;
      let query = supabase
        .from("livraisons")
        .select(`id, commande_id, statut_final, date_livraison, commentaire, created_at,
          commande:commandes(code),
          point_vente:points_vente(name, city, address),
          commercial:commerciaux(full_name)`)
        .eq("agent_livreur_id", userId)
        .order("date_livraison", { ascending: false });
      if (userTeamId) query = query.eq("team_id", userTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- SEARCH POINTS DE VENTE (agent livreur) ---
    if (path === "/search-points-vente" && method === "GET") {
      const denied = requirePermission("search_point_vente"); if (denied) return denied;
      const q = sanitizeSearchTerm((url.searchParams.get("q") || "").trim());
      if (!q || q.length < 2) return jsonResponse([]);
      if (!userTeamId) return jsonError(400, "Une équipe est requise pour rechercher les POS");
      const qNorm = normalizeAccents(q);
      const result = await fetchAllRows((from, to) => supabase
        .from("points_vente")
        .select("id, code, name, address, city, latitude, longitude, secteur_id, team_id", { count: "exact" })
        .eq("team_id", userTeamId)
        .order("id", { ascending: true })
        .range(from, to));
      if (result.error) return jsonError(500, "Erreur de recherche");
      const filtered = uniqueById(result.data as Record<string, unknown>[]).filter((p: Record<string, unknown>) => {
        const name = normalizeAccents(String(p.name || ""));
        const code = normalizeAccents(String(p.code || ""));
        const city = normalizeAccents(String(p.city || ""));
        const address = normalizeAccents(String(p.address || ""));
        return name.includes(qNorm) || code.includes(qNorm) || city.includes(qNorm) || address.includes(qNorm);
      }).slice(0, 20);
      return jsonResponse(filtered);
    }

    // --- MES TOURNEES (agent livreur) ---
    if (path === "/mes-tournees" && method === "GET") {
      // Agent livreur sees commandes grouped by secteur
      let cmdQ = supabase
        .from("commandes")
        .select(`id, code, statut, secteur_id, point_vente_id, created_at,
          point_vente:points_vente(name, city, address)`)
        .eq("agent_livreur_id", userId)
        .order("created_at", { ascending: false });
      if (userTeamId) cmdQ = cmdQ.eq("team_id", userTeamId);
      const { data: commandes, error: cmdErr } = await cmdQ;
      if (cmdErr) return jsonError(500, "Erreur de lecture");

      const secteurIds = [...new Set((commandes || []).map((c: Record<string, unknown>) => c.secteur_id).filter(Boolean))] as string[];
      if (secteurIds.length === 0) return jsonResponse([]);

      let secQ = supabase.from("secteurs").select("*").in("id", secteurIds).order("nom", { ascending: true });
      if (userTeamId) secQ = secQ.eq("team_id", userTeamId);
      const { data: secteurs } = await secQ;

      const result = (secteurs || []).map((sec: Record<string, unknown>) => {
        const secId = String(sec.id);
        const secCmds = (commandes || []).filter((c: Record<string, unknown>) => c.secteur_id === secId);
        const livrees = secCmds.filter((c: Record<string, unknown>) => c.statut === "livree").length;
        const enCours = secCmds.filter((c: Record<string, unknown>) => c.statut !== "livree" && c.statut !== "annulee").length;
        return {
          id: secId,
          nom: sec.nom,
          code: sec.code,
          color_code: sec.color_code,
          actif: sec.actif,
          total_commandes: secCmds.length,
          livrees,
          en_cours: enCours,
          restantes: Math.max(0, secCmds.filter((c: Record<string, unknown>) => c.statut !== "livree" && c.statut !== "annulee").length),
          statut: livrees === 0 ? "a_venir" : livrees >= secCmds.length ? "terminee" : "en_cours",
        };
      });
      return jsonResponse(result);
    }

    // --- MES POINTS DE VENTE (agent livreur) ---
    if (path === "/mes-points-vente" && method === "GET") {
      let cmdQ = supabase
        .from("commandes")
        .select(`id, code, statut, date_livraison, point_vente_id, secteur_id,
          point_vente:points_vente(id, code, name, address, city, latitude, longitude, secteur_id)`)
        .eq("agent_livreur_id", userId)
        .order("created_at", { ascending: false });
      if (userTeamId) cmdQ = cmdQ.eq("team_id", userTeamId);
      const { data: commandes, error: cmdErr } = await cmdQ;
      if (cmdErr) return jsonError(500, "Erreur de lecture");

      const secIds = [...new Set((commandes || []).map((c: Record<string, unknown>) => c.secteur_id).filter(Boolean))] as string[];
      const secteurMap: Record<string, Record<string, unknown>> = {};
      if (secIds.length > 0) {
        let secQuery = supabase.from("secteurs").select("id, nom, code, color_code").in("id", secIds);
        if (userTeamId) secQuery = secQuery.eq("team_id", userTeamId);
        const { data: secteurs } = await secQuery;
        for (const s of (secteurs || []) as Record<string, unknown>[]) secteurMap[String(s.id)] = s;
      }

      const seen = new Set<string>();
      const points: Record<string, unknown>[] = [];
      for (const cmd of (commandes || []) as Record<string, unknown>[]) {
        const pv = cmd.point_vente as Record<string, unknown> | null;
        if (!pv) continue;
        const pvId = String(pv.id);
        if (seen.has(pvId)) continue;
        seen.add(pvId);
        const secteur = pv.secteur_id ? secteurMap[String(pv.secteur_id)] ?? null : null;
        points.push({
          id: pv.id,
          code: pv.code,
          name: pv.name,
          address: pv.address,
          city: pv.city,
          latitude: pv.latitude,
          longitude: pv.longitude,
          secteur_nom: secteur?.nom ?? null,
          secteur_code: secteur?.code ?? null,
          secteur_color: secteur?.color_code ?? null,
          commande_code: cmd.code,
          commande_statut: cmd.statut,
          date_livraison: cmd.date_livraison,
          statut: cmd.statut === "livree" ? "livre" : "en_attente",
        });
      }
      return jsonResponse(points);
    }
  }

  return jsonError(404, "Route introuvable");
}

// ============ UTILITIES ============

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function jsonResponse(data: unknown, status = 200, additionalHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...additionalHeaders } });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============ SERVER ============

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    return await handleRoute(req);
  } catch (err) {
    console.error("auth-api unhandled error", err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
