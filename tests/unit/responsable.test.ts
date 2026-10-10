import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Auth } from "@/lib/server/auth/resolve";
import type { PermissionCode, Row } from "@/lib/server/schema";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Cart = typeof import("@/lib/server/services/cart");
type Table = typeof import("@/lib/server/services/table");
type Chef = typeof import("@/lib/server/services/responsable");
type Publication = typeof import("@/lib/server/services/publication");

const code = (e: unknown) => (e as { code?: string }).code;

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

describe("espace responsable de salle", () => {
  let s: Storage;
  let cart: Cart;
  let table: Table;
  let chef: Chef;
  let pub: Publication;
  let camille: Auth;
  let hugo: Auth;
  let t7 = "";
  let t9 = "";
  let produitId = "";
  let sessionId = "";
  let vera = "";

  before(async () => {
    ({ storage: s } = await setup("responsable"));
    cart = await import("@/lib/server/services/cart");
    table = await import("@/lib/server/services/table");
    chef = await import("@/lib/server/services/responsable");
    pub = await import("@/lib/server/services/publication");

    const roles = { resp: {} as Row<"Roles">, serveur: {} as Row<"Roles"> };
    const membre = (id: string, prenom: string, roleId: string): Row<"Utilisateurs"> => ({
      id, prenom, nom: "", email: `${prenom}@test.local`, identifiant: "", motDePasseHash: "", roleId, statut: "actif",
      zoneIds: [], stationId: "", jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: "", majLe: "",
    });
    const uCamille = membre("usr_camille", "Camille", "role_responsable");
    const uHugo = membre("usr_hugo", "Hugo", "role_serveur");
    const uSarah = membre("usr_sarah", "Sarah", "role_serveur");
    const uLea = membre("usr_lea", "Lea", "role_cuisine");

    await s.transaction({ actor: ACTOR }, (db, tx) => {
      const now = tx.now;
      roles.resp = db.Roles.find((r) => r.id === "role_responsable")!;
      roles.serveur = db.Roles.find((r) => r.id === "role_serveur")!;
      db.Utilisateurs.push(uCamille, uHugo, uSarah, uLea);
      db.Zones.push({ id: "zon_salle", nom: "Salle principale", icone: "house", ordre: 1, active: true });
      t7 = tx.id("tbl");
      t9 = tx.id("tbl");
      db.Tables.push(
        { id: t7, nom: "Table 07", zoneId: "zon_salle", capacite: 6, active: true, serveurId: uHugo.id, couleur: "#8FA382", archiveeLe: "", creeLe: now, majLe: now },
        { id: t9, nom: "Table 09", zoneId: "zon_salle", capacite: 4, active: true, serveurId: "", couleur: "#8FA382", archiveeLe: "", creeLe: now, majLe: now },
      );
      db.ObjetsPlan.push({ id: tx.id("obj"), zoneId: "zon_salle", type: "table_ronde", tableId: t7, libelle: "", x: 100, y: 100, largeur: 90, hauteur: 90, rotation: 0, ordre: 1 });
      db.Categories.push({ id: "cat_pizzas", nom: "Pizzas", description: "", imageMediaId: "", visible: true, ordre: 1, stationId: "", creeLe: now, majLe: now });
      produitId = tx.id("prd");
      db.Produits.push({ id: produitId, nom: "Pizza della casa", description: "", categorieId: "cat_pizzas", prixCentimes: 1850, imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: [], tempsPreparationMin: 15, disponible: true, visible: true, ordre: 1, creeLe: now, majLe: now });
    });
    await pub.publish(ACTOR, "maintenant");

    camille = fakeAuth(uCamille, roles.resp, ["tables.affecter", "sessions.gerer", "commandes.voir", "commandes.servir"]);
    hugo = fakeAuth(uHugo, roles.serveur, ["commandes.voir", "commandes.servir"]);

    const session = await cart.openTableSession(ACTOR, t7);
    sessionId = session.id;
    vera = (await cart.joinSession(t7, session.code, "Vera")).jeton;
    await cart.addCartLine(vera, { produitId, quantite: 2 });
    await cart.confirmCart(vera, "cle-chef-1");
  });
  after(() => s.__releaseLock());

  it("l'état de chaque table est recalculé, jamais repris du navigateur", async () => {
    const db = await s.readDb();
    const tables = chef.chefTables(db, camille);
    const sept = tables.find((t) => t.id === t7)!;
    const neuf = tables.find((t) => t.id === t9)!;
    assert.equal(sept.etat, "en_service");
    assert.equal(sept.convives, 1);
    assert.equal(sept.serveur, "Hugo");
    assert.equal(sept.enPreparation, 1);
    assert.equal(neuf.etat, "libre");
    assert.equal(neuf.serveur, "");

    const board = chef.sessionsBoard(db, camille);
    assert.deepEqual(board.actives.map((t) => t.nom), ["Table 07"]);
    assert.deepEqual(board.disponibles.map((t) => t.nom), ["Table 09"]);
    assert.equal(board.stats.tablesOccupees, 1);
    assert.equal(board.stats.tablesTotal, 2);
    // Le plan dessiné dans l'administration est repris tel quel.
    assert.equal(chef.floorZones(db)[0].objets[0].tableId, t7);
  });

  it("la cuisine signale la commande prête : la table bascule en « à servir »", async () => {
    const cmd = (await s.readDb()).Commandes[0].id;
    await table.setOrderStatus(ACTOR, cmd, "prete", { preparer: true, servir: false });
    const db = await s.readDb();
    const vue = chef.overview(db, camille);
    assert.equal(vue.tables.find((t) => t.id === t7)!.etat, "a_servir");
    assert.equal(vue.stats.aServir, 1);
    assert.equal(vue.priorites[0].libelle, "Commande prête");
    assert.equal(vue.priorites[0].serveur, "Hugo");
    // L'équipe ne liste que les membres autorisés à servir : la cuisine n'y figure pas.
    assert.deepEqual(vue.equipe.map((m) => m.nom), ["Camille", "Hugo", "Sarah"]);
    assert.deepEqual(
      vue.equipe.filter((m) => m.etat === "en_service").map((m) => m.nom),
      ["Hugo"],
    );
  });

  it("réaffecter une table demande la permission et conserve commandes et demandes", async () => {
    await assert.rejects(() => chef.assignTable(hugo, t7, "usr_sarah"), (e) => code(e) === "interdit");
    await assert.rejects(() => chef.assignTable(camille, t7, "usr_lea"), (e) => code(e) === "invalide");
    await assert.rejects(() => chef.assignTable(camille, t7, "usr_hugo"), (e) => code(e) === "conflit");

    await chef.assignTable(camille, t7, "usr_sarah", "Commande 01 prête à servir.");
    const db = await s.readDb();
    const sept = chef.chefTables(db, camille).find((t) => t.id === t7)!;
    assert.equal(sept.serveur, "Sarah");
    assert.equal(sept.pretes, 1, "la commande est restée sur la table");
    assert.equal(db.Commandes[0].tableId, t7);
    const trace = db.HistoriqueActions.find((h) => h.action === "affectation");
    assert.ok(trace?.libelle.includes("Sarah"), "le transfert n'est pas journalisé");
    assert.ok(trace?.libelle.includes("Commande 01 prête à servir."), "la note de passation n'est pas conservée");
  });

  it("une demande attribuée passe en cours au nom du serveur désigné, et la table le voit", async () => {
    const { id } = await table.createRequest(vera, { motifId: "mtf_eau" });
    await assert.rejects(() => chef.assignRequest(hugo, id, "usr_sarah"), (e) => code(e) === "interdit");
    await assert.rejects(() => chef.assignRequest(camille, id, "usr_lea"), (e) => code(e) === "invalide");

    await chef.assignRequest(camille, id, "usr_sarah");
    const db = await s.readDb();
    const demande = chef.requestsBoard(db, camille).demandes.find((d) => d.id === id)!;
    assert.equal(demande.statut, "en_cours");
    assert.equal(demande.prisePar, "Sarah");
    assert.equal(table.tableState(db, vera).demandes[0].statut, "en_cours");
    // La table qui a un serveur est proposée par défaut pour l'attribution suivante.
    assert.equal(chef.requestsBoard(db, camille).parTable[t7], "usr_sarah");
    await assert.rejects(() => chef.assignRequest(camille, id, "usr_sarah"), (e) => code(e) === "conflit");
  });

  it("le suivi du service nomme le serveur de chaque commande", async () => {
    const db = await s.readDb();
    const vue = chef.serviceFollow(db, camille);
    assert.equal(vue.commandes.length, 1);
    assert.equal(vue.commandes[0].serveur, "Sarah");
    assert.equal(vue.commandes[0].prete, true);
    assert.deepEqual(vue.serveurs.map((x) => x.nom), ["Camille", "Hugo", "Sarah"]);
  });

  it("la fermeture de la session libère la table et fige son addition", async () => {
    await cart.closeTableSession(ACTOR, sessionId);
    const db = await s.readDb();
    const sept = chef.chefTables(db, camille).find((t) => t.id === t7)!;
    assert.equal(sept.etat, "libre");
    assert.equal(sept.sessionId, "");
    assert.equal(sept.serveur, "Sarah", "l'affectation de la table survit à la session");
    assert.equal(db.AdditionsTable.find((a) => a.sessionId === sessionId)?.statut, "cloturee");
    // Une demande encore ouverte n'a plus de destinataire une fois la table partie.
    assert.deepEqual([...new Set(db.DemandesClient.filter((d) => d.sessionId === sessionId).map((d) => d.statut))], ["traitee"]);
    assert.equal(chef.sessionsBoard(db, camille).actives.length, 0);
  });
});
