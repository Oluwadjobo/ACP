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
  // Auth
  login: (body: { login: string; password: string }) =>
    apiRequest<{ token: string; userType: string; fullName: string; userId: string }>(
      "/login",
      { method: "POST", body: JSON.stringify(body) }
    ),

  logout: () => apiRequest<{ success: boolean }>("/logout", { method: "POST" }),

  me: () =>
    apiRequest<{ userType: string; userId: string; fullName: string }>("/me", {
      method: "GET",
    }),

  // Admin - Commerciaux
  listCommerciaux: () => apiRequest<import("@/types").Commercial[]>("/commerciaux", {
    method: "GET",
  }),

  createCommercial: (body: { identifiant: string; full_name: string; password: string }) =>
    apiRequest<import("@/types").Commercial>("/commerciaux", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateCommercial: (id: string, body: Partial<{ identifiant: string; full_name: string; active: boolean }>) =>
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
  }) =>
    apiRequest<import("@/types").PointVente>("/points-vente", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updatePointVente: (
    id: string,
    body: Partial<{ name: string; address: string; city: string; latitude: number; longitude: number }>
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

  // Commercial
  resolveQr: (qr_token: string) =>
    apiRequest<{ id: string; name: string; address: string; city: string; latitude: number; longitude: number }>(
      "/resolve-qr",
      { method: "POST", body: JSON.stringify({ qr_token }) }
    ),

  recordVisit: (body: { point_vente_id: string; latitude: number; longitude: number }) =>
    apiRequest<import("@/types").VisitResult>("/visites", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  myVisites: () => apiRequest<import("@/types").Visite[]>("/mes-visites", { method: "GET" }),
};
