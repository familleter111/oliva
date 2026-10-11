import "server-only";
import type { BillStatus, SalleBill, SalleCounts, SalleHome, SalleLine, SalleOrder, SallePriority, SalleRequest, SalleServe, SalleTableCard, SalleTableDetail } from "@/lib/salle-types";
import type { Auth } from "../auth/resolve";
import { fullName, must } from "../db-utils";
import { AppError, conflit, introuvable } from "../errors";
import type { Db, Row } from "../schema";
import { transaction } from "../storage";
import { BILL_MOTIF, billTotals, upsertBill } from "./bill";
import { closeTableSession } from "./cart";
import { names, setOrderStatus, thumbs } from "./table";
import { pendingSeats, type SeatRequest } from "./access";

/**
 * Espace serveur : ce qu'un membre de salle voit et peut faire pendant le service.
 *
 * Deux règles tiennent tout l'écran :
 *   - la portée du rôle décide des tables visibles, et elle est recalculée sur le serveur à chaque lecture
 *     comme à chaque écriture : un identifiant de table dans une URL ne donne jamais accès à la table ;
 *   - aucun montant ne vient du navigateur, tout est relu des commandes figées et des réglages d'addition.
 */

/* ------------------------------------------------------------ portée */

export interface Scope {
  /** Vrai pour un rôle de portée « toutes » : responsable de salle, administrateur. */
  toutes: boolean;
  ids: Set<string>;
}

/** Tables accessibles au membre connecté. Un rôle « tables affectées » ne voit que les siennes. */
/** Arrivées à confirmer sur les tables de la personne connectée. */
export function seatsOf(db: Db, auth: Auth): SeatRequest[] {
  return pendingSeats(db, scopeOf(db, auth).ids);
}

export function scopeOf(db: Db, auth: Auth): Scope {
  const vivantes = db.Tables.filter((t) => !t.archiveeLe);
  if (auth.role.portee === "toutes") return { toutes: true, ids: new Set(vivantes.map((t) => t.id)) };
  return { toutes: false, ids: new Set(vivantes.filter((t) => t.serveurId === auth.user.id).map((t) => t.id)) };
}

function assertTable(scope: Scope, tableId: string): void {
  if (!scope.ids.has(tableId)) throw introuvable("Cette table ne fait pas partie de votre service.");
}

/* ------------------------------------------------------------ lectures */

export const sortedStatuses = (db: Db) => [...db.StatutsCommande].sort((a, b) => a.ordre - b.ordre);

export function orderBuilder(db: Db) {
  const statuts = sortedStatuses(db);
  const last = statuts.at(-1)?.id ?? "servie";
  const ready = statuts.at(-2)?.id ?? "prete";
  const tables = new Map(db.Tables.map((t) => [t.id, t.nom]));
  const thumb = thumbs(db);
  const rangs = new Map<string, number>();
  for (const s of db.SessionsTable) {
    db.Commandes.filter((c) => c.sessionId === s.id)
      .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
      .forEach((c, i) => rangs.set(c.id, i + 1));
  }
  return (c: Row<"Commandes">): SalleOrder => {
    const st = statuts.find((s) => s.id === c.statut);
    const rang = statuts.findIndex((s) => s.id === c.statut);
    const suivant = rang < 0 ? undefined : statuts[rang + 1];
    const lignes: SalleLine[] = db.LignesCommande.filter((l) => l.commandeId === c.id).map((l) => ({
      id: l.id,
      nom: l.nom,
      description: l.description,
      image: thumb(l.produitId),
      quantite: l.quantite,
      options: l.options ?? [],
      instructions: l.instructions,
      totalCentimes: l.totalCentimes,
    }));
    return {
      id: c.id,
      sessionId: c.sessionId,
      tableId: c.tableId,
      table: tables.get(c.tableId) ?? "",
      rang: rangs.get(c.id) ?? 1,
      numero: c.numero,
      statut: c.statut,
      statutNom: st?.nom ?? c.statut,
      couleur: st?.couleur ?? "#5B6B7A",
      prete: c.statut === ready,
      servie: c.statut === last,
      suivant: suivant ? { id: suivant.id, nom: suivant.nom, dernier: suivant.id === last } : null,
      creeLe: c.creeLe,
      articles: lignes.reduce((n, l) => n + l.quantite, 0),
      totalCentimes: c.totalCentimes,
      devise: c.devise,
      lignes,
      notes: lignes.filter((l) => l.instructions).map((l) => ({ nom: l.nom, texte: l.instructions })),
    };
  };
}

