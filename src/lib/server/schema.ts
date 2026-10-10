import "server-only";

/**
 * Schéma du classeur `storage/data/oliva.xlsx`.
 * Une feuille par entité, une colonne par champ. Les montants sont en centimes entiers,
 * les dates en ISO 8601 UTC (texte), les listes d'identifiants et objets en JSON (texte).
 */
export const SCHEMA_VERSION = 4;

type T = "string" | "int" | "int?" | "bool" | "date" | "ids" | "json";

const defs = {
  Restaurant: { id: "string", nom: "string", sousTitre: "string", description: "string", adresse: "string", telephone: "string", email: "string", devise: "string", fuseauHoraire: "string", languePrincipale: "string", logoMediaId: "string", majLe: "date" },
  Horaires: { id: "string", jour: "int", ouvert: "bool", plages: "json" },
  Exceptions: { id: "string", date: "string", motif: "string", service: "string" },
  Apparence: { id: "string", theme: "string", couleurFond: "string", couleurPrimaire: "string", couleurTexte: "string", couleurBordures: "string", banniereMediaId: "string", titreAccueil: "string", texteBanniere: "string", majLe: "date" },
  Langues: { id: "string", nom: "string", principale: "bool", active: "bool", ordre: "int" },
  Traductions: { id: "string", langue: "string", cle: "string", valeur: "string" },
  Categories: { id: "string", nom: "string", description: "string", imageMediaId: "string", visible: "bool", ordre: "int", stationId: "string", creeLe: "date", majLe: "date" },
  Allergenes: { id: "string", nom: "string", ordre: "int" },
  Etiquettes: { id: "string", nom: "string", couleur: "string", icone: "string", ordre: "int" },
  Produits: { id: "string", nom: "string", description: "string", categorieId: "string", prixCentimes: "int", imageMediaId: "string", allergeneIds: "ids", etiquetteIds: "ids", groupeOptionIds: "ids", tempsPreparationMin: "int?", disponible: "bool", visible: "bool", ordre: "int", creeLe: "date", majLe: "date" },
  GroupesOptions: { id: "string", nom: "string", selection: "string", min: "int", max: "int", ordre: "int", creeLe: "date", majLe: "date" },
  Options: { id: "string", groupeId: "string", nom: "string", prixCentimes: "int", imageMediaId: "string", disponible: "bool", ordre: "int" },
  Medias: { id: "string", nom: "string", fichier: "string", miniature: "string", format: "string", largeur: "int", hauteur: "int", taille: "int", alt: "string", categorie: "string", creeLe: "date", creePar: "string", majLe: "date" },
  Utilisateurs: { id: "string", prenom: "string", nom: "string", email: "string", identifiant: "string", motDePasseHash: "string", roleId: "string", statut: "string", zoneIds: "ids", stationId: "string", jetonHash: "string", jetonType: "string", jetonExpireLe: "date", derniereConnexionLe: "date", creeLe: "date", majLe: "date" },
  Roles: { id: "string", nom: "string", systeme: "bool", portee: "string", zoneIds: "ids", ordre: "int" },
  Permissions: { id: "string", roleId: "string", permission: "string", portee: "string" },
  SessionsPersonnel: { id: "string", utilisateurId: "string", jetonHash: "string", creeLe: "date", vueLe: "date", expireLe: "date", revoqueeLe: "date", navigateur: "string", ip: "string" },
  Zones: { id: "string", nom: "string", icone: "string", ordre: "int", active: "bool" },
  Tables: { id: "string", nom: "string", zoneId: "string", capacite: "int", active: "bool", serveurId: "string", couleur: "string", qrJeton: "string", archiveeLe: "date", creeLe: "date", majLe: "date" },
  ObjetsPlan: { id: "string", zoneId: "string", type: "string", tableId: "string", libelle: "string", x: "int", y: "int", largeur: "int", hauteur: "int", rotation: "int", ordre: "int" },
  ReglesAccesTable: { id: "string", politique: "string", validiteCode: "string", wifi: "string", majLe: "date" },
  SessionsTable: { id: "string", tableId: "string", statut: "string", code: "string", ouverteLe: "date", ouvertePar: "string", fermeeLe: "date", fermeePar: "string" },
  Participants: { id: "string", sessionId: "string", pseudo: "string", jetonHash: "string", statut: "string", rejointLe: "date" },
  Paniers: { id: "string", sessionId: "string", statut: "string", version: "int", creeLe: "date", majLe: "date" },
  LignesPanier: { id: "string", panierId: "string", produitId: "string", quantite: "int", optionIds: "ids", instructions: "string", ajoutePar: "string", creeLe: "date", majLe: "date" },
  Commandes: { id: "string", sessionId: "string", tableId: "string", numero: "int", statut: "string", totalCentimes: "int", devise: "string", creeLe: "date", creePar: "string" },
  LignesCommande: { id: "string", commandeId: "string", produitId: "string", nom: "string", description: "string", prixUnitaireCentimes: "int", quantite: "int", options: "json", instructions: "string", totalCentimes: "int", stationId: "string" },
  DemandesClient: { id: "string", sessionId: "string", tableId: "string", participantId: "string", motifId: "string", libelle: "string", message: "string", statut: "string", creeLe: "date", traiteeLe: "date", traiteePar: "string" },
  DemandesAcces: { id: "string", tableId: "string", pseudo: "string", jetonHash: "string", statut: "string", origine: "string", creeLe: "date", traiteeLe: "date", traiteePar: "string", sessionId: "string", participantId: "string" },
  AdditionsTable: { id: "string", sessionId: "string", tableId: "string", statut: "string", commandesCentimes: "int", serviceCentimes: "int", totalCentimes: "int", demandeeLe: "date", demandeePar: "string", remiseLe: "date", remisePar: "string", clotureeLe: "date" },
  StationsPreparation: { id: "string", nom: "string", icone: "string", utilisateurIds: "ids", notifierServeur: "bool", ordre: "int" },
  StatutsCommande: { id: "string", nom: "string", couleur: "string", visibleClient: "bool", creation: "string", acteur: "string", ordre: "int", systeme: "bool" },
  ParametresCommandes: { id: "string", quantiteMax: "int", instructionsActives: "bool", instructionsMax: "int", confirmation: "bool", animations: "bool", pseudoActif: "bool", pseudoMode: "string", libelleBouton: "string", commandesSuccessives: "bool", arretAvantFermetureMin: "int", messageHorsHoraires: "string", annulationRole: "string", annulationMotif: "bool", annulationHistorique: "bool", majLe: "date" },
  ReglesNotifications: { id: "string", evenement: "string", destinataires: "string", ecran: "bool", son: "bool", delaiMin: "int", accuse: "bool", sonnerie: "string", actif: "bool", ordre: "int" },
  MotifsDemandes: { id: "string", libelle: "string", icone: "string", couleur: "string", actif: "bool", ordre: "int" },
  ParametresAddition: { id: "string", devise: "string", affichagePrix: "string", arrondi: "string", fraisServiceActif: "bool", fraisServiceBp: "int", partageActif: "bool", reglement: "string", majLe: "date" },
  ProfilsTaxes: { id: "string", nom: "string", tauxBp: "int?", parDefaut: "bool", statut: "string" },
  Integrations: { id: "string", type: "string", nom: "string", description: "string", statut: "string" },
  Equipements: { id: "string", nom: "string", type: "string", emplacement: "string", stationId: "string", formatTicket: "string", impressionAuto: "bool", statut: "string", creeLe: "date" },
  ParametresSecurite: { id: "string", motDePasseMin: "int", exigerLettreChiffre: "bool", exigerSpecial: "bool", inactiviteMin: "int", dureeMaxHeures: "int", tentativesMax: "int", verrouillageMin: "int", majLe: "date" },
  HistoriqueActions: { id: "string", date: "date", auteurId: "string", auteurNom: "string", action: "string", libelle: "string", entite: "string", entiteId: "string", entiteNom: "string", resultat: "string", avant: "json", apres: "json" },
  OperationsIdempotentes: { id: "string", portee: "string", resultat: "json", creeLe: "date" },
  VersionsConfiguration: { id: "string", numero: "int", statut: "string", creeLe: "date", publieeLe: "date", programmeePour: "date", auteurId: "string", auteurNom: "string", nbChangements: "int", resume: "json" },
  InstantanesVersion: { id: "string", versionId: "string", ordre: "int", fragment: "string" },
} as const satisfies Record<string, Record<string, T>>;

