import "server-only";
import { PERMISSION_CODES, ROLE_ADMIN, SCHEMA_VERSION, SHEETS, type AnyRow, type Db, type SheetName } from "./schema";

export const ID = {
  restaurant: "restaurant",
  apparence: "apparence",
  commandes: "commandes",
  addition: "addition",
  securite: "securite",
  acces: "global",
} as const;

const ALLERGENES = ["Gluten", "Crustacés", "Œufs", "Poissons", "Arachides", "Soja", "Lait", "Fruits à coque", "Céleri", "Moutarde", "Sésame", "Sulfites", "Lupin", "Mollusques"];

/**
 * Contenu d'un classeur neuf : structure, rôles, réglages par défaut et référentiels.
 * Aucun compte ni mot de passe : le premier administrateur est créé par `npm run admin:init`.
 */
export function initialDb(now: string): Db {
  const db = { _meta: { schemaVersion: SCHEMA_VERSION, revision: 0, creeLe: now, majLe: now, donneesDemo: false } } as Db;
  for (const s of SHEETS) (db as unknown as Record<SheetName, AnyRow[]>)[s] = [];

  db.Restaurant.push({ id: ID.restaurant, nom: "Oliva", sousTitre: "", description: "", adresse: "", telephone: "", email: "", devise: "EUR", fuseauHoraire: "Europe/Paris", languePrincipale: "fr", logoMediaId: "", majLe: now });
  for (let jour = 1; jour <= 7; jour++) db.Horaires.push({ id: `jour-${jour}`, jour, ouvert: false, plages: [] });
  db.Apparence.push({ id: ID.apparence, theme: "oliva-clair", couleurFond: "#F8F9F5", couleurPrimaire: "#52683F", couleurTexte: "#263D30", couleurBordures: "#E7EBE3", banniereMediaId: "", titreAccueil: "", texteBanniere: "", majLe: now });
  db.Langues.push({ id: "fr", nom: "Français", principale: true, active: true, ordre: 1 });

  ALLERGENES.forEach((nom, i) => db.Allergenes.push({ id: `alg_${String(i + 1).padStart(2, "0")}`, nom, ordre: i + 1 }));
  [
    ["etq_vegetarien", "Végétarien", "#52683F", "leaf"],
    ["etq_vegan", "Végan", "#3F7A5A", "plant"],
    ["etq_epice", "Épicé", "#B42318", "pepper"],
    ["etq_maison", "Fait maison", "#8A5A0B", "cooking-pot"],
  ].forEach(([id, nom, couleur, icone], i) => db.Etiquettes.push({ id, nom, couleur, icone, ordre: i + 1 }));

  db.Roles.push(
    { id: ROLE_ADMIN, nom: "Administrateur", systeme: true, portee: "toutes", zoneIds: [], ordre: 1 },
    { id: "role_responsable", nom: "Responsable de salle", systeme: false, portee: "toutes", zoneIds: [], ordre: 2 },
    { id: "role_serveur", nom: "Serveur", systeme: false, portee: "tables_affectees", zoneIds: [], ordre: 3 },
    { id: "role_cuisine", nom: "Cuisine", systeme: false, portee: "station", zoneIds: [], ordre: 4 },
  );
  const grant = (roleId: string, permission: string, portee = "toutes") => db.Permissions.push({ id: `${roleId}:${permission}`, roleId, permission, portee });
  PERMISSION_CODES.forEach((p) => grant(ROLE_ADMIN, p));
  ["tables.affecter", "sessions.gerer", "commandes.voir", "commandes.servir"].forEach((p) => grant("role_responsable", p));
  grant("role_serveur", "sessions.gerer", "selon_autorisation");
  grant("role_serveur", "commandes.voir", "mes_tables");
  grant("role_serveur", "commandes.servir", "mes_tables");
  grant("role_cuisine", "commandes.voir", "ma_station");
  grant("role_cuisine", "preparation.changer", "ma_station");

  db.StatutsCommande.push(
    { id: "recue", nom: "Reçue", couleur: "#5B6B7A", visibleClient: false, creation: "Automatique après validation", acteur: "Système", ordre: 1, systeme: true },
    { id: "preparation", nom: "En préparation", couleur: "#D99A2B", visibleClient: true, creation: "Manuel ou automatique", acteur: "Cuisine", ordre: 2, systeme: true },
    { id: "prete", nom: "Prête", couleur: "#5E9B4B", visibleClient: true, creation: "Manuel", acteur: "Cuisine", ordre: 3, systeme: true },
    { id: "servie", nom: "Servie", couleur: "#46603A", visibleClient: true, creation: "Manuel", acteur: "Serveur", ordre: 4, systeme: true },
  );
  db.ParametresCommandes.push({ id: ID.commandes, quantiteMax: 20, instructionsActives: true, instructionsMax: 200, confirmation: true, animations: true, pseudoActif: true, pseudoMode: "optionnel", libelleBouton: "Commander maintenant", commandesSuccessives: true, arretAvantFermetureMin: 15, messageHorsHoraires: "La prise de commande est momentanément fermée.", annulationRole: "responsable", annulationMotif: true, annulationHistorique: true, majLe: now });

  const regle = (id: string, evenement: string, destinataires: string, son: boolean, delaiMin: number, ordre: number) =>
    db.ReglesNotifications.push({ id, evenement, destinataires, ecran: true, son, delaiMin, accuse: evenement === "Appel client" || evenement === "Demande non prise en charge", sonnerie: "discret", actif: true, ordre });
  regle("ntf_commande", "Commande reçue", "Station de préparation", true, 0, 1);
  regle("ntf_pret", "Plat prêt", "Serveur affecté", true, 0, 2);
  regle("ntf_appel", "Appel client", "Serveur affecté", false, 3, 3);
  regle("ntf_escalade", "Demande non prise en charge", "Responsable de salle", true, 3, 4);
  regle("ntf_session", "Session fermée", "Personnel affecté", false, 0, 5);

  [
    ["mtf_eau", "De l'eau", "drop", "#3B82C4"],
    ["mtf_serveur", "Commander avec un serveur", "fork-knife", "#D9822B"],
    ["mtf_addition", "L'addition", "receipt", "#3F8F5F"],
    ["mtf_autre", "Autre demande", "dots", "#8A4FB0"],
  ].forEach(([id, libelle, icone, couleur], i) => db.MotifsDemandes.push({ id, libelle, icone, couleur, actif: true, ordre: i + 1 }));

  db.ParametresAddition.push({ id: ID.addition, devise: "EUR", affichagePrix: "ttc", arrondi: "0.01", fraisServiceActif: false, fraisServiceBp: 0, partageActif: true, reglement: "caisse", majLe: now });
  db.ParametresSecurite.push({ id: ID.securite, motDePasseMin: 10, exigerLettreChiffre: true, exigerSpecial: false, inactiviteMin: 30, dureeMaxHeures: 8, tentativesMax: 5, verrouillageMin: 15, majLe: now });
  db.ReglesAccesTable.push({ id: ID.acces, politique: "code_session", validiteCode: "session", wifi: "", majLe: now });

  db.Integrations.push(
    { id: "int_caisse", type: "caisse", nom: "Caisse du restaurant", description: "Synchroniser les ventes, les produits et les additions avec votre caisse.", statut: "non_configure" },
    { id: "int_paiement", type: "paiement", nom: "Paiement en ligne", description: "Encaisser les commandes passées depuis les QR codes.", statut: "non_configure" },
    { id: "int_email", type: "email", nom: "Envoi d'e-mails", description: "Envoyer les invitations et les liens de réinitialisation par e-mail.", statut: "non_configure" },
  );
  return db;
}
