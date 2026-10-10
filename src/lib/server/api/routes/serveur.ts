import "server-only";
import { deliverBill, finishRequest, markServed, takeRequest } from "../../services/salle";
import type { Routes } from "../core";
import { serviceStream } from "../stream";

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
  "GET evenements": { perm: "commandes.voir", run: (c) => serviceStream(c.req) },
};
