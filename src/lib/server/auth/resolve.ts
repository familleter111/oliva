import "server-only";
import { ID } from "../defaults";
import { fullName } from "../db-utils";
import type { Db, PermissionCode, Row } from "../schema";
import type { Actor } from "../storage";
import { safeEqual, tokenHash } from "./crypto";

export interface Auth {
  session: Row<"SessionsPersonnel">;
  user: Row<"Utilisateurs">;
  role: Row<"Roles">;
  permissions: Map<string, string>;
  csrf: string;
  actor: Actor;
  can: (p: PermissionCode) => boolean;
}

/**
 * Vérifie un jeton de session contre le classeur. Fonction pure, sans cookie ni requête.
 * Retourne null si la session est inconnue, révoquée, expirée, inactive depuis trop longtemps,
 * ou si le compte n'est plus actif. `lastSeenOf` donne la dernière activité connue en mémoire pour une session.
 */
export function resolveSession(db: Db, token: string, now = Date.now(), lastSeenOf: (sessionId: string) => number = () => 0): Auth | null {
  if (!token) return null;
  const hash = tokenHash(token);
  const session = db.SessionsPersonnel.find((s) => safeEqual(s.jetonHash, hash));
  if (!session || session.revoqueeLe) return null;
  if (Date.parse(session.expireLe) <= now) return null;
  const idleMs = (db.ParametresSecurite.find((p) => p.id === ID.securite)?.inactiviteMin ?? 30) * 60 * 1000;
  if (now - Math.max(Date.parse(session.vueLe), lastSeenOf(session.id)) > idleMs) return null;

  const user = db.Utilisateurs.find((u) => u.id === session.utilisateurId);
  if (!user || user.statut !== "actif") return null;
  const role = db.Roles.find((r) => r.id === user.roleId);
  if (!role) return null;
  const permissions = new Map(db.Permissions.filter((p) => p.roleId === role.id).map((p) => [p.permission, p.portee]));
  return {
    session,
    user,
    role,
    permissions,
    csrf: tokenHash(`csrf:${session.id}`),
    actor: { id: user.id, nom: fullName(user) },
    can: (p) => permissions.has(p),
  };
}
