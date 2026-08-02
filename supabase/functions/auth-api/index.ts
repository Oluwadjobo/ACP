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

const CONTROLE_NOTATIONS = ["excellent", "bon", "moyen", "faible", "critique"];
const BL_STATUTS = ["en_attente", "livre", "partiel", "annule"];

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

type UserType = "admin" | "commercial" | "superviseur";

async function createSession(userType: UserType, userId: string, fullName: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("sessions").insert({
    token, user_type: userType, user_id: userId, full_name: fullName, expires_at: expiresAt,
  });
  if (error) throw new Error("Failed to create session");
  return token;
}

async function getSession(token: string) {
  const { data, error } = await supabase.from("sessions").select("*").eq("token", token).maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("sessions").delete().eq("id", data.id);
    return null;
  }
  return data;
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

// ============ HELPERS ============

async function getCommercialSecteur(commercialId: string): Promise<{ secteur_id: string | null; superviseur_id: string | null }> {
  const { data } = await supabase
    .from("commerciaux")
    .select("superviseur_id")
    .eq("id", commercialId)
    .maybeSingle();
  const superviseur_id = data?.superviseur_id ?? null;
  let secteur_id: string | null = null;
  if (superviseur_id) {
    const { data: tlt } = await supabase
      .from("team_leader_tournees")
      .select("secteur_id")
      .eq("superviseur_id", superviseur_id)
      .limit(1)
      .maybeSingle();
    secteur_id = tlt?.secteur_id ?? null;
  }
  return { secteur_id, superviseur_id };
}

async function getSuperviseurSecteur(superviseurId: string): Promise<string | null> {
  const { data } = await supabase
    .from("team_leader_tournees")
    .select("secteur_id")
    .eq("superviseur_id", superviseurId)
    .limit(1)
    .maybeSingle();
  return data?.secteur_id ?? null;
}

async function getPointVenteSecteur(pointVenteId: string): Promise<string | null> {
  const { data } = await supabase.from("points_vente").select("secteur_id").eq("id", pointVenteId).maybeSingle();
  return data?.secteur_id ?? null;
}

// ============ ROUTE HANDLER ============

