import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

const VENTE_MOTIFS = [
  "Rupture de stock",
  "Client absent",
  "Refus du client",
  "Fermeture exceptionnelle",
  "Problème de paiement",
  "Autre",
];

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
] as const;

const DASHBOARD_PERMISSIONS = [
  "view_dashboard", "view_carte", "manage_secteurs", "manage_commerciaux",
  "manage_superviseurs", "manage_admins", "manage_produits", "manage_points_vente",
  "manage_bons_livraison", "view_visites", "view_ventes", "view_controles",
] as const;

const ALL_PERMISSIONS = [...FIELD_PERMISSIONS, ...DASHBOARD_PERMISSIONS];

const DEFAULT_ADMIN_PERMS: Record<string, boolean> = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true]));
const DEFAULT_SUPERVISEUR_PERMS: Record<string, boolean> = Object.fromEntries(
  ["scan", "create_point_vente", "record_vente", "create_promesse", "control_terrain", "view_history", "view_ventes_non_realisees"].map((p) => [p, true])
);
const DEFAULT_COMMERCIAL_PERMS: Record<string, boolean> = Object.fromEntries(
  ["scan", "create_point_vente", "record_vente", "view_history"].map((p) => [p, true])
);

type UserType = "admin" | "commercial" | "superviseur";

function getDefaultPermissions(userType: UserType): Record<string, boolean> {
  if (userType === "admin") return { ...DEFAULT_ADMIN_PERMS };
  if (userType === "superviseur") return { ...DEFAULT_SUPERVISEUR_PERMS };
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
  const table = userType === "admin" ? "admins" : userType === "superviseur" ? "superviseurs" : "commerciaux";
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
    } catch (_e) { /* upgrade is best effort; never block a valid sign-in */ }
  }
  return result.ok;
}

// ============ LOGIN RATE LIMITING ============

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return req.headers.get("cf-connecting-ip")?.slice(0, 64) || "unknown";
}

async function isLoginLocked(identifier: string, ip: string): Promise<boolean> {
  const { data } = await supabase.from("login_attempts")
    .select("locked_until").eq("identifier", identifier).eq("ip", ip).maybeSingle();
  if (!data?.locked_until) return false;
  return new Date(data.locked_until).getTime() > Date.now();
}

async function recordLoginFailure(identifier: string, ip: string): Promise<void> {
  const now = Date.now();
  const windowMs = LOGIN_WINDOW_MINUTES * 60 * 1000;
  const { data } = await supabase.from("login_attempts")
    .select("id, attempts, first_attempt").eq("identifier", identifier).eq("ip", ip).maybeSingle();
  if (!data) {
    await supabase.from("login_attempts").insert({
      identifier, ip, attempts: 1, first_attempt: new Date(now).toISOString(),
    });
    return;
  }
  const withinWindow = new Date(data.first_attempt).getTime() > now - windowMs;
  const attempts = withinWindow ? Number(data.attempts) + 1 : 1;
  const updates: Record<string, unknown> = {
    attempts,
    updated_at: new Date(now).toISOString(),
    locked_until: attempts >= LOGIN_MAX_ATTEMPTS ? new Date(now + windowMs).toISOString() : null,
  };
  if (!withinWindow) updates.first_attempt = new Date(now).toISOString();
  await supabase.from("login_attempts").update(updates).eq("id", data.id);
}

