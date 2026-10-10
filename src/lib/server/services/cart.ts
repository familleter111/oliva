import "server-only";
import { randomInt } from "node:crypto";
import { randomToken, safeEqual, tokenHash } from "../auth/crypto";
import { ID } from "../defaults";
import { must } from "../db-utils";
import { AppError, conflit, invalide } from "../errors";
import type { Db, OptionFigee, Row } from "../schema";
import { readDb, transaction, type Actor } from "../storage";
import { freezeBill } from "./bill";
import { openingState } from "./menu";
import { publishedSnapshot } from "./publication";

/**
 * Fondations du panier partagé par table.
 * Le serveur fait autorité sur les prix, les droits et les totaux ; chaque opération passe par
 * une transaction du stockage, donc les modifications concurrentes sont sérialisées.
 * Le parcours client (`/table/[tableId]`) et l'écran de service du personnel s'appuient sur ces services.
 */

const newCode = () => String(randomInt(0, 10000)).padStart(4, "0");

/* ------------------------------------------------- sessions (personnel) */

export function openTableSession(actor: Actor, tableId: string) {
  return transaction({ actor }, (db, tx) => {
    const table = must(db, "Tables", tableId);
    if (!table.active || table.archiveeLe) throw conflit("Cette table est désactivée : activez-la avant d'ouvrir une session.");
    if (db.SessionsTable.some((s) => s.tableId === tableId && s.statut === "ouverte")) throw conflit("Une session est déjà ouverte pour cette table.");
    const session: Row<"SessionsTable"> = { id: tx.id("stb"), tableId, statut: "ouverte", code: newCode(), ouverteLe: tx.now, ouvertePar: actor.id, fermeeLe: "", fermeePar: "" };
    db.SessionsTable.push(session);
    db.Paniers.push({ id: tx.id("pan"), sessionId: session.id, statut: "ouvert", version: 1, creeLe: tx.now, majLe: tx.now });
    tx.log({ action: "session_ouverte", libelle: "Session ouverte", entite: "Tables", entiteId: table.id, entiteNom: table.nom, resultat: "Terminé" });
    tx.publish(`table:${tableId}`);
    tx.publish("service");
    return session;
  });
}

/** Ferme la session : accès clients révoqués, panier en cours abandonné, commandes conservées. */
export function closeTableSession(actor: Actor, sessionId: string) {
  return transaction({ actor }, (db, tx) => {
    const session = must(db, "SessionsTable", sessionId);
    if (session.statut !== "ouverte") throw conflit("Cette session est déjà fermée.");
    session.statut = "fermee";
    session.fermeeLe = tx.now;
    session.fermeePar = actor.id;
    session.code = "";
    for (const p of db.Participants) if (p.sessionId === sessionId) p.statut = "revoque";
    const paniers = new Set(db.Paniers.filter((p) => p.sessionId === sessionId).map((p) => p.id));
    db.LignesPanier = db.LignesPanier.filter((l) => !paniers.has(l.panierId));
    for (const p of db.Paniers) if (paniers.has(p.id)) p.statut = "ferme";
    // Une demande encore ouverte n'a plus de destinataire : la table est partie.
    for (const d of db.DemandesClient) {
      if (d.sessionId === sessionId && d.statut !== "traitee") {
        d.statut = "traitee";
        d.traiteeLe = tx.now;
        d.traiteePar = d.traiteePar || actor.id;
      }
    }
    freezeBill(db, session, tx.now);
    const table = db.Tables.find((t) => t.id === session.tableId);
    tx.log({ action: "session_fermee", libelle: "Session fermée", entite: "Tables", entiteId: session.tableId, entiteNom: table?.nom ?? "", resultat: "Terminé" });
    tx.publish(`session:${sessionId}`);
    tx.publish(`table:${session.tableId}`);
    tx.publish("service");
    return session;
  });
}

