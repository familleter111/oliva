import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Auth } from "@/lib/server/auth/resolve";
import type { PermissionCode, Row } from "@/lib/server/schema";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Cart = typeof import("@/lib/server/services/cart");
type Table = typeof import("@/lib/server/services/table");
type Salle = typeof import("@/lib/server/services/salle");
type Publication = typeof import("@/lib/server/services/publication");

const code = (e: unknown) => (e as { code?: string }).code;

/** Fabrique une session de personnel sans passer par la connexion : seuls le rôle et les droits comptent ici. */
function fakeAuth(user: Row<"Utilisateurs">, role: Row<"Roles">, perms: string[]): Auth {
  return {
    session: { id: `ses_${user.id}` } as Row<"SessionsPersonnel">,
    user,
    role,
    permissions: new Map(perms.map((p) => [p, "toutes"])),
    csrf: "csrf",
    actor: { id: user.id, nom: user.prenom },
    can: (p: PermissionCode) => perms.includes(p),
  };
}

describe("espace serveur", () => {
  let s: Storage;
  let cart: Cart;
  let table: Table;
  let salle: Salle;
  let pub: Publication;
  let hugo: Auth;
  let sarah: Auth;
  let patron: Auth;
  let t7 = "";
  let t9 = "";
  let produitId = "";
  let sessionId = "";
  let vera = "";
  let commandeId = "";

  before(async () => {
    ({ storage: s } = await setup("salle"));
    cart = await import("@/lib/server/services/cart");
    table = await import("@/lib/server/services/table");
    salle = await import("@/lib/server/services/salle");
    pub = await import("@/lib/server/services/publication");

    // Les rôles « Serveur » et « Administrateur » sont livrés par l'installation : on les réutilise tels quels.
    const roles = { serveur: {} as Row<"Roles">, patron: {} as Row<"Roles"> };
    const membre = (id: string, prenom: string, roleId: string): Row<"Utilisateurs"> => ({
      id, prenom, nom: "", email: `${prenom}@test.local`, identifiant: "", motDePasseHash: "", roleId, statut: "actif",
      zoneIds: [], stationId: "", jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: "", majLe: "",
    });
    const uHugo = membre("usr_hugo", "Hugo", "role_serveur");
    const uSarah = membre("usr_sarah", "Sarah", "role_serveur");
    const uPatron = membre("usr_patron", "Camille", "role_admin");

    await s.transaction({ actor: ACTOR }, (db, tx) => {
      const now = tx.now;
      roles.serveur = db.Roles.find((r) => r.id === "role_serveur")!;
      roles.patron = db.Roles.find((r) => r.id === "role_admin")!;
      db.Utilisateurs.push(uHugo, uSarah, uPatron);
      db.Zones.push({ id: "zon_salle", nom: "Salle principale", icone: "house", ordre: 1, active: true });
      t7 = tx.id("tbl");
      t9 = tx.id("tbl");
      db.Tables.push(
        { id: t7, nom: "Table 07", zoneId: "zon_salle", capacite: 6, active: true, serveurId: uHugo.id, couleur: "#8FA382", qrJeton: "", archiveeLe: "", creeLe: now, majLe: now },
        { id: t9, nom: "Table 09", zoneId: "zon_salle", capacite: 4, active: true, serveurId: uSarah.id, couleur: "#8FA382", qrJeton: "", archiveeLe: "", creeLe: now, majLe: now },
      );
      db.Categories.push({ id: "cat_pizzas", nom: "Pizzas", description: "", imageMediaId: "", visible: true, ordre: 1, stationId: "", creeLe: now, majLe: now });
      produitId = tx.id("prd");
      db.Produits.push({ id: produitId, nom: "Pizza della casa", description: "Tomate, mozzarella.", categorieId: "cat_pizzas", prixCentimes: 1850, imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: [], tempsPreparationMin: 15, disponible: true, visible: true, ordre: 1, creeLe: now, majLe: now });
      db.ParametresAddition[0].fraisServiceActif = true;
      db.ParametresAddition[0].fraisServiceBp = 1000;
    });
    await pub.publish(ACTOR, "maintenant");

    hugo = fakeAuth(uHugo, roles.serveur, ["commandes.voir", "commandes.servir"]);
    sarah = fakeAuth(uSarah, roles.serveur, ["commandes.voir", "commandes.servir"]);
    patron = fakeAuth(uPatron, roles.patron, ["commandes.voir", "commandes.servir", "preparation.changer"]);

    const session = await cart.openTableSession(ACTOR, t7);
    sessionId = session.id;
    vera = (await cart.joinSession(t7, session.code, "Vera")).jeton;
    await cart.addCartLine(vera, { produitId, quantite: 2, instructions: "Sans oignons" });
    commandeId = (await cart.confirmCart(vera, "cle-salle-1")).commandeId;
  });
  after(() => s.__releaseLock());

  it("la portée du rôle limite les tables, un identifiant dans l'URL ne suffit pas", async () => {
    const db = await s.readDb();
    assert.deepEqual(
      salle.homeOf(db, hugo).tables.map((t) => t.nom),
      ["Table 07"],
    );
    assert.deepEqual(
      salle.homeOf(db, sarah).tables.map((t) => t.nom),
      ["Table 09"],
    );
    assert.deepEqual(
      salle.homeOf(db, patron).tables.map((t) => t.nom),
      ["Table 07", "Table 09"],
    );
    // Sarah connaît l'identifiant de la table de Hugo : elle n'y accède pas pour autant.
    assert.throws(() => salle.tableDetail(db, sarah, t7), (e) => code(e) === "introuvable");
    assert.throws(() => salle.orderDetail(db, sarah, commandeId), (e) => code(e) === "introuvable");
    assert.throws(() => salle.billDetail(db, sarah, sessionId), (e) => code(e) === "introuvable");
    assert.equal(salle.tableDetail(db, hugo, t7).commandes.length, 1);
  });

  it("une commande n'arrive dans « À servir » qu'une fois signalée prête par la cuisine", async () => {
    assert.equal(salle.serveList(await s.readDb(), hugo).aServir.length, 0);
    await table.setOrderStatus(ACTOR, commandeId, "preparation", { preparer: true, servir: false });
    assert.equal(salle.serveList(await s.readDb(), hugo).aServir.length, 0);
    await table.setOrderStatus(ACTOR, commandeId, "prete", { preparer: true, servir: false });

    const db = await s.readDb();
    const liste = salle.serveList(db, hugo);
    assert.equal(liste.aServir.length, 1);
    assert.equal(liste.aServir[0].table, "Table 07");
    assert.equal(liste.aServir[0].articles, 2);
    assert.deepEqual(liste.aServir[0].notes, [{ nom: "Pizza della casa", texte: "Sans oignons" }]);
    assert.equal(salle.serveList(db, sarah).aServir.length, 0);
    assert.equal(salle.countsOf(db, hugo).aServir, 1);
    assert.equal(salle.homeOf(db, hugo).priorites[0].texte, "Servir la commande 01.");
  });

  it("marquer servi exige la permission, et le convive voit le changement", async () => {
    const sansDroit = fakeAuth(hugo.user, hugo.role, ["commandes.voir"]);
    await assert.rejects(() => salle.markServed(sansDroit, commandeId), (e) => code(e) === "interdit");
    await assert.rejects(() => salle.markServed(sarah, commandeId), (e) => code(e) === "introuvable");

    await salle.markServed(hugo, commandeId);
    const db = await s.readDb();
    assert.equal(salle.serveList(db, hugo).aServir.length, 0);
    assert.equal(salle.serveList(db, hugo).servies.length, 1);
    assert.equal(table.tableState(db, vera).commandes[0].statut, "servie");
    await assert.rejects(() => salle.markServed(hugo, commandeId), (e) => code(e) === "conflit");
  });

  it("une demande passe par la prise en charge, visible aussitôt par la table", async () => {
    const { id } = await table.createRequest(vera, { motifId: "mtf_autre", message: "Sans fromage ?" });
    let db = await s.readDb();
    assert.equal(salle.requestDetail(db, hugo, id).statut, "en_attente");
    assert.equal(table.tableState(db, vera).demandes[0].statut, "en_attente");
    await assert.rejects(() => salle.takeRequest(sarah, id), (e) => code(e) === "introuvable");

    await salle.takeRequest(hugo, id);
    db = await s.readDb();
    const prise = salle.requestDetail(db, hugo, id);
    assert.equal(prise.statut, "en_cours");
    assert.equal(prise.parMoi, true);
    assert.equal(prise.prisePar, "Hugo");
    assert.equal(salle.requestDetail(db, patron, id).parMoi, false);
    assert.equal(table.tableState(db, vera).demandes[0].statut, "en_cours");
    await assert.rejects(() => salle.takeRequest(hugo, id), (e) => code(e) === "conflit");

    await salle.finishRequest(hugo, id);
    db = await s.readDb();
    assert.equal(salle.requestDetail(db, hugo, id).statut, "traitee");
    assert.equal(table.tableState(db, vera).demandes[0].statut, "traitee");
    assert.equal(salle.countsOf(db, hugo).demandes, 0);
  });

  it("la demande d'addition crée une addition à remettre, que le serveur remet une seule fois", async () => {
    await table.createRequest(vera, { motifId: table.MOTIF_ADDITION });
    let db = await s.readDb();
    let addition = salle.billDetail(db, hugo, sessionId).addition;
    assert.equal(addition.statut, "a_remettre");
    // 2 × 18,50 € plus 10 % de service.
    assert.equal(addition.commandesCentimes, 3700);
    assert.equal(addition.serviceCentimes, 370);
    assert.equal(addition.totalCentimes, 4070);
    assert.equal(salle.countsOf(db, hugo).additions, 1);

    await assert.rejects(() => salle.deliverBill(sarah, sessionId), (e) => code(e) === "introuvable");
    await salle.deliverBill(hugo, sessionId);
    db = await s.readDb();
    addition = salle.billDetail(db, hugo, sessionId).addition;
    assert.equal(addition.statut, "remise");
    assert.equal(addition.remisePar, "Hugo");
    // La demande d'addition est close du même coup : la table a reçu ce qu'elle attendait.
    assert.equal(table.tableState(db, vera).demandes.filter((d) => d.statut !== "traitee").length, 0);
    await assert.rejects(() => salle.deliverBill(hugo, sessionId), (e) => code(e) === "conflit");
  });

  it("la clôture de la session fige l'addition, même si les frais de service changent ensuite", async () => {
    await cart.closeTableSession(ACTOR, sessionId);
    let db = await s.readDb();
    const figee = salle.billDetail(db, hugo, sessionId).addition;
    assert.equal(figee.statut, "cloturee");
    assert.equal(figee.totalCentimes, 4070);
    assert.ok(figee.clotureeLe !== "");

    await s.transaction({ actor: ACTOR }, (dbx) => {
      dbx.ParametresAddition[0].fraisServiceBp = 2000;
    });
    db = await s.readDb();
    assert.equal(salle.billDetail(db, hugo, sessionId).addition.totalCentimes, 4070);
    assert.deepEqual(
      salle.billList(db, hugo).map((b) => b.statut),
      ["cloturee"],
    );
    // Session fermée : plus aucune action possible sur son addition.
    await assert.rejects(() => salle.deliverBill(hugo, sessionId), (e) => code(e) === "conflit");
  });
});
