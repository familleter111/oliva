import "server-only";
import { z } from "zod";
import { advanceKitchenOrder } from "../../services/cuisine";
import type { Routes } from "../core";
import { serviceStream } from "../stream";

/**
 * API de l'écran de cuisine, servie sous /api/cuisine/...
 * Elle n'exige pas `admin.acces` : la cuisine n'entre pas dans l'administration.
 * Chaque action revérifie la station du membre dans sa propre transaction.
 */
export const cuisineRoutes: Routes = {
  "POST commandes/:id/statut": {
    perm: "preparation.changer",
    input: z.object({ statut: z.string().trim().min(1).max(40) }),
    run: (c, input: { statut: string }) => advanceKitchenOrder(c.auth, c.params.id, input.statut),
  },
  "GET evenements": { perm: "preparation.changer", run: (c) => serviceStream(c.req) },
};
