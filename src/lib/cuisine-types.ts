/** Écran de cuisine : ce que la préparation doit voir, et rien d'autre. */
export interface KitchenLine {
  nom: string;
  quantite: number;
  options: { nom: string }[];
  instructions: string;
  /** Station de préparation de la ligne, affichée quand le membre en suit plusieurs. */
  station: string;
}

export interface KitchenOrder {
  id: string;
  table: string;
  /** Rang de la commande dans la session : 1, 2, 3. */
  rang: number;
  numero: number;
  creeLe: string;
  statut: string;
  statutNom: string;
  couleur: string;
  /** Étape suivante, seulement tant qu'elle reste du ressort de la cuisine. */
  suivant: { id: string; nom: string } | null;
  articles: number;
  lignes: KitchenLine[];
  /** Vrai quand la commande contient aussi des plats d'une autre station. */
  partielle: boolean;
}

export interface KitchenState {
  membre: string;
  /** Noms des stations suivies par le membre. Vide quand il les voit toutes. */
  stations: string[];
  toutesStations: boolean;
  /** Commandes sur lesquelles la cuisine a encore une étape à faire. */
  aPreparer: KitchenOrder[];
  /** Commandes terminées en cuisine, en attente du service. */
  pretes: KitchenOrder[];
}
