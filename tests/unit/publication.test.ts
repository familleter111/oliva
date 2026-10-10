import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Publication = typeof import("@/lib/server/services/publication");
type Menu = typeof import("@/lib/server/services/menu");

describe("publication et menu public", () => {
  let s: Storage;
  let pub: Publication;
  let menu: Menu;
  const HOUR = 3600 * 1000;
  const product = async () => (await menu.publicMenu()).categories.flatMap((c) => c.produits).find((p) => p.id === "prd_pizza");

  before(async () => {
    ({ storage: s } = await setup("publication"));
    pub = await import("@/lib/server/services/publication");
    menu = await import("@/lib/server/services/menu");
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      const now = tx.now;
      db.Medias.push({ id: "med_pizza", nom: "pizza.jpg", fichier: `${"a".repeat(32)}.webp`, miniature: `${"a".repeat(32)}-s.webp`, format: "JPG", largeur: 1200, hauteur: 900, taille: 1000, alt: "Pizza", categorie: "produits", creeLe: now, creePar: "", majLe: now });
      db.Medias.push({ id: "med_inutilisee", nom: "autre.jpg", fichier: `${"b".repeat(32)}.webp`, miniature: `${"b".repeat(32)}-s.webp`, format: "JPG", largeur: 1200, hauteur: 900, taille: 1000, alt: "", categorie: "produits", creeLe: now, creePar: "", majLe: now });
      db.Categories.push({ id: "cat_pizzas", nom: "Pizzas", description: "", imageMediaId: "", visible: true, ordre: 1, stationId: "", creeLe: now, majLe: now });
      db.Categories.push({ id: "cat_secrete", nom: "Carte secrète", description: "", imageMediaId: "", visible: false, ordre: 2, stationId: "", creeLe: now, majLe: now });
      const base = { description: "", imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: [], tempsPreparationMin: null, disponible: true, visible: true, creeLe: now, majLe: now };
      db.Produits.push({ ...base, id: "prd_pizza", nom: "Pizza della casa", categorieId: "cat_pizzas", prixCentimes: 1850, imageMediaId: "med_pizza", ordre: 1 });
      db.Produits.push({ ...base, id: "prd_masque", nom: "Brouillon du chef", categorieId: "cat_pizzas", prixCentimes: 900, visible: false, ordre: 2 });
      db.Produits.push({ ...base, id: "prd_secret", nom: "Plat secret", categorieId: "cat_secrete", prixCentimes: 900, ordre: 3 });
    });
  });
  after(() => s.__releaseLock());

  it("rien n'est public avant la première publication", async () => {
    const m = await menu.publicMenu();
    assert.equal(m.publie, false);
    assert.equal(m.categories.length, 0);
    assert.equal(await menu.isPublishedFile(`${"a".repeat(32)}.webp`), false);
  });

  it("la publication met en ligne les produits visibles des catégories visibles", async () => {
    const v = await pub.publish(ACTOR, "maintenant");
    assert.equal(v.numero, 1);
    const m = await menu.publicMenu();
    assert.equal(m.publie, true);
    assert.deepEqual(m.categories.map((c) => c.nom), ["Pizzas"]);
    assert.deepEqual(m.categories[0].produits.map((p) => p.nom), ["Pizza della casa"]);
    assert.equal(m.categories[0].produits[0].image?.src, `/media/${"a".repeat(32)}.webp`);
  });

  it("seules les images de la version publiée sont servies au public", async () => {
    assert.equal(await menu.isPublishedFile(`${"a".repeat(32)}.webp`), true);
    assert.equal(await menu.isPublishedFile(`${"a".repeat(32)}-s.webp`), true);
    assert.equal(await menu.isPublishedFile(`${"b".repeat(32)}.webp`), false, "image importée mais non utilisée");
  });

  it("une modification reste en brouillon jusqu'à la publication, avec le détail avant et après", async () => {
    await s.transaction({ actor: ACTOR }, (db) => void (db.Produits.find((p) => p.id === "prd_pizza")!.prixCentimes = 1990));
    assert.equal((await product())?.prixCentimes, 1850, "le public voit encore l'ancien prix");
    assert.equal((await menu.draftMenu()).categories[0].produits[0].prixCentimes, 1990, "l'aperçu admin montre le brouillon");
    const changes = pub.draftChanges(await s.readDb());
    assert.equal(changes.length, 1);
    assert.equal(changes[0].nom, "Pizza della casa");
    assert.equal(changes[0].champ, "Prix");
    assert.match(changes[0].avant, /18,50/);
    assert.match(changes[0].apres, /19,90/);
    await pub.publish(ACTOR, "maintenant");
    assert.equal((await product())?.prixCentimes, 1990);
    assert.equal(pub.draftChanges(await s.readDb()).length, 0);
  });

  it("refuse de publier quand rien n'a changé", async () => {
    await assert.rejects(pub.publish(ACTOR, "maintenant"), (e: { code?: string }) => e.code === "conflit");
  });

  it("la disponibilité s'applique tout de suite, sans publication", async () => {
    await s.transaction({ actor: ACTOR }, (db) => void (db.Produits.find((p) => p.id === "prd_pizza")!.disponible = false));
    assert.equal((await product())?.disponible, false);
    assert.equal(pub.draftChanges(await s.readDb()).length, 0, "une rupture n'est pas un changement à publier");
    await s.transaction({ actor: ACTOR }, (db) => void (db.Produits.find((p) => p.id === "prd_pizza")!.disponible = true));
  });

  it("une publication programmée ne prend effet qu'à l'heure prévue, et peut être annulée", async () => {
    await s.transaction({ actor: ACTOR }, (db) => void (db.Produits.find((p) => p.id === "prd_pizza")!.prixCentimes = 2100));
    await assert.rejects(pub.publish(ACTOR, "programmee", new Date(Date.now() - HOUR).toISOString()), (e: { code?: string }) => e.code === "invalide");
    const when = new Date(Date.now() + 2 * HOUR).toISOString();
    const v = await pub.publish(ACTOR, "programmee", when);
    let db = await s.readDb();
    assert.equal(pub.effectiveVersion(db)?.numero, v.numero - 1, "la version en ligne ne change pas avant l'heure");
    assert.equal((await product())?.prixCentimes, 1990);
    assert.equal(pub.scheduledVersion(db)?.numero, v.numero);
    assert.equal(pub.effectiveVersion(db, Date.now() + 3 * HOUR)?.numero, v.numero, "à l'heure prévue, elle devient la version en ligne");

    await pub.cancelScheduled(ACTOR);
    db = await s.readDb();
    assert.equal(pub.scheduledVersion(db), null);
    assert.equal(pub.effectiveVersion(db, Date.now() + 3 * HOUR)?.numero, v.numero - 1);
    assert.equal(db.InstantanesVersion.some((f) => f.versionId === v.id), false, "l'instantané annulé est retiré");
    await assert.rejects(pub.cancelScheduled(ACTOR), (e: { code?: string }) => e.code === "conflit");
  });

  it("une traduction publiée s'affiche dans la langue choisie, sinon la langue principale", async () => {
    await s.transaction({ actor: ACTOR }, (db) => {
      db.Langues.push({ id: "en", nom: "English", principale: false, active: true, ordre: 2 });
      db.Traductions.push({ id: "en|produit:prd_pizza.nom", langue: "en", cle: "produit:prd_pizza.nom", valeur: "House pizza" });
    });
    await pub.publish(ACTOR, "maintenant");
    const en = await menu.publicMenu("en");
    assert.equal(en.langue, "en");
    assert.equal(en.categories[0].produits[0].nom, "House pizza");
    assert.equal(en.categories[0].nom, "Pizzas", "texte non traduit : langue principale");
    assert.equal((await menu.publicMenu("zz")).langue, "fr", "langue inconnue : langue principale");
  });

  it("bloque une publication qui viderait la carte", async () => {
    await s.transaction({ actor: ACTOR }, (db) => db.Produits.forEach((p) => (p.visible = false)));
    await assert.rejects(pub.publish(ACTOR, "maintenant"), (e: { code?: string; message: string }) => e.code === "conflit" && /carte publiée serait vide/.test(e.message));
    assert.ok((await product()), "la carte en ligne est inchangée");
    await s.transaction({ actor: ACTOR }, (db) => void (db.Produits.find((p) => p.id === "prd_pizza")!.visible = true));
  });

  it("ne conserve que les instantanés des cinq dernières versions", async () => {
    for (let i = 0; i < 6; i++) {
      await s.transaction({ actor: ACTOR }, (db) => void (db.Produits.find((p) => p.id === "prd_pizza")!.prixCentimes += 10));
      await pub.publish(ACTOR, "maintenant");
    }
    const db = await s.readDb();
    assert.ok(db.VersionsConfiguration.length >= 9);
    assert.equal(new Set(db.InstantanesVersion.map((f) => f.versionId)).size, 5);
    assert.ok(db.InstantanesVersion.every((f) => f.fragment.length <= 30000), "chaque fragment tient dans une cellule Excel");
    assert.ok((await product()), "la version en ligne reste lisible");
  });
});

