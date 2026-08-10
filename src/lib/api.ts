import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

const FUNCTION_URL = `${supabaseUrl}/functions/v1/auth-api`;

function getToken(): string | null {
  return localStorage.getItem("session_token");
}

let teamsPromise: Promise<import("@/types").Team[]> | null = null;

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${FUNCTION_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Erreur ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Teams
  listTeams: () => {
    if (!teamsPromise) {
      teamsPromise = apiRequest<import("@/types").Team[]>("/teams", { method: "GET" });
    }
    return teamsPromise;
  },

  // Auth
  login: (body: { login: string; password: string; teamCode?: string }) =>
    apiRequest<{
      token: string;
      userType: string;
      fullName: string;
      userId: string;
      mustChangePassword?: boolean;
      teamId: string | null;
      role: string;
      teamCode?: string | null;
      teamColor?: string | null;
      permissions: Record<string, boolean>;
    }>("/login", { method: "POST", body: JSON.stringify({ login: body.login, password: body.password, team_code: body.teamCode }) }),

  logout: () => apiRequest<{ success: boolean }>("/logout", { method: "POST" }),

  me: () =>
    apiRequest<{ userType: string; userId: string; fullName: string; teamId: string | null; teamCode?: string | null; teamColor?: string | null; role: string; permissions: Record<string, boolean> }>("/me", {
      method: "GET",
    }),

  switchTeam: (teamId: string | null) =>
    apiRequest<{ success: boolean; teamId: string | null }>("/switch-team", {
      method: "POST",
      body: JSON.stringify({ team_id: teamId }),
    }),

  changePassword: (newPassword: string) =>
    apiRequest<{ success: boolean }>("/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),

  // Admin - Commerciaux
  listCommerciaux: () => apiRequest<import("@/types").Commercial[]>("/commerciaux", {
    method: "GET",
  }),

  createCommercial: (body: { identifiant: string; full_name: string; password: string; telephone?: string; superviseur_id?: string }) =>
    apiRequest<import("@/types").Commercial>("/commerciaux", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateCommercial: (id: string, body: Partial<{ identifiant: string; full_name: string; active: boolean; telephone: string; superviseur_id: string | null }>) =>
    apiRequest<import("@/types").Commercial>(`/commerciaux/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  resetCommercialPassword: (id: string, password: string) =>
    apiRequest<{ success: boolean }>(`/commerciaux/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  deleteCommercial: (id: string) =>
    apiRequest<{ success: boolean }>(`/commerciaux/${id}`, { method: "DELETE" }),

  // Admin - Superviseurs
  listSuperviseurs: () => apiRequest<import("@/types").Superviseur[]>("/superviseurs", {
    method: "GET",
  }),

  createSuperviseur: (body: { identifiant: string; full_name: string; password: string; telephone?: string; secteur_ids: string[] }) =>
    apiRequest<import("@/types").Superviseur>("/superviseurs", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateSuperviseur: (id: string, body: Partial<{ identifiant: string; full_name: string; active: boolean; telephone: string; secteur_ids: string[] }>) =>
    apiRequest<import("@/types").Superviseur>(`/superviseurs/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  resetSuperviseurPassword: (id: string, password: string) =>
    apiRequest<{ success: boolean }>(`/superviseurs/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  deleteSuperviseur: (id: string) =>
    apiRequest<{ success: boolean }>(`/superviseurs/${id}`, { method: "DELETE" }),

  // Admin - Admins
  listAdmins: () => apiRequest<import("@/types").AdminUser[]>("/admins", {
    method: "GET",
  }),

  createAdmin: (body: { email: string; full_name: string; password: string; role?: string; team_id?: string | null }) =>
    apiRequest<import("@/types").AdminUser>("/admins", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateAdmin: (id: string, body: Partial<{ email: string; full_name: string; role?: string; team_id?: string | null }>) =>
    apiRequest<import("@/types").AdminUser>(`/admins/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  resetAdminPassword: (id: string, password: string) =>
    apiRequest<{ success: boolean }>(`/admins/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  deleteAdmin: (id: string) =>
    apiRequest<{ success: boolean }>(`/admins/${id}`, { method: "DELETE" }),

  // Admin - Secteurs
  listSecteurs: () => apiRequest<import("@/types").Secteur[]>("/secteurs", {
    method: "GET",
  }),

  createSecteur: (body: { nom: string; code: string; description?: string; color_code?: string }) =>
    apiRequest<import("@/types").Secteur>("/secteurs", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateSecteur: (id: string, body: Partial<{ nom: string; code: string; description: string; actif: boolean; color_code: string }>) =>
    apiRequest<import("@/types").Secteur>(`/secteurs/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteSecteur: (id: string) =>
    apiRequest<{ success: boolean }>(`/secteurs/${id}`, { method: "DELETE" }),

  // Admin - Produits
  listProduits: () => apiRequest<import("@/types").Produit[]>("/produits", {
    method: "GET",
  }),

  createProduit: (nom: string) =>
    apiRequest<import("@/types").Produit>("/produits", {
      method: "POST",
      body: JSON.stringify({ nom }),
    }),

  deleteProduit: (id: string) =>
    apiRequest<{ success: boolean }>(`/produits/${id}`, { method: "DELETE" }),

  // Admin - Points de vente
  listPointsVente: () => apiRequest<import("@/types").PointVente[]>("/points-vente", {
    method: "GET",
  }),

  createPointVente: (body: {
    name: string;
    address: string;
    city: string;
    latitude: number;
    longitude: number;
    secteur_id?: string;
  }) =>
    apiRequest<import("@/types").PointVente>("/points-vente", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updatePointVente: (
    id: string,
    body: Partial<{ name: string; address: string; city: string; latitude: number; longitude: number; secteur_id: string | null }>
  ) =>
    apiRequest<import("@/types").PointVente>(`/points-vente/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deletePointVente: (id: string) =>
    apiRequest<{ success: boolean }>(`/points-vente/${id}`, { method: "DELETE" }),

  // Admin - Dashboard
  getDashboard: () => apiRequest<import("@/types").DashboardStats>("/dashboard", {
    method: "GET",
  }),

  listVisites: (page = 1, pageSize = 50) =>
    apiRequest<{ data: import("@/types").Visite[]; count: number; page: number; pageSize: number }>(
      `/visites?page=${page}&pageSize=${pageSize}`,
      { method: "GET" }
    ),

  listPromesses: (page = 1, pageSize = 50) =>
    apiRequest<{ data: import("@/types").PromesseAchat[]; count: number; page: number; pageSize: number }>(
      `/promesses?page=${page}&pageSize=${pageSize}`,
      { method: "GET" }
    ),

  listVentes: (page = 1, pageSize = 50) =>
    apiRequest<{ data: import("@/types").Vente[]; count: number; page: number; pageSize: number }>(
      `/ventes?page=${page}&pageSize=${pageSize}`,
      { method: "GET" }
    ),

  listBonsLivraison: (page = 1, pageSize = 50) =>
    apiRequest<{ data: import("@/types").BonLivraison[]; count: number; page: number; pageSize: number }>(
      `/bons-livraison?page=${page}&pageSize=${pageSize}`,
      { method: "GET" }
    ),

  updateBlStatut: (id: string, statut: string, commentaire?: string) =>
    apiRequest<{ success: boolean }>(`/bons-livraison/${id}/statut`, {
      method: "PUT",
      body: JSON.stringify({ statut, commentaire }),
    }),

  listControles: (page = 1, pageSize = 50) =>
    apiRequest<{ data: import("@/types").ControleTerrain[]; count: number; page: number; pageSize: number }>(
      `/controles-terrain?page=${page}&pageSize=${pageSize}`,
      { method: "GET" }
    ),

  // Admin - Permissions
  getPermissions: (userType: string, userId: string) =>
    apiRequest<{ permissions: import("@/types").Permissions }>(`/permissions?type=${userType}&id=${userId}`, { method: "GET" }),

  updatePermissions: (userType: string, userId: string, permissions: Record<string, boolean>) =>
    apiRequest<{ success: boolean; permissions: import("@/types").Permissions }>("/permissions", {
      method: "PUT",
      body: JSON.stringify({ userType, userId, permissions }),
    }),

  getPermissionCatalog: () =>
    apiRequest<{ field: string[]; dashboard: string[] }>("/permissions/catalog", { method: "GET" }),

  // Field - Shared
  resolveQr: (qr_token: string) =>
    apiRequest<{ id: string; name: string; address: string; city: string; latitude: number; longitude: number }>(
      "/resolve-qr",
      { method: "POST", body: JSON.stringify({ qr_token }) }
    ),

  recordVisit: (body: { point_vente_id: string; latitude: number; longitude: number; accuracy?: number }) =>
    apiRequest<import("@/types").VisitResult>("/visites", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  finalizeVisit: (body: { visite_id: string; vente_status: string; motif?: string }) =>
    apiRequest<{ success: boolean; visite_id: string; vente_status: string }>("/visites/finalize", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createVente: (body: {
    visite_id: string;
    point_vente_id: string;
    lignes: { produit_id: string; produit_nom: string; quantite: number; observation?: string }[];
    livraison_immediate?: boolean;
    observation?: string;
  }) =>
    apiRequest<{ id: string; bl_id?: string; bl_numero?: string; created_at: string }>("/ventes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createPromesse: (body: {
    visite_id: string;
    point_vente_id: string;
    produits: string[];
    quantite: number;
    date_previsionnelle?: string;
    montant_estime?: number;
    responsable?: string;
    observations?: string;
  }) =>
    apiRequest<{ id: string; created_at: string }>("/promesses", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createControle: (body: {
    point_vente_id: string;
    visite_id?: string;
    notation: string;
    presence_comtesse: boolean;
    disponibilite: boolean;
    visibilite: boolean;
    merchandising: boolean;
    presence_concurrents: boolean;
    commentaires?: string;
    recommandations?: string;
    actions_correctives?: string;
  }) =>
    apiRequest<{ id: string; created_at: string }>("/controles-terrain", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Superviseur - ventes non réalisées de ses commerciaux
  listVentesNonRealisees: () =>
    apiRequest<import("@/types").Visite[]>("/ventes-non-realisees", { method: "GET" }),

  myVisites: () => apiRequest<import("@/types").Visite[]>("/mes-visites", { method: "GET" }),

  myControles: () => apiRequest<import("@/types").ControleTerrain[]>("/mes-controles", { method: "GET" }),

  myBonsLivraison: () => apiRequest<import("@/types").BonLivraison[]>("/mes-bons-livraison", { method: "GET" }),
};
