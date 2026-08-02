export type UserType = "admin" | "commercial" | "superviseur";

export type Permission =
  | "scan" | "create_point_vente" | "record_vente" | "create_promesse"
  | "control_terrain" | "view_history" | "view_ventes_non_realisees"
  | "view_dashboard" | "view_carte" | "manage_secteurs" | "manage_commerciaux"
  | "manage_superviseurs" | "manage_admins" | "manage_produits" | "manage_points_vente"
  | "manage_bons_livraison" | "view_visites" | "view_ventes" | "view_controles";

export type Permissions = Record<Permission, boolean>;

export const FIELD_PERMISSIONS: Permission[] = [
  "scan", "create_point_vente", "record_vente", "create_promesse",
  "control_terrain", "view_history", "view_ventes_non_realisees",
];

export const DASHBOARD_PERMISSIONS: Permission[] = [
  "view_dashboard", "view_carte", "manage_secteurs", "manage_commerciaux",
  "manage_superviseurs", "manage_admins", "manage_produits", "manage_points_vente",
  "manage_bons_livraison", "view_visites", "view_ventes", "view_controles",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  scan: "Scanner (visites)",
  create_point_vente: "Créer un point de vente",
  record_vente: "Enregistrer une vente",
  create_promesse: "Créer une promesse d'achat",
  control_terrain: "Contrôle terrain",
  view_history: "Voir l'historique",
  view_ventes_non_realisees: "Voir les ventes non réalisées",
  view_dashboard: "Tableau de bord",
  view_carte: "Carte",
  manage_secteurs: "Gérer les tournées",
  manage_commerciaux: "Gérer les commerciaux",
  manage_superviseurs: "Gérer les Team Leaders",
  manage_admins: "Gérer les administrateurs",
  manage_produits: "Gérer les produits",
  manage_points_vente: "Gérer les points de vente",
  manage_bons_livraison: "Gérer les bons de livraison",
  view_visites: "Voir les visites",
  view_ventes: "Voir les ventes",
  view_controles: "Voir les contrôles",
};

export interface Session {
  token: string;
  userType: UserType;
  fullName: string;
  userId: string;
}

export interface Secteur {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  actif: boolean;
  created_at: string;
}

export interface Commercial {
  id: string;
  identifiant: string;
  full_name: string;
  active: boolean;
  telephone?: string | null;
  superviseur_id?: string | null;
  superviseur_nom?: string | null;
  secteur_nom?: string | null;
  permissions?: Permissions;
  created_at: string;
  updated_at?: string;
}

export interface SuperviseurTournee {
  secteur_id: string;
  nom: string | null;
  code: string | null;
}

export interface Superviseur {
  id: string;
  identifiant: string;
  full_name: string;
  active: boolean;
  telephone?: string | null;
  secteur_id?: string | null;
  secteur_nom?: string | null;
  tournees?: SuperviseurTournee[];
  permissions?: Permissions;
  created_at: string;
  updated_at?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  must_change_password: boolean;
  permissions?: Permissions;
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
  secteur_id?: string | null;
  secteur_nom?: string | null;
  created_at: string;
  updated_at?: string;
}

export type VenteStatus =
  | "confirmed"
  | "out_of_zone"
  | "vente_realisee"
  | "vente_non_realisee"
  | "vente_livraison"
  | "livraison_realisee"
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

export interface VenteLigne {
  produit_id: string | null;
  produit_nom: string;
  quantite: number;
  prix_unitaire: number;
  montant: number;
  observation?: string;
}

export interface Vente {
  id: string;
  visite_id: string;
  commercial_id: string | null;
  superviseur_id: string | null;
  point_vente_id: string;
  secteur_id: string | null;
  montant_total: number;
  observation: string | null;
  created_at: string;
  lignes?: VenteLigne[];
  commercial?: { full_name: string };
  superviseur?: { full_name: string };
  point_vente?: { name: string; city: string; address: string };
}

export type BLStatut = "en_attente" | "livre" | "partiel" | "annule";

export interface BLLigne {
  produit_nom: string;
  quantite: number;
  unite: string;
  observation?: string;
}

export interface BonLivraison {
  id: string;
  numero: string;
  vente_id: string;
  commercial_id: string | null;
  superviseur_id: string | null;
  point_vente_id: string;
  secteur_id: string | null;
  statut: BLStatut;
  commentaire: string | null;
  date_livraison: string | null;
  created_at: string;
  lignes?: BLLigne[];
  commercial?: { full_name: string };
  superviseur?: { full_name: string };
  point_vente?: { name: string; city: string; address: string };
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

export type ControleNotation = "excellent" | "bon" | "moyen" | "faible" | "critique";

export interface ControleTerrain {
  id: string;
  superviseur_id: string | null;
  point_vente_id: string;
  visite_id: string | null;
  secteur_id: string | null;
  notation: ControleNotation;
  presence_comtesse: boolean;
  disponibilite: boolean;
  visibilite: boolean;
  merchandising: boolean;
  presence_concurrents: boolean;
  commentaires: string | null;
  recommandations: string | null;
  actions_correctives: string | null;
  created_at: string;
  superviseur?: { full_name: string };
  point_vente?: { name: string; city: string; address: string };
}

export interface DashboardStats {
  totalCommerciaux: number;
  totalSuperviseurs: number;
  totalSecteurs: number;
  totalPointsVente: number;
  visitesToday: number;
  outOfZoneToday: number;
  promessesToday: number;
  ventesRealisees: number;
  ventesNonRealisees: number;
  blEnAttente: number;
  blLivres: number;
  blPartiels: number;
  blAnnules: number;
  controlesToday: number;
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

export const VENTE_NON_REALISEE_MOTIFS = [
  "Rupture de stock",
  "Refus du client",
  "Manque de trésorerie",
  "Client absent",
  "Client déjà suffisamment approvisionné",
  "Fermeture exceptionnelle",
  "Concurrence",
  "Autre",
] as const;

export const CONTROLE_NOTATIONS: { value: ControleNotation; label: string; color: string }[] = [
  { value: "excellent", label: "Excellent", color: "success" },
  { value: "bon", label: "Bon", color: "accent" },
  { value: "moyen", label: "Moyen", color: "warning" },
  { value: "faible", label: "Faible", color: "error" },
  { value: "critique", label: "Critique", color: "error" },
];
