import "server-only";
import { introuvable } from "../../errors";
import { acceptSeat, refuseSeat, renewTableQr } from "../../services/access";
import { deliverBill, finishRequest, markServed, releaseTable, scopeOf, takeRequest } from "../../services/salle";
import { readDb } from "../../storage";
import type { Ctx, Routes } from "../core";
import { serviceStream } from "../stream";

/** Une demande d'accès ne se traite que si sa table fait partie du service de la personne. */
async function assertSeatScope(c: Ctx, demandeId: string): Promise<void> {
  const db = await readDb();
  const demande = db.DemandesAcces.find((d) => d.id === demandeId);
  if (!demande || !scopeOf(db, c.auth).ids.has(demande.tableId)) throw introuvable("Cette demande ne fait pas partie de votre service.");
}

async function assertTableScope(c: Ctx, tableId: string): Promise<void> {
  if (!scopeOf(await readDb(), c.auth).ids.has(tableId)) throw introuvable("Cette table ne fait pas partie de votre service.");
}

/**
 * API de l'espace serveur, servie sous /api/salle/...
 * Elle n'exige pas `admin.acces` : un membre de salle n'entre pas dans l'administration.
 * Chaque action revérifie la portée du rôle sur les tables dans sa propre transaction.
 */
export const serveurRoutes: Routes = {
  "POST commandes/:id/servir": { perm: "commandes.servir", run: (c) => markServed(c.auth, c.params.id) },
  "POST demandes/:id/prendre": { perm: "commandes.voir", run: (c) => takeRequest(c.auth, c.params.id) },
  "POST demandes/:id/traiter": { perm: "commandes.voir", run: (c) => finishRequest(c.auth, c.params.id) },
  "POST additions/:sessionId/remettre": { perm: "commandes.servir", run: (c) => deliverBill(c.auth, c.params.sessionId) },
  "POST acces/:id/accepter": {
    perm: "commandes.servir",
    run: async (c) => {
      await assertSeatScope(c, c.params.id);
      return acceptSeat(c.actor, c.params.id);
    },
  },
  "POST acces/:id/refuser": {
    perm: "commandes.servir",
    run: async (c) => {
      await assertSeatScope(c, c.params.id);
      return refuseSeat(c.actor, c.params.id);
    },
  },
  /** Libérer la table : la session se ferme, les accès des convives sont révoqués. */
  "POST sessions/:id/fermer": { perm: "commandes.servir", run: (c) => releaseTable(c.auth, c.params.id) },
  "POST tables/:id/qr": {
    perm: "commandes.servir",
    run: async (c) => {
      await assertTableScope(c, c.params.id);
      return renewTableQr(c.actor, c.params.id);
    },
  },
  "GET evenements": { perm: "commandes.voir", run: (c) => serviceStream(c.req) },
};