export type SheetName = keyof typeof defs;

/**
 * Feuilles apparues après la version 1 du schéma. Un classeur plus ancien est lu tel quel : la feuille
 * manquante est considérée comme vide, puis créée à la prochaine écriture. Aucune donnée n'est touchée.
 */
export const SHEET_SINCE: Partial<Record<SheetName, number>> = { DemandesClient: 2, AdditionsTable: 3, DemandesAcces: 4 };

/** Colonnes ajoutées après coup : absentes d'un enregistrement plus ancien, elles prennent leur valeur par défaut. */
export const COLUMN_SINCE: Partial<Record<SheetName, Record<string, number>>> = { Tables: { qrJeton: 4 } };
export const SHEETS = Object.keys(defs) as SheetName[];
export const columnsOf = (s: SheetName): Record<string, T> => defs[s];

export interface Plage {
  libelle: string;
  debut: string;
  fin: string;
}
export interface OptionFigee {
  nom: string;
  prixCentimes: number;
}
export interface ChangementResume {
  entite: string;
  nom: string;
  champ: string;
  avant: string;
  apres: string;
  impact: string;
}
interface JsonTypes {
  "Horaires.plages": Plage[];
  "LignesCommande.options": OptionFigee[];
  "HistoriqueActions.avant": Record<string, unknown> | null;
  "HistoriqueActions.apres": Record<string, unknown> | null;
  "OperationsIdempotentes.resultat": unknown;
  "VersionsConfiguration.resume": ChangementResume[];
}
type Ts<S extends string, K extends string, X> = X extends "string" | "date"
  ? string
  : X extends "int"
    ? number
    : X extends "int?"
      ? number | null
      : X extends "bool"
        ? boolean
        : X extends "ids"
          ? string[]
          : `${S}.${K}` extends keyof JsonTypes
            ? JsonTypes[`${S}.${K}`]
            : unknown;