export function renewSessionCode(actor: Actor, sessionId: string) {
  return transaction({ actor }, (db, tx) => {
    const session = must(db, "SessionsTable", sessionId);
    if (session.statut !== "ouverte") throw conflit("Cette session est fermée.");
    session.code = newCode();
    const table = db.Tables.find((t) => t.id === session.tableId);
    tx.log({ action: "session_code", libelle: "Code de session renouvelé", entite: "Tables", entiteId: session.tableId, entiteNom: table?.nom ?? "", resultat: "Terminé" });
    return session;
  });
}

/* ------------------------------------------------------ admission client */

/** L'identifiant de table ne suffit jamais : il faut le code courant, ou la validation du personnel. */
export async function joinSession(tableId: string, code: string, pseudo: string) {
  const jeton = randomToken();
  const out = await transaction({ actor: null }, (db, tx) => {
    const session = db.SessionsTable.find((s) => s.tableId === tableId && s.statut === "ouverte");
    const politique = db.ReglesAccesTable.find((r) => r.id === ID.acces)?.politique ?? "code_session";
    // Même message que la table existe ou non, pour ne rien révéler.
    const refuse = new AppError("interdit", "Accès refusé : demandez le code de session au personnel.");
    if (!session) throw refuse;
    if (politique === "code_session" && !safeEqual(session.code, code.trim())) throw refuse;
    const params = db.ParametresCommandes.find((p) => p.id === ID.commandes);
    const name = pseudo.trim().slice(0, 24);
    if (params?.pseudoActif && params.pseudoMode === "obligatoire" && !name) throw invalide("Indiquez un pseudo pour rejoindre la table.");
    if (db.Participants.filter((p) => p.sessionId === session.id && p.statut !== "revoque").length >= 30) throw conflit("Cette table a atteint le nombre maximal de participants.");
    const participant: Row<"Participants"> = { id: tx.id("par"), sessionId: session.id, pseudo: name, jetonHash: tokenHash(jeton), statut: politique === "validation_personnel" ? "en_attente" : "admis", rejointLe: tx.now };
    db.Participants.push(participant);
    tx.publish(`session:${session.id}`);
    tx.publish("service");
    return { participantId: participant.id, sessionId: session.id, statut: participant.statut };
  });
  return { ...out, jeton };
}

export function admitParticipant(actor: Actor, participantId: string) {
  return transaction({ actor }, (db, tx) => {
    const p = must(db, "Participants", participantId);
    if (p.statut !== "en_attente") throw conflit("Ce participant n'est pas en attente.");
    p.statut = "admis";
    tx.publish(`session:${p.sessionId}`);
    tx.publish("service");
    return p;
  });
}

/** Vérifie le jeton d'un convive : session ouverte et participant admis. Sert aux lectures. */
export function sessionAccess(db: Db, jeton: string) {
  const hash = tokenHash(jeton);
  const participant = db.Participants.find((p) => safeEqual(p.jetonHash, hash));
  const session = participant && db.SessionsTable.find((s) => s.id === participant.sessionId);
  if (!participant || !session || session.statut !== "ouverte" || participant.statut !== "admis") {
    throw new AppError("interdit", "Cette session de table n'est plus accessible.");
  }
  return { participant, session, panier: db.Paniers.find((p) => p.sessionId === session.id && p.statut === "ouvert") };
}

/** Comme `sessionAccess`, pour les opérations qui modifient le panier : il doit encore être ouvert. */
export function access(db: Db, jeton: string) {
  const { participant, session, panier } = sessionAccess(db, jeton);
  if (!panier) throw conflit("Le panier de cette table est fermé : la commande a déjà été envoyée.");
  return { participant, session, panier };
}

/* --------------------------------------------------------------- panier */

export interface PricedLine {
  id: string;
  produitId: string;
  nom: string;
  description: string;
  quantite: number;
  options: OptionFigee[];
  instructions: string;
  prixUnitaireCentimes: number;
  totalCentimes: number;
  stationId: string;
  ajoutePar: string;
  valide: boolean;
}