describe("état d'ouverture", () => {
  let menu: Menu;
  before(async () => {
    await setup("ouverture");
    menu = await import("@/lib/server/services/menu");
  });
  after(async () => (await import("@/lib/server/storage")).__releaseLock());

  const midi = { libelle: "Déjeuner", debut: "12:00", fin: "15:00" };
  const soir = { libelle: "Dîner", debut: "19:00", fin: "23:00" };
  const horaires = [1, 2, 3, 4, 5, 6, 7].map((jour) => ({ id: `jour-${jour}`, jour, ouvert: jour !== 1, plages: jour === 1 ? [] : jour === 7 ? [midi] : [midi, soir] }));
  // Octobre 2026 : heure d'été à Paris, soit UTC+2. Le 6 est un mardi, le 5 un lundi.
  const at = (iso: string) => new Date(iso);

  it("calcule l'état dans le fuseau du restaurant", () => {
    assert.deepEqual(menu.openingState(horaires, [], "Europe/Paris", at("2026-10-06T11:30:00Z")), { ouvert: true, libelle: "Ouvert jusqu'à 15:00" });
    assert.deepEqual(menu.openingState(horaires, [], "Europe/Paris", at("2026-10-06T14:00:00Z")), { ouvert: false, libelle: "Fermé, ouvre à 19:00" });
    assert.deepEqual(menu.openingState(horaires, [], "Europe/Paris", at("2026-10-06T21:30:00Z")), { ouvert: false, libelle: "Fermé actuellement" });
    assert.deepEqual(menu.openingState(horaires, [], "Europe/Paris", at("2026-10-05T11:30:00Z")), { ouvert: false, libelle: "Fermé actuellement" });
    assert.equal(menu.openingState(horaires, [], "America/Montreal", at("2026-10-06T11:30:00Z")).ouvert, false, "7 h 30 à Montréal : fermé");
  });

  it("tient compte des fermetures exceptionnelles et des horaires non renseignés", () => {
    const exception = [{ id: "exc_1", date: "2026-10-06", motif: "Congés", service: "journee" }];
    assert.deepEqual(menu.openingState(horaires, exception, "Europe/Paris", at("2026-10-06T11:30:00Z")), { ouvert: false, libelle: "Fermeture exceptionnelle aujourd'hui" });
    assert.deepEqual(menu.openingState([], [], "Europe/Paris"), { ouvert: false, libelle: "" });
  });
});
