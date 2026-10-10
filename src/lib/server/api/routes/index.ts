import "server-only";
import type { Routes } from "../core";
import { catalogueRoutes } from "./catalogue";
import { donneesRoutes } from "./donnees";
import { equipeRoutes } from "./equipe";
import { reglagesRoutes } from "./reglages";
import { salleRoutes } from "./salle";

/** Table unique des API d'administration, servie sous /api/admin/... */
export const adminRoutes: Routes = { ...equipeRoutes, ...catalogueRoutes, ...salleRoutes, ...reglagesRoutes, ...donneesRoutes };
