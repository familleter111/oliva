import "server-only";
import { z } from "zod";
import { hashPassword, passwordProblem, randomToken, safeEqual, tokenHash, verifyPassword } from "../../auth/crypto";
import { assertNotLocked, recordFailure } from "../../auth/rate-limit";
import { activeAdminCount, clientMeta, fullName, isActiveAdmin, login, logout, revokeUserSessions } from "../../auth/session";
import { ID } from "../../defaults";
import { must, removeRow, safe } from "../../db-utils";
import { publicUrl } from "../../env";
import { AppError, conflit, invalide } from "../../errors";
import { PERMISSION_CODES, ROLE_ADMIN, type Db, type Row } from "../../schema";
import { transaction, type Tx } from "../../storage";
import { choix, collection, logUpdate, nom, ref, refs, type Ctx, type Routes } from "../core";

const PERM = "utilisateurs.gerer" as const;
const PORTEES = ["toutes", "mes_tables", "ma_station", "selon_autorisation"] as const;
const email = z.string().trim().toLowerCase().max(120).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Adresse e-mail invalide.");

function baseUrl(c: Ctx): string {
  return publicUrl() || new URL(c.req.url).origin;
}

/** Crée un jeton à usage unique (invitation ou réinitialisation). Seule son empreinte est enregistrée. */
function issueToken(user: Row<"Utilisateurs">, type: "invitation" | "reinitialisation", hours: number) {
  const token = randomToken();
  user.jetonHash = tokenHash(token);
  user.jetonType = type;
  user.jetonExpireLe = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  return token;
}

function guardLastAdmin(db: Db, user: Row<"Utilisateurs">, action: string) {
  if (isActiveAdmin(user) && activeAdminCount(db) <= 1) {
    throw conflit(`Impossible de ${action} le dernier administrateur actif. Nommez d'abord un autre administrateur.`);
  }
}

function checkScope(db: Db, u: Row<"Utilisateurs">) {
  must(db, "Roles", u.roleId);
  if (db.Utilisateurs.some((x) => x.id !== u.id && x.email.toLowerCase() === u.email.toLowerCase())) throw conflit("Un compte utilise déjà cette adresse e-mail.");
  if (u.identifiant && db.Utilisateurs.some((x) => x.id !== u.id && x.identifiant.toLowerCase() === u.identifiant.toLowerCase())) throw conflit("Cet identifiant est déjà pris.");
}

const logUser = (tx: Tx, u: Row<"Utilisateurs">, libelle: string, resultat = "Appliqué") =>
  tx.log({ action: "utilisateur", libelle, entite: "Utilisateurs", entiteId: u.id, entiteNom: fullName(u), resultat });

