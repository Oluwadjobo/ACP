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

const VENTE_MOTIFS = [
  "Rupture de stock",
  "Client absent",
  "Refus du client",
  "Fermeture exceptionnelle",
  "Problème de paiement",
  "Autre",
];

// ============ CRYPTO HELPERS ============

async function sha512(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt || crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const h = await sha512(s + password);
  return `sha512:${s}:${h}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [algo, salt, hash] = parts;
  if (algo !== "sha512") return false;
  const computed = await sha512(salt + password);
  return computed === hash;
}

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateQrToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============ SESSION HELPERS ============

type UserType = "admin" | "commercial" | "superviseur";

async function createSession(
  userType: UserType,
  userId: string,
  fullName: string
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("sessions").insert({
    token,
    user_type: userType,
    user_id: userId,
    full_name: fullName,
    expires_at: expiresAt,
  });
  if (error) throw new Error("Failed to create session");
  return token;
}

async function getSession(token: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("sessions").delete().eq("id", data.id);
    return null;
  }
  return data;
}

// ============ GEO HELPERS ============

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// ============ ROUTE HANDLER ============

async function handleRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/auth-api/, "");
  const method = req.method;

  // ---------- LOGIN (auto-detect admin / commercial / superviseur) ----------
  if (path === "/login" && method === "POST") {
    const { login, password } = await req.json();
    if (!login || !password) return jsonError(400, "Identifiant et mot de passe requis");

    const normalizedLogin = login.trim();

    // Try admin table first (admins log in by email)
    const { data: admin, error: adminErr } = await supabase
      .from("admins")
      .select("*")
      .eq("email", normalizedLogin.toLowerCase())
      .maybeSingle();
    if (!adminErr && admin) {
      const ok = await verifyPassword(password, admin.password_hash);
      if (ok) {
        const token = await createSession("admin", admin.id, admin.full_name);
        return jsonResponse({
          token,
          userType: "admin",
          fullName: admin.full_name,
          userId: admin.id,
          mustChangePassword: admin.must_change_password ?? false,
        });
      }
      return jsonError(401, "Identifiants incorrects");
    }

    // Try superviseur table
    const { data: sup, error: supErr } = await supabase
      .from("superviseurs")
      .select("*")
      .eq("identifiant", normalizedLogin)
      .maybeSingle();
    if (!supErr && sup) {
      if (!sup.active) return jsonError(403, "Ce compte est désactivé. Contactez votre administrateur.");
      const ok = await verifyPassword(password, sup.password_hash);
      if (ok) {
        const token = await createSession("superviseur", sup.id, sup.full_name);
        return jsonResponse({ token, userType: "superviseur", fullName: sup.full_name, userId: sup.id });
      }
      return jsonError(401, "Identifiants incorrects");
    }

    // Fall back to commercial table
    const { data: commercial, error: commErr } = await supabase
      .from("commerciaux")
      .select("*")
      .eq("identifiant", normalizedLogin)
      .maybeSingle();
    if (!commErr && commercial) {
      if (!commercial.active) return jsonError(403, "Ce compte est désactivé. Contactez votre administrateur.");
      const ok = await verifyPassword(password, commercial.password_hash);
      if (ok) {
        const token = await createSession("commercial", commercial.id, commercial.full_name);
        return jsonResponse({ token, userType: "commercial", fullName: commercial.full_name, userId: commercial.id });
      }
      return jsonError(401, "Identifiants incorrects");
    }

    return jsonError(401, "Identifiants incorrects");
  }

  // ---------- LOGOUT ----------
  if (path === "/logout" && method === "POST") {
    const token = getBearerToken(req);
    if (token) await supabase.from("sessions").delete().eq("token", token);
    return jsonResponse({ success: true });
  }

  // ---------- ME (get current session) ----------
  if (path === "/me" && method === "GET") {
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Non authentifié");
    const session = await getSession(token);
    if (!session) return jsonError(401, "Session expirée");
    return jsonResponse({
      userType: session.user_type,
      userId: session.user_id,
      fullName: session.full_name,
    });
  }

  // ---------- AUTHED ROUTES ----------
  const token = getBearerToken(req);
  if (!token) return jsonError(401, "Non authentifié");
  const session = await getSession(token);
  if (!session) return jsonError(401, "Session expirée");

  // ===== ADMIN ROUTES =====
  if (session.user_type === "admin") {
    // --- CHANGE OWN PASSWORD (forced first-login change) ---
    if (path === "/change-password" && method === "POST") {
      const { newPassword } = await req.json();
      if (!newPassword || newPassword.length < 6)
        return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(newPassword);
      const { error } = await supabase
        .from("admins")
        .update({ password_hash, must_change_password: false })
        .eq("id", session.user_id);
      if (error) return jsonError(500, "Erreur lors du changement de mot de passe");
      return jsonResponse({ success: true });
    }

    // --- COMMERCIAUX CRUD ---
    if (path === "/commerciaux" && method === "GET") {
      const { data, error } = await supabase
        .from("commerciaux")
        .select("id, identifiant, full_name, active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    if (path === "/commerciaux" && method === "POST") {
      const { identifiant, full_name, password } = await req.json();
      if (!identifiant || !full_name || !password)
        return jsonError(400, "Identifiant, nom et mot de passe requis");
      if (password.length < 6)
        return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { data, error } = await supabase
        .from("commerciaux")
        .insert({ identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash })
        .select("id, identifiant, full_name, active, created_at")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà");
        return jsonError(500, "Erreur lors de la création");
      }
      return jsonResponse(data, 201);
    }

    if (path.startsWith("/commerciaux/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.identifiant !== undefined) updates.identifiant = body.identifiant.trim();
      if (body.active !== undefined) updates.active = body.active;
      const { data, error } = await supabase
        .from("commerciaux")
        .update(updates)
        .eq("id", id)
        .select("id, identifiant, full_name, active, created_at, updated_at")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà");
        return jsonError(500, "Erreur lors de la modification");
      }
      if (!data) return jsonError(404, "Commercial introuvable");
      return jsonResponse(data);
    }

    if (path.startsWith("/commerciaux/") && path.endsWith("/reset-password") && method === "POST") {
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < 6)
        return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { error } = await supabase
        .from("commerciaux")
        .update({ password_hash, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }

    if (path.startsWith("/commerciaux/") && method === "DELETE") {
      const id = path.split("/")[2];
      const { error } = await supabase.from("commerciaux").delete().eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- SUPERVISEURS CRUD ---
    if (path === "/superviseurs" && method === "GET") {
      const { data, error } = await supabase
        .from("superviseurs")
        .select("id, identifiant, full_name, active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    if (path === "/superviseurs" && method === "POST") {
      const { identifiant, full_name, password } = await req.json();
      if (!identifiant || !full_name || !password)
        return jsonError(400, "Identifiant, nom et mot de passe requis");
      if (password.length < 6)
        return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { data, error } = await supabase
        .from("superviseurs")
        .insert({ identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash })
        .select("id, identifiant, full_name, active, created_at")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà");
        return jsonError(500, "Erreur lors de la création");
      }
      return jsonResponse(data, 201);
    }

    if (path.startsWith("/superviseurs/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.identifiant !== undefined) updates.identifiant = body.identifiant.trim();
      if (body.active !== undefined) updates.active = body.active;
      const { data, error } = await supabase
        .from("superviseurs")
        .update(updates)
        .eq("id", id)
        .select("id, identifiant, full_name, active, created_at, updated_at")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà");
        return jsonError(500, "Erreur lors de la modification");
      }
      if (!data) return jsonError(404, "Superviseur introuvable");
      return jsonResponse(data);
    }

    if (path.startsWith("/superviseurs/") && path.endsWith("/reset-password") && method === "POST") {
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < 6)
        return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { error } = await supabase
        .from("superviseurs")
        .update({ password_hash, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }

    if (path.startsWith("/superviseurs/") && method === "DELETE") {
      const id = path.split("/")[2];
      const { error } = await supabase.from("superviseurs").delete().eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- ADMINS CRUD (admin can create other admins) ---
    if (path === "/admins" && method === "GET") {
      const { data, error } = await supabase
        .from("admins")
        .select("id, email, full_name, must_change_password, created_at")
        .order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    if (path === "/admins" && method === "POST") {
      const { email, full_name, password } = await req.json();
      if (!email || !full_name || !password)
        return jsonError(400, "Email, nom et mot de passe requis");
      if (password.length < 6)
        return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { data, error } = await supabase
        .from("admins")
        .insert({ email: email.trim().toLowerCase(), full_name: full_name.trim(), password_hash, must_change_password: true })
        .select("id, email, full_name, must_change_password, created_at")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Cet email existe déjà");
        return jsonError(500, "Erreur lors de la création");
      }
      return jsonResponse(data, 201);
    }

    if (path.startsWith("/admins/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.email !== undefined) updates.email = body.email.trim().toLowerCase();
      const { data, error } = await supabase
        .from("admins")
        .update(updates)
        .eq("id", id)
        .select("id, email, full_name, must_change_password, created_at")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Cet email existe déjà");
        return jsonError(500, "Erreur lors de la modification");
      }
      if (!data) return jsonError(404, "Administrateur introuvable");
      return jsonResponse(data);
    }

    if (path.startsWith("/admins/") && path.endsWith("/reset-password") && method === "POST") {
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < 6)
        return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { error } = await supabase
        .from("admins")
        .update({ password_hash, must_change_password: true })
        .eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }

    if (path.startsWith("/admins/") && method === "DELETE") {
      const id = path.split("/")[2];
      if (id === session.user_id) return jsonError(400, "Vous ne pouvez pas supprimer votre propre compte");
      const { error } = await supabase.from("admins").delete().eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- PRODUITS CRUD ---
    if (path === "/produits" && method === "GET") {
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom, created_at")
        .order("nom", { ascending: true });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    if (path === "/produits" && method === "POST") {
      const { nom } = await req.json();
      if (!nom) return jsonError(400, "Nom du produit requis");
      const { data, error } = await supabase
        .from("produits")
        .insert({ nom: nom.trim() })
        .select("id, nom, created_at")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Ce produit existe déjà");
        return jsonError(500, "Erreur lors de la création");
      }
      return jsonResponse(data, 201);
    }

    if (path.startsWith("/produits/") && method === "DELETE") {
      const id = path.split("/")[2];
      const { error } = await supabase.from("produits").delete().eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- POINTS DE VENTE CRUD ---
    if (path === "/points-vente" && method === "GET") {
      const { data, error } = await supabase
        .from("points_vente")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    if (path === "/points-vente" && method === "POST") {
      const { name, address, city, latitude, longitude } = await req.json();
      if (!name || !address || !city || latitude == null || longitude == null)
        return jsonError(400, "Tous les champs sont requis");
      const code = "PV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const qr_token = generateQrToken();
      const { data, error } = await supabase
        .from("points_vente")
        .insert({
          code,
          name: name.trim(),
          address: address.trim(),
          city: city.trim(),
          latitude: Number(latitude),
          longitude: Number(longitude),
          qr_token,
        })
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return jsonError(409, "Code déjà existant");
        return jsonError(500, "Erreur lors de la création");
      }
      return jsonResponse(data, 201);
    }

    if (path.startsWith("/points-vente/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.address !== undefined) updates.address = body.address.trim();
      if (body.city !== undefined) updates.city = body.city.trim();
      if (body.latitude !== undefined) updates.latitude = Number(body.latitude);
      if (body.longitude !== undefined) updates.longitude = Number(body.longitude);
      const { data, error } = await supabase
        .from("points_vente")
        .update(updates)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) return jsonError(500, "Erreur lors de la modification");
      if (!data) return jsonError(404, "Point de vente introuvable");
      return jsonResponse(data);
    }

    if (path.startsWith("/points-vente/") && method === "DELETE") {
      const id = path.split("/")[2];
      const { error } = await supabase.from("points_vente").delete().eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- DASHBOARD STATS ---
    if (path === "/dashboard" && method === "GET") {
      const { count: totalCommerciaux } = await supabase
        .from("commerciaux")
        .select("*", { count: "exact", head: true });

      const { count: totalSuperviseurs } = await supabase
        .from("superviseurs")
        .select("*", { count: "exact", head: true });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const { count: visitesToday } = await supabase
        .from("visites")
        .select("*", { count: "exact", head: true })
        .gte("visited_at", todayIso);

      const { count: outOfZoneToday } = await supabase
        .from("visites")
        .select("*", { count: "exact", head: true })
        .eq("status", "out_of_zone")
        .gte("visited_at", todayIso);

      const { count: promessesToday } = await supabase
        .from("promesses_achat")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayIso);

      const { count: ventesRealisees } = await supabase
        .from("visites")
        .select("*", { count: "exact", head: true })
        .eq("vente_status", "vente_realisee")
        .gte("visited_at", todayIso);

      const { count: ventesNonRealisees } = await supabase
        .from("visites")
        .select("*", { count: "exact", head: true })
        .eq("vente_status", "vente_non_realisee")
        .gte("visited_at", todayIso);

      const { data: lastVisite } = await supabase
        .from("visites")
        .select("visited_at")
        .order("visited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return jsonResponse({
        totalCommerciaux: totalCommerciaux || 0,
        totalSuperviseurs: totalSuperviseurs || 0,
        visitesToday: visitesToday || 0,
        outOfZoneToday: outOfZoneToday || 0,
        promessesToday: promessesToday || 0,
        ventesRealisees: ventesRealisees || 0,
        ventesNonRealisees: ventesNonRealisees || 0,
        lastVisite: lastVisite?.visited_at || null,
      });
    }

    // --- ALL VISITS (admin) ---
    if (path === "/visites" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("visites")
        .select(
          `id, visited_at, latitude, longitude, distance_meters, status, vente_status, motif, user_role,
           commercial:commerciaux(full_name),
           superviseur:superviseurs(full_name),
           point_vente:points_vente(name, city)`,
          { count: "exact" }
        )
        .order("visited_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- ALL PROMESSES (admin) ---
    if (path === "/promesses" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("promesses_achat")
        .select(
          `id, produits, quantite, date_previsionnelle, montant_estime, responsable, observations, created_at,
           superviseur:superviseurs(full_name),
           point_vente:points_vente(name, city)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }
  }

  // ===== SHARED FIELD ROUTES (commercial + superviseur) =====
  if (session.user_type === "commercial" || session.user_type === "superviseur") {
    const userId = session.user_id;
    const userRole = session.user_type as "commercial" | "superviseur";

    // --- RESOLVE QR TOKEN ---
    if (path === "/resolve-qr" && method === "POST") {
      const { qr_token } = await req.json();
      if (!qr_token) return jsonError(400, "Token QR requis");
      const { data, error } = await supabase
        .from("points_vente")
        .select("id, name, address, city, latitude, longitude")
        .eq("qr_token", qr_token.trim())
        .maybeSingle();
      if (error || !data) return jsonError(404, "QR Code invalide ou point de vente introuvable");
      return jsonResponse(data);
    }

    // --- RECORD VISIT (shared validation engine) ---
    if (path === "/visites" && method === "POST") {
      const { point_vente_id, latitude, longitude } = await req.json();
      if (!point_vente_id || latitude == null || longitude == null)
        return jsonError(400, "Données de visite incomplètes");

      const { data: pv, error: pvError } = await supabase
        .from("points_vente")
        .select("id, latitude, longitude")
        .eq("id", point_vente_id)
        .maybeSingle();
      if (pvError || !pv) return jsonError(404, "Point de vente introuvable");

      const distance = haversineMeters(
        Number(latitude),
        Number(longitude),
        pv.latitude,
        pv.longitude
      );

      if (distance > MAX_DISTANCE_METERS) {
        // Record the out-of-zone attempt
        const insertData: Record<string, unknown> = {
          point_vente_id,
          latitude: Number(latitude),
          longitude: Number(longitude),
          distance_meters: distance,
          status: "out_of_zone",
          vente_status: "out_of_zone",
          user_role: userRole,
        };
        if (userRole === "commercial") insertData.commercial_id = userId;
        else insertData.superviseur_id = userId;
        await supabase.from("visites").insert(insertData);

        return jsonResponse(
          {
            status: "out_of_zone",
            distance,
            message: "Vous êtes trop éloigné du point de vente. Approchez-vous à moins de 30 mètres pour enregistrer votre présence.",
            debug: {
              userLat: Number(latitude),
              userLon: Number(longitude),
              pointLat: pv.latitude,
              pointLon: pv.longitude,
              pointName: (pv as Record<string, unknown>).name || null,
            },
          },
          200
        );
      }

      // Double-scan prevention: check for a visit in the last 5 minutes
      const fiveMinAgo = new Date(Date.now() - DOUBLE_SCAN_MINUTES * 60 * 1000).toISOString();
      let dedupQuery = supabase
        .from("visites")
        .select("id, visited_at")
        .eq("point_vente_id", point_vente_id)
        .gte("visited_at", fiveMinAgo)
        .order("visited_at", { ascending: false })
        .limit(1);

      if (userRole === "commercial") {
        dedupQuery = dedupQuery.eq("commercial_id", userId);
      } else {
        dedupQuery = dedupQuery.eq("superviseur_id", userId);
      }
      const { data: recent } = await dedupQuery.maybeSingle();

      if (recent) {
        return jsonResponse(
          {
            status: "duplicate",
            message: `Une visite a déjà été enregistrée à ce point il y a moins de ${DOUBLE_SCAN_MINUTES} minutes.`,
            lastVisit: recent.visited_at,
          },
          200
        );
      }

      // Insert the confirmed visit (presence validated, awaiting post-validation action)
      const insertData: Record<string, unknown> = {
        point_vente_id,
        latitude: Number(latitude),
        longitude: Number(longitude),
        distance_meters: distance,
        status: "confirmed",
        vente_status: "confirmed",
        user_role: userRole,
      };
      if (userRole === "commercial") insertData.commercial_id = userId;
      else insertData.superviseur_id = userId;

      const { data: visit, error: insertError } = await supabase
        .from("visites")
        .insert(insertData)
        .select("id, visited_at, distance_meters, status, vente_status")
        .maybeSingle();

      if (insertError) {
        return jsonError(500, `Erreur lors de l'enregistrement: ${insertError.message}`);
      }
      return jsonResponse(
        { status: "confirmed", distance, visit },
        201
      );
    }

    // --- FINALIZE VISIT (post-validation action: vente status + motif) ---
    if (path === "/visites/finalize" && method === "POST") {
      const { visite_id, vente_status, motif } = await req.json();
      if (!visite_id || !vente_status)
        return jsonError(400, "Visite et statut de vente requis");

      const validStatuses = ["vente_realisee", "vente_non_realisee"];
      if (userRole === "superviseur") validStatuses.push("promesse_achat");
      if (!validStatuses.includes(vente_status))
        return jsonError(400, "Statut de vente invalide");

      if (vente_status === "vente_non_realisee") {
        if (!motif || !motif.trim())
          return jsonError(400, "Un motif est obligatoire pour une vente non réalisée");
        if (!VENTE_MOTIFS.includes(motif.trim()) && motif.trim() !== "Autre")
          return jsonError(400, "Motif invalide");
      }

      const updates: Record<string, unknown> = { vente_status };
      if (vente_status === "vente_non_realisee") {
        updates.motif = motif.trim();
      }

      // Ownership check
      const ownerFilter = userRole === "commercial"
        ? { id: visite_id, commercial_id: userId }
        : { id: visite_id, superviseur_id: userId };

      const { data: existing } = await supabase
        .from("visites")
        .select("id, vente_status")
        .match(ownerFilter)
        .maybeSingle();

      if (!existing) return jsonError(404, "Visite introuvable");

      const { error } = await supabase
        .from("visites")
        .update(updates)
        .eq("id", visite_id);

      if (error) return jsonError(500, "Erreur lors de la finalisation");
      return jsonResponse({ success: true, visite_id, vente_status });
    }

    // --- CREATE PROMESSE D'ACHAT (superviseur only) ---
    if (path === "/promesses" && method === "POST" && userRole === "superviseur") {
      const { visite_id, point_vente_id, produits, quantite, date_previsionnelle, montant_estime, responsable, observations } = await req.json();
      if (!visite_id || !point_vente_id || !produits)
        return jsonError(400, "Visite, point de vente et produits requis");

      // Verify ownership of the visite
      const { data: visite } = await supabase
        .from("visites")
        .select("id")
        .eq("id", visite_id)
        .eq("superviseur_id", userId)
        .maybeSingle();
      if (!visite) return jsonError(404, "Visite introuvable");

      // Mark the visite as promesse_achat
      await supabase
        .from("visites")
        .update({ vente_status: "promesse_achat" })
        .eq("id", visite_id);

      const { data, error } = await supabase
        .from("promesses_achat")
        .insert({
          visite_id,
          superviseur_id: userId,
          point_vente_id,
          produits: Array.isArray(produits) ? produits.join(", ") : produits.trim(),
          quantite: Number(quantite) || 1,
          date_previsionnelle: date_previsionnelle || null,
          montant_estime: montant_estime ? Number(montant_estime) : null,
          responsable: responsable?.trim() || null,
          observations: observations?.trim() || null,
        })
        .select("id, created_at")
        .maybeSingle();

      if (error) return jsonError(500, "Erreur lors de l'enregistrement de la promesse");
      return jsonResponse(data, 201);
    }

    // --- MY VISITS (history) ---
    if (path === "/mes-visites" && method === "GET") {
      let query = supabase
        .from("visites")
        .select(
          `id, visited_at, distance_meters, status, vente_status, motif, user_role,
           point_vente:points_vente(name, city, address)`
        )
        .order("visited_at", { ascending: false });

      if (userRole === "commercial") {
        query = query.eq("commercial_id", userId);
      } else {
        query = query.eq("superviseur_id", userId);
      }
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- PRODUITS LIST (for promesse form) ---
    if (path === "/produits" && method === "GET") {
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom")
        .order("nom", { ascending: true });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }
  }

  return jsonError(404, "Route introuvable");
}

// ============ UTILITIES ============

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ============ SERVER ============

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    return await handleRoute(req);
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