export function requestBuilder(db: Db, auth: Auth) {
  const tables = new Map(db.Tables.map((t) => [t.id, t.nom]));
  const icones = new Map(db.MotifsDemandes.map((m) => [m.id, m.icone]));
  const membres = new Map(db.Utilisateurs.map((u) => [u.id, fullName(u)]));
  return (d: Row<"DemandesClient">): SalleRequest => ({
    id: d.id,
    sessionId: d.sessionId,
    tableId: d.tableId,
    table: tables.get(d.tableId) ?? "",
    libelle: d.libelle,
    icone: d.motifId === BILL_MOTIF ? "receipt" : (icones.get(d.motifId) ?? "chat"),
    message: d.message,
    auteur: names(db, d.sessionId).get(d.participantId) ?? "",
    statut: d.statut === "traitee" ? "traitee" : d.statut === "en_cours" ? "en_cours" : "en_attente",
    creeLe: d.creeLe,
    traiteeLe: d.traiteeLe,
    prisePar: d.statut === "en_attente" ? "" : (membres.get(d.traiteePar) ?? ""),
    parMoi: d.statut !== "en_attente" && d.traiteePar === auth.user.id,
    addition: d.motifId === BILL_MOTIF,
  });
}

/** Addition d'une session : recalculée tant que la session est ouverte, relue telle quelle une fois figée. */
export function billOf(db: Db, session: Row<"SessionsTable">): SalleBill {
  const table = db.Tables.find((t) => t.id === session.tableId);
  const row = db.AdditionsTable.find((a) => a.sessionId === session.id);
  const commandes = db.Commandes.filter((c) => c.sessionId === session.id).sort((a, b) => a.creeLe.localeCompare(b.creeLe));
  const vivant = billTotals(db, session.id);
  // Une session fermée affiche les montants figés à sa clôture, pas un recalcul.
  const figee = session.statut === "fermee" && !!row && row.statut === "cloturee";
  const commandesCentimes = figee ? row.commandesCentimes : vivant.commandesCentimes;
  const serviceCentimes = figee ? row.serviceCentimes : vivant.serviceCentimes;
  const thumb = thumbs(db);
  const lignes = commandes.flatMap((c) => db.LignesCommande.filter((l) => l.commandeId === c.id));
  const membres = new Map(db.Utilisateurs.map((u) => [u.id, fullName(u)]));
  const statut: BillStatus = session.statut === "fermee" ? "cloturee" : row?.statut === "remise" ? "remise" : "a_remettre";
  return {
    sessionId: session.id,
    tableId: session.tableId,
    table: table?.nom ?? "",
    statut,
    convives: db.Participants.filter((p) => p.sessionId === session.id && p.statut === "admis").length,
    nbCommandes: commandes.length,
    commandesCentimes,
    serviceCentimes,
    servicePourcentage: vivant.pourcentage,
    totalCentimes: commandesCentimes + serviceCentimes,
    devise: commandes[0]?.devise || db.Restaurant[0]?.devise || "EUR",
    demandeeLe: row?.demandeeLe ?? "",
    remiseLe: row?.remiseLe ?? "",
    remisePar: row?.remisePar ? (membres.get(row.remisePar) ?? "") : "",
    clotureeLe: row?.clotureeLe || session.fermeeLe,
    apercu: lignes.slice(0, 3).map((l) => ({ nom: l.nom, quantite: l.quantite })),
    autres: Math.max(0, lignes.length - 3),
    image: lignes.map((l) => thumb(l.produitId)).find(Boolean) ?? null,
  };
}