export type Row<S extends SheetName> = { -readonly [K in keyof (typeof defs)[S] & string]: Ts<S, K, (typeof defs)[S][K]> };

export interface Meta {
  schemaVersion: number;
  revision: number;
  creeLe: string;
  majLe: string;
  donneesDemo: boolean;
}
export type Db = { [S in SheetName]: Row<S>[] } & { _meta: Meta };
export type AnyRow = { id: string } & Record<string, unknown>;

/** Colonnes jamais exposées au navigateur ni copiées dans l'historique. */
export const SENSITIVE: Partial<Record<SheetName, string[]>> = {
  Utilisateurs: ["motDePasseHash", "jetonHash"],
  SessionsPersonnel: ["jetonHash"],
  Participants: ["jetonHash"],
  DemandesAcces: ["jetonHash"],
};

type Mode = "restrict" | "nullify" | "cascade";
export interface Relation {
  sheet: SheetName;
  col: string;
  ref: SheetName;
  mode: Mode;
}
const r = (sheet: SheetName, col: string, ref: SheetName, mode: Mode): Relation => ({ sheet, col, ref, mode });

/** Relations vérifiées à chaque écriture. `mode` décrit l'effet d'une suppression de la cible. */
export const RELATIONS: Relation[] = [
  r("Restaurant", "logoMediaId", "Medias", "restrict"),
  r("Apparence", "banniereMediaId", "Medias", "restrict"),
  r("Categories", "imageMediaId", "Medias", "restrict"),
  r("Categories", "stationId", "StationsPreparation", "nullify"),
  r("Produits", "categorieId", "Categories", "restrict"),
  r("Produits", "imageMediaId", "Medias", "restrict"),
  r("Produits", "allergeneIds", "Allergenes", "nullify"),
  r("Produits", "etiquetteIds", "Etiquettes", "nullify"),
  r("Produits", "groupeOptionIds", "GroupesOptions", "nullify"),
  r("Options", "groupeId", "GroupesOptions", "cascade"),
  r("Options", "imageMediaId", "Medias", "restrict"),
  r("Utilisateurs", "roleId", "Roles", "restrict"),
  r("Utilisateurs", "zoneIds", "Zones", "nullify"),
  r("Utilisateurs", "stationId", "StationsPreparation", "nullify"),
  r("Roles", "zoneIds", "Zones", "nullify"),
  r("Permissions", "roleId", "Roles", "cascade"),
  r("SessionsPersonnel", "utilisateurId", "Utilisateurs", "cascade"),
  r("Tables", "zoneId", "Zones", "restrict"),
  r("Tables", "serveurId", "Utilisateurs", "nullify"),
  r("ObjetsPlan", "zoneId", "Zones", "cascade"),
  r("ObjetsPlan", "tableId", "Tables", "nullify"),
  r("SessionsTable", "tableId", "Tables", "restrict"),
  r("Participants", "sessionId", "SessionsTable", "cascade"),
  r("Paniers", "sessionId", "SessionsTable", "cascade"),
  r("LignesPanier", "panierId", "Paniers", "cascade"),
  r("LignesPanier", "produitId", "Produits", "cascade"),
  r("LignesCommande", "commandeId", "Commandes", "cascade"),
  r("DemandesClient", "sessionId", "SessionsTable", "cascade"),
  r("DemandesAcces", "tableId", "Tables", "cascade"),
  r("AdditionsTable", "sessionId", "SessionsTable", "cascade"),
  r("StationsPreparation", "utilisateurIds", "Utilisateurs", "nullify"),
  r("Equipements", "stationId", "StationsPreparation", "nullify"),
  r("Traductions", "langue", "Langues", "cascade"),
  r("InstantanesVersion", "versionId", "VersionsConfiguration", "cascade"),
];