/** Recalcule une ligne à partir de la carte publiée. Le navigateur n'envoie jamais de prix. */
export function price(db: Db, line: Row<"LignesPanier">): PricedLine {
  const snap = publishedSnapshot(db)?.snap;
  const p = snap?.Produits.find((x) => x.id === line.produitId);
  const live = db.Produits.find((x) => x.id === line.produitId);
  const options = (snap?.Options ?? []).filter((o) => line.optionIds.includes(o.id));
  const unit = (p?.prixCentimes ?? 0) + options.reduce((n, o) => n + o.prixCentimes, 0);
  const cat = snap?.Categories.find((c) => c.id === p?.categorieId);
  return {
    id: line.id,
    produitId: line.produitId,
    nom: p?.nom ?? "Produit retiré",
    description: p?.description ?? "",
    quantite: line.quantite,
    options: options.map((o) => ({ nom: o.nom, prixCentimes: o.prixCentimes })),
    instructions: line.instructions,
    prixUnitaireCentimes: unit,
    totalCentimes: unit * line.quantite,
    stationId: cat?.stationId ?? "",
    ajoutePar: line.ajoutePar,
    valide: !!p && p.visible && (live?.disponible ?? false) && options.length === line.optionIds.length,
  };
}

export function cartView(db: Db, sessionId: string) {
  const panier = db.Paniers.find((p) => p.sessionId === sessionId && p.statut === "ouvert");
  const lignes = panier ? db.LignesPanier.filter((l) => l.panierId === panier.id).map((l) => price(db, l)) : [];
  const commandes = db.Commandes.filter((c) => c.sessionId === sessionId).map((c) => ({ ...c, lignes: db.LignesCommande.filter((l) => l.commandeId === c.id) }));
  return { version: panier?.version ?? 0, lignes, totalCentimes: lignes.reduce((n, l) => n + l.totalCentimes, 0), commandes };
}

export async function readCart(jeton: string) {
  const db = await readDb();
  return cartView(db, sessionAccess(db, jeton).session.id);
}

function checkSelection(db: Db, produitId: string, optionIds: string[]) {
  const snap = publishedSnapshot(db)?.snap;
  if (!snap) throw conflit("La carte n'est pas encore publiée.");
  const p = snap.Produits.find((x) => x.id === produitId);
  const live = db.Produits.find((x) => x.id === produitId);
  if (!p || !p.visible) throw invalide("Ce produit n'est pas proposé sur la carte.");
  if (!live?.disponible) throw conflit(`« ${p.nom} » n'est plus disponible pour le moment.`);
  const unique = [...new Set(optionIds)];
  for (const gid of p.groupeOptionIds) {
    const g = snap.GroupesOptions.find((x) => x.id === gid);
    if (!g) continue;
    const picked = snap.Options.filter((o) => o.groupeId === gid && unique.includes(o.id));
    if (picked.length < g.min) throw invalide(`« ${g.nom} » : choisissez au moins ${g.min} option(s).`);
    if (picked.length > g.max) throw invalide(`« ${g.nom} » : ${g.max} option(s) au maximum.`);
    for (const o of picked) if (!(db.Options.find((x) => x.id === o.id)?.disponible ?? false)) throw conflit(`L'option « ${o.nom} » n'est plus disponible.`);
  }
  const allowed = new Set(snap.Options.filter((o) => p.groupeOptionIds.includes(o.groupeId)).map((o) => o.id));
  if (unique.some((id) => !allowed.has(id))) throw invalide("Une option choisie ne correspond pas à ce produit.");
  return unique.sort();
}

function params(db: Db) {
  return must(db, "ParametresCommandes", ID.commandes);
}

function cleanInstructions(db: Db, text: string) {
  const s = params(db);
  const t = text.trim();
  if (t && !s.instructionsActives) throw invalide("Les instructions ne sont pas acceptées pour cette commande.");
  if (t.length > s.instructionsMax) throw invalide(`Instruction trop longue : ${s.instructionsMax} caractères maximum.`);
  return t;
}

