import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cookieSecure, publicUrl } from "../env";
import { AppError } from "../errors";
import { ID } from "../defaults";
import { activeAdminCount, fullName, isActiveAdmin } from "../db-utils";
import type { Db, PermissionCode } from "../schema";
import { newId, nowIso, readDb, transaction } from "../storage";
import { dummyHash, randomToken, safeEqual, tokenHash, verifyPassword } from "./crypto";
import { assertNotLocked, clearFailures, recordFailure } from "./rate-limit";
import { resolveSession, type Auth } from "./resolve";

const COOKIE = () => (cookieSecure() ? "__Host-oliva_session" : "oliva_session");
const DEVICE = () => (cookieSecure() ? "__Host-oliva_appareil" : "oliva_appareil");
const DEVICE_DAYS = 180;
const TOUCH_PERSIST_MS = 5 * 60 * 1000;

const holder = globalThis as unknown as { __olivaSeen?: Map<string, number> };
const seen = () => (holder.__olivaSeen ??= new Map<string, number>());

export { activeAdminCount, fullName, isActiveAdmin };
export type { Auth };

/** À utiliser dans une transaction : révoque toutes les sessions ouvertes d'un compte. */
export function revokeUserSessions(db: Db, userId: string, now: string, exceptSessionId?: string): number {
  let n = 0;
  for (const s of db.SessionsPersonnel) {
    if (s.utilisateurId === userId && !s.revoqueeLe && s.id !== exceptSessionId) {
      s.revoqueeLe = now;
      n++;
    }
  }
  return n;
}

/**
 * Session courante, vérifiée dans le classeur à chaque requête. Null si absente, expirée ou révoquée.
 * `cache` évite de refaire la vérification quand le layout et la page la demandent pendant le même rendu.
 */
export const currentAuth = cache(async (): Promise<Auth | null> => {
  const token = (await cookies()).get(COOKIE())?.value;
  if (!token) return null;
  const auth = resolveSession(await readDb(), token, Date.now(), (id) => seen().get(id) ?? 0);
  if (!auth) return null;

  const now = Date.now();
  const map = seen();
  if (map.size > 2000) for (const [id, at] of map) if (now - at > 24 * 3600 * 1000) map.delete(id);
  map.set(auth.session.id, now);
  if (now - Date.parse(auth.session.vueLe) > TOUCH_PERSIST_MS) {
    const id = auth.session.id;
    transaction({ actor: null }, (db) => {
      const s = db.SessionsPersonnel.find((x) => x.id === id);
      if (s && !s.revoqueeLe) s.vueLe = nowIso();
    }).catch(() => undefined);
  }
  return auth;
});

/**
 * Garde des pages d'administration, appelée dans chaque page (pas seulement dans le layout).
 * Redirige vers la connexion sans session valide, vers « accès refusé » sans la permission requise.
 */
export async function requirePage(...anyOf: PermissionCode[]): Promise<Auth> {
  const auth = await currentAuth();
  if (!auth) redirect("/admin/login");
  if (!auth.can("admin.acces")) redirect("/admin/acces-refuse");
  if (anyOf.length > 0 && !anyOf.some((p) => auth.can(p))) redirect("/admin/acces-refuse");
  return auth;
}

/**
 * Page d'accueil du membre connecté : l'administration pour qui y a droit, sinon son espace de
 * travail, du plus large au plus spécialisé. Un compte sans aucun de ces droits est renvoyé
 * vers « accès refusé ».
 */
export function homeFor(auth: Auth): string {
  if (auth.can("admin.acces")) return "/admin";
  if (auth.can("tables.affecter")) return "/responsable";
  if (auth.can("commandes.servir")) return "/salle";
  if (auth.can("preparation.changer")) return "/cuisine";
  return "/admin/acces-refuse";
}

/**
 * Garde des pages de l'espace serveur. Même contrôle de session que l'administration,
 * mais sans exiger `admin.acces` : un serveur n'entre pas dans /admin.
 */
