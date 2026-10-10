import "server-only";
import { z } from "zod";
import { introuvable } from "../../errors";
import { closeTableSession, openTableSession, renewSessionCode } from "../../services/cart";
import { assignRequest, assignTable } from "../../services/responsable";
import { scopeOf } from "../../services/salle";
import { readDb } from "../../storage";
import { ref, txt, type Ctx, type Routes } from "../core";
import { serviceStream } from "../stream";

/**
 * API de l'espace responsable de salle, servie sous /api/responsable/...
 * Les sessions de table passent par les mêmes services que l'administration ; seule la portée
 * du rôle est vérifiée en plus, pour qu'un responsable n'agisse que sur les tables de sa salle.
 */

async function assertScope(c: Ctx, tableId: string): Promise<void> {
  if (!scopeOf(await readDb(), c.auth).ids.has(tableId)) throw introuvable("Cette table ne fait pas partie de votre salle.");
}

async function tableOfSession(c: Ctx, sessionId: string): Promise<string> {
  const db = await readDb();
  const session = db.SessionsTable.find((s) => s.id === sessionId);
  if (!session || !scopeOf(db, c.auth).ids.has(session.tableId)) throw introuvable("Cette session ne fait pas partie de votre salle.");
  return session.tableId;
}

export const responsableRoutes: Routes = {
  "POST tables/:id/affecter": {
    perm: "tables.affecter",
    input: z.object({ serveurId: ref, note: txt(200).optional() }),
    run: (c, input: { serveurId: string; note?: string }) => assignTable(c.auth, c.params.id, input.serveurId, input.note ?? ""),
  },
  "POST demandes/:id/attribuer": {
    perm: "tables.affecter",
    input: z.object({ serveurId: ref.min(1) }),
    run: (c, input: { serveurId: string }) => assignRequest(c.auth, c.params.id, input.serveurId),
  },

  "POST sessions": {
    perm: "sessions.gerer",
    input: z.object({ tableId: ref.min(1) }),
    run: async (c, input: { tableId: string }) => {
      await assertScope(c, input.tableId);
      return openTableSession(c.actor, input.tableId);
    },
  },
  "POST sessions/:id/fermer": {
    perm: "sessions.gerer",
    run: async (c) => {
      await tableOfSession(c, c.params.id);
      return closeTableSession(c.actor, c.params.id);
    },
  },
  "POST sessions/:id/code": {
    perm: "sessions.gerer",
    run: async (c) => {
      await tableOfSession(c, c.params.id);
      return renewSessionCode(c.actor, c.params.id);
    },
  },

  "GET evenements": { perm: "tables.affecter", run: (c) => serviceStream(c.req) },
};
