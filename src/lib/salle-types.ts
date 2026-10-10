/** Types de l'espace serveur. Ils ne contiennent ni jeton, ni code de session, ni donnée personnelle. */

import type { TableOption } from "./table-types";

export type BillStatus = "a_remettre" | "remise" | "cloturee";
export type RequestStatus = "en_attente" | "en_cours" | "traitee";

export interface SalleLine {
  id: string;
  nom: string;
  description: string;
  image: string | null;
  quantite: number;
  options: TableOption[];
  instructions: string;
  totalCentimes: number;
}

export interface SalleOrder {
  id: string;
  sessionId: string;
  tableId: string;
  table: string;
  /** Rang de la commande dans la session : 1, 2, 3. Le numéro global reste `numero`. */
  rang: number;
  numero: number;
  statut: string;
  statutNom: string;
  couleur: string;
  /** Vrai quand la cuisine a signalé la commande prête : elle apparaît alors dans « À servir ». */
  prete: boolean;
  servie: boolean;
  creeLe: string;
  articles: number;
  totalCentimes: number;
  devise: string;
  lignes: SalleLine[];
  /** Instructions des convives, regroupées pour le bandeau de rappel. */
  notes: { nom: string; texte: string }[];
}

export interface SalleRequest {
  id: string;
  sessionId: string;
  tableId: string;
  table: string;
  libelle: string;
  icone: string;
  message: string;
  auteur: string;
  statut: RequestStatus;
  creeLe: string;
  traiteeLe: string;
  /** Nom du membre qui a pris la demande en charge, vide tant que personne ne l'a prise. */
  prisePar: string;
  /** Vrai quand c'est le membre connecté qui l'a prise en charge. */
  parMoi: boolean;
  /** Vrai pour une demande d'addition : l'écran propose alors d'ouvrir l'addition de la table. */
  addition: boolean;
}

export interface SalleBill {
  sessionId: string;
  tableId: string;
  table: string;
  statut: BillStatus;
  convives: number;
  nbCommandes: number;
  commandesCentimes: number;
  serviceCentimes: number;
  servicePourcentage: number;
  totalCentimes: number;
  devise: string;
  demandeeLe: string;
  remiseLe: string;
  remisePar: string;
  clotureeLe: string;
  /** Trois lignes représentatives pour la carte de liste. */
  apercu: { nom: string; quantite: number }[];
  autres: number;
  image: string | null;
}

export interface SalleTableCard {
  id: string;
  nom: string;
  zone: string;
  capacite: number;
  couleur: string;
  sessionId: string;
  convives: number;
  /** Repère affiché sur la carte, du plus urgent au plus calme. */
  etat: "libre" | "en_cours" | "prete" | "addition";
  pretes: number;
  enCours: number;
  demandes: number;
  additionStatut: BillStatus | null;
}

export interface SallePriority {
  id: string;
  type: "servir" | "demande" | "addition";
  table: string;
  texte: string;
  href: string;
  image: string | null;
}

export interface SalleHome {
  membre: string;
  toutesLesTables: boolean;
  stats: { tables: number; pretes: number; demandes: number };
  tables: SalleTableCard[];
  priorites: SallePriority[];
}

export interface SalleTableDetail {
  table: { id: string; nom: string; zone: string; capacite: number };
  sessionId: string;
  sessionOuverte: boolean;
  ouverteLe: string;
  convives: number;
  commandes: SalleOrder[];
  demandes: SalleRequest[];
  addition: SalleBill | null;
}

export interface SalleServe {
  aServir: SalleOrder[];
  servies: SalleOrder[];
}

export interface SalleCounts {
  aServir: number;
  demandes: number;
  additions: number;
}

/** Droits du membre connecté, calculés sur le serveur et rejoués à chaque action. */
export interface SalleRights {
  servir: boolean;
  traiter: boolean;
  remettre: boolean;
}