export async function requireStaffPage(...anyOf: PermissionCode[]): Promise<Auth> {
  const auth = await currentAuth();
  if (!auth) redirect("/admin/login");
  if (anyOf.length > 0 && !anyOf.some((p) => auth.can(p))) redirect("/admin/acces-refuse");
  return auth;
}

/** Garde des API de l'espace serveur : lève 401 ou 403, sans exiger `admin.acces`. */
export async function requireStaffApi(anyOf: PermissionCode[] | "session"): Promise<Auth> {
  const auth = await currentAuth();
  if (!auth) throw new AppError("non_authentifie", "Session absente ou expirée. Reconnectez-vous.");
  if (anyOf !== "session" && anyOf.length > 0 && !anyOf.some((p) => auth.can(p))) {
    throw new AppError("interdit", "Votre rôle ne permet pas cette action.");
  }
  return auth;
}

/** Garde des API : lève 401 ou 403. */
export async function requireApi(anyOf: PermissionCode[] | "session"): Promise<Auth> {
  const auth = await currentAuth();
  if (!auth) throw new AppError("non_authentifie", "Session absente ou expirée. Reconnectez-vous.");
  if (anyOf === "session") return auth;
  if (!auth.can("admin.acces") || (anyOf.length > 0 && !anyOf.some((p) => auth.can(p)))) {
    throw new AppError("interdit", "Votre rôle ne permet pas cette action.");
  }
  return auth;
}

/** Protection contre les requêtes intersites : l'origine doit être celle du site. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (origin) {
    const allowed = new Set<string>();
    for (const h of [req.headers.get("x-forwarded-host"), req.headers.get("host")]) if (h) allowed.add(h.toLowerCase());
    const configured = publicUrl();
    try {
      if (configured) allowed.add(new URL(configured).host.toLowerCase());
      if (allowed.has(new URL(origin).host.toLowerCase())) return;
    } catch {
      /* origine illisible : refus */
    }
  } else if (req.headers.get("sec-fetch-site") === "same-origin") {
    return;
  }
  throw new AppError("interdit", "Requête refusée : son origine n'a pas pu être vérifiée.");
}

export function assertCsrf(req: Request, auth: Auth): void {
  const sent = req.headers.get("x-oliva-csrf") ?? "";
  if (!sent || !safeEqual(sent, auth.csrf)) throw new AppError("interdit", "Requête refusée : jeton de protection manquant ou invalide. Rechargez la page.");
}

export async function clientMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "local";
  return { ip: ip.slice(0, 60), navigateur: (h.get("user-agent") ?? "").slice(0, 200) };
}

async function setCookie(token: string, maxAgeSeconds: number) {
  (await cookies()).set(COOKIE(), token, { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: maxAgeSeconds });
}

/** Ouvre une session pour un compte déjà vérifié et pose le cookie. À appeler hors transaction. */
export async function openSession(userId: string): Promise<void> {
  const meta = await clientMeta();
  const token = randomToken();
  const hours = await transaction({ actor: null }, (db, tx) => {
    const user = db.Utilisateurs.find((u) => u.id === userId);
    if (!user || user.statut !== "actif") throw new AppError("non_authentifie", "Compte indisponible.");
    const h = db.ParametresSecurite.find((p) => p.id === ID.securite)?.dureeMaxHeures ?? 8;
    // Les sessions terminées depuis plus de 30 jours sont retirées pour limiter la taille du classeur.
    const limit = Date.now() - 30 * 24 * 3600 * 1000;
    db.SessionsPersonnel = db.SessionsPersonnel.filter((s) => Date.parse(s.expireLe) > limit);
    db.SessionsPersonnel.push({
      id: newId("ses"),
      utilisateurId: user.id,
      jetonHash: tokenHash(token),
      creeLe: tx.now,
      vueLe: tx.now,
      expireLe: new Date(Date.now() + h * 3600 * 1000).toISOString(),
      revoqueeLe: "",
      navigateur: meta.navigateur,
      ip: meta.ip,
    });
    user.derniereConnexionLe = tx.now;
    tx.actor = { id: user.id, nom: fullName(user) };
    tx.log({ action: "connexion", libelle: "Connexion", entite: "Utilisateurs", entiteId: user.id, entiteNom: fullName(user), resultat: "Terminé" });
    return h;
  });
  await setCookie(token, hours * 3600);
}