/** Compteurs des pastilles de navigation. */
export function countsOf(db: Db, auth: Auth): SalleCounts {
  const scope = scopeOf(db, auth);
  const ouvertes = db.SessionsTable.filter((s) => s.statut === "ouverte" && scope.ids.has(s.tableId));
  const ids = new Set(ouvertes.map((s) => s.id));
  const ready = sortedStatuses(db).at(-2)?.id ?? "prete";
  return {
    aServir: db.Commandes.filter((c) => ids.has(c.sessionId) && c.statut === ready).length,
    demandes: db.DemandesClient.filter((d) => ids.has(d.sessionId) && d.statut !== "traitee").length,
    additions: ouvertes.filter((s) => db.AdditionsTable.find((a) => a.sessionId === s.id)?.statut === "a_remettre").length,
    arrivees: pendingSeats(db, scope.ids).length,
  };
}

export function homeOf(db: Db, auth: Auth): SalleHome {
  const scope = scopeOf(db, auth);
  const order = orderBuilder(db);
  const statuts = sortedStatuses(db);
  const ready = statuts.at(-2)?.id ?? "prete";
  const last = statuts.at(-1)?.id ?? "servie";
  const zones = new Map(db.Zones.map((z) => [z.id, z.nom]));

  const enAttente = pendingSeats(db, scope.ids);
  const arriveesParTable = new Map<string, number>();
  for (const a of enAttente) arriveesParTable.set(a.tableId, (arriveesParTable.get(a.tableId) ?? 0) + 1);

  const cartes: SalleTableCard[] = db.Tables.filter((t) => scope.ids.has(t.id))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }))
    .map((t) => {
      const session = db.SessionsTable.find((s) => s.tableId === t.id && s.statut === "ouverte");
      const commandes = session ? db.Commandes.filter((c) => c.sessionId === session.id) : [];
      const pretes = commandes.filter((c) => c.statut === ready).length;
      const enCours = commandes.filter((c) => c.statut !== ready && c.statut !== last).length;
      const addition = session ? db.AdditionsTable.find((a) => a.sessionId === session.id) : undefined;
      const additionStatut = session ? ((addition?.statut as BillStatus | undefined) ?? null) : null;
      const demandes = session ? db.DemandesClient.filter((d) => d.sessionId === session.id && d.statut !== "traitee").length : 0;
      const arrivees = arriveesParTable.get(t.id) ?? 0;
      return {
        id: t.id,
        nom: t.nom,
        zone: zones.get(t.zoneId) ?? "",
        capacite: t.capacite,
        couleur: t.couleur,
        sessionId: session?.id ?? "",
        convives: session ? db.Participants.filter((p) => p.sessionId === session.id && p.statut === "admis").length : 0,
        // Du plus pressant au plus calme : quelqu'un attend debout avant tout le reste.
        etat: arrivees > 0 ? "arrivee" : !session ? "libre" : pretes > 0 ? "prete" : additionStatut === "a_remettre" ? "addition" : "en_cours",
        pretes,
        enCours,
        demandes,
        arrivees,
        aFaire: arrivees + pretes + demandes + (additionStatut === "a_remettre" ? 1 : 0),
        additionStatut,
      };
    });

  const ouvertes = db.SessionsTable.filter((s) => s.statut === "ouverte" && scope.ids.has(s.tableId));
  const ids = new Set(ouvertes.map((s) => s.id));
  const aServir = db.Commandes.filter((c) => ids.has(c.sessionId) && c.statut === ready)
    .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
    .map(order);
  const toRequest = requestBuilder(db, auth);
  const demandes = db.DemandesClient.filter((d) => ids.has(d.sessionId) && d.statut !== "traitee")
    .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
    .map(toRequest);
  const additions = ouvertes.map((s) => billOf(db, s)).filter((b) => b.statut === "a_remettre" && b.nbCommandes > 0);

  const priorites: SallePriority[] = [
    ...enAttente.map((a) => ({ id: `arr-${a.id}`, type: "arrivee" as const, table: a.table, texte: `${a.pseudo || "Un convive"} attend d'être installé.`, action: "Installer", href: `/salle/tables/${a.tableId}`, image: null })),
    ...aServir.map((o) => ({ id: `cmd-${o.id}`, type: "servir" as const, table: o.table, texte: `Servir la commande ${String(o.rang).padStart(2, "0")}.`, action: "Servir", href: `/salle/servir/${o.id}`, image: o.lignes[0]?.image ?? null })),
    ...additions.map((b) => ({ id: `add-${b.sessionId}`, type: "addition" as const, table: b.table, texte: "Apporter l'addition.", action: "Apporter", href: `/salle/additions/${b.sessionId}`, image: b.image })),
    ...demandes.filter((d) => !d.addition && d.statut === "en_attente").map((d) => ({ id: `dem-${d.id}`, type: "demande" as const, table: d.table, texte: `${d.libelle} : prendre en charge.`, action: "Traiter", href: `/salle/demandes/${d.id}`, image: null })),
  ].slice(0, 6);

  return {
    membre: auth.user.prenom || fullName(auth.user),
    toutesLesTables: scope.toutes,
    stats: { tables: cartes.length, pretes: aServir.length, demandes: demandes.length },
    tables: cartes,
    priorites,
  };
}