/** Libellés humains (historique, publication, messages d'erreur). */
export const SHEET_LABEL: Record<SheetName, string> = {
  Restaurant: "Établissement",
  Horaires: "Horaires",
  Exceptions: "Fermeture exceptionnelle",
  Apparence: "Apparence",
  Langues: "Langue",
  Traductions: "Traduction",
  Categories: "Catégorie",
  Allergenes: "Allergène",
  Etiquettes: "Étiquette",
  Produits: "Produit",
  GroupesOptions: "Groupe d'options",
  Options: "Option",
  Medias: "Image",
  Utilisateurs: "Utilisateur",
  Roles: "Rôle",
  Permissions: "Permission",
  SessionsPersonnel: "Session du personnel",
  Zones: "Zone",
  Tables: "Table",
  ObjetsPlan: "Élément du plan",
  ReglesAccesTable: "Accès par table",
  SessionsTable: "Session de table",
  Participants: "Participant",
  Paniers: "Panier",
  LignesPanier: "Ligne de panier",
  Commandes: "Commande",
  LignesCommande: "Ligne de commande",
  DemandesClient: "Demande client",
  DemandesAcces: "Demande d'accès",
  AdditionsTable: "Addition de table",
  StationsPreparation: "Station",
  StatutsCommande: "Statut de commande",
  ParametresCommandes: "Panier partagé",
  ReglesNotifications: "Règle de notification",
  MotifsDemandes: "Motif de demande",
  ParametresAddition: "Addition",
  ProfilsTaxes: "Profil de taxe",
  Integrations: "Intégration",
  Equipements: "Équipement",
  ParametresSecurite: "Sécurité",
  HistoriqueActions: "Historique",
  OperationsIdempotentes: "Opération",
  VersionsConfiguration: "Version",
  InstantanesVersion: "Instantané",
};