async function clearLoginFailures(identifier: string, ip: string): Promise<void> {
  await supabase.from("login_attempts").delete().eq("identifier", identifier).eq("ip", ip);
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
          permissions, teamId: sup.team_id, role: "superviseur", teamCode, teamColor,
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
          permissions, teamId: commercial.team_id, role: "commercial", teamCode, teamColor,
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
    let teamCode: string | null = null;
    let teamColor: string | null = null;
    if (session.user_type === "admin") {
      const { data: adminData } = await supabase.from("admins").select("role, team_id").eq("id", session.user_id).maybeSingle();
      role = adminData?.role || "admin";
    }
    if (session.team_id) {
      const { data: teamData } = await supabase.from("teams").select("code, color").eq("id", session.team_id).maybeSingle();
      teamCode = teamData?.code ?? null;
      teamColor = teamData?.color ?? null;
    }
    return jsonResponse({
      userType: session.user_type, userId: session.user_id,
      fullName: session.full_name, permissions: session.permissions,
      teamId: session.team_id, role, teamCode, teamColor,
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

    // --- CHANGE PASSWORD ---
    if (path === "/change-password" && method === "POST") {
      const { newPassword } = await req.json();
      if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) return jsonError(400, PASSWORD_RULE_MESSAGE);
      const password_hash = await hashPassword(newPassword);
      const { error } = await supabase.from("admins").update({ password_hash, must_change_password: false }).eq("id", session.user_id);
      if (error) return jsonError(500, "Erreur lors du changement de mot de passe");
      return jsonResponse({ success: true });
    }

    // --- SECTEURS CRUD ---
    if (path === "/secteurs" && method === "GET") {
      { const denied = requireAnyAdminPermission("manage_secteurs", "manage_commerciaux", "manage_superviseurs", "manage_points_vente", "view_carte", "view_dashboard", "view_visites"); if (denied) return denied; }
      let query = supabase.from("secteurs").select("*").order("created_at", { ascending: false });
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
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
      let query = supabase
        .from("commerciaux").select("id, identifiant, full_name, active, telephone, superviseur_id, team_id, created_at, updated_at, permissions")
        .order("created_at", { ascending: false });
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      const enriched = await Promise.all((data || []).map(async (c: Record<string, unknown>) => {
        let superviseur_nom = null;
        if (c.superviseur_id) {
          const { data: sup } = await supabase.from("superviseurs").select("full_name").eq("id", c.superviseur_id).maybeSingle();
          superviseur_nom = sup?.full_name ?? null;
        }
        let assignments = supabase.from("commercial_tournees").select("secteur_id, secteurs(nom, code)").eq("commercial_id", c.id);
        if (effectiveTeamId) assignments = assignments.eq("team_id", effectiveTeamId);
        const { data: assigned } = await assignments;
        const tournees = (assigned ?? []).map((row: Record<string, unknown>) => {
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
      const insertData: Record<string, unknown> = { identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash };
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
      let query = supabase.from("commerciaux").update({ password_hash, updated_at: new Date().toISOString() }).eq("id", id);
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
      let query = supabase
        .from("superviseurs").select("id, identifiant, full_name, active, telephone, team_id, created_at, updated_at, permissions")
        .order("created_at", { ascending: false });
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      const enriched = await Promise.all((data || []).map(async (s: Record<string, unknown>) => {
        let tltQuery = supabase.from("team_leader_tournees").select("secteur_id, secteurs(nom, code)").eq("superviseur_id", s.id);
        if (effectiveTeamId) tltQuery = tltQuery.eq("team_id", effectiveTeamId);
        const { data: tlt } = await tltQuery;
        const tournees = (tlt || []).map((t: Record<string, unknown>) => ({
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
      const insertData: Record<string, unknown> = { identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash };
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
      let query = supabase.from("superviseurs").update({ password_hash, updated_at: new Date().toISOString() }).eq("id", id);
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
      let query = supabase.from("points_vente").select("*").order("created_at", { ascending: false });
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      const enriched = await Promise.all((data || []).map(async (p: Record<string, unknown>) => {
        let secteur_nom = null;
        if (p.secteur_id) {
          let secQuery = supabase.from("secteurs").select("nom").eq("id", p.secteur_id);
          if (effectiveTeamId) secQuery = secQuery.eq("team_id", effectiveTeamId);
          const { data: sec } = await secQuery.maybeSingle();
          secteur_nom = sec?.nom ?? null;
        }
        return { ...p, secteur_nom };
      }));
      return jsonResponse(enriched);
    }
    if (path === "/points-vente" && method === "POST") {
      { const denied = requireAnyAdminPermission("manage_points_vente"); if (denied) return denied; }
      const { name, address, city, latitude, longitude, secteur_id } = await req.json();
      if (!name || !address || !city || latitude == null || longitude == null) return jsonError(400, "Tous les champs sont requis");
      const code = "PV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const qr_token = generateQrToken();
      const insertData: Record<string, unknown> = { code, name: name.trim(), address: address.trim(), city: city.trim(), latitude: Number(latitude), longitude: Number(longitude), qr_token };
      if (secteur_id) insertData.secteur_id = secteur_id;
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
      let query = supabase.from("points_vente").delete().eq("id", id);
      if (effectiveTeamId) query = query.eq("team_id", effectiveTeamId);
      const { error } = await query;
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
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

      const [
        totalCommerciaux, totalSuperviseurs, totalSecteurs, totalPointsVente,
        visitesToday, outOfZoneToday, promessesToday,
        ventesRealisees, ventesNonRealisees,
        blEnAttente, blLivres, blPartiels, blAnnules,
        controlesToday, lastVisiteRaw
      ] = await Promise.all([
        countWithTeam("commerciaux"),
        countWithTeam("superviseurs"),
        countWithTeam("secteurs"),
        countWithTeam("points_vente"),
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
      const table = userType === "admin" ? "admins" : userType === "superviseur" ? "superviseurs" : "commerciaux";
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
      const table = userType === "admin" ? "admins" : userType === "superviseur" ? "superviseurs" : "commerciaux";
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
  }

  // ===== SHARED FIELD ROUTES (commercial + superviseur) =====
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
      const { visite_id, point_vente_id, lignes, livraison_immediate, observation } = await req.json();
      if (!visite_id || !point_vente_id || !Array.isArray(lignes) || lignes.length === 0)
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
      const { data: visite } = await supabase.from("visites").select("id, status").match(ownerFilter).maybeSingle();
      if (!visite) return jsonError(404, "Visite introuvable");
      if (visite.status !== "confirmed") {
        return jsonError(409, "Cette visite n'a pas été validée sur le terrain.");
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
      const { visite_id, point_vente_id, produits, quantite, date_previsionnelle, montant_estime, responsable, observations } = await req.json();
      if (!visite_id || !point_vente_id || !produits) return jsonError(400, "Visite, point de vente et produits requis");
      let visQuery = supabase.from("visites").select("id, status, vente_status").eq("id", visite_id).eq("superviseur_id", userId);
      if (userTeamId) visQuery = visQuery.eq("team_id", userTeamId);
      const { data: visite } = await visQuery.maybeSingle();
      if (!visite) return jsonError(404, "Visite introuvable");
      if (visite.status !== "confirmed") return jsonError(409, "Cette visite n'a pas été validée sur le terrain.");
      if (visite.vente_status !== "confirmed") return jsonError(409, "Cette visite a déjà été finalisée.");
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
      const secteur_id = await getSuperviseurSecteur(userId, userTeamId);
      const insertData: Record<string, unknown> = {
        superviseur_id: userId, point_vente_id, visite_id: visite_id || null, secteur_id,
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

    // --- SECTEURS LIST (team leaders: only their assigned tournées) ---
    if (path === "/secteurs" && method === "GET") {
      const denied = requirePermission("create_point_vente");
      if (denied) return denied;
      let tltQuery = supabase.from("team_leader_tournees").select("secteur_id").eq("superviseur_id", session.user_id);
      if (userTeamId) tltQuery = tltQuery.eq("team_id", userTeamId);
      const { data: tltRows, error: tltError } = await tltQuery;
      if (tltError) return jsonError(500, "Erreur lors de la récupération des tournées");
      const secteurIds = (tltRows ?? []).map((r: Record<string, unknown>) => String(r.secteur_id));
      if (secteurIds.length === 0) return jsonResponse([]);
      const { data: secteurs, error: secError } = await supabase
        .from("secteurs").select("*").in("id", secteurIds).order("created_at", { ascending: false });
      if (secError) return jsonError(500, "Erreur de lecture");
      return jsonResponse(secteurs);
    }

    // --- CREATE POINT DE VENTE (field users) ---
    if (path === "/points-vente" && method === "POST") {
      const denied = requirePermission("create_point_vente"); if (denied) return denied;
      const { name, address, city, latitude, longitude, secteur_id } = await req.json();
      if (!name || !address || !city || latitude == null || longitude == null) return jsonError(400, "Tous les champs sont requis");
      const code = "PV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const qr_token = generateQrToken();
      const insertData: Record<string, unknown> = { code, name: name.trim(), address: address.trim(), city: city.trim(), latitude: Number(latitude), longitude: Number(longitude), qr_token };
      if (secteur_id) insertData.secteur_id = secteur_id;
      if (userTeamId) insertData.team_id = userTeamId;
      const { data, error } = await supabase.from("points_vente").insert(insertData).select("*").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Code déjà existant"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
