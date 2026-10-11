import "server-only";
import type { ServiceOrder, ServiceState, TableActivity, TableGate, TableState } from "@/lib/table-types";
import { safeEqual, tokenHash } from "../auth/crypto";
import { ID } from "../defaults";
import { fullName, must } from "../db-utils";
import { AppError, conflit, invalide } from "../errors";
import type { Db, Row } from "../schema";
import { transaction, type Actor } from "../storage";
import { pendingSeats, qrAccepte, seatOf } from "./access";
import { BILL_MOTIF, upsertBill } from "./bill";
import { price, sessionAccess } from "./cart";
import { openingState, orderingState } from "./menu";
import { publishedSnapshot } from "./publication";

/**
 * Vue d'une table pour ses convives, et suivi du service pour le personnel.
 * Rien ici ne fait confiance au navigateur : le jeton du participant est vérifié à chaque lecture
 * et chaque montant vient de la carte publiée ou des commandes figées.
 */

const POLITIQUES = ["code_session", "validation_personnel", "acces_direct"] as const;

/** Nom affiché d'un convive : son pseudo, sinon son rang d'arrivée à la table. */
export function names(db: Db, sessionId: string): Map<string, string> {
  const out = new Map<string, string>();
  db.Participants.filter((p) => p.sessionId === sessionId)
    .sort((a, b) => a.rejointLe.localeCompare(b.rejointLe))
    .forEach((p, i) => out.set(p.id, p.pseudo || `Convive ${i + 1}`));
  return out;
}

export function thumbs(db: Db): (produitId: string) => string | null {
  const snap = publishedSnapshot(db)?.snap;
  const medias = new Map((snap?.Medias ?? []).map((m) => [m.id, m.miniature]));
  const byProduct = new Map((snap?.Produits ?? []).map((p) => [p.id, medias.get(p.imageMediaId)]));
  return (produitId) => {
    const file = byProduct.get(produitId);
    return file ? `/media/${file}` : null;
  };
}

/** Écran d'accueil d'une table : ne révèle ni code, ni panier, ni commande. */
export function tableGate(db: Db, tableId: string, jeton: string | undefined, qr?: string): TableGate | null {
  const table = db.Tables.find((t) => t.id === tableId && t.active && !t.archiveeLe);
  if (!table) return null;
  const demande = seatOf(db, tableId, jeton);
  const session = db.SessionsTable.find((s) => s.tableId === tableId && s.statut === "ouverte");
  const regle = db.ReglesAccesTable.find((r) => r.id === ID.acces)?.politique;
  const params = db.ParametresCommandes.find((p) => p.id === ID.commandes);
  const participant = jeton && session ? db.Participants.find((p) => p.sessionId === session.id && safeEqual(p.jetonHash, tokenHash(jeton))) : undefined;
  // Jeton d'une session déjà fermée de cette table : la personne voit que sa session est terminée.
  const ancien = jeton && !participant ? db.Participants.find((p) => safeEqual(p.jetonHash, tokenHash(jeton))) : undefined;
  const termine = !!ancien && db.SessionsTable.some((s) => s.id === ancien.sessionId && s.tableId === tableId && s.statut === "fermee");
  const snap = publishedSnapshot(db)?.snap;
  const banniere = snap?.Medias.find((m) => m.id === snap.Apparence[0]?.banniereMediaId);
  return {
    table: { id: table.id, nom: table.nom },
    restaurant: db.Restaurant[0]?.nom || "Oliva",
    sessionOuverte: !!session,
    politique: POLITIQUES.find((p) => p === regle) ?? "code_session",
    pseudo: !params?.pseudoActif ? "aucun" : params.pseudoMode === "obligatoire" ? "obligatoire" : "optionnel",
    enAttente: participant?.statut === "en_attente",
    demande: demande?.statut === "en_attente" ? "en_attente" : demande?.statut === "refusee" ? "refusee" : "aucune",
    prenom: demande?.pseudo ?? "",
    qrPerime: !qrAccepte(table, qr),
    termine,
    banniere: banniere ? `/media/${banniere.fichier}` : null,
  };
}

