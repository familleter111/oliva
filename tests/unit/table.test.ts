import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, describe, it } from "node:test";
import ExcelJS from "exceljs";
import { ACTOR, restart, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Cart = typeof import("@/lib/server/services/cart");
type Table = typeof import("@/lib/server/services/table");
type Publication = typeof import("@/lib/server/services/publication");

const code = (e: unknown) => (e as { code?: string }).code;

describe("parcours client d'une table", () => {
  let s: Storage;
  let cart: Cart;
  let table: Table;
  let pub: Publication;
  let workbook = "";
  let tableId = "";
  let produitId = "";
  let sessionId = "";
  let sessionCode = "";
  let vera = "";
  let lina = "";

  before(async () => {
    ({ storage: s, workbook } = await setup("table"));
    cart = await import("@/lib/server/services/cart");
    table = await import("@/lib/server/services/table");
    pub = await import("@/lib/server/services/publication");
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      const now = tx.now;
      db.Zones.push({ id: "zon_salle", nom: "Salle", icone: "house", ordre: 1, active: true });
      tableId = tx.id("tbl");
      db.Tables.push({ id: tableId, nom: "Table 07", zoneId: "zon_salle", capacite: 6, active: true, serveurId: "", couleur: "#8FA382", qrJeton: "", archiveeLe: "", creeLe: now, majLe: now });
      db.Categories.push({ id: "cat_pizzas", nom: "Pizzas", description: "", imageMediaId: "", visible: true, ordre: 1, stationId: "", creeLe: now, majLe: now });
      produitId = tx.id("prd");
      db.Produits.push({ id: produitId, nom: "Pizza della casa", description: "", categorieId: "cat_pizzas", prixCentimes: 1850, imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: [], tempsPreparationMin: 15, disponible: true, visible: true, ordre: 1, creeLe: now, majLe: now });
      db.ParametresAddition[0].fraisServiceActif = true;
      db.ParametresAddition[0].fraisServiceBp = 1000;
    });
    await pub.publish(ACTOR, "maintenant");
    const session = await cart.openTableSession(ACTOR, tableId);
    sessionId = session.id;
    sessionCode = session.code;
  });
  after(() => s.__releaseLock());

  it("l'écran d'accueil ne révèle ni code, ni panier, ni convive", async () => {
    const db0 = await s.readDb();
    const gate = table.tableGate(db0, tableId, undefined);
    assert.ok(gate?.sessionOuverte);
    assert.ok(!JSON.stringify(gate).includes(sessionCode));
    assert.deepEqual(Object.keys(gate!).sort(), ["banniere", "demande", "enAttente", "politique", "prenom", "pseudo", "qrPerime", "restaurant", "sessionOuverte", "table", "termine"]);
    assert.equal(table.tableGate(await s.readDb(), "tbl_inconnue", undefined), null);
    assert.equal(table.admitted(await s.readDb(), tableId, "jeton-invente-jeton-invente-jeton"), false);
    assert.throws(() => table.tableState(db0, "jeton-invente-jeton-invente-jeton"), (e) => code(e) === "interdit");
  });

  it("deux convives rejoignent la table et voient le même état", async () => {
    vera = (await cart.joinSession(tableId, sessionCode, "Vera")).jeton;
    lina = (await cart.joinSession(tableId, sessionCode, "")).jeton;
    const db = await s.readDb();
    assert.ok(table.admitted(db, tableId, vera));
    assert.equal(table.admitted(db, "tbl_autre", vera), false);
    const state = table.tableState(db, lina);
    assert.deepEqual(state.convives.map((c) => [c.nom, c.moi]), [["Vera", false], ["Convive 2", true]]);
    assert.ok(!JSON.stringify(state).includes("jetonHash"));
  });

  it("une instruction se modifie, et deux lignes devenues identiques fusionnent", async () => {
    await cart.addCartLine(vera, { produitId, quantite: 1 });
    await cart.addCartLine(lina, { produitId, quantite: 2, instructions: "Sans oignons" });
    let state = table.tableState(await s.readDb(), vera);
    assert.equal(state.panier.lignes.length, 2);
    const plain = state.panier.lignes.find((l) => l.instructions === "")!;
    await cart.setLineInstructions(vera, plain.id, "Sans oignons");
    state = table.tableState(await s.readDb(), vera);
    assert.equal(state.panier.lignes.length, 1);
    assert.equal(state.panier.lignes[0].quantite, 3);
    assert.equal(state.panier.totalCentimes, 5550);
    await assert.rejects(cart.setLineInstructions(vera, state.panier.lignes[0].id, "x".repeat(500)), (e) => code(e) === "invalide");
  });

  it("une ligne se retire, et une ligne déjà retirée est signalée", async () => {
    await cart.addCartLine(vera, { produitId, quantite: 1 });
    const state = table.tableState(await s.readDb(), vera);
    const extra = state.panier.lignes.find((l) => l.instructions === "")!;
    await cart.removeCartLine(lina, extra.id);
    await assert.rejects(cart.removeCartLine(lina, extra.id), (e) => code(e) === "conflit");
    assert.equal(table.tableState(await s.readDb(), vera).panier.lignes.length, 1);
  });

  it("la commande confirmée apparaît dans le suivi et l'addition, service compris", async () => {
    await cart.confirmCart(vera, "cle-commande-0001");
    const state = table.tableState(await s.readDb(), lina);
    assert.equal(state.panier.lignes.length, 0);
    assert.equal(state.commandes.length, 1);
    assert.deepEqual([state.commandes[0].rang, state.commandes[0].statut, state.commandes[0].articles], [1, "recue", 3]);
    assert.deepEqual(state.addition, { commandesCentimes: 5550, service: { actif: true, pourcentage: 10, montantCentimes: 555 }, totalCentimes: 6105, partageActif: true });
    assert.ok(state.activite.some((a) => a.type === "commande" && a.auteur === "Vera"));
  });

  it("une demande est enregistrée une seule fois tant qu'elle est en attente", async () => {
    await table.createRequest(lina, { motifId: table.MOTIF_ADDITION });
    await assert.rejects(table.createRequest(vera, { motifId: table.MOTIF_ADDITION }), (e) => code(e) === "conflit");
    await assert.rejects(table.createRequest(vera, { motifId: "mtf_invente" }), (e) => code(e) === "invalide");
    const service = table.serviceState(await s.readDb());
    assert.deepEqual(service.demandes.map((d) => [d.table, d.libelle, d.auteur]), [["Table 07", "L'addition", "Convive 2"]]);
    await table.closeRequest(ACTOR, service.demandes[0].id);
    assert.equal(table.serviceState(await s.readDb()).demandes.length, 0);
    assert.equal(table.tableState(await s.readDb(), vera).demandes[0].statut, "traitee");
    await table.createRequest(vera, { motifId: table.MOTIF_ADDITION });
  });

  it("le personnel fait avancer la commande selon ses droits, et le client le voit", async () => {
    const order = table.serviceState(await s.readDb()).commandes[0];
    await assert.rejects(table.setOrderStatus(ACTOR, order.id, "preparation", { preparer: false, servir: true }), (e) => code(e) === "interdit");
    await table.setOrderStatus(ACTOR, order.id, "preparation", { preparer: true, servir: false });
    assert.equal(table.tableState(await s.readDb(), vera).commandes[0].statut, "preparation");
    await assert.rejects(table.setOrderStatus(ACTOR, order.id, "servie", { preparer: true, servir: false }), (e) => code(e) === "interdit");
    await assert.rejects(table.setOrderStatus(ACTOR, order.id, "invente", { preparer: true, servir: true }), (e) => code(e) === "invalide");
    await table.setOrderStatus(ACTOR, order.id, "servie", { preparer: false, servir: true });
    const service = table.serviceState(await s.readDb());
    assert.deepEqual([service.commandes.length, service.servies.length], [0, 1]);
  });

  it("sans commandes successives, le panier se ferme mais le suivi reste lisible", async () => {
    await s.transaction({ actor: ACTOR }, (db) => {
      db.ParametresCommandes[0].commandesSuccessives = false;
    });
    await cart.addCartLine(vera, { produitId, quantite: 1 });
    await cart.confirmCart(vera, "cle-commande-0002");
    const state = table.tableState(await s.readDb(), lina);
    assert.equal(state.reglages.panierOuvert, false);
    assert.equal(state.commandes.length, 2);
    await assert.rejects(cart.addCartLine(lina, { produitId, quantite: 1 }), (e) => code(e) === "conflit");
  });

  it("un convive qui quitte la table, ou une session fermée, perd tout accès", async () => {
    await table.leaveSession(lina);
    assert.equal(table.admitted(await s.readDb(), tableId, lina), false);
    await cart.closeTableSession(ACTOR, sessionId);
    const db = await s.readDb();
    assert.equal(table.admitted(db, tableId, vera), false);
    assert.throws(() => table.tableState(db, vera), (e) => code(e) === "interdit");
    await assert.rejects(table.createRequest(vera, { motifId: table.MOTIF_ADDITION }), (e) => code(e) === "interdit");
    assert.equal(table.tableGate(db, tableId, vera)?.sessionOuverte, false);
    assert.equal(table.tableGate(db, tableId, vera)?.termine, true);
    assert.equal(table.tableGate(db, tableId, undefined)?.termine, false);
  });

  it("un classeur de la version précédente est lu tel quel, puis mis à niveau à la prochaine écriture", async () => {
    restart(s);
    // Reconstitue un classeur au schéma 1 : sans la feuille des demandes clients.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(workbook);
    wb.removeWorksheet(wb.getWorksheet("DemandesClient")!.id);
    wb.getWorksheet("_Meta")!.eachRow((row) => {
      if (row.getCell(1).value === "schemaVersion") row.getCell(2).value = "1";
    });
    await wb.xlsx.writeFile(workbook);
    const before = fs.statSync(workbook).mtimeMs;

    const db = await s.readDb();
    assert.equal(db.DemandesClient.length, 0);
    assert.equal(db.Commandes.length, 2);
    assert.equal(fs.statSync(workbook).mtimeMs, before, "une simple lecture ne doit pas réécrire le classeur");

    await s.transaction({ actor: ACTOR }, (draft) => {
      draft.Restaurant[0].sousTitre = "Après mise à niveau";
    });
    const check = new ExcelJS.Workbook();
    await check.xlsx.readFile(workbook);
    assert.ok(check.getWorksheet("DemandesClient"));
    assert.equal((await s.readDb()).Commandes.length, 2);
  });
});