export const COL_LABEL: Record<string, string> = {
  nom: "Nom", sousTitre: "Sous-titre", description: "Description", adresse: "Adresse", telephone: "Téléphone", email: "E-mail",
  devise: "Devise", fuseauHoraire: "Fuseau horaire", languePrincipale: "Langue principale", logoMediaId: "Logo", ouvert: "Ouverture",
  plages: "Plages horaires", date: "Date", motif: "Motif", service: "Service", couleurFond: "Couleur de fond", couleurPrimaire: "Couleur primaire",
  couleurTexte: "Couleur du texte", couleurBordures: "Couleur des bordures", banniereMediaId: "Image de bannière", titreAccueil: "Titre d'accueil",
  texteBanniere: "Texte de bannière", imageMediaId: "Image", visible: "Visibilité", ordre: "Ordre", stationId: "Station", categorieId: "Catégorie",
  prixCentimes: "Prix", allergeneIds: "Allergènes", etiquetteIds: "Étiquettes", groupeOptionIds: "Groupes d'options",
  tempsPreparationMin: "Temps de préparation", disponible: "Disponibilité", selection: "Sélection", min: "Minimum", max: "Maximum",
  groupeId: "Groupe", alt: "Texte alternatif", roleId: "Rôle", statut: "Statut", zoneIds: "Zones", zoneId: "Zone", capacite: "Capacité",
  active: "Activation", actif: "Activation", serveurId: "Attribution par défaut", couleur: "Couleur", politique: "Politique d'accès",
  validiteCode: "Validité du code", wifi: "Réseau du restaurant", quantiteMax: "Quantité maximale", instructionsActives: "Instructions clients",
  instructionsMax: "Longueur des instructions", confirmation: "Dialogue de confirmation", animations: "Animations", pseudoActif: "Pseudos",
  pseudoMode: "Mode des pseudos", libelleBouton: "Libellé du bouton", commandesSuccessives: "Commandes successives",
  arretAvantFermetureMin: "Arrêt des commandes", messageHorsHoraires: "Message hors horaires", evenement: "Événement",
  destinataires: "Destinataires", ecran: "Affichage écran", son: "Son", delaiMin: "Délai d'escalade", accuse: "Accusé de prise en compte",
  sonnerie: "Sonnerie", libelle: "Libellé", icone: "Icône", affichagePrix: "Affichage des prix", arrondi: "Arrondi",
  fraisServiceActif: "Frais de service", fraisServiceBp: "Taux des frais de service", partageActif: "Partage de l'addition",
  reglement: "Règlement", tauxBp: "Taux", parDefaut: "Par défaut", visibleClient: "Visible client", acteur: "Acteur autorisé",
  creation: "Création", annulationRole: "Annulation autorisée pour", annulationMotif: "Motif d'annulation", annulationHistorique: "Historique des annulations",
  prenom: "Prénom", identifiant: "Identifiant", portee: "Portée", theme: "Thème", utilisateurIds: "Équipe", notifierServeur: "Notification serveur",
  principale: "Langue principale", valeur: "Texte", type: "Type", emplacement: "Emplacement", formatTicket: "Format de ticket", impressionAuto: "Impression automatique",
  motDePasseMin: "Longueur minimale", exigerLettreChiffre: "Lettre et chiffre exigés", exigerSpecial: "Caractère spécial exigé",
  inactiviteMin: "Délai d'inactivité", dureeMaxHeures: "Durée maximale de session", tentativesMax: "Tentatives de connexion", verrouillageMin: "Durée de verrouillage",
  totalCentimes: "Total", commandesCentimes: "Total des commandes", serviceCentimes: "Frais de service", demandeeLe: "Demandée le", remiseLe: "Remise le", clotureeLe: "Clôturée le", remisePar: "Remise par",
};

/** Feuilles couvertes par la publication (comparées à l'instantané publié). */
export const PUBLISHED_SHEETS = [
  "Restaurant", "Horaires", "Exceptions", "Apparence", "Langues", "Traductions", "Categories", "Allergenes", "Etiquettes",
  "Produits", "GroupesOptions", "Options", "Medias", "Zones", "Tables", "ParametresCommandes", "ReglesNotifications",
  "MotifsDemandes", "ParametresAddition", "ProfilsTaxes", "StatutsCommande", "StationsPreparation", "ReglesAccesTable",
] as const satisfies readonly SheetName[];
export type PublishedSheet = (typeof PUBLISHED_SHEETS)[number];
export type Snapshot = { [S in PublishedSheet]: Row<S>[] };

/** Codes de permission stables. */
export const PERMISSIONS = [
  { code: "admin.acces", label: "Accéder à l'administration", aide: "Ouvre l'interface /admin." },
  { code: "restaurant.configurer", label: "Configurer le restaurant", aide: "Établissement, horaires, apparence et réglages." },
  { code: "utilisateurs.gerer", label: "Gérer les utilisateurs", aide: "Comptes, invitations, rôles et droits." },
  { code: "carte.modifier", label: "Modifier la carte", aide: "Catégories, produits, options et images." },
  { code: "salle.configurer", label: "Configurer la salle", aide: "Zones, tables, plan et supports QR." },
  { code: "tables.affecter", label: "Affecter les tables", aide: "Attribuer les tables au personnel." },
  { code: "sessions.gerer", label: "Ouvrir / fermer une session", aide: "Ouvrir et fermer les sessions de table." },
  { code: "commandes.voir", label: "Voir les commandes", aide: "Consulter les commandes envoyées." },
  { code: "preparation.changer", label: "Changer la préparation", aide: "Faire avancer une commande en cuisine." },
  { code: "commandes.servir", label: "Marquer servi", aide: "Indiquer qu'une commande est servie." },
  { code: "securite.gerer", label: "Gérer la sécurité", aide: "Règles des comptes et sessions du personnel." },
  { code: "historique.consulter", label: "Consulter l'historique", aide: "Journal des actions en lecture seule." },
  { code: "donnees.gerer", label: "Gérer les données", aide: "Imports, exports et sauvegardes." },
  { code: "publication.publier", label: "Publier la configuration", aide: "Appliquer les réglages au menu client." },
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number]["code"];
export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code) as PermissionCode[];

export const ROLE_ADMIN = "role_admin";
