import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Crypto = typeof import("@/lib/server/auth/crypto");
type Resolve = typeof import("@/lib/server/auth/resolve");
type Limit = typeof import("@/lib/server/auth/rate-limit");

describe("authentification du personnel", () => {
  let s: Storage;
  let c: Crypto;
  let r: Resolve;
  let limit: Limit;
  const token = "jeton-de-session-de-test-0123456789abcdef";
  const HOUR = 3600 * 1000;

  before(async () => {
    ({ storage: s } = await setup("auth"));
    c = await import("@/lib/server/auth/crypto");
    r = await import("@/lib/server/auth/resolve");
    limit = await import("@/lib/server/auth/rate-limit");
    const hash = await c.hashPassword("Motdepasse-Solide-2026");
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      db.Utilisateurs.push({ id: "usr_admin", prenom: "Ada", nom: "Admin", email: "ada@example.test", identifiant: "ada", motDePasseHash: hash, roleId: "role_admin", statut: "actif", zoneIds: [], stationId: "", jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: tx.now, majLe: tx.now });
      db.Utilisateurs.push({ id: "usr_serveur", prenom: "Hugo", nom: "", email: "hugo@example.test", identifiant: "", motDePasseHash: hash, roleId: "role_serveur", statut: "actif", zoneIds: [], stationId: "", jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: tx.now, majLe: tx.now });
      const base = { creeLe: tx.now, vueLe: tx.now, expireLe: new Date(Date.now() + 8 * HOUR).toISOString(), revoqueeLe: "", navigateur: "test", ip: "local" };
      db.SessionsPersonnel.push({ id: "ses_admin", utilisateurId: "usr_admin", jetonHash: c.tokenHash(token), ...base });
      db.SessionsPersonnel.push({ id: "ses_serveur", utilisateurId: "usr_serveur", jetonHash: c.tokenHash(`${token}-serveur`), ...base });
    });
  });
  after(() => s.__releaseLock());

  it("ne stocke qu'une empreinte salée du mot de passe", async () => {
    const a = await c.hashPassword("Motdepasse-Solide-2026");
    const b = await c.hashPassword("Motdepasse-Solide-2026");
    assert.match(a, /^scrypt\$32768\$8\$1\$/);
    assert.ok(!a.includes("Motdepasse"));
    assert.notEqual(a, b, "deux empreintes du même mot de passe diffèrent grâce au sel");
    assert.equal(await c.verifyPassword("Motdepasse-Solide-2026", a), true);
    assert.equal(await c.verifyPassword("motdepasse-solide-2026", a), false);
    assert.equal(await c.verifyPassword("x", "valeur-non-conforme"), false);
  });

  it("applique les règles de mot de passe", () => {
    const policy = { motDePasseMin: 10, exigerLettreChiffre: true, exigerSpecial: true };
    assert.match(c.passwordProblem("court1!", policy) ?? "", /au moins 10 caractères/);
    assert.match(c.passwordProblem("sanschiffres!!", policy) ?? "", /une lettre et un chiffre/);
    assert.match(c.passwordProblem("SansSpecial2026", policy) ?? "", /caractère spécial/);
    assert.equal(c.passwordProblem("Correct-Cheval-42", policy), null);
  });

  it("reconnaît une session valide et ses permissions", async () => {
    const db = await s.readDb();
    const auth = r.resolveSession(db, token);
    assert.ok(auth);
    assert.equal(auth.user.id, "usr_admin");
    assert.equal(auth.can("admin.acces"), true);
    assert.equal(auth.can("donnees.gerer"), true);
    assert.match(auth.csrf, /^[a-f0-9]{64}$/);
    const serveur = r.resolveSession(db, `${token}-serveur`);
    assert.ok(serveur);
    assert.equal(serveur.can("admin.acces"), false, "un serveur n'a pas accès à l'administration par défaut");
    assert.equal(serveur.can("commandes.voir"), true);
    assert.notEqual(serveur.csrf, auth.csrf, "le jeton de protection est propre à chaque session");
  });

  it("refuse un jeton inconnu, vide ou falsifié", async () => {
    const db = await s.readDb();
    assert.equal(r.resolveSession(db, ""), null);
    assert.equal(r.resolveSession(db, "jeton-invente"), null);
    assert.equal(r.resolveSession(db, c.tokenHash(token)), null, "l'empreinte stockée ne sert pas de jeton");
  });

  it("expire après la durée maximale et après une inactivité trop longue", async () => {
    const db = await s.readDb();
    assert.equal(r.resolveSession(db, token, Date.now() + 9 * HOUR), null, "durée maximale de 8 heures dépassée");
    assert.equal(r.resolveSession(db, token, Date.now() + 45 * 60 * 1000), null, "30 minutes d'inactivité dépassées");
    const recent = Date.now() + 40 * 60 * 1000;
    assert.ok(r.resolveSession(db, token, Date.now() + 45 * 60 * 1000, () => recent), "une activité récente garde la session ouverte");
  });

  it("révoque immédiatement les accès d'un compte suspendu", async () => {
    await s.transaction({ actor: ACTOR }, (db) => void (db.Utilisateurs.find((u) => u.id === "usr_serveur")!.statut = "suspendu"));
    assert.equal(r.resolveSession(await s.readDb(), `${token}-serveur`), null);
    await s.transaction({ actor: ACTOR }, (db) => {
      db.Utilisateurs.find((u) => u.id === "usr_serveur")!.statut = "actif";
      db.SessionsPersonnel.find((x) => x.id === "ses_serveur")!.revoqueeLe = new Date().toISOString();
    });
    assert.equal(r.resolveSession(await s.readDb(), `${token}-serveur`), null, "une session révoquée ne revit pas");
  });

  it("verrouille après trop de tentatives, puis libère", () => {
    const key = `id:test-${Date.now()}`;
    limit.assertNotLocked(key);
    for (let i = 0; i < 4; i++) limit.recordFailure(key, 5, 15);
    limit.assertNotLocked(key);
    limit.recordFailure(key, 5, 15);
    assert.throws(() => limit.assertNotLocked(key), (e: { code?: string; retryAfter?: number }) => e.code === "limite" && (e.retryAfter ?? 0) > 800);
    limit.clearFailures(key);
    limit.assertNotLocked(key);
  });
});
