export type UserType = "admin" | "commercial";

export interface Session {
  token: string;
  userType: UserType;
  fullName: string;
  userId: string;
}

export interface Commercial {
  id: string;
  identifiant: string;
  full_name: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PointVente {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  qr_token: string;
  created_at: string;
  updated_at?: string;
}

export interface Visite {
  id: string;
  visited_at: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  status: string;
  commercial?: { full_name: string };
  point_vente?: { name: string; city: string; address?: string };
}

export interface DashboardStats {
  totalCommerciaux: number;
  visitesToday: number;
  lastVisite: string | null;
}

export interface VisitResult {
  status: "confirmed" | "out_of_zone" | "duplicate";
  distance?: number;
  message?: string;
  visit?: {
    id: string;
    visited_at: string;
    distance_meters: number;
    status: string;
  };
  lastVisit?: string;
}
