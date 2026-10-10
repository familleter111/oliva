import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Cart = typeof import("@/lib/server/services/cart");
type Publication = typeof import("@/lib/server/services/publication");

describe("panier partagé (fondations)", () => {
  let s: Storage;
  let cart: Cart;
  let pub: Publication;
  let tableId = "";
  let produitId = "";
  let sessionId = "";
  let code = "";
  const jetons: string[] = [];

  before(async () => {
    ({ storage: s } = await setup("panier"));
    cart = await import("@/lib/server/services/cart");
    pub = await import("@/lib/server/services/publication");
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      const now = tx.now;
      db.Zones.push({ id: "zon_salle", nom: "Salle", icone: "house", ordre: 1, active: true });
      tableId = tx.id("tbl");
      db.Tables.push({ id: tableId, nom: "Table 07", zoneId: "zon_salle", capacite: 6, active: true, serveurId: "", couleur: "#8FA382", archiveeLe: "", creeLe: now, majLe: now });
      db.Categories.push({ id: "cat_pizzas", nom: "Pizzas", description: "", imageMediaId: "", visible: true, ordre: 1, stationId: "", creeLe: now, majLe: now });
      produitId = tx.id("prd");
      db.Produits.push({ id: produitId, nom: "Pizza della casa", description: "Tomate, mozzarella", categorieId: "cat_pizzas", prixCentimes: 1850, imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: ["grp_sup"], tempsPreparationMin: 15, disponible: true, visible: true, ordre: 1, creeLe: now, majLe: now });
      db.GroupesOptions.push({ id: "grp_sup", nom: "Suppléments", selection: "facultative", min: 0, max: 2, ordre: 1, creeLe: now, majLe: now });
      db.Options.push({ id: "opt_mozza", groupeId: "grp_sup", nom: "Mozzarella", prixCentimes: 200, imageMediaId: "", disponible: true, ordre: 1 });
      db.ParametresCommandes[0].quantiteMax = 99;
    });
    await pub.publish(ACTOR, "maintenant");
  });
  after(() => s.__releaseLock());

  it("le personnel ouvre la session ; une seule session ouverte par table", async () => {
    const session = await cart.openTableSession(ACTOR, tableId);
    sessionId = session.id;
    code = session.code;
    assert.match(code, /^\d{4}$/);
    await assert.rejects(cart.openTableSession(ACTOR, tableId), (e: { code?: string }) => e.code === "conflit");
  });

  it("l'identifiant de table ne suffit pas : il faut le code de session", async () => {
    const wrong = code === "0000" ? "1111" : "0000";
    await assert.rejects(cart.joinSession(tableId, wrong, "Intrus"), (e: { code?: string }) => e.code === "interdit");
    await assert.rejects(cart.joinSession("tbl_inconnue", code, "Intrus"), (e: { code?: string }) => e.code === "interdit");
    await assert.rejects(cart.readCart("jeton-invente-jeton-invente-jeton"), (e: { code?: string }) => e.code === "interdit");
  });

  it("cinq personnes rejoignent la Table 07 sans compte", async () => {
    const joined = await Promise.all(["LD", "MB", "CP", "AL", "TH"].map((p) => cart.joinSession(tableId, code, p)));
    joined.forEach((j) => jetons.push(j.jeton));
    assert.equal(new Set(jetons).size, 5);
    assert.equal((await s.readDb()).Participants.filter((p) => p.sessionId === sessionId && p.statut === "admis").length, 5);
  });

  it("50 ajouts simultanés par 5 participants : aucune mise à jour perdue, total recalculé par le serveur", async () => {
    await Promise.all(jetons.flatMap((j) => Array.from({ length: 10 }, () => cart.addCartLine(j, { produitId, quantite: 1 }))));
    const view = await cart.readCart(jetons[0]);
    assert.equal(view.lignes.length, 1, "les ajouts identiques fusionnent en une ligne");
    assert.equal(view.lignes[0].quantite, 50);
    assert.equal(view.totalCentimes, 50 * 1850);
  });

  it("un ajout rejoué avec la même clé n'est compté qu'une fois", async () => {
    const add = () => cart.addCartLine(jetons[1], { produitId, quantite: 2, optionIds: ["opt_mozza"] }, "ajout-cle-0001");
    await Promise.all([add(), add(), add()]);
    const line = (await cart.readCart(jetons[1])).lignes.find((l) => l.options.length === 1);
    assert.equal(line?.quantite, 2);
    assert.equal(line?.prixUnitaireCentimes, 2050, "prix produit + option, calculé côté serveur");
  });

  it("refuse une option étrangère au produit et une quantité au-delà de la limite", async () => {
    await assert.rejects(cart.addCartLine(jetons[0], { produitId, quantite: 1, optionIds: ["opt_inconnue"] }), (e: { code?: string }) => e.code === "invalide");
    await assert.rejects(cart.addCartLine(jetons[0], { produitId, quantite: 60 }), (e: { code?: string }) => e.code === "conflit");
  });

  it("confirmations simultanées : une seule commande, figée, et le panier est vidé des lignes envoyées", async () => {
    const results = await Promise.allSettled(jetons.map((j, i) => cart.confirmCart(j, `confirmation-${i}-0001`)));
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1, "une seule confirmation aboutit");
    const db = await s.readDb();
    assert.equal(db.Commandes.filter((c) => c.sessionId === sessionId).length, 1);
    const commande = db.Commandes.find((c) => c.sessionId === sessionId)!;
    assert.equal(commande.totalCentimes, 50 * 1850 + 2 * 2050);
    assert.equal(commande.statut, "recue");
    assert.equal(db.LignesCommande.filter((l) => l.commandeId === commande.id).length, 2);
    assert.equal((await cart.readCart(jetons[0])).lignes.length, 0);
  });

  it("la même confirmation rejouée renvoie la même commande, sans doublon", async () => {
    await cart.addCartLine(jetons[2], { produitId, quantite: 1 });
    const [a, b] = await Promise.all([cart.confirmCart(jetons[2], "double-clic-00001"), cart.confirmCart(jetons[2], "double-clic-00001")]);
    assert.equal(a.commandeId, b.commandeId);
    const again = await cart.confirmCart(jetons[2], "double-clic-00001");
    assert.equal(again.commandeId, a.commandeId);
    assert.equal((await s.readDb()).Commandes.filter((c) => c.sessionId === sessionId).length, 2);
  });

  it("une commande envoyée garde ses prix quand la carte change ensuite", async () => {
    await s.transaction({ actor: ACTOR }, (db) => void (db.Produits.find((p) => p.id === produitId)!.prixCentimes = 2100));
    await pub.publish(ACTOR, "maintenant");
    const db = await s.readDb();
    const first = db.Commandes.find((c) => c.sessionId === sessionId)!;
    assert.ok(db.LignesCommande.filter((l) => l.commandeId === first.id).every((l) => l.prixUnitaireCentimes === 1850 || l.prixUnitaireCentimes === 2050));
    await cart.addCartLine(jetons[3], { produitId, quantite: 1 });
    assert.equal((await cart.readCart(jetons[3])).totalCentimes, 2100, "le nouveau panier utilise le nouveau prix publié");
  });

  it("à la fermeture, les accès sont révoqués et les prochains occupants ne voient rien d'avant", async () => {
    await cart.closeTableSession(ACTOR, sessionId);
    await assert.rejects(cart.readCart(jetons[0]), (e: { code?: string }) => e.code === "interdit");
    await assert.rejects(cart.addCartLine(jetons[0], { produitId, quantite: 1 }), (e: { code?: string }) => e.code === "interdit");
    await assert.rejects(cart.joinSession(tableId, code, "Retour"), (e: { code?: string }) => e.code === "interdit");

    const next = await cart.openTableSession(ACTOR, tableId);
    const guest = await cart.joinSession(tableId, next.code, "Nouveau");
    const view = await cart.readCart(guest.jeton);
    assert.equal(view.commandes.length, 0, "aucune commande des occupants précédents");
    assert.equal(view.lignes.length, 0);
    assert.equal((await s.readDb()).Commandes.length, 2, "les commandes passées restent enregistrées");
  });
});