async function handleRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/auth-api/, "");
  const method = req.method;

  // ---------- LOGIN ----------
  if (path === "/login" && method === "POST") {
    const { login, password } = await req.json();
    if (!login || !password) return jsonError(400, "Identifiant et mot de passe requis");
    const normalizedLogin = login.trim();

    const { data: admin } = await supabase.from("admins").select("*").eq("email", normalizedLogin.toLowerCase()).maybeSingle();
    if (admin) {
      if (await verifyPassword(password, admin.password_hash)) {
        const token = await createSession("admin", admin.id, admin.full_name);
        return jsonResponse({ token, userType: "admin", fullName: admin.full_name, userId: admin.id, mustChangePassword: admin.must_change_password ?? false });
      }
      return jsonError(401, "Identifiants incorrects");
    }

    const { data: sup } = await supabase.from("superviseurs").select("*").eq("identifiant", normalizedLogin).maybeSingle();
    if (sup) {
      if (!sup.active) return jsonError(403, "Ce compte est désactivé. Contactez votre administrateur.");
      if (await verifyPassword(password, sup.password_hash)) {
        const token = await createSession("superviseur", sup.id, sup.full_name);
        return jsonResponse({ token, userType: "superviseur", fullName: sup.full_name, userId: sup.id });
      }
      return jsonError(401, "Identifiants incorrects");
    }

    const { data: commercial } = await supabase.from("commerciaux").select("*").eq("identifiant", normalizedLogin).maybeSingle();
    if (commercial) {
      if (!commercial.active) return jsonError(403, "Ce compte est désactivé. Contactez votre administrateur.");
      if (await verifyPassword(password, commercial.password_hash)) {
        const token = await createSession("commercial", commercial.id, commercial.full_name);
        return jsonResponse({ token, userType: "commercial", fullName: commercial.full_name, userId: commercial.id });
      }
      return jsonError(401, "Identifiants incorrects");
    }
    return jsonError(401, "Identifiants incorrects");
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
    return jsonResponse({ userType: session.user_type, userId: session.user_id, fullName: session.full_name });
  }

  // ---------- AUTHED ROUTES ----------
  const token = getBearerToken(req);
  if (!token) return jsonError(401, "Non authentifié");
  const session = await getSession(token);
  if (!session) return jsonError(401, "Session expirée");

  // ===== ADMIN ROUTES =====
  if (session.user_type === "admin") {
    // --- CHANGE PASSWORD ---
    if (path === "/change-password" && method === "POST") {
      const { newPassword } = await req.json();
      if (!newPassword || newPassword.length < 6) return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(newPassword);
      const { error } = await supabase.from("admins").update({ password_hash, must_change_password: false }).eq("id", session.user_id);
      if (error) return jsonError(500, "Erreur lors du changement de mot de passe");
      return jsonResponse({ success: true });
    }

    // --- SECTEURS CRUD ---
    if (path === "/secteurs" && method === "GET") {
      const { data, error } = await supabase.from("secteurs").select("*").order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }
    if (path === "/secteurs" && method === "POST") {
      const { nom, code, description } = await req.json();
      if (!nom || !code) return jsonError(400, "Nom et code requis");
      const { data, error } = await supabase.from("secteurs").insert({
        code: code.trim().toUpperCase(), nom: nom.trim(), description: description?.trim() || null,
      }).select("*").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Ce code existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/secteurs/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.nom !== undefined) updates.nom = body.nom.trim();
      if (body.code !== undefined) updates.code = body.code.trim().toUpperCase();
      if (body.description !== undefined) updates.description = body.description?.trim() || null;
      if (body.actif !== undefined) updates.actif = body.actif;
      const { data, error } = await supabase.from("secteurs").update(updates).eq("id", id).select("*").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Ce code existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Secteur introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/secteurs/") && method === "DELETE") {
      const id = path.split("/")[2];
      const { error } = await supabase.from("secteurs").delete().eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- COMMERCIAUX CRUD ---
    if (path === "/commerciaux" && method === "GET") {
      const { data, error } = await supabase
        .from("commerciaux").select("id, identifiant, full_name, active, telephone, superviseur_id, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      // Enrich with superviseur name and first tournée
      const enriched = await Promise.all((data || []).map(async (c: Record<string, unknown>) => {
        let superviseur_nom = null, secteur_nom = null;
        if (c.superviseur_id) {
          const { data: sup } = await supabase.from("superviseurs").select("full_name").eq("id", c.superviseur_id).maybeSingle();
          superviseur_nom = sup?.full_name ?? null;
          const { data: tlt } = await supabase.from("team_leader_tournees").select("secteurs(nom)").eq("superviseur_id", c.superviseur_id).limit(1).maybeSingle();
          secteur_nom = (tlt?.secteurs as Record<string, unknown> | null)?.nom ?? null;
        }
        return { ...c, superviseur_nom, secteur_nom };
      }));
      return jsonResponse(enriched);
    }
    if (path === "/commerciaux" && method === "POST") {
      const { identifiant, full_name, password, telephone, superviseur_id } = await req.json();
      if (!identifiant || !full_name || !password) return jsonError(400, "Identifiant, nom et mot de passe requis");
      if (password.length < 6) return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      if (!superviseur_id) return jsonError(400, "Un superviseur de rattachement est obligatoire");
      const password_hash = await hashPassword(password);
      const insertData: Record<string, unknown> = { identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash };
      if (telephone) insertData.telephone = telephone.trim();
      if (superviseur_id) insertData.superviseur_id = superviseur_id;
      const { data, error } = await supabase.from("commerciaux").insert(insertData).select("id, identifiant, full_name, active, telephone, superviseur_id, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/commerciaux/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.identifiant !== undefined) updates.identifiant = body.identifiant.trim();
      if (body.active !== undefined) updates.active = body.active;
      if (body.telephone !== undefined) updates.telephone = body.telephone?.trim() || null;
      if (body.superviseur_id !== undefined) updates.superviseur_id = body.superviseur_id || null;
      const { data, error } = await supabase.from("commerciaux").update(updates).eq("id", id).select("id, identifiant, full_name, active, telephone, superviseur_id, created_at, updated_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Commercial introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/commerciaux/") && path.endsWith("/reset-password") && method === "POST") {
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < 6) return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { error } = await supabase.from("commerciaux").update({ password_hash, updated_at: new Date().toISOString() }).eq("id", id);
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
        .from("superviseurs").select("id, identifiant, full_name, active, telephone, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      const enriched = await Promise.all((data || []).map(async (s: Record<string, unknown>) => {
        const { data: tlt } = await supabase
          .from("team_leader_tournees").select("secteur_id, secteurs(nom, code)").eq("superviseur_id", s.id);
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
      const { identifiant, full_name, password, telephone, secteur_ids } = await req.json();
      if (!identifiant || !full_name || !password) return jsonError(400, "Identifiant, nom et mot de passe requis");
      if (password.length < 6) return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      if (!Array.isArray(secteur_ids) || secteur_ids.length === 0) return jsonError(400, "Au moins une tournée affectée est obligatoire");
      const password_hash = await hashPassword(password);
      const insertData: Record<string, unknown> = { identifiant: identifiant.trim(), full_name: full_name.trim(), password_hash };
      if (telephone) insertData.telephone = telephone.trim();
      const { data, error } = await supabase.from("superviseurs").insert(insertData).select("id, identifiant, full_name, active, telephone, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      const tltData = secteur_ids.map((sid: string) => ({ superviseur_id: data.id, secteur_id: sid }));
      await supabase.from("team_leader_tournees").insert(tltData);
      if (secteur_ids.length > 0) await supabase.from("superviseurs").update({ secteur_id: secteur_ids[0] }).eq("id", data.id);
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/superviseurs/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.identifiant !== undefined) updates.identifiant = body.identifiant.trim();
      if (body.active !== undefined) updates.active = body.active;
      if (body.telephone !== undefined) updates.telephone = body.telephone?.trim() || null;
      if (body.secteur_ids !== undefined && Array.isArray(body.secteur_ids)) {
        await supabase.from("team_leader_tournees").delete().eq("superviseur_id", id);
        if (body.secteur_ids.length > 0) {
          const tltData = body.secteur_ids.map((sid: string) => ({ superviseur_id: id, secteur_id: sid }));
          await supabase.from("team_leader_tournees").insert(tltData);
          updates.secteur_id = body.secteur_ids[0];
        } else {
          updates.secteur_id = null;
        }
      }
      const { data, error } = await supabase.from("superviseurs").update(updates).eq("id", id).select("id, identifiant, full_name, active, telephone, created_at, updated_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet identifiant existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Team Leader introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/superviseurs/") && path.endsWith("/reset-password") && method === "POST") {
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < 6) return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { error } = await supabase.from("superviseurs").update({ password_hash, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la réinitialisation");
      return jsonResponse({ success: true });
    }
    if (path.startsWith("/superviseurs/") && method === "DELETE") {
      const id = path.split("/")[2];
      const { error } = await supabase.from("superviseurs").delete().eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la suppression");
      return jsonResponse({ success: true });
    }

    // --- ADMINS CRUD ---
    if (path === "/admins" && method === "GET") {
      const { data, error } = await supabase.from("admins").select("id, email, full_name, must_change_password, created_at").order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }
    if (path === "/admins" && method === "POST") {
      const { email, full_name, password } = await req.json();
      if (!email || !full_name || !password) return jsonError(400, "Email, nom et mot de passe requis");
      if (password.length < 6) return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { data, error } = await supabase.from("admins").insert({ email: email.trim().toLowerCase(), full_name: full_name.trim(), password_hash, must_change_password: true }).select("id, email, full_name, must_change_password, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet email existe déjà"); return jsonError(500, "Erreur lors de la création"); }
      return jsonResponse(data, 201);
    }
    if (path.startsWith("/admins/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
      if (body.email !== undefined) updates.email = body.email.trim().toLowerCase();
      const { data, error } = await supabase.from("admins").update(updates).eq("id", id).select("id, email, full_name, must_change_password, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Cet email existe déjà"); return jsonError(500, "Erreur lors de la modification"); }
      if (!data) return jsonError(404, "Administrateur introuvable");
      return jsonResponse(data);
    }
    if (path.startsWith("/admins/") && path.endsWith("/reset-password") && method === "POST") {
      const id = path.split("/")[2];
      const { password } = await req.json();
      if (!password || password.length < 6) return jsonError(400, "Le mot de passe doit contenir au moins 6 caractères");
      const password_hash = await hashPassword(password);
      const { error } = await supabase.from("admins").update({ password_hash, must_change_password: true }).eq("id", id);
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
      const { data, error } = await supabase.from("produits").select("id, nom, created_at").order("nom", { ascending: true });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }
    if (path === "/produits" && method === "POST") {
      const { nom } = await req.json();
      if (!nom) return jsonError(400, "Nom du produit requis");
      const { data, error } = await supabase.from("produits").insert({ nom: nom.trim() }).select("id, nom, created_at").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Ce produit existe déjà"); return jsonError(500, "Erreur lors de la création"); }
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
      const { data, error } = await supabase.from("points_vente").select("*").order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      const enriched = await Promise.all((data || []).map(async (p: Record<string, unknown>) => {
        let secteur_nom = null;
        if (p.secteur_id) {
          const { data: sec } = await supabase.from("secteurs").select("nom").eq("id", p.secteur_id).maybeSingle();
          secteur_nom = sec?.nom ?? null;
        }
        return { ...p, secteur_nom };
      }));
      return jsonResponse(enriched);
    }
    if (path === "/points-vente" && method === "POST") {
      const { name, address, city, latitude, longitude, secteur_id } = await req.json();
      if (!name || !address || !city || latitude == null || longitude == null) return jsonError(400, "Tous les champs sont requis");
      const code = "PV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const qr_token = generateQrToken();
      const insertData: Record<string, unknown> = { code, name: name.trim(), address: address.trim(), city: city.trim(), latitude: Number(latitude), longitude: Number(longitude), qr_token };
      if (secteur_id) insertData.secteur_id = secteur_id;
      const { data, error } = await supabase.from("points_vente").insert(insertData).select("*").maybeSingle();
      if (error) { if (error.code === "23505") return jsonError(409, "Code déjà existant"); return jsonError(500, "Erreur lors de la création"); }
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
      if (body.secteur_id !== undefined) updates.secteur_id = body.secteur_id || null;
      const { data, error } = await supabase.from("points_vente").update(updates).eq("id", id).select("*").maybeSingle();
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
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const [{ count: totalCommerciaux }, { count: totalSuperviseurs }, { count: totalSecteurs }, { count: totalPointsVente },
        { count: visitesToday }, { count: outOfZoneToday }, { count: promessesToday },
        { count: ventesRealisees }, { count: ventesNonRealisees },
        { count: blEnAttente }, { count: blLivres }, { count: blPartiels }, { count: blAnnules },
        { count: controlesToday }, { data: lastVisiteRaw }] = await Promise.all([
        supabase.from("commerciaux").select("*", { count: "exact", head: true }),
        supabase.from("superviseurs").select("*", { count: "exact", head: true }),
        supabase.from("secteurs").select("*", { count: "exact", head: true }),
        supabase.from("points_vente").select("*", { count: "exact", head: true }),
        supabase.from("visites").select("*", { count: "exact", head: true }).gte("visited_at", todayIso),
        supabase.from("visites").select("*", { count: "exact", head: true }).eq("status", "out_of_zone").gte("visited_at", todayIso),
        supabase.from("promesses_achat").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
        supabase.from("visites").select("*", { count: "exact", head: true }).eq("vente_status", "vente_realisee").gte("visited_at", todayIso),
        supabase.from("visites").select("*", { count: "exact", head: true }).eq("vente_status", "vente_non_realisee").gte("visited_at", todayIso),
        supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "en_attente"),
        supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "livre"),
        supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "partiel"),
        supabase.from("bons_livraison").select("*", { count: "exact", head: true }).eq("statut", "annule"),
        supabase.from("controles_terrain").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
        supabase.from("visites").select("visited_at").order("visited_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      return jsonResponse({
        totalCommerciaux: totalCommerciaux || 0,
        totalSuperviseurs: totalSuperviseurs || 0,
        totalSecteurs: totalSecteurs || 0,
        totalPointsVente: totalPointsVente || 0,
        visitesToday: visitesToday || 0,
        outOfZoneToday: outOfZoneToday || 0,
        promessesToday: promessesToday || 0,
        ventesRealisees: ventesRealisees || 0,
        ventesNonRealisees: ventesNonRealisees || 0,
        blEnAttente: blEnAttente || 0,
        blLivres: blLivres || 0,
        blPartiels: blPartiels || 0,
        blAnnules: blAnnules || 0,
        controlesToday: controlesToday || 0,
        lastVisite: lastVisiteRaw?.visited_at || null,
      });
    }

    // --- ALL VISITES (admin) ---
    if (path === "/visites" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("visites").select(`id, visited_at, latitude, longitude, distance_meters, status, vente_status, motif, user_role,
          commercial:commerciaux(full_name), superviseur:superviseurs(full_name), point_vente:points_vente(name, city)`, { count: "exact" })
        .order("visited_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- ALL PROMESSES (admin) ---
    if (path === "/promesses" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("promesses_achat").select(`id, produits, quantite, date_previsionnelle, montant_estime, responsable, observations, created_at,
          superviseur:superviseurs(full_name), point_vente:points_vente(name, city)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- ALL VENTES (admin) ---
    if (path === "/ventes" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("ventes").select(`id, visite_id, commercial_id, superviseur_id, point_vente_id, secteur_id, montant_total, observation, created_at,
          commercial:commerciaux(full_name), superviseur:superviseurs(full_name), point_vente:points_vente(name, city, address),
          lignes:vente_lignes(produit_nom, quantite, prix_unitaire, montant, observation)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }

    // --- ALL BONS LIVRAISON (admin) ---
    if (path === "/bons-livraison" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("bons_livraison").select(`id, numero, vente_id, commercial_id, superviseur_id, point_vente_id, secteur_id, statut, commentaire, date_livraison, created_at,
          commercial:commerciaux(full_name), superviseur:superviseurs(full_name), point_vente:points_vente(name, city, address),
          lignes:bl_lignes(produit_nom, quantite, unite, observation)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }
    if (path.startsWith("/bons-livraison/") && path.endsWith("/statut") && method === "PUT") {
      const id = path.split("/")[2];
      const { statut, commentaire } = await req.json();
      if (!BL_STATUTS.includes(statut)) return jsonError(400, "Statut invalide");
      const updates: Record<string, unknown> = { statut };
      if (commentaire !== undefined) updates.commentaire = commentaire?.trim() || null;
      if (statut === "livre") updates.date_livraison = new Date().toISOString();
      const { error } = await supabase.from("bons_livraison").update(updates).eq("id", id);
      if (error) return jsonError(500, "Erreur lors de la mise à jour");
      return jsonResponse({ success: true });
    }

    // --- ALL CONTROLES TERRAIN (admin) ---
    if (path === "/controles-terrain" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "50"), 200);
      const offset = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("controles_terrain").select(`id, superviseur_id, point_vente_id, visite_id, secteur_id, notation, presence_comtesse, disponibilite, visibilite, merchandising, presence_concurrents, commentaires, recommandations, actions_correctives, created_at,
          superviseur:superviseurs(full_name), point_vente:points_vente(name, city, address)`, { count: "exact" })
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
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
      const { data, error } = await supabase.from("points_vente").select("id, name, address, city, latitude, longitude").eq("qr_token", qr_token.trim()).maybeSingle();
      if (error || !data) return jsonError(404, "QR Code invalide ou point de vente introuvable");
      return jsonResponse(data);
    }

    // --- RECORD VISIT ---
    if (path === "/visites" && method === "POST") {
      const { point_vente_id, latitude, longitude } = await req.json();
      if (!point_vente_id || latitude == null || longitude == null) return jsonError(400, "Données de visite incomplètes");
      const { data: pv, error: pvError } = await supabase.from("points_vente").select("id, latitude, longitude, name").eq("id", point_vente_id).maybeSingle();
      if (pvError || !pv) return jsonError(404, "Point de vente introuvable");
      const distance = haversineMeters(Number(latitude), Number(longitude), pv.latitude, pv.longitude);

      if (distance > MAX_DISTANCE_METERS) {
        const insertData: Record<string, unknown> = { point_vente_id, latitude: Number(latitude), longitude: Number(longitude), distance_meters: distance, status: "out_of_zone", vente_status: "out_of_zone", user_role: userRole };
        if (userRole === "commercial") insertData.commercial_id = userId; else insertData.superviseur_id = userId;
        await supabase.from("visites").insert(insertData);
        return jsonResponse({ status: "out_of_zone", distance, message: "Vous êtes trop éloigné du point de vente. Approchez-vous à moins de 30 mètres pour enregistrer votre présence.", debug: { userLat: Number(latitude), userLon: Number(longitude), pointLat: pv.latitude, pointLon: pv.longitude, pointName: pv.name } }, 200);
      }

      const fiveMinAgo = new Date(Date.now() - DOUBLE_SCAN_MINUTES * 60 * 1000).toISOString();
      let dedupQuery = supabase.from("visites").select("id, visited_at").eq("point_vente_id", point_vente_id).gte("visited_at", fiveMinAgo).order("visited_at", { ascending: false }).limit(1);
      if (userRole === "commercial") dedupQuery = dedupQuery.eq("commercial_id", userId); else dedupQuery = dedupQuery.eq("superviseur_id", userId);
      const { data: recent } = await dedupQuery.maybeSingle();
      if (recent) return jsonResponse({ status: "duplicate", message: `Une visite a déjà été enregistrée à ce point il y a moins de ${DOUBLE_SCAN_MINUTES} minutes.`, lastVisit: recent.visited_at }, 200);

      const insertData: Record<string, unknown> = { point_vente_id, latitude: Number(latitude), longitude: Number(longitude), distance_meters: distance, status: "confirmed", vente_status: "confirmed", user_role: userRole };
      if (userRole === "commercial") insertData.commercial_id = userId; else insertData.superviseur_id = userId;
      const { data: visit, error: insertError } = await supabase.from("visites").insert(insertData).select("id, visited_at, distance_meters, status, vente_status").maybeSingle();
      if (insertError) return jsonError(500, `Erreur lors de l'enregistrement: ${insertError.message}`);
      return jsonResponse({ status: "confirmed", distance, visit }, 201);
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
      const ownerFilter = userRole === "commercial" ? { id: visite_id, commercial_id: userId } : { id: visite_id, superviseur_id: userId };
      const { data: existing } = await supabase.from("visites").select("id, vente_status").match(ownerFilter).maybeSingle();
      if (!existing) return jsonError(404, "Visite introuvable");
      const { error } = await supabase.from("visites").update(updates).eq("id", visite_id);
      if (error) return jsonError(500, "Erreur lors de la finalisation");
      return jsonResponse({ success: true, visite_id, vente_status });
    }

    // --- CREATE VENTE (with multi-product lignes + auto BL) ---
    if (path === "/ventes" && method === "POST") {
      const { visite_id, point_vente_id, lignes, livraison_immediate, observation } = await req.json();
      if (!visite_id || !point_vente_id || !Array.isArray(lignes) || lignes.length === 0)
        return jsonError(400, "Visite, point de vente et au moins une ligne de produit requis");

      // Ownership check on visite
      const ownerFilter = userRole === "commercial" ? { id: visite_id, commercial_id: userId } : { id: visite_id, superviseur_id: userId };
      const { data: visite } = await supabase.from("visites").select("id").match(ownerFilter).maybeSingle();
      if (!visite) return jsonError(404, "Visite introuvable");

      // Resolve secteur
      let secteur_id: string | null = null;
      if (userRole === "commercial") {
        const info = await getCommercialSecteur(userId);
        secteur_id = info.secteur_id;
      } else {
        secteur_id = await getSuperviseurSecteur(userId);
      }
      if (!secteur_id) secteur_id = await getPointVenteSecteur(point_vente_id);

      // Calculate montant_total
      const montant_total = lignes.reduce((sum: number, l: Record<string, unknown>) => {
        const q = Number(l.quantite) || 0;
        const pu = Number(l.prix_unitaire) || 0;
        return sum + q * pu;
      }, 0);

      // Insert vente
      const venteInsert: Record<string, unknown> = {
        visite_id, point_vente_id, montant_total: Math.round(montant_total * 100) / 100,
        observation: observation?.trim() || null,
      };
      if (userRole === "commercial") venteInsert.commercial_id = userId; else venteInsert.superviseur_id = userId;
      if (secteur_id) venteInsert.secteur_id = secteur_id;
      const { data: vente, error: venteError } = await supabase.from("ventes").insert(venteInsert).select("id, created_at").maybeSingle();
      if (venteError || !vente) return jsonError(500, "Erreur lors de la création de la vente");

      // Insert lignes
      const lignesData = lignes.map((l: Record<string, unknown>) => ({
        vente_id: vente.id,
        produit_nom: String(l.produit_nom).trim(),
        quantite: Number(l.quantite) || 1,
        prix_unitaire: Number(l.prix_unitaire) || 0,
        montant: Math.round((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0) * 100) / 100,
        observation: l.observation?.trim() || null,
      }));
      const { error: lignesError } = await supabase.from("vente_lignes").insert(lignesData);
      if (lignesError) return jsonError(500, "Erreur lors de l'enregistrement des lignes");

      // Auto-generate BL
      const blNumero = generateBlNumero();
      const blInsert: Record<string, unknown> = {
        numero: blNumero, vente_id: vente.id, point_vente_id,
        statut: livraison_immediate ? "livre" : "en_attente",
      };
      if (userRole === "commercial") blInsert.commercial_id = userId; else blInsert.superviseur_id = userId;
      if (secteur_id) blInsert.secteur_id = secteur_id;
      if (livraison_immediate) blInsert.date_livraison = new Date().toISOString();
      const { data: bl, error: blError } = await supabase.from("bons_livraison").insert(blInsert).select("id, numero").maybeSingle();
      if (blError) return jsonError(500, "Erreur lors de la création du bon de livraison");

      // Insert BL lignes
      const blLignesData = lignes.map((l: Record<string, unknown>) => ({
        bl_id: bl!.id,
        produit_nom: String(l.produit_nom).trim(),
        quantite: Number(l.quantite) || 1,
        unite: "unité",
        observation: l.observation?.trim() || null,
      }));
      await supabase.from("bl_lignes").insert(blLignesData);

      // Update visite status
      await supabase.from("visites").update({ vente_status: livraison_immediate ? "vente_livraison" : "vente_realisee" }).eq("id", visite_id);

      return jsonResponse({ id: vente.id, bl_id: bl!.id, bl_numero: bl!.numero, created_at: vente.created_at }, 201);
    }

    // --- CREATE PROMESSE D'ACHAT (superviseur only) ---
    if (path === "/promesses" && method === "POST" && userRole === "superviseur") {
      const { visite_id, point_vente_id, produits, quantite, date_previsionnelle, montant_estime, responsable, observations } = await req.json();
      if (!visite_id || !point_vente_id || !produits) return jsonError(400, "Visite, point de vente et produits requis");
      const { data: visite } = await supabase.from("visites").select("id").eq("id", visite_id).eq("superviseur_id", userId).maybeSingle();
      if (!visite) return jsonError(404, "Visite introuvable");
      await supabase.from("visites").update({ vente_status: "promesse_achat" }).eq("id", visite_id);
      const { data, error } = await supabase.from("promesses_achat").insert({
        visite_id, superviseur_id: userId, point_vente_id,
        produits: Array.isArray(produits) ? produits.join(", ") : produits.trim(),
        quantite: Number(quantite) || 1, date_previsionnelle: date_previsionnelle || null,
        montant_estime: montant_estime ? Number(montant_estime) : null,
        responsable: responsable?.trim() || null, observations: observations?.trim() || null,
      }).select("id, created_at").maybeSingle();
      if (error) return jsonError(500, "Erreur lors de l'enregistrement de la promesse");
      return jsonResponse(data, 201);
    }

    // --- CREATE CONTROLE TERRAIN (superviseur only) ---
    if (path === "/controles-terrain" && method === "POST" && userRole === "superviseur") {
      const { point_vente_id, visite_id, notation, presence_comtesse, disponibilite, visibilite, merchandising, presence_concurrents, commentaires, recommandations, actions_correctives } = await req.json();
      if (!point_vente_id || !notation) return jsonError(400, "Point de vente et notation requis");
      if (!CONTROLE_NOTATIONS.includes(notation)) return jsonError(400, "Notation invalide");
      const secteur_id = await getSuperviseurSecteur(userId);
      const { data, error } = await supabase.from("controles_terrain").insert({
        superviseur_id: userId, point_vente_id, visite_id: visite_id || null, secteur_id,
        notation, presence_comtesse: !!presence_comtesse, disponibilite: !!disponibilite,
        visibilite: !!visibilite, merchandising: !!merchandising, presence_concurrents: !!presence_concurrents,
        commentaires: commentaires?.trim() || null, recommandations: recommandations?.trim() || null,
        actions_correctives: actions_correctives?.trim() || null,
      }).select("id, created_at").maybeSingle();
      if (error) return jsonError(500, "Erreur lors de l'enregistrement du contrôle");
      return jsonResponse(data, 201);
    }

    // --- MY VISITES ---
    if (path === "/mes-visites" && method === "GET") {
      let query = supabase.from("visites").select(`id, visited_at, distance_meters, status, vente_status, motif, user_role, point_vente:points_vente(name, city, address)`).order("visited_at", { ascending: false });
      if (userRole === "commercial") query = query.eq("commercial_id", userId); else query = query.eq("superviseur_id", userId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- MY CONTROLES (superviseur) ---
    if (path === "/mes-controles" && method === "GET" && userRole === "superviseur") {
      const { data, error } = await supabase
        .from("controles_terrain").select(`id, notation, presence_comtesse, disponibilite, visibilite, merchandising, presence_concurrents, commentaires, recommandations, actions_correctives, created_at, point_vente:points_vente(name, city, address)`)
        .eq("superviseur_id", userId).order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- MY BONS LIVRAISON (commercial) ---
    if (path === "/mes-bons-livraison" && method === "GET" && userRole === "commercial") {
      const { data, error } = await supabase
        .from("bons_livraison").select(`id, numero, statut, commentaire, date_livraison, created_at, point_vente:points_vente(name, city, address), lignes:bl_lignes(produit_nom, quantite, unite)`)
        .eq("commercial_id", userId).order("created_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- VENTES NON REALISEES (superviseur: visites of own commerciaux with vente_non_realisee) ---
    if (path === "/ventes-non-realisees" && method === "GET" && userRole === "superviseur") {
      // Get commerciaux under this superviseur
      const { data: commerciaux } = await supabase.from("commerciaux").select("id").eq("superviseur_id", userId);
      if (!commerciaux || commerciaux.length === 0) return jsonResponse([]);
      const commIds = commerciaux.map((c: Record<string, unknown>) => c.id);
      const { data, error } = await supabase
        .from("visites").select(`id, visited_at, motif, user_role, commercial:commerciaux(full_name), point_vente:points_vente(name, city, address)`)
        .in("commercial_id", commIds).eq("vente_status", "vente_non_realisee").order("visited_at", { ascending: false });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- PRODUITS LIST ---
    if (path === "/produits" && method === "GET") {
      const { data, error } = await supabase.from("produits").select("id, nom").order("nom", { ascending: true });
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse(data);
    }

    // --- CREATE POINT DE VENTE (field users) ---
    if (path === "/points-vente" && method === "POST") {
      const { name, address, city, latitude, longitude, secteur_id } = await req.json();
      if (!name || !address || !city || latitude == null || longitude == null) return jsonError(400, "Tous les champs sont requis");
      const code = "PV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const qr_token = generateQrToken();
      const insertData: Record<string, unknown> = { code, name: name.trim(), address: address.trim(), city: city.trim(), latitude: Number(latitude), longitude: Number(longitude), qr_token };
      if (secteur_id) insertData.secteur_id = secteur_id;
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
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erreur serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