export function addCartLine(jeton: string, input: { produitId: string; quantite: number; optionIds?: string[]; instructions?: string }, idempotencyKey?: string) {
  const scope = `panier.ajout:${tokenHash(jeton).slice(0, 16)}`;
  return transaction({ actor: null, idempotencyKey: idempotencyKey ? `${scope}:${idempotencyKey}` : undefined, scope }, (db, tx) => {
    const { participant, session, panier } = access(db, jeton);
    if (!Number.isInteger(input.quantite) || input.quantite < 1) throw invalide("Quantité invalide.");
    const optionIds = checkSelection(db, input.produitId, input.optionIds ?? []);
    const instructions = cleanInstructions(db, input.instructions ?? "");
    const max = params(db).quantiteMax;
    // Une sélection identique s'ajoute à la ligne existante : pas de doublon, pas de mise à jour perdue.
    const same = db.LignesPanier.find((l) => l.panierId === panier.id && l.produitId === input.produitId && l.instructions === instructions && JSON.stringify(l.optionIds) === JSON.stringify(optionIds));
    const total = db.LignesPanier.filter((l) => l.panierId === panier.id && l.produitId === input.produitId).reduce((n, l) => n + l.quantite, 0) + input.quantite;
    if (total > max) throw conflit(`Quantité maximale atteinte pour ce produit (${max}).`);
    if (same) {
      same.quantite += input.quantite;
      same.majLe = tx.now;
    } else {
      db.LignesPanier.push({ id: tx.id("lgp"), panierId: panier.id, produitId: input.produitId, quantite: input.quantite, optionIds, instructions, ajoutePar: participant.id, creeLe: tx.now, majLe: tx.now });
    }
    panier.version += 1;
    panier.majLe = tx.now;
    tx.publish(`session:${session.id}`);
    return { version: panier.version };
  });
}

/** `delta` modifie la quantité de façon relative ; zéro ou moins retire la ligne. */
export function changeCartLine(jeton: string, ligneId: string, delta: number) {
  return transaction({ actor: null }, (db, tx) => {
    const { session, panier } = access(db, jeton);
    const line = db.LignesPanier.find((l) => l.id === ligneId && l.panierId === panier.id);
    if (!line) throw conflit("Cet article n'est plus dans le panier.");
    if (!Number.isInteger(delta) || delta === 0) throw invalide("Modification invalide.");
    const next = line.quantite + delta;
    const others = db.LignesPanier.filter((l) => l.panierId === panier.id && l.produitId === line.produitId && l.id !== line.id).reduce((n, l) => n + l.quantite, 0);
    if (next + others > params(db).quantiteMax) throw conflit(`Quantité maximale atteinte pour ce produit (${params(db).quantiteMax}).`);
    if (next <= 0) db.LignesPanier = db.LignesPanier.filter((l) => l.id !== line.id);
    else {
      line.quantite = next;
      line.majLe = tx.now;
    }
    panier.version += 1;
    panier.majLe = tx.now;
    tx.publish(`session:${session.id}`);
    return { version: panier.version };
  });
}

/** Modifie ou efface l'instruction d'une ligne. Deux lignes devenues identiques sont fusionnées. */
export function setLineInstructions(jeton: string, ligneId: string, text: string) {
  return transaction({ actor: null }, (db, tx) => {
    const { session, panier } = access(db, jeton);
    const line = db.LignesPanier.find((l) => l.id === ligneId && l.panierId === panier.id);
    if (!line) throw conflit("Cet article n'est plus dans le panier.");
    const instructions = cleanInstructions(db, text);
    const twin = db.LignesPanier.find((l) => l.id !== line.id && l.panierId === panier.id && l.produitId === line.produitId && l.instructions === instructions && JSON.stringify(l.optionIds) === JSON.stringify(line.optionIds));
    if (twin) {
      twin.quantite += line.quantite;
      twin.majLe = tx.now;
      db.LignesPanier = db.LignesPanier.filter((l) => l.id !== line.id);
    } else {
      line.instructions = instructions;
      line.majLe = tx.now;
    }
    panier.version += 1;
    panier.majLe = tx.now;
    tx.publish(`session:${session.id}`);
    return { version: panier.version };
  });
}

