export type UserType = "admin" | "commercial" | "superviseur";

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

export interface Superviseur {
  id: string;
  identifiant: string;
  full_name: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  must_change_password: boolean;
  created_at: string;
}

export interface Produit {
  id: string;
  nom: string;
  created_at?: string;
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

export type VenteStatus =
  | "confirmed"
  | "out_of_zone"
  | "vente_realisee"
  | "vente_non_realisee"
  | "promesse_achat";

export interface Visite {
  id: string;
  visited_at: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  status: string;
  vente_status: VenteStatus | null;
  motif: string | null;
  user_role: "commercial" | "superviseur";
  commercial?: { full_name: string };
  superviseur?: { full_name: string };
  point_vente?: { name: string; city: string; address?: string };
}

export interface PromesseAchat {
  id: string;
  produits: string;
  quantite: number;
  date_previsionnelle: string | null;
  montant_estime: number | null;
  responsable: string | null;
  observations: string | null;
  created_at: string;
  superviseur?: { full_name: string };
  point_vente?: { name: string; city: string };
}

export interface DashboardStats {
  totalCommerciaux: number;
  totalSuperviseurs: number;
  visitesToday: number;
  outOfZoneToday: number;
  promessesToday: number;
  ventesRealisees: number;
  ventesNonRealisees: number;
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
    vente_status: string | null;
  };
  lastVisit?: string;
  debug?: {
    userLat: number;
    userLon: number;
    pointLat: number;
    pointLon: number;
    pointName: string | null;
  };
}

export const VENTE_MOTIFS = [
  "Rupture de stock",
  "Client absent",
  "Refus du client",
  "Fermeture exceptionnelle",
  "Problème de paiement",
  "Autre",
] as const;
