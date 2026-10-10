import "server-only";
import { randomInt } from "node:crypto";
import { randomToken, safeEqual, tokenHash } from "../auth/crypto";
import { ID } from "../defaults";
import { must } from "../db-utils";
import { conflit, introuvable, invalide } from "../errors";
import type { Db, Row } from "../schema";
import { transaction, type Actor } from "../storage";

/**
 * Demandes d'accès à une table, faites par un client avant toute session.
 *
 * Deux chemins mènent ici : le QR code de la table, et le choix de la table depuis l'accueil public.
 * Dans les deux cas, la demande ne donne aucun droit : le personnel confirme la personne de vive voix,
 * puis l'admet. L'accord ouvre la session de la table si elle ne l'était pas encore.
 */

export const SEAT_TTL_MS = 2 * 3600 * 1000;
const MAX_EN_ATTENTE_PAR_TABLE = 12;
const newCode = () => String(randomInt(0, 10000)).padStart(4, "0");

export type SeatOrigin = "accueil" | "qr";
export type SeatStatus = "en_attente" | "acceptee" | "refusee";

export interface SeatRequest {
  id: string;
  tableId: string;
  table: string;
  zone: string;
  pseudo: string;
  origine: SeatOrigin;
  creeLe: string;
}

/** Une demande oubliée ne reste pas éternellement dans la liste du personnel. */
const perimee = (d: Row<"DemandesAcces">, maintenant: number) => Date.parse(d.creeLe) + SEAT_TTL_MS < maintenant;

function purge(db: Db, maintenant: number): void {
  for (const d of db.DemandesAcces) {
    if (d.statut === "en_attente" && perimee(d, maintenant)) d.statut = "refusee";
  }
}

/* ------------------------------------------------------------- lecture */

/** Tables proposées au public. Ne révèle ni code, ni convives, ni commandes. */
export function publicTables(db: Db) {
  const zones = new Map(db.Zones.map((z) => [z.id, z.nom]));
  return db.Tables.filter((t) => t.active && !t.archiveeLe)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }))
    .map((t) => ({
      id: t.id,
      nom: t.nom,
      zone: zones.get(t.zoneId) ?? "",
      capacite: t.capacite,
      occupee: db.SessionsTable.some((s) => s.tableId === t.id && s.statut === "ouverte"),
    }));
}

/** Demande en cours portée par ce jeton, pour la table affichée. */
export function seatOf(db: Db, tableId: string, jeton: string | undefined): { statut: SeatStatus; pseudo: string } | null {
  if (!jeton) return null;
  const hash = tokenHash(jeton);
  const d = db.DemandesAcces.find((x) => x.tableId === tableId && safeEqual(x.jetonHash, hash));
  if (!d) return null;
  if (d.statut === "en_attente" && perimee(d, Date.now())) return { statut: "refusee", pseudo: d.pseudo };
  return { statut: d.statut as SeatStatus, pseudo: d.pseudo };
}

/** Demandes d'accès encore en attente, les plus anciennes d'abord. */
export function pendingSeats(db: Db, tableIds?: Set<string>): SeatRequest[] {
  const maintenant = Date.now();
  const zones = new Map(db.Zones.map((z) => [z.id, z.nom]));
  const tables = new Map(db.Tables.map((t) => [t.id, t]));
  return db.DemandesAcces.filter((d) => d.statut === "en_attente" && !perimee(d, maintenant) && (!tableIds || tableIds.has(d.tableId)))
    .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
    .map((d) => {
      const t = tables.get(d.tableId);
      return {
        id: d.id,
        tableId: d.tableId,
        table: t?.nom ?? "",
        zone: t ? (zones.get(t.zoneId) ?? "") : "",
        pseudo: d.pseudo,
        origine: d.origine === "qr" ? ("qr" as const) : ("accueil" as const),
        creeLe: d.creeLe,
      };
    });
}

/* ------------------------------------------------------------ écriture */

/**
 * Enregistre une demande d'accès et renvoie le jeton du demandeur.
 * Le jeton ne vaut rien tant que le personnel n'a pas accepté : il devient alors celui du participant.
 */
export async function requestSeat(tableId: string, pseudo: string, origine: SeatOrigin) {
  const jeton = randomToken();
  const out = await transaction({ actor: null }, (db, tx) => {
    const table = db.Tables.find((t) => t.id === tableId && t.active && !t.archiveeLe);
    if (!table) throw introuvable("Cette table n'existe pas ou n'est pas en service.");
    purge(db, Date.parse(tx.now));

    const params = db.ParametresCommandes.find((p) => p.id === ID.commandes);
    const nom = pseudo.trim().slice(0, 24);
    if (params?.pseudoActif && params.pseudoMode === "obligatoire" && !nom) throw invalide("Indiquez votre prénom pour demander une table.");
    const attente = db.DemandesAcces.filter((d) => d.tableId === tableId && d.statut === "en_attente");
    if (attente.length >= MAX_EN_ATTENTE_PAR_TABLE) throw conflit("Trop de demandes en attente pour cette table. Adressez-vous à notre équipe.");

    const row: Row<"DemandesAcces"> = {
      id: tx.id("acc"),
      tableId,
      pseudo: nom,
      jetonHash: tokenHash(jeton),
      statut: "en_attente",
      origine,
      creeLe: tx.now,
      traiteeLe: "",
      traiteePar: "",
      sessionId: "",
      participantId: "",
    };
    db.DemandesAcces.push(row);
    tx.publish(`table:${tableId}`);
    tx.publish("service");
    return { id: row.id, statut: row.statut as SeatStatus };
  });
  return { ...out, jeton };
}