const deviceSignature = (userId: string, nonce: string) => tokenHash(`appareil:${userId}:${nonce}`);

/** Appareil déjà utilisé avec succès par ce compte : cookie signé, posé après une connexion réussie. */
async function knownDevice(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const [uid, nonce, sig] = ((await cookies()).get(DEVICE())?.value ?? "").split(".");
  if (uid !== userId || !nonce || !sig || !safeEqual(sig, deviceSignature(uid, nonce))) return null;
  return nonce;
}

async function rememberDevice(userId: string): Promise<void> {
  const nonce = randomToken(12);
  (await cookies()).set(DEVICE(), `${userId}.${nonce}.${deviceSignature(userId, nonce)}`, { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: DEVICE_DAYS * 24 * 3600 });
}

/**
 * Connexion par identifiant ou e-mail. Les échecs sont comptés et verrouillent temporairement :
 * par appareil connu quand le navigateur s'est déjà connecté à ce compte, sinon par identifiant et par adresse IP.
 * Ainsi, quelqu'un qui multiplie les essais sur l'e-mail d'un administrateur ne bloque pas l'appareil habituel de celui-ci.
 */
export async function login(identifiant: string, motDePasse: string): Promise<{ redirection: string }> {
  const meta = await clientMeta();
  const ident = identifiant.trim().toLowerCase();
  const db = await readDb();
  const sec = db.ParametresSecurite.find((p) => p.id === ID.securite);
  const max = sec?.tentativesMax ?? 5;
  const lock = sec?.verrouillageMin ?? 15;

  const user = db.Utilisateurs.find((u) => u.email.toLowerCase() === ident || (u.identifiant !== "" && u.identifiant.toLowerCase() === ident));
  const device = await knownDevice(user?.id);
  // L'adresse IP tolère davantage d'échecs que l'identifiant, pour ne pas bloquer toute une salle.
  const limits: [string, number][] = device ? [[`app:${user!.id}:${device}`, max]] : [[`ip:${meta.ip}`, max * 4], [`id:${ident}`, max]];
  limits.forEach(([key]) => assertNotLocked(key));

  const ok = await verifyPassword(motDePasse, user?.motDePasseHash || (await dummyHash()));
  if (!user || !ok || user.statut !== "actif" || !user.motDePasseHash) {
    limits.forEach(([key, n]) => recordFailure(key, n, lock));
    throw new AppError("non_authentifie", "Identifiant ou mot de passe incorrect.");
  }
  clearFailures(limits[limits.length - 1][0]);
  await openSession(user.id);
  if (!device) await rememberDevice(user.id);
  // Chaque rôle arrive sur son espace : l'administration, la salle, ou la cuisine pour qui prépare.
  const droits = new Set(db.Permissions.filter((p) => p.roleId === user.roleId).map((p) => p.permission));
  const vers = droits.has("admin.acces")
    ? "/admin"
    : droits.has("tables.affecter")
      ? "/responsable"
      : droits.has("commandes.servir")
        ? "/salle"
        : droits.has("preparation.changer")
          ? "/cuisine"
          : "/admin/acces-refuse";
  return { redirection: vers };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE())?.value;
  // Les mêmes attributs qu'à la pose sont requis pour qu'un cookie `__Host-` soit bien effacé.
  jar.set(COOKIE(), "", { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 0 });
  if (!token) return;
  const hash = tokenHash(token);
  await transaction({ actor: null }, (db, tx) => {
    const s = db.SessionsPersonnel.find((x) => safeEqual(x.jetonHash, hash));
    if (!s || s.revoqueeLe) return;
    s.revoqueeLe = tx.now;
    const u = db.Utilisateurs.find((x) => x.id === s.utilisateurId);
    if (u) {
      tx.actor = { id: u.id, nom: fullName(u) };
      tx.log({ action: "deconnexion", libelle: "Déconnexion", entite: "Utilisateurs", entiteId: u.id, entiteNom: fullName(u), resultat: "Terminé" });
    }
  });
}
