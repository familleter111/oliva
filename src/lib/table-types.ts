/** Types partagés entre le serveur et le parcours client d'une table. Aucun secret n'y figure. */

export interface TableOption {
  nom: string;
  prixCentimes: number;
}
export interface TableConvive {
  id: string;
  nom: string;
  moi: boolean;
}
export interface TableCartLine {
  id: string;
  produitId: string;
  nom: string;
  image: string | null;
  quantite: number;
  options: TableOption[];
  instructions: string;
  prixUnitaireCentimes: number;
  totalCentimes: number;
  ajoutePar: string;
  /** Faux quand le produit ou une option n'est plus proposé : la ligne doit être retirée avant l'envoi. */
  valide: boolean;
}
export interface TableOrderLine {
  id: string;
  nom: string;
  image: string | null;
  quantite: number;
  options: TableOption[];
  instructions: string;
  totalCentimes: number;
}
export interface TableOrder {
  id: string;
  /** Rang de la commande dans la session de table : 1, 2, 3. */
  rang: number;
  statut: string;
  creeLe: string;
  totalCentimes: number;
  articles: number;
  lignes: TableOrderLine[];
}
export interface TableActivity {
  id: string;
  type: "ajout" | "commande" | "arrivee";
  auteur: string;
  date: string;
  /** Nom du produit ou rang de la commande, selon le type. */
  objet: string;
  quantite: number;
  montantCentimes: number;
  image: string | null;
}
export interface TableRequest {
  id: string;
  libelle: string;
  /** « en_cours » : un membre de l'équipe a pris la demande en charge et se rend à la table. */
  statut: "en_attente" | "en_cours" | "traitee";
  creeLe: string;
}

export interface TableState {
  table: { id: string; nom: string };
  devise: string;
  /** Fuseau du restaurant : les heures affichées sont les mêmes sur le serveur et dans le navigateur. */
  fuseau: string;
  convives: TableConvive[];
  panier: { version: number; lignes: TableCartLine[]; articles: number; totalCentimes: number };
  commandes: TableOrder[];
  statuts: { id: string; nom: string }[];
  addition: {
    commandesCentimes: number;
    service: { actif: boolean; pourcentage: number; montantCentimes: number };
    totalCentimes: number;
    partageActif: boolean;
  };
  activite: TableActivity[];
  demandes: TableRequest[];
  motifs: { id: string; libelle: string; icone: string }[];
  reglages: {
    libelleBouton: string;
    confirmation: boolean;
    instructionsActives: boolean;
    instructionsMax: number;
    quantiteMax: number;
    /** Faux quand le panier a été envoyé et que les commandes successives sont désactivées. */
    panierOuvert: boolean;
    /** Faux en dehors des horaires de prise de commande. */
    commandesOuvertes: boolean;
    messageFerme: string;
  };
}

/** Ce que voit une personne qui n'a pas encore rejoint la table. */
export interface TableGate {
  table: { id: string; nom: string };
  restaurant: string;
  sessionOuverte: boolean;
  politique: "code_session" | "validation_personnel" | "acces_direct";
  pseudo: "aucun" | "optionnel" | "obligatoire";
  /** Présent quand la personne a déjà demandé à rejoindre et attend la validation du personnel. */
  enAttente: boolean;
  /** Vrai quand cet appareil participait à une session de cette table que le personnel a clôturée. */
  termine: boolean;
  banniere: string | null;
}

/* ------------------------------------------------------------ personnel */

export interface ServiceSession {
  id: string;
  table: string;
  code: string;
  ouverteLe: string;
  convives: number;
  enAttente: { id: string; nom: string; rejointLe: string }[];
  panierArticles: number;
}
export interface ServiceOrder {
  id: string;
  numero: number;
  table: string;
  statut: string;
  creeLe: string;
  totalCentimes: number;
  devise: string;
  lignes: { nom: string; quantite: number; options: TableOption[]; instructions: string }[];
}
export interface ServiceRequest {
  id: string;
  table: string;
  libelle: string;
  message: string;
  auteur: string;
  statut: "en_attente" | "en_cours";
  /** Nom du membre qui a pris la demande en charge, vide tant que personne ne l'a prise. */
  prisePar: string;
  creeLe: string;
}
export interface ServiceState {
  sessions: ServiceSession[];
  commandes: ServiceOrder[];
  servies: ServiceOrder[];
  demandes: ServiceRequest[];
  statuts: { id: string; nom: string; couleur: string }[];
}