export function removeCartLine(jeton: string, ligneId: string) {
  return transaction({ actor: null }, (db, tx) => {
    const { session, panier } = access(db, jeton);
    if (!db.LignesPanier.some((l) => l.id === ligneId && l.panierId === panier.id)) throw conflit("Cet article n'est plus dans le panier.");
    db.LignesPanier = db.LignesPanier.filter((l) => l.id !== ligneId);
    panier.version += 1;
    panier.majLe = tx.now;
    tx.publish(`session:${session.id}`);
    return { version: panier.version };
  });
}

/**
 * Confirme le panier : crée une commande figée (libellés, options, prix), retire du brouillon
 * uniquement les lignes envoyées et enregistre la clé d'idempotence, le tout dans la même écriture.
 */
export function confirmCart(jeton: string, idempotencyKey: string, ligneIds?: string[]) {
  if (!/^[\w-]{8,80}$/.test(idempotencyKey)) throw invalide("Clé d'opération invalide.");
  const scope = `panier.confirmation:${tokenHash(jeton).slice(0, 16)}`;
  return transaction({ actor: null, idempotencyKey: `${scope}:${idempotencyKey}`, scope }, (db, tx) => {
    const { participant, session, panier } = access(db, jeton);
    const snap = publishedSnapshot(db)?.snap;
    const resto = db.Restaurant[0];
    const etat = openingState(snap?.Horaires ?? [], snap?.Exceptions ?? [], resto?.fuseauHoraire ?? "Europe/Paris");
    if (etat.libelle !== "" && !etat.ouvert) throw conflit(params(db).messageHorsHoraires || "La prise de commande est fermée.");

    const all = db.LignesPanier.filter((l) => l.panierId === panier.id);
    const chosen = ligneIds ? all.filter((l) => ligneIds.includes(l.id)) : all;
    if (chosen.length === 0) throw conflit("Le panier est vide : cette commande a peut-être déjà été envoyée.");
    const priced = chosen.map((l) => price(db, l));
    const invalid = priced.find((l) => !l.valide);
    if (invalid) throw conflit(`« ${invalid.nom} » n'est plus disponible : retirez-le du panier avant d'envoyer.`);

    const commande: Row<"Commandes"> = {
      id: tx.id("cmd"),
      sessionId: session.id,
      tableId: session.tableId,
      numero: db.Commandes.reduce((m, c) => Math.max(m, c.numero), 0) + 1,
      statut: "recue",
      totalCentimes: priced.reduce((n, l) => n + l.totalCentimes, 0),
      devise: resto?.devise || "EUR",
      creeLe: tx.now,
      creePar: participant.id,
    };
    db.Commandes.push(commande);
    for (const l of priced) {
      db.LignesCommande.push({ id: tx.id("lgc"), commandeId: commande.id, produitId: l.produitId, nom: l.nom, description: l.description, prixUnitaireCentimes: l.prixUnitaireCentimes, quantite: l.quantite, options: l.options, instructions: l.instructions, totalCentimes: l.totalCentimes, stationId: l.stationId });
    }
    const sent = new Set(chosen.map((l) => l.id));
    db.LignesPanier = db.LignesPanier.filter((l) => !sent.has(l.id));
    panier.version += 1;
    panier.majLe = tx.now;
    if (!params(db).commandesSuccessives) panier.statut = "soumis";
    tx.publish(`session:${session.id}`);
    tx.publish("commandes");
    tx.publish("service");
    return { commandeId: commande.id, numero: commande.numero, totalCentimes: commande.totalCentimes, lignes: priced.length };
  });
}
