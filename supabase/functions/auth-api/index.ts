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
const MAX_DISTANCE_METERS = 10;

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

async function createSession(
  userType: "admin" | "commercial",
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

  // ---------- LOGIN (auto-detect admin vs commercial) ----------
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
        return jsonResponse({ token, userType: "admin", fullName: admin.full_name, userId: admin.id });
      }
      return jsonError(401, "Identifiants incorrects");
    }

    // Fall back to commercial table (commercials log in by identifiant)
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

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: visitesToday } = await supabase
        .from("visites")
        .select("*", { count: "exact", head: true })
        .gte("visited_at", todayStart.toISOString());

      const { count: outOfZoneToday } = await supabase
        .from("visites")
        .select("*", { count: "exact", head: true })
        .eq("status", "out_of_zone")
        .gte("visited_at", todayStart.toISOString());

      const { data: lastVisite } = await supabase
        .from("visites")
        .select("visited_at")
        .order("visited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return jsonResponse({
        totalCommerciaux: totalCommerciaux || 0,
        visitesToday: visitesToday || 0,
        outOfZoneToday: outOfZoneToday || 0,
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
          `id, visited_at, latitude, longitude, distance_meters, status,
           commercial:commerciaux(full_name),
           point_vente:points_vente(name, city)`,
          { count: "exact" }
        )
        .order("visited_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return jsonError(500, "Erreur de lecture");
      return jsonResponse({ data, count: count || 0, page, pageSize });
    }
  }

  // ===== COMMERCIAL ROUTES =====
  if (session.user_type === "commercial") {
    const commercialId = session.user_id;

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

    // --- RECORD VISIT ---
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
        await supabase
          .from("visites")
          .insert({
            commercial_id: commercialId,
            point_vente_id,
            latitude: Number(latitude),
            longitude: Number(longitude),
            distance_meters: distance,
            status: "out_of_zone",
          });
        return jsonResponse(
          {
            status: "out_of_zone",
            distance,
            message: "Vous êtes trop éloigné du point de vente.",
          },
          200
        );
      }

      // Double-scan prevention: check for a visit in the last 5 minutes
      const fiveMinAgo = new Date(Date.now() - DOUBLE_SCAN_MINUTES * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("visites")
        .select("id, visited_at")
        .eq("commercial_id", commercialId)
        .eq("point_vente_id", point_vente_id)
        .gte("visited_at", fiveMinAgo)
        .order("visited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

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

      const { data: visit, error: insertError } = await supabase
        .from("visites")
        .insert({
          commercial_id: commercialId,
          point_vente_id,
          latitude: Number(latitude),
          longitude: Number(longitude),
          distance_meters: distance,
          status: "confirmed",
        })
        .select("id, visited_at, distance_meters, status")
        .maybeSingle();

      if (insertError) return jsonError(500, "Erreur lors de l'enregistrement");
      return jsonResponse(
        { status: "confirmed", distance, visit },
        201
      );
    }

    // --- MY VISITS (history) ---
    if (path === "/mes-visites" && method === "GET") {
      const { data, error } = await supabase
        .from("visites")
        .select(
          `id, visited_at, distance_meters, status,
           point_vente:points_vente(name, city, address)`
        )
        .eq("commercial_id", commercialId)
        .order("visited_at", { ascending: false });
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
