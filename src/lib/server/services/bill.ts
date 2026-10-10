import "server-only";
import { ID } from "../defaults";
import type { Db, Row } from "../schema";

/**
 * Cycle de vie de l'addition d'une table, partagé par le parcours client, le panier et l'espace serveur.
 * Ce module ne dépend d'aucun autre service pour rester importable des deux côtés.
 */

/** Motif de demande réservé à l'addition. Il ne figure pas dans la liste des motifs configurables. */
export const BILL_MOTIF = "addition";

/** Retrouve la ligne d'addition d'une session, ou la crée. À appeler dans une transaction. */
export function upsertBill(db: Db, session: Row<"SessionsTable">, now: string): Row<"AdditionsTable"> {
  const found = db.AdditionsTable.find((a) => a.sessionId === session.id);
  if (found) return found;
  const row: Row<"AdditionsTable"> = {
    id: `add_${session.id.slice(4)}`,
    sessionId: session.id,
    tableId: session.tableId,
    statut: "a_remettre",
    commandesCentimes: 0,
    serviceCentimes: 0,
    totalCentimes: 0,
    demandeeLe: now,
    demandeePar: "",
    remiseLe: "",
    remisePar: "",
    clotureeLe: "",
  };
  db.AdditionsTable.push(row);
  return row;
}

/** Montant dû par une session, d'après les commandes figées et les frais de service en vigueur. */
export function billTotals(db: Db, sessionId: string): { commandesCentimes: number; serviceCentimes: number; totalCentimes: number; pourcentage: number } {
  const regles = db.ParametresAddition.find((p) => p.id === ID.addition);
  const commandesCentimes = db.Commandes.filter((c) => c.sessionId === sessionId).reduce((n, c) => n + c.totalCentimes, 0);
  const actif = !!regles?.fraisServiceActif && regles.fraisServiceBp > 0;
  const serviceCentimes = actif ? Math.round((commandesCentimes * regles.fraisServiceBp) / 10000) : 0;
  return { commandesCentimes, serviceCentimes, totalCentimes: commandesCentimes + serviceCentimes, pourcentage: actif ? regles.fraisServiceBp / 100 : 0 };
}

/**
 * Fige l'addition à la fermeture de la session : les totaux clôturés ne bougent plus,
 * même si les frais de service sont modifiés plus tard.
 */
export function freezeBill(db: Db, session: Row<"SessionsTable">, now: string): void {
  if (!db.Commandes.some((c) => c.sessionId === session.id)) return;
  const t = billTotals(db, session.id);
  const row = upsertBill(db, session, now);
  row.commandesCentimes = t.commandesCentimes;
  row.serviceCentimes = t.serviceCentimes;
  row.totalCentimes = t.totalCentimes;
  row.statut = "cloturee";
  row.clotureeLe = now;
}