/**
 * Le personnel accepte la personne : la session de la table s'ouvre si besoin,
 * et le jeton déjà détenu par le client devient celui de son participant.
 */
export function acceptSeat(actor: Actor, demandeId: string) {
  return transaction({ actor }, (db, tx) => {
    const d = must(db, "DemandesAcces", demandeId);
    if (d.statut !== "en_attente") throw conflit("Cette demande a déjà été traitée.");
    if (perimee(d, Date.parse(tx.now))) throw conflit("Cette demande a expiré : la personne doit la refaire.");
    const table = must(db, "Tables", d.tableId);
    if (!table.active || table.archiveeLe) throw conflit("Cette table est désactivée.");

    let session = db.SessionsTable.find((s) => s.tableId === d.tableId && s.statut === "ouverte");
    if (!session) {
      session = { id: tx.id("stb"), tableId: d.tableId, statut: "ouverte", code: newCode(), ouverteLe: tx.now, ouvertePar: actor.id, fermeeLe: "", fermeePar: "" };
      db.SessionsTable.push(session);
      db.Paniers.push({ id: tx.id("pan"), sessionId: session.id, statut: "ouvert", version: 1, creeLe: tx.now, majLe: tx.now });
      tx.log({ action: "session_ouverte", libelle: "Session ouverte", entite: "Tables", entiteId: table.id, entiteNom: table.nom, resultat: "Terminé" });
    }
    if (db.Participants.filter((p) => p.sessionId === session.id && p.statut !== "revoque").length >= 30) {
      throw conflit("Cette table a atteint le nombre maximal de participants.");
    }

    // Le client garde le jeton reçu au moment de la demande : rien de nouveau à lui transmettre.
    const participant: Row<"Participants"> = { id: tx.id("par"), sessionId: session.id, pseudo: d.pseudo, jetonHash: d.jetonHash, statut: "admis", rejointLe: tx.now };
    db.Participants.push(participant);
    d.statut = "acceptee";
    d.traiteeLe = tx.now;
    d.traiteePar = actor.id;
    d.sessionId = session.id;
    d.participantId = participant.id;

    tx.log({ action: "acces_table", libelle: "Accès accordé à une table", entite: "Tables", entiteId: table.id, entiteNom: table.nom, resultat: d.pseudo || "Convive" });
    tx.publish(`table:${d.tableId}`);
    tx.publish(`session:${session.id}`);
    tx.publish("service");
    return { id: d.id, sessionId: session.id, participantId: participant.id };
  });
}

export function refuseSeat(actor: Actor, demandeId: string) {
  return transaction({ actor }, (db, tx) => {
    const d = must(db, "DemandesAcces", demandeId);
    if (d.statut !== "en_attente") throw conflit("Cette demande a déjà été traitée.");
    const table = db.Tables.find((t) => t.id === d.tableId);
    d.statut = "refusee";
    d.traiteeLe = tx.now;
    d.traiteePar = actor.id;
    tx.log({ action: "acces_table", libelle: "Demande d'accès refusée", entite: "Tables", entiteId: d.tableId, entiteNom: table?.nom ?? "", resultat: d.pseudo || "Convive" });
    tx.publish(`table:${d.tableId}`);
    tx.publish("service");
    return { id: d.id };
  });
}

/* ----------------------------------------------------------- QR codes */

/**
 * Remplace le jeton du QR code d'une table. Les affichettes imprimées avant ne mènent plus à la table :
 * la personne est invitée à choisir sa table depuis l'accueil, ou à demander le nouveau QR code.
 */
export function renewTableQr(actor: Actor, tableId: string) {
  return transaction({ actor }, (db, tx) => {
    const table = must(db, "Tables", tableId);
    if (table.archiveeLe) throw conflit("Cette table est archivée.");
    table.qrJeton = randomToken(9);
    table.majLe = tx.now;
    tx.log({ action: "table_qr", libelle: "QR code remplacé", entite: "Tables", entiteId: table.id, entiteNom: table.nom, resultat: "Terminé" });
    tx.publish(`table:${tableId}`);
    tx.publish("service");
    return { id: table.id, qrJeton: table.qrJeton };
  });
}

/** Le QR présenté correspond-il au QR courant de la table ? Un jeton vide signifie « jamais remplacé ». */
export function qrAccepte(table: { qrJeton: string }, presente: string | undefined): boolean {
  if (!table.qrJeton) return true;
  return !!presente && safeEqual(table.qrJeton, presente);
}
