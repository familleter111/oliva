/** Types de l'espace responsable de salle. Aucun jeton ni mot de passe n'y figure. */

import type { SalleOrder, SalleRequest } from "./salle-types";

export type TableEtat = "libre" | "en_service" | "a_servir" | "demande" | "arrivee";

export interface ChefTable {
  id: string;
  nom: string;
  zoneId: string;
  zone: string;
  capacite: number;
  etat: TableEtat;
  sessionId: string;
  convives: number;
  /** Serveur affecté à la table, vide quand personne n'en a la charge. */
  serveurId: string;
  serveur: string;
  pretes: number;
  enPreparation: number;
  demandes: number;
  /** Arrivées en attente de confirmation à cette table. */
  arrivees: number;
  /** Nombre d'actions en attente sur cette table, toutes natures confondues. */
  aFaire: number;
  additionARemettre: boolean;
  ouverteLe: string;
  derniereActiviteLe: string;
}

export interface ChefMember {
  id: string;
  nom: string;
  role: string;
  /** « en_service » dès qu'une table ouverte lui est affectée. */
  etat: "en_service" | "disponible";
  tables: { id: string; nom: string }[];
  convives: number;
  demandes: number;
}

export interface ChefStats {
  tablesOccupees: number;
  tablesTotal: number;
  convives: number;
  aServir: number;
  demandes: number;
  enPreparation: number;
  servies: number;
}

export interface ChefPriority {
  id: string;
  tableId: string;
  table: string;
  serveur: string;
  libelle: string;
  type: "servir" | "addition" | "demande" | "arrivee";
  /** Verbe du bouton : le geste attendu, pas une description. */
  action: string;
  href: string;
}

/** Objet du plan publié d'une zone, rendu tel quel avec l'état en direct des tables. */
export interface ChefPlanItem {
  id: string;
  type: string;
  tableId: string;
  libelle: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  rotation: number;
}

export interface ChefZone {
  id: string;
  nom: string;
  objets: ChefPlanItem[];
}

export interface ChefAction {
  date: string;
  libelle: string;
  detail: string;
}

export interface ChefTableDetail {
  table: ChefTable;
  commandes: SalleOrder[];
  demandes: SalleRequest[];
  /** Montant dû tant que la session est ouverte, figé une fois clôturée. */
  additionCentimes: number;
  additionRemise: boolean;
  devise: string;
  code: string;
  actions: ChefAction[];
}

export interface ChefOverview {
  stats: ChefStats;
  zones: ChefZone[];
  tables: ChefTable[];
  priorites: ChefPriority[];
  equipe: ChefMember[];
  /** Phrase d'alerte du bandeau bas, vide quand tout est calme. */
  alerte: string;
}

export interface ChefTeam {
  membres: ChefMember[];
  tables: ChefTable[];
  demandes: SalleRequest[];
  pretes: SalleOrder[];
  stats: { serveurs: number; convives: number; tablesOccupees: number; tablesTotal: number };
}

export interface ChefService {
  stats: ChefStats;
  commandes: (SalleOrder & { serveur: string; serveurId: string })[];
  serveurs: { id: string; nom: string }[];
}

export interface ChefRequests {
  demandes: SalleRequest[];
  serveurs: { id: string; nom: string }[];
  /** Serveur affecté à la table de chaque demande, proposé par défaut. */
  parTable: Record<string, string>;
}

export interface ChefSessions {
  stats: ChefStats;
  actives: ChefTable[];
  disponibles: ChefTable[];
}