export function tableDetail(db: Db, auth: Auth, tableId: string): SalleTableDetail {
  assertTable(scopeOf(db, auth), tableId);
  const table = must(db, "Tables", tableId);
  const derniere = db.SessionsTable.filter((s) => s.tableId === tableId).sort((a, b) => b.ouverteLe.localeCompare(a.ouverteLe))[0];
  const session = derniere?.statut === "ouverte" ? derniere : undefined;
  const order = orderBuilder(db);
  const toRequest = requestBuilder(db, auth);
  return {
    table: { id: table.id, nom: table.nom, zone: db.Zones.find((z) => z.id === table.zoneId)?.nom ?? "", capacite: table.capacite },
    sessionId: session?.id ?? "",
    sessionOuverte: !!session,
    ouverteLe: session?.ouverteLe ?? "",
    convives: session ? db.Participants.filter((p) => p.sessionId === session.id && p.statut === "admis").length : 0,
    commandes: session ? db.Commandes.filter((c) => c.sessionId === session.id).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(order) : [],
    demandes: session ? db.DemandesClient.filter((d) => d.sessionId === session.id && d.statut !== "traitee").sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(toRequest) : [],
    addition: session && db.Commandes.some((c) => c.sessionId === session.id) ? billOf(db, session) : null,
  };
}

export function serveList(db: Db, auth: Auth): SalleServe {
  const scope = scopeOf(db, auth);
  const ids = new Set(db.SessionsTable.filter((s) => s.statut === "ouverte" && scope.ids.has(s.tableId)).map((s) => s.id));
  const order = orderBuilder(db);
  const statuts = sortedStatuses(db);
  const ready = statuts.at(-2)?.id ?? "prete";
  const last = statuts.at(-1)?.id ?? "servie";
  const miennes = db.Commandes.filter((c) => ids.has(c.sessionId));
  return {
    aServir: miennes.filter((c) => c.statut === ready).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(order),
    servies: miennes.filter((c) => c.statut === last).sort((a, b) => b.creeLe.localeCompare(a.creeLe)).slice(0, 20).map(order),
  };
}

export function orderDetail(db: Db, auth: Auth, commandeId: string): { commande: SalleOrder; autres: SalleOrder[] } {
  const row = db.Commandes.find((c) => c.id === commandeId);
  if (!row) throw introuvable("Cette commande n'existe pas.");
  assertTable(scopeOf(db, auth), row.tableId);
  const order = orderBuilder(db);
  return {
    commande: order(row),
    autres: db.Commandes.filter((c) => c.sessionId === row.sessionId && c.id !== row.id).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(order),
  };
}

export function requestList(db: Db, auth: Auth): SalleRequest[] {
  const scope = scopeOf(db, auth);
  const toRequest = requestBuilder(db, auth);
  return db.DemandesClient.filter((d) => scope.ids.has(d.tableId))
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe))
    .slice(0, 120)
    .map(toRequest);
}