export const equipeRoutes: Routes = {
  /* --------------------------------------------------------- connexion */
  "POST auth/login": {
    perm: "public",
    input: z.object({ identifiant: z.string().trim().min(1, "Indiquez votre identifiant ou e-mail.").max(120), motDePasse: z.string().min(1, "Indiquez votre mot de passe.").max(200) }),
    run: async (_c, input: { identifiant: string; motDePasse: string }) => login(input.identifiant, input.motDePasse),
  },
  "POST auth/logout": {
    perm: "session",
    run: async () => {
      await logout();
      return { ok: true };
    },
  },
  /** Acceptation d'une invitation ou réinitialisation : le membre choisit son mot de passe. */
  "POST auth/jeton": {
    perm: "public",
    input: z.object({ jeton: z.string().min(20).max(200), motDePasse: z.string().max(200), identifiant: z.string().trim().max(40).regex(/^[\w.-]*$/, "Lettres, chiffres, points et tirets uniquement.").optional() }),
    run: async (_c, input: { jeton: string; motDePasse: string; identifiant?: string }) => {
      const key = `jeton:${(await clientMeta()).ip}`;
      assertNotLocked(key);
      const hash = tokenHash(input.jeton);
      const motDePasseHash = await hashPassword(input.motDePasse);
      try {
        return await transaction({ actor: null }, (db, tx) => {
          const u = db.Utilisateurs.find((x) => x.jetonHash !== "" && safeEqual(x.jetonHash, hash));
          if (!u || Date.parse(u.jetonExpireLe) < Date.now() || u.statut === "suspendu") throw new AppError("interdit", "Ce lien est invalide ou a expiré. Demandez un nouveau lien à un administrateur.");
          const problem = passwordProblem(input.motDePasse, must(db, "ParametresSecurite", ID.securite));
          if (problem) throw invalide(problem, { motDePasse: problem });
          const wasInvite = u.jetonType === "invitation";
          u.motDePasseHash = motDePasseHash;
          u.statut = "actif";
          u.jetonHash = "";
          u.jetonType = "";
          u.jetonExpireLe = "";
          u.majLe = tx.now;
          if (input.identifiant) u.identifiant = input.identifiant;
          checkScope(db, u);
          revokeUserSessions(db, u.id, tx.now);
          tx.actor = { id: u.id, nom: fullName(u) };
          logUser(tx, u, wasInvite ? "Invitation acceptée" : "Mot de passe réinitialisé", "Terminé");
          return { ok: true };
        });
      } catch (e) {
        if (e instanceof AppError && e.code === "interdit") recordFailure(key, 10, 15);
        throw e;
      }
    },
  },

  /* ------------------------------------------------------ utilisateurs */
  "POST utilisateurs/inviter": {
    perm: PERM,
    input: z.object({ prenom: nom(40), nom: nom(40), email, roleId: ref.min(1, "Choisissez un rôle."), zoneIds: refs, stationId: ref, validiteHeures: z.number().int().min(1).max(168) }),
    run: (c, input: { prenom: string; nom: string; email: string; roleId: string; zoneIds: string[]; stationId: string; validiteHeures: number }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const u: Row<"Utilisateurs"> = {
          id: tx.id("usr"), prenom: input.prenom, nom: input.nom, email: input.email, identifiant: "", motDePasseHash: "", roleId: input.roleId, statut: "invite",
          zoneIds: input.zoneIds, stationId: input.stationId, jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: tx.now, majLe: tx.now,
        };
        checkScope(db, u);
        const token = issueToken(u, "invitation", input.validiteHeures);
        db.Utilisateurs.push(u);
        logUser(tx, u, "Invitation créée", "En attente");
        // Aucun e-mail n'est envoyé : le lien est remis à l'administrateur, qui le transmet lui-même.
        return { id: u.id, lien: `${baseUrl(c)}/admin/invitation/${token}`, expireLe: u.jetonExpireLe };
      }),
  },
  "PATCH utilisateurs/:id": {
    perm: PERM,
    input: z.object({ prenom: nom(40), nom: z.string().trim().max(40), email, roleId: ref.min(1), zoneIds: refs, stationId: ref }).partial(),
    run: (c, input: Partial<Row<"Utilisateurs">>) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const u = must(db, "Utilisateurs", c.params.id);
        const before = structuredClone(u);
        if (input.roleId && input.roleId !== u.roleId) guardLastAdmin(db, u, "changer le rôle du");
        Object.assign(u, input);
        checkScope(db, u);
        if (logUpdate(tx, "Utilisateurs", before, u)) u.majLe = tx.now;
        return safe("Utilisateurs", u);
      }),
  },
  "POST utilisateurs/:id/suspendre": {
    perm: PERM,
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const u = must(db, "Utilisateurs", c.params.id);
        if (u.id === c.auth.user.id) throw conflit("Vous ne pouvez pas suspendre votre propre compte.");
        if (u.statut === "suspendu") throw conflit("Ce compte est déjà suspendu.");
        guardLastAdmin(db, u, "suspendre");
        u.statut = "suspendu";
        u.jetonHash = "";
        u.jetonType = "";
        u.jetonExpireLe = "";
        u.majLe = tx.now;
        const n = revokeUserSessions(db, u.id, tx.now);
        logUser(tx, u, "Compte suspendu", `Appliqué (${n} session(s) révoquée(s))`);
        return { id: u.id, sessionsRevoquees: n };
      }),
  },
  "POST utilisateurs/:id/reactiver": {
    perm: PERM,
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const u = must(db, "Utilisateurs", c.params.id);
        if (u.statut !== "suspendu") throw conflit("Ce compte n'est pas suspendu.");
        u.statut = u.motDePasseHash ? "actif" : "invite";
        u.majLe = tx.now;
        logUser(tx, u, "Compte réactivé");
        return { id: u.id, statut: u.statut };
      }),
  },
  /** Nouveau lien d'invitation (compte invité) ou de réinitialisation (compte actif). */
  "POST utilisateurs/:id/lien": {
    perm: PERM,
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const u = must(db, "Utilisateurs", c.params.id);
        if (u.statut === "suspendu") throw conflit("Réactivez d'abord ce compte.");
        const type = u.statut === "invite" ? "invitation" : "reinitialisation";
        const token = issueToken(u, type, type === "invitation" ? 48 : 2);
        u.majLe = tx.now;
        logUser(tx, u, type === "invitation" ? "Lien d'invitation régénéré" : "Lien de réinitialisation créé", "En attente");
        return { lien: `${baseUrl(c)}/admin/invitation/${token}`, type, expireLe: u.jetonExpireLe };
      }),
  },
  "DELETE utilisateurs/:id": {
    perm: PERM,
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const u = must(db, "Utilisateurs", c.params.id);
        if (u.id === c.auth.user.id) throw conflit("Vous ne pouvez pas supprimer votre propre compte.");
        guardLastAdmin(db, u, "supprimer");
        removeRow(db, "Utilisateurs", u.id);
        logUser(tx, u, "Compte supprimé");
        return { id: u.id };
      }),
  },

  /* -------------------------------------------------------------- rôles */
  ...collection({
    path: "roles",
    sheet: "Roles",
    perm: PERM,
    prefix: "role",
    ordered: true,
    required: ["nom"],
    schema: z.object({ nom: nom(40), portee: choix(["toutes", "tables_affectees", "station"]), zoneIds: refs }),
    defaults: () => ({ portee: "tables_affectees", systeme: false }),
    check: (row, db, before) => {
      if (row.id === ROLE_ADMIN && before) throw conflit("Le rôle Administrateur est verrouillé : il garde tous les droits.");
      if (db.Roles.some((r) => r.id !== row.id && r.nom.toLowerCase() === row.nom.toLowerCase())) throw conflit(`Un rôle « ${row.nom} » existe déjà.`);
    },
    canDelete: (row) => {
      if (row.systeme) throw conflit("Ce rôle système ne peut pas être supprimé.");
    },
  }),
  "PUT roles/:id/permissions": {
    perm: PERM,
    input: z.object({ permissions: z.record(z.string(), choix(PORTEES).nullable()) }),
    run: (c, input: { permissions: Record<string, (typeof PORTEES)[number] | null> }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const role = must(db, "Roles", c.params.id);
        if (role.id === ROLE_ADMIN) throw conflit("Le rôle Administrateur est verrouillé : il garde tous les droits.");
        const before = Object.fromEntries(db.Permissions.filter((p) => p.roleId === role.id).map((p) => [p.permission, p.portee]));
        for (const [code, portee] of Object.entries(input.permissions)) {
          if (!(PERMISSION_CODES as string[]).includes(code)) throw invalide(`Permission inconnue : ${code}.`);
          db.Permissions = db.Permissions.filter((p) => !(p.roleId === role.id && p.permission === code));
          if (portee) db.Permissions.push({ id: `${role.id}:${code}`, roleId: role.id, permission: code, portee });
        }
        const after = Object.fromEntries(db.Permissions.filter((p) => p.roleId === role.id).map((p) => [p.permission, p.portee]));
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          tx.log({ action: "permissions", libelle: "Permissions modifiées", entite: "Roles", entiteId: role.id, entiteNom: role.nom, avant: before, apres: after });
        }
        return { id: role.id };
      }),
  },

  /* ------------------------------------------- sessions du personnel */
  "POST sessions-personnel/:id/revoquer": {
    perm: "securite.gerer",
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const s = must(db, "SessionsPersonnel", c.params.id);
        if (s.revoqueeLe) throw conflit("Cette session est déjà révoquée.");
        s.revoqueeLe = tx.now;
        const u = db.Utilisateurs.find((x) => x.id === s.utilisateurId);
        tx.log({ action: "session", libelle: "Session révoquée", entite: "Utilisateurs", entiteId: s.utilisateurId, entiteNom: u ? fullName(u) : "" });
        return { id: s.id };
      }),
  },
  "POST sessions-personnel/revoquer-autres": {
    perm: "securite.gerer",
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        let n = 0;
        for (const s of db.SessionsPersonnel) {
          if (!s.revoqueeLe && s.id !== c.auth.session.id && Date.parse(s.expireLe) > Date.now()) {
            s.revoqueeLe = tx.now;
            n++;
          }
        }
        tx.log({ action: "session", libelle: "Autres sessions révoquées", entite: "SessionsPersonnel", entiteNom: `${n} session(s)` });
        return { n };
      }),
  },
  "PUT compte/mot-de-passe": {
    perm: "session",
    input: z.object({ actuel: z.string().max(200), nouveau: z.string().max(200) }),
    run: async (c, input: { actuel: string; nouveau: string }) => {
      if (!(await verifyPassword(input.actuel, c.auth.user.motDePasseHash))) throw invalide("Le mot de passe actuel est incorrect.", { actuel: "Mot de passe incorrect." });
      const hash = await hashPassword(input.nouveau);
      return transaction({ actor: c.actor }, (db, tx) => {
        const u = must(db, "Utilisateurs", c.auth.user.id);
        const problem = passwordProblem(input.nouveau, must(db, "ParametresSecurite", ID.securite));
        if (problem) throw invalide(problem, { nouveau: problem });
        u.motDePasseHash = hash;
        u.majLe = tx.now;
        revokeUserSessions(db, u.id, tx.now, c.auth.session.id);
        logUser(tx, u, "Mot de passe modifié");
        return { ok: true };
      });
    },
  },
};