/** Le jeton donne-t-il accès à la session ouverte de cette table ? */
export function admitted(db: Db, tableId: string, jeton: string | undefined): boolean {
  if (!jeton) return false;
  try {
    return sessionAccess(db, jeton).session.tableId === tableId;
  } catch {
    return false;
  }
}

export function tableState(db: Db, jeton: string): TableState {
  const { participant, session, panier } = sessionAccess(db, jeton);
  const table = must(db, "Tables", session.tableId);
  const who = names(db, session.id);
  const thumb = thumbs(db);
  const snap = publishedSnapshot(db)?.snap;
  const resto = db.Restaurant[0];
  const params = must(db, "ParametresCommandes", ID.commandes);
  const bill = db.ParametresAddition.find((p) => p.id === ID.addition);

  const lignes = db.LignesPanier.filter((l) => l.panierId === panier?.id)
    .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
    .map((l) => {
      const p = price(db, l);
      return { id: p.id, produitId: p.produitId, nom: p.nom, image: thumb(p.produitId), quantite: p.quantite, options: p.options, instructions: p.instructions, prixUnitaireCentimes: p.prixUnitaireCentimes, totalCentimes: p.totalCentimes, ajoutePar: who.get(p.ajoutePar) ?? "", valide: p.valide };
    });

  const commandes = db.Commandes.filter((c) => c.sessionId === session.id)
    .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
    .map((c, i) => {
      const rows = db.LignesCommande.filter((l) => l.commandeId === c.id);
      return {
        id: c.id,
        rang: i + 1,
        statut: c.statut,
        creeLe: c.creeLe,
        totalCentimes: c.totalCentimes,
        articles: rows.reduce((n, l) => n + l.quantite, 0),
        lignes: rows.map((l) => ({ id: l.id, nom: l.nom, image: thumb(l.produitId), quantite: l.quantite, options: l.options ?? [], instructions: l.instructions, totalCentimes: l.totalCentimes })),
      };
    });

  const commandesCentimes = commandes.reduce((n, c) => n + c.totalCentimes, 0);
  const serviceActif = !!bill?.fraisServiceActif && bill.fraisServiceBp > 0;
  const serviceCentimes = serviceActif ? Math.round((commandesCentimes * bill.fraisServiceBp) / 10000) : 0;

  const activite: TableActivity[] = [
    ...db.Participants.filter((p) => p.sessionId === session.id && p.statut === "admis").map((p) => ({ id: `a-${p.id}`, type: "arrivee" as const, auteur: who.get(p.id) ?? "", date: p.rejointLe, objet: "", quantite: 0, montantCentimes: 0, image: null })),
    ...db.LignesPanier.filter((l) => l.panierId === panier?.id).map((l) => {
      const p = price(db, l);
      return { id: `l-${l.id}`, type: "ajout" as const, auteur: who.get(l.ajoutePar) ?? "", date: l.creeLe, objet: p.nom, quantite: l.quantite, montantCentimes: p.prixUnitaireCentimes, image: thumb(l.produitId) };
    }),
    ...commandes.map((c) => {
      const row = db.Commandes.find((x) => x.id === c.id);
      return { id: `c-${c.id}`, type: "commande" as const, auteur: who.get(row?.creePar ?? "") ?? "", date: c.creeLe, objet: String(c.rang), quantite: c.articles, montantCentimes: c.totalCentimes, image: c.lignes[0]?.image ?? null };
    }),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  // Horaires et fermetures sont pris en direct : un changement dans l'administration s'applique tout de suite.
  const etat = openingState(db.Horaires, db.Exceptions, resto?.fuseauHoraire ?? "Europe/Paris");
  // La prise de commande s'arrête avant la fermeture, selon le réglage de l'écran Horaires.
  const prise = orderingState(db.Horaires, db.Exceptions, resto?.fuseauHoraire ?? "Europe/Paris", params.arretAvantFermetureMin ?? 0);
  return {
    table: { id: table.id, nom: table.nom },
    devise: resto?.devise || "EUR",
    fuseau: resto?.fuseauHoraire || "Europe/Paris",
    convives: db.Participants.filter((p) => p.sessionId === session.id && p.statut === "admis")
      .sort((a, b) => a.rejointLe.localeCompare(b.rejointLe))
      .map((p) => ({ id: p.id, nom: who.get(p.id) ?? "", moi: p.id === participant.id })),
    panier: { version: panier?.version ?? 0, lignes, articles: lignes.reduce((n, l) => n + l.quantite, 0), totalCentimes: lignes.reduce((n, l) => n + l.totalCentimes, 0) },
    commandes,
    statuts: [...db.StatutsCommande].sort((a, b) => a.ordre - b.ordre).map((s) => ({ id: s.id, nom: s.nom })),
    addition: {
      commandesCentimes,
      service: { actif: serviceActif, pourcentage: serviceActif ? bill.fraisServiceBp / 100 : 0, montantCentimes: serviceCentimes },
      totalCentimes: commandesCentimes + serviceCentimes,
      partageActif: bill?.partageActif ?? true,
    },
    activite,
    demandes: db.DemandesClient.filter((d) => d.sessionId === session.id)
      .sort((a, b) => b.creeLe.localeCompare(a.creeLe))
      .slice(0, 10)
      .map((d) => ({ id: d.id, libelle: d.libelle, statut: d.statut === "traitee" ? ("traitee" as const) : d.statut === "en_cours" ? ("en_cours" as const) : ("en_attente" as const), creeLe: d.creeLe })),
    motifs: (snap?.MotifsDemandes ?? db.MotifsDemandes)
      .filter((m) => m.actif)
      .sort((a, b) => a.ordre - b.ordre)
      .map((m) => ({ id: m.id, libelle: m.libelle, icone: m.icone })),
    reglages: {
      libelleBouton: params.libelleBouton || "Commander maintenant",
      confirmation: params.confirmation,
      instructionsActives: params.instructionsActives,
      instructionsMax: params.instructionsMax,
      quantiteMax: params.quantiteMax,
      panierOuvert: !!panier,
      commandesOuvertes: prise.ouvert,
      messageFerme: `${params.messageHorsHoraires || "La prise de commande est fermée."}${prise.reprise ? ` Réouverture à ${prise.reprise}.` : ""}`,
    },
  };
}

/** Motif spécial, toujours proposé : demander l'addition. */
export const MOTIF_ADDITION = BILL_MOTIF;

/** Enregistre une demande d'aide pour le personnel. Une même demande ne peut pas être en attente deux fois. */
export function createRequest(jeton: string, input: { motifId: string; message?: string }) {
  return transaction({ actor: null }, (db, tx) => {
    const { participant, session } = sessionAccess(db, jeton);
    // Le motif d'addition livré par défaut et le bouton « Demander l'addition » ouvrent la même demande :
    // sans cela, une table pourrait demander deux fois son addition sous deux identifiants différents.
    const motifId = input.motifId === "mtf_addition" ? BILL_MOTIF : input.motifId;
    const motifs = publishedSnapshot(db)?.snap.MotifsDemandes ?? db.MotifsDemandes;
    const motif = motifs.find((m) => m.id === motifId && m.actif);
    const libelle = motifId === BILL_MOTIF ? "L'addition" : motif?.libelle;
    if (!libelle) throw invalide("Ce motif de demande n'est pas proposé.");
    const message = (input.message ?? "").trim();
    if (message.length > 200) throw invalide("Message trop long : 200 caractères maximum.");
    const pending = db.DemandesClient.filter((d) => d.sessionId === session.id && d.statut === "en_attente");
    if (pending.some((d) => d.motifId === motifId)) throw conflit("Cette demande est déjà transmise à notre équipe.");
    if (pending.length >= 6) throw conflit("Plusieurs demandes sont déjà en attente. Notre équipe arrive.");
    const row: Row<"DemandesClient"> = { id: tx.id("dem"), sessionId: session.id, tableId: session.tableId, participantId: participant.id, motifId, libelle, message, statut: "en_attente", creeLe: tx.now, traiteeLe: "", traiteePar: "" };
    db.DemandesClient.push(row);
    if (motifId === BILL_MOTIF) {
      const addition = upsertBill(db, session, tx.now);
      // Une addition déjà remise redevient à remettre si la table commande encore puis la redemande.
      if (addition.statut === "remise") {
        addition.statut = "a_remettre";
        addition.demandeeLe = tx.now;
        addition.remiseLe = "";
        addition.remisePar = "";
      }
      addition.demandeePar = participant.id;
    }
    tx.publish(`session:${session.id}`);
    tx.publish("service");
    return { id: row.id, libelle };
  });
}

/** Le convive quitte la table sur cet appareil : son jeton ne donne plus accès à rien. */
export function leaveSession(jeton: string) {
  return transaction({ actor: null }, (db, tx) => {
    const hash = tokenHash(jeton);
    const p = db.Participants.find((x) => safeEqual(x.jetonHash, hash));
    if (!p || p.statut === "revoque") return { ok: true };
    p.statut = "revoque";
    tx.publish(`session:${p.sessionId}`);
    return { ok: true };
  });
}

/* ------------------------------------------------------------ personnel */

/**
 * Ce qui reste à faire pour le service, toutes tables confondues.
 * Sert les pastilles de l'administration, qui voit l'ensemble de la salle.
 */
export function serviceCounts(db: Db): { commandes: number; demandes: number; arrivees: number; additions: number } {
  const ouvertes = db.SessionsTable.filter((s) => s.statut === "ouverte");
  const ids = new Set(ouvertes.map((s) => s.id));
  const dernier = [...db.StatutsCommande].sort((a, b) => a.ordre - b.ordre).at(-1)?.id ?? "servie";
  return {
    commandes: db.Commandes.filter((c) => ids.has(c.sessionId) && c.statut !== dernier).length,
    demandes: db.DemandesClient.filter((d) => ids.has(d.sessionId) && d.statut !== "traitee").length,
    arrivees: pendingSeats(db).length,
    additions: ouvertes.filter((s) => db.AdditionsTable.find((a) => a.sessionId === s.id)?.statut === "a_remettre").length,
  };
}

export function serviceState(db: Db): ServiceState {
  const tables = new Map(db.Tables.map((t) => [t.id, t.nom]));
  const open = db.SessionsTable.filter((s) => s.statut === "ouverte");
  const openIds = new Set(open.map((s) => s.id));
  const order = (c: Row<"Commandes">): ServiceOrder => ({
    id: c.id,
    numero: c.numero,
    table: tables.get(c.tableId) ?? "",
    statut: c.statut,
    creeLe: c.creeLe,
    totalCentimes: c.totalCentimes,
    devise: c.devise,
    lignes: db.LignesCommande.filter((l) => l.commandeId === c.id).map((l) => ({ nom: l.nom, quantite: l.quantite, options: l.options ?? [], instructions: l.instructions })),
  });
  const last = [...db.StatutsCommande].sort((a, b) => a.ordre - b.ordre).at(-1)?.id ?? "servie";
  const membres = new Map(db.Utilisateurs.map((u) => [u.id, fullName(u)]));
  const current = db.Commandes.filter((c) => openIds.has(c.sessionId)).sort((a, b) => a.creeLe.localeCompare(b.creeLe));
  return {
    sessions: open
      .sort((a, b) => (tables.get(a.tableId) ?? "").localeCompare(tables.get(b.tableId) ?? "", "fr", { numeric: true }))
      .map((s) => {
        const who = names(db, s.id);
        const people = db.Participants.filter((p) => p.sessionId === s.id);
        const paniers = new Set(db.Paniers.filter((p) => p.sessionId === s.id && p.statut === "ouvert").map((p) => p.id));
        return {
          id: s.id,
          table: tables.get(s.tableId) ?? "",
          code: s.code,
          ouverteLe: s.ouverteLe,
          convives: people.filter((p) => p.statut === "admis").length,
          enAttente: people.filter((p) => p.statut === "en_attente").map((p) => ({ id: p.id, nom: who.get(p.id) ?? "", rejointLe: p.rejointLe })),
          panierArticles: db.LignesPanier.filter((l) => paniers.has(l.panierId)).reduce((n, l) => n + l.quantite, 0),
        };
      }),
    commandes: current.filter((c) => c.statut !== last).map(order),
    servies: current.filter((c) => c.statut === last).map(order).reverse().slice(0, 12),
    demandes: db.DemandesClient.filter((d) => d.statut !== "traitee" && openIds.has(d.sessionId))
      .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
      .map((d) => ({
        id: d.id,
        table: tables.get(d.tableId) ?? "",
        libelle: d.libelle,
        message: d.message,
        auteur: names(db, d.sessionId).get(d.participantId) ?? "",
        statut: d.statut === "en_cours" ? ("en_cours" as const) : ("en_attente" as const),
        prisePar: d.statut === "en_cours" ? (membres.get(d.traiteePar) ?? "") : "",
        creeLe: d.creeLe,
      })),
    statuts: [...db.StatutsCommande].sort((a, b) => a.ordre - b.ordre).map((s) => ({ id: s.id, nom: s.nom, couleur: s.couleur })),
  };
}

/** Fait avancer (ou corrige) le statut d'une commande. `rights` vient des permissions du membre connecté. */
export function setOrderStatus(actor: Actor, commandeId: string, statut: string, rights: { preparer: boolean; servir: boolean }) {
  return transaction({ actor }, (db, tx) => {
    const c = must(db, "Commandes", commandeId);
    const statuts = [...db.StatutsCommande].sort((a, b) => a.ordre - b.ordre);
    const next = statuts.find((s) => s.id === statut);
    if (!next) throw invalide("Statut inconnu.");
    if (c.statut === statut) throw conflit("La commande a déjà ce statut.");
    const serving = statut === statuts.at(-1)?.id || c.statut === statuts.at(-1)?.id;
    if (serving ? !rights.servir : !rights.preparer) throw new AppError("interdit", "Votre rôle ne permet pas cette action.");
    const before = statuts.find((s) => s.id === c.statut)?.nom ?? c.statut;
    c.statut = statut;
    const table = db.Tables.find((t) => t.id === c.tableId);
    tx.log({ action: "modification", libelle: `Commande ${c.numero} : ${next.nom}`, entite: "Commandes", entiteId: c.id, entiteNom: table?.nom ?? "", resultat: "Terminé", avant: { statut: before }, apres: { statut: next.nom } });
    tx.publish(`session:${c.sessionId}`);
    tx.publish("service");
    return { id: c.id, statut };
  });
}

export function closeRequest(actor: Actor, demandeId: string) {
  return transaction({ actor }, (db, tx) => {
    const d = must(db, "DemandesClient", demandeId);
    if (d.statut === "traitee") throw conflit("Cette demande est déjà traitée.");
    d.statut = "traitee";
    d.traiteeLe = tx.now;
    d.traiteePar = actor.id;
    tx.publish(`session:${d.sessionId}`);
    tx.publish("service");
    return { id: d.id };
  });
}

/** Refuse une personne en attente de validation. */
export function refuseParticipant(actor: Actor, participantId: string) {
  return transaction({ actor }, (db, tx) => {
    const p = must(db, "Participants", participantId);
    if (p.statut !== "en_attente") throw conflit("Ce participant n'est pas en attente.");
    p.statut = "revoque";
    tx.publish(`session:${p.sessionId}`);
    tx.publish("service");
    return { id: p.id };
  });
}