export function requestDetail(db: Db, auth: Auth, demandeId: string): SalleRequest {
  const d = db.DemandesClient.find((x) => x.id === demandeId);
  if (!d) throw introuvable("Cette demande n'existe pas.");
  assertTable(scopeOf(db, auth), d.tableId);
  return requestBuilder(db, auth)(d);
}

export function billList(db: Db, auth: Auth): SalleBill[] {
  const scope = scopeOf(db, auth);
  // Une session sans commande n'a pas d'addition : il n'y a rien à remettre.
  return db.SessionsTable.filter((s) => scope.ids.has(s.tableId) && db.Commandes.some((c) => c.sessionId === s.id))
    .map((s) => billOf(db, s))
    .sort((a, b) => (b.clotureeLe || b.remiseLe || b.demandeeLe).localeCompare(a.clotureeLe || a.remiseLe || a.demandeeLe))
    .slice(0, 120);
}

export function billDetail(db: Db, auth: Auth, sessionId: string): { addition: SalleBill; commandes: SalleOrder[]; demande: SalleRequest | null } {
  const session = db.SessionsTable.find((s) => s.id === sessionId);
  if (!session) throw introuvable("Cette session n'existe pas.");
  assertTable(scopeOf(db, auth), session.tableId);
  const order = orderBuilder(db);
  const attente = db.DemandesClient.find((d) => d.sessionId === session.id && d.motifId === BILL_MOTIF && d.statut !== "traitee");
  return {
    addition: billOf(db, session),
    commandes: db.Commandes.filter((c) => c.sessionId === session.id).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(order),
    demande: attente ? requestBuilder(db, auth)(attente) : null,
  };
}

/* ------------------------------------------------------------ écritures */

/**
 * Fait avancer une commande d'une étape depuis l'espace serveur. Les droits sont ceux du membre,
 * exactement comme sur l'écran de service, et la table doit faire partie de son service.
 */
export function advanceOrder(auth: Auth, commandeId: string, statut: string) {
  return setOrderStatus(auth.actor, commandeId, statut, { preparer: auth.can("preparation.changer"), servir: auth.can("commandes.servir") }, (db, commande) =>
    assertTable(scopeOf(db, auth), commande.tableId),
  );
}

/** Le membre a apporté la commande à la table : elle passe au dernier statut. */
export function markServed(auth: Auth, commandeId: string) {
  return transaction({ actor: auth.actor }, (db, tx) => {
    if (!auth.can("commandes.servir")) throw new AppError("interdit", "Votre rôle ne permet pas de marquer une commande servie.");
    const c = must(db, "Commandes", commandeId);
    assertTable(scopeOf(db, auth), c.tableId);
    const statuts = sortedStatuses(db);
    const dernier = statuts.at(-1);
    if (!dernier) throw conflit("Aucun statut de commande n'est configuré.");
    if (c.statut === dernier.id) throw conflit("Cette commande est déjà servie.");
    const avant = statuts.find((s) => s.id === c.statut)?.nom ?? c.statut;
    c.statut = dernier.id;
    const table = db.Tables.find((t) => t.id === c.tableId);
    tx.log({ action: "modification", libelle: `Commande ${c.numero} : ${dernier.nom}`, entite: "Commandes", entiteId: c.id, entiteNom: table?.nom ?? "", resultat: "Terminé", avant: { statut: avant }, apres: { statut: dernier.nom } });
    tx.publish(`session:${c.sessionId}`);
    tx.publish("service");
    return { id: c.id, statut: c.statut };
  });
}

