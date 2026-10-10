import "server-only";
import { z } from "zod";
import { ID } from "../../defaults";
import { must } from "../../db-utils";
import { conflit, invalide } from "../../errors";
import type { Plage } from "../../schema";
import { transaction } from "../../storage";
import { choix, collection, entier, hex, logUpdate, nom, ref, refs, singleton, txt, type Routes } from "../core";

const PERM = "restaurant.configurer" as const;
export const DEVISES = ["EUR", "USD", "GBP", "CHF", "CAD", "MAD", "TND", "DZD", "XOF"] as const;
export const LANGUES: Record<string, string> = { en: "English", es: "Español", it: "Italiano", de: "Deutsch", pt: "Português", nl: "Nederlands", ar: "العربية" };

const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure attendue au format HH:MM.");
const plage = z.object({ libelle: txt(30), debut: heure, fin: heure });
const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const reglagesRoutes: Routes = {
  ...singleton({
    path: "restaurant",
    sheet: "Restaurant",
    id: ID.restaurant,
    perm: PERM,
    schema: z.object({
      nom: nom(60),
      sousTitre: txt(80),
      description: txt(160),
      adresse: txt(200),
      telephone: z.string().trim().max(30).regex(/^[0-9+().\s-]*$/, "Numéro de téléphone invalide."),
      email: z.string().trim().max(120).regex(/^$|^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Adresse e-mail invalide."),
      devise: choix(DEVISES),
      fuseauHoraire: z.string().trim().max(60),
      languePrincipale: z.string().trim().max(5),
      logoMediaId: ref,
    }),
    check: (row) => {
      if (!validTimeZone(row.fuseauHoraire)) throw invalide("Fuseau horaire inconnu.", { fuseauHoraire: "Fuseau horaire inconnu." });
    },
  }),

  "PUT horaires": {
    perm: PERM,
    input: z.object({
      jours: z.array(z.object({ jour: entier(1, 7), ouvert: z.boolean(), plages: z.array(plage).max(4, "4 plages maximum par jour.") })).length(7),
      arretAvantFermetureMin: entier(0, 120),
      messageHorsHoraires: txt(160),
    }),
    run: (c, input: { jours: { jour: number; ouvert: boolean; plages: Plage[] }[]; arretAvantFermetureMin: number; messageHorsHoraires: string }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        for (const j of input.jours) {
          const sorted = [...j.plages].sort((a, b) => minutes(a.debut) - minutes(b.debut));
          sorted.forEach((p, i) => {
            if (p.debut === p.fin) throw invalide("Une plage horaire a la même heure de début et de fin.");
            if (i > 0 && minutes(p.debut) < minutes(sorted[i - 1].fin)) throw invalide("Deux plages horaires se chevauchent le même jour.");
          });
          if (j.ouvert && sorted.length === 0) throw invalide("Un jour ouvert doit avoir au moins une plage horaire.");
          const row = must(db, "Horaires", `jour-${j.jour}`);
          const before = structuredClone(row);
          row.ouvert = j.ouvert;
          row.plages = sorted;
          logUpdate(tx, "Horaires", before, row);
        }
        const p = must(db, "ParametresCommandes", ID.commandes);
        const before = structuredClone(p);
        p.arretAvantFermetureMin = input.arretAvantFermetureMin;
        p.messageHorsHoraires = input.messageHorsHoraires;
        if (logUpdate(tx, "ParametresCommandes", before, p)) p.majLe = tx.now;
        return { ok: true };
      }),
  },
  ...collection({
    path: "exceptions",
    sheet: "Exceptions",
    perm: PERM,
    prefix: "exc",
    required: ["date"],
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ."), motif: txt(80), service: choix(["journee", "dejeuner", "diner"]) }),
    defaults: () => ({ service: "journee" }),
    check: (row, db) => {
      if (Number.isNaN(Date.parse(row.date))) throw invalide("Cette date n'existe pas.");
      if (db.Exceptions.some((e) => e.id !== row.id && e.date === row.date && e.service === row.service)) throw conflit("Cette fermeture est déjà enregistrée.");
    },
  }),

  ...singleton({
    path: "apparence",
    sheet: "Apparence",
    id: ID.apparence,
    perm: PERM,
    schema: z.object({ couleurFond: hex, couleurPrimaire: hex, couleurTexte: hex, couleurBordures: hex, banniereMediaId: ref, titreAccueil: txt(80), texteBanniere: txt(120) }),
  }),
  "POST langues": {
    perm: PERM,
    input: z.object({ code: z.string().trim().toLowerCase() }),
    run: (c, input: { code: string }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const label = LANGUES[input.code];
        if (!label) throw invalide("Langue non prise en charge.");
        if (db.Langues.some((l) => l.id === input.code)) throw conflit("Cette langue est déjà ajoutée.");
        const row = { id: input.code, nom: label, principale: false, active: true, ordre: db.Langues.length + 1 };
        db.Langues.push(row);
        tx.log({ action: "creation", libelle: "Langue ajoutée", entite: "Langues", entiteId: row.id, entiteNom: row.nom });
        return row;
      }),
  },
  "DELETE langues/:id": {
    perm: PERM,
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const l = must(db, "Langues", c.params.id);
        if (l.principale) throw conflit("La langue principale ne peut pas être retirée.");
        db.Traductions = db.Traductions.filter((t) => t.langue !== l.id);
        db.Langues = db.Langues.filter((x) => x.id !== l.id);
        tx.log({ action: "suppression", libelle: "Langue retirée", entite: "Langues", entiteId: l.id, entiteNom: l.nom });
        return { id: l.id };
      }),
  },
  "PUT traductions/:langue": {
    perm: PERM,
    input: z.object({ textes: z.record(z.string().regex(/^(restaurant|apparence|categorie|produit|groupe|option)[:.][\w:.-]{1,80}$/), txt(500)) }),
    run: (c, input: { textes: Record<string, string> }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const l = must(db, "Langues", c.params.langue);
        if (l.principale) throw conflit("Les textes de la langue principale se modifient directement dans la carte.");
        let n = 0;
        for (const [cle, valeur] of Object.entries(input.textes)) {
          const id = `${l.id}|${cle}`;
          const existing = db.Traductions.find((t) => t.id === id);
          if (valeur === "") {
            if (existing) {
              db.Traductions = db.Traductions.filter((t) => t.id !== id);
              n++;
            }
          } else if (!existing) {
            db.Traductions.push({ id, langue: l.id, cle, valeur });
            n++;
          } else if (existing.valeur !== valeur) {
            existing.valeur = valeur;
            n++;
          }
        }
        if (n > 0) tx.log({ action: "modification", libelle: "Traductions modifiées", entite: "Langues", entiteId: l.id, entiteNom: l.nom, apres: { textes: n } });
        return { n };
      }),
  },

  /* ---------------------------------------------- commandes et service */
  ...singleton({
    path: "parametres-commandes",
    sheet: "ParametresCommandes",
    id: ID.commandes,
    perm: PERM,
    schema: z.object({
      quantiteMax: entier(1, 99),
      instructionsActives: z.boolean(),
      instructionsMax: entier(20, 500),
      confirmation: z.boolean(),
      animations: z.boolean(),
      pseudoActif: z.boolean(),
      pseudoMode: choix(["optionnel", "obligatoire"]),
      libelleBouton: nom(30),
      commandesSuccessives: z.boolean(),
      annulationRole: choix(["responsable", "administrateur"]),
      annulationMotif: z.boolean(),
      annulationHistorique: z.boolean(),
    }),
  }),
  ...collection({
    path: "statuts",
    sheet: "StatutsCommande",
    perm: PERM,
    prefix: "stt",
    ordered: true,
    required: ["nom"],
    schema: z.object({ nom: nom(30), couleur: hex, visibleClient: z.boolean(), acteur: choix(["Système", "Cuisine", "Serveur", "Responsable de salle"]) }),
    defaults: () => ({ couleur: "#5B6B7A", visibleClient: true, creation: "Manuel", acteur: "Cuisine", systeme: false }),
    canDelete: (row) => {
      if (row.systeme) throw conflit("Ce statut fait partie du cycle de base et ne peut pas être supprimé.");
    },
  }),
  ...collection({
    path: "stations",
    sheet: "StationsPreparation",
    perm: PERM,
    prefix: "sta",
    ordered: true,
    required: ["nom"],
    schema: z.object({ nom: nom(40), icone: txt(30), utilisateurIds: refs, notifierServeur: z.boolean() }),
    defaults: () => ({ icone: "fire", notifierServeur: true }),
  }),
  "PUT acheminement": {
    perm: PERM,
    input: z.object({ routes: z.record(z.string(), ref) }),
    run: (c, input: { routes: Record<string, string> }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        for (const [categorieId, stationId] of Object.entries(input.routes)) {
          const cat = must(db, "Categories", categorieId);
          if (stationId) must(db, "StationsPreparation", stationId);
          const before = structuredClone(cat);
          cat.stationId = stationId;
          if (logUpdate(tx, "Categories", before, cat)) cat.majLe = tx.now;
        }
        return { ok: true };
      }),
  },
  ...collection({
    path: "notifications",
    sheet: "ReglesNotifications",
    perm: PERM,
    prefix: "ntf",
    ordered: true,
    required: ["evenement"],
    schema: z.object({
      evenement: nom(60),
      destinataires: choix(["Station de préparation", "Serveur affecté", "Responsable de salle", "Personnel affecté", "Administrateur"]),
      ecran: z.boolean(),
      son: z.boolean(),
      delaiMin: entier(0, 60),
      accuse: z.boolean(),
      sonnerie: choix(["discret", "clochette", "alerte"]),
      actif: z.boolean(),
    }),
    defaults: () => ({ destinataires: "Serveur affecté", ecran: true, son: false, sonnerie: "discret", actif: true }),
    check: (row) => {
      if (!row.ecran && !row.son) throw invalide("Choisissez au moins un canal : écran ou son.");
    },
  }),
  ...collection({
    path: "motifs",
    sheet: "MotifsDemandes",
    perm: PERM,
    prefix: "mtf",
    ordered: true,
    required: ["libelle"],
    schema: z.object({ libelle: nom(40), icone: txt(30), couleur: hex, actif: z.boolean() }),
    defaults: () => ({ icone: "chat", couleur: "#52683F", actif: true }),
  }),

  /* ------------------------------------------------------------ addition */
  ...singleton({
    path: "addition",
    sheet: "ParametresAddition",
    id: ID.addition,
    perm: PERM,
    schema: z.object({ devise: choix(DEVISES), affichagePrix: choix(["ttc", "ht"]), arrondi: choix(["0.01", "0.05", "0.10"]), fraisServiceActif: z.boolean(), fraisServiceBp: entier(0, 3000), partageActif: z.boolean(), reglement: choix(["caisse"]) }),
  }),
  ...collection({
    path: "taxes",
    sheet: "ProfilsTaxes",
    perm: PERM,
    prefix: "tax",
    required: ["nom"],
    schema: z.object({ nom: nom(40), tauxBp: entier(0, 10000).nullable(), parDefaut: z.boolean(), statut: choix(["brouillon", "actif"]) }),
    defaults: () => ({ statut: "brouillon" }),
    check: (row, db) => {
      if (row.statut === "actif" && row.tauxBp === null) throw invalide("Renseignez un taux avant d'activer ce profil.", { tauxBp: "Taux manquant." });
      if (row.parDefaut) for (const t of db.ProfilsTaxes) if (t.id !== row.id) t.parDefaut = false;
    },
  }),

  /* ------------------------------------------------------- équipements */
  ...collection({
    path: "equipements",
    sheet: "Equipements",
    perm: PERM,
    prefix: "eqp",
    required: ["nom"],
    schema: z.object({ nom: nom(40), type: choix(["ecran_cuisine", "tablette", "imprimante"]), emplacement: txt(40), stationId: ref, formatTicket: choix(["", "58 mm", "80 mm"]) }),
    // Aucun appairage réel n'existe encore : l'état reste « À associer » et l'impression automatique désactivée.
    defaults: (_db, tx) => ({ statut: "a_associer", impressionAuto: false, creeLe: tx.now }),
  }),

  /* ----------------------------------------------------------- sécurité */
  ...singleton({
    path: "securite",
    sheet: "ParametresSecurite",
    id: ID.securite,
    perm: "securite.gerer",
    schema: z.object({
      motDePasseMin: entier(8, 64),
      exigerLettreChiffre: z.boolean(),
      exigerSpecial: z.boolean(),
      inactiviteMin: entier(5, 240),
      dureeMaxHeures: entier(1, 24),
      tentativesMax: entier(3, 20),
      verrouillageMin: entier(1, 120),
    }),
  }),
};