/** Prise en charge d'une demande : la table voit aussitôt que quelqu'un arrive. */
export function takeRequest(auth: Auth, demandeId: string) {
  return transaction({ actor: auth.actor }, (db, tx) => {
    const d = must(db, "DemandesClient", demandeId);
    assertTable(scopeOf(db, auth), d.tableId);
    if (d.statut === "traitee") throw conflit("Cette demande est déjà traitée.");
    if (d.statut === "en_cours") throw conflit("Cette demande est déjà prise en charge.");
    d.statut = "en_cours";
    d.traiteePar = auth.user.id;
    const table = db.Tables.find((t) => t.id === d.tableId);
    tx.log({ action: "modification", libelle: `Demande prise en charge : ${d.libelle}`, entite: "DemandesClient", entiteId: d.id, entiteNom: table?.nom ?? "", resultat: "Terminé" });
    tx.publish(`session:${d.sessionId}`);
    tx.publish("service");
    return { id: d.id, statut: d.statut };
  });
}

/** Demande terminée. Un membre peut clore une demande qu'il n'avait pas prise en charge. */
export function finishRequest(auth: Auth, demandeId: string) {
  return transaction({ actor: auth.actor }, (db, tx) => {
    const d = must(db, "DemandesClient", demandeId);
    assertTable(scopeOf(db, auth), d.tableId);
    if (d.statut === "traitee") throw conflit("Cette demande est déjà traitée.");
    d.statut = "traitee";
    d.traiteeLe = tx.now;
    d.traiteePar = auth.user.id;
    const table = db.Tables.find((t) => t.id === d.tableId);
    tx.log({ action: "modification", libelle: `Demande traitée : ${d.libelle}`, entite: "DemandesClient", entiteId: d.id, entiteNom: table?.nom ?? "", resultat: "Terminé" });
    tx.publish(`session:${d.sessionId}`);
    tx.publish("service");
    return { id: d.id, statut: d.statut };
  });
}

/**
 * L'addition a été apportée à la table. Cette action n'enregistre aucun encaissement :
 * le règlement reste traité par l'organisation du restaurant, en dehors de l'application.
 */
/**
 * Libère une table : le serveur déclare que les convives sont partis.
 * Même effet qu'une clôture par le responsable, limité aux tables de son service.
 */
export function releaseTable(auth: Auth, sessionId: string) {
  if (!auth.can("commandes.servir")) throw new AppError("interdit", "Votre rôle ne permet pas de libérer une table.");
  return closeTableSession(auth.actor, sessionId, (db, session) => assertTable(scopeOf(db, auth), session.tableId));
}

export function deliverBill(auth: Auth, sessionId: string) {
  return transaction({ actor: auth.actor }, (db, tx) => {
    if (!auth.can("commandes.servir")) throw new AppError("interdit", "Votre rôle ne permet pas de remettre une addition.");
    const session = must(db, "SessionsTable", sessionId);
    assertTable(scopeOf(db, auth), session.tableId);
    if (session.statut !== "ouverte") throw conflit("Cette session est fermée : son addition est déjà clôturée.");
    if (!db.Commandes.some((c) => c.sessionId === session.id)) throw conflit("Cette table n'a envoyé aucune commande.");
    const row = upsertBill(db, session, tx.now);
    if (row.statut === "remise") throw conflit("Cette addition a déjà été remise.");
    const total = billOf(db, session);
    row.statut = "remise";
    row.remiseLe = tx.now;
    row.remisePar = auth.user.id;
    row.commandesCentimes = total.commandesCentimes;
    row.serviceCentimes = total.serviceCentimes;
    row.totalCentimes = total.totalCentimes;
    // Les demandes d'addition encore ouvertes sont closes : la table a reçu ce qu'elle attendait.
    for (const d of db.DemandesClient) {
      if (d.sessionId === session.id && d.motifId === BILL_MOTIF && d.statut !== "traitee") {
        d.statut = "traitee";
        d.traiteeLe = tx.now;
        d.traiteePar = auth.user.id;
      }
    }
    const table = db.Tables.find((t) => t.id === session.tableId);
    tx.log({ action: "addition_remise", libelle: "Addition remise", entite: "Tables", entiteId: session.tableId, entiteNom: table?.nom ?? "", resultat: "Terminé", apres: { totalCentimes: row.totalCentimes } });
    tx.publish(`session:${session.id}`);
    tx.publish("service");
    return { sessionId: session.id, statut: row.statut };
  });
}
