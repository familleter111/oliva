import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Auth } from "@/lib/server/auth/resolve";
import type { PermissionCode, Row } from "@/lib/server/schema";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Cart = typeof import("@/lib/server/services/cart");
type Table = typeof import("@/lib/server/services/table");
type Cuisine = typeof import("@/lib/server/services/cuisine");
type Publication = typeof import("@/lib/server/services/publication");

const code = (e: unknown) => (e as { code?: string }).code;

/** Session de personnel fabriquée directement : seuls le rôle, la station et les droits comptent ici. */
function fakeAuth(user: Row<"Utilisateurs">, role: Row<"Roles">, perms: string[]): Auth {
  return {
    session: { id: `ses_${user.id}` } as Row<"SessionsPersonnel">,
    user,
    role,
    permissions: new Map(perms.map((p) => [p, "ma_station"])),
    csrf: "csrf",
    actor: { id: user.id, nom: user.prenom },
    can: (p: PermissionCode) => perms.includes(p),
  };
}

describe("écran de cuisine", () => {
  let s: Storage;
  let cart: Cart;
  let table: Table;
  let cuisine: Cuisine;
  let pub: Publication;
  let lea: Auth;
  let marco: Auth;
  let vera = "";
  let commandeId = "";
  let dessertId = "";

  before(async () => {
    ({ storage: s } = await setup("cuisine"));
    cart = await import("@/lib/server/services/cart");
    table = await import("@/lib/server/services/table");
    cuisine = await import("@/lib/server/services/cuisine");
    pub = await import("@/lib/server/services/publication");

    const membre = (id: string, prenom: string, stationId: string): Row<"Utilisateurs"> => ({
      id, prenom, nom: "", email: `${prenom}@test.local`, identifiant: "", motDePasseHash: "", roleId: "role_cuisine", statut: "actif",
      zoneIds: [], stationId, jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: "", majLe: "",
    });
    const uLea = membre("usr_lea", "Léa", "sta_chaud");
    const uMarco = membre("usr_marco", "Marco", "sta_froid");
    let role = {} as Row<"Roles">;
    let tableId = "";

    await s.transaction({ actor: ACTOR }, (db, tx) => {
      const now = tx.now;
      role = db.Roles.find((r) => r.id === "role_cuisine")!;
      db.Utilisateurs.push(uLea, uMarco);
      db.StationsPreparation.push(
        { id: "sta_chaud", nom: "Cuisine chaude", icone: "oven", utilisateurIds: [], notifierServeur: true, ordre: 1 },
        { id: "sta_froid", nom: "Garde-manger", icone: "leaf", utilisateurIds: [], notifierServeur: true, ordre: 2 },
      );
      db.Zones.push({ id: "zon_salle", nom: "Salle principale", icone: "house", ordre: 1, active: true });
      tableId = tx.id("tbl");
      db.Tables.push({ id: tableId, nom: "Table 07", zoneId: "zon_salle", capacite: 4, active: true, serveurId: "", couleur: "#8FA382", qrJeton: "", archiveeLe: "", creeLe: now, majLe: now });
      // Deux catégories acheminées vers deux stations différentes : c'est ce qui sépare le travail.
      db.Categories.push(
        { id: "cat_pizzas", nom: "Pizzas", description: "", imageMediaId: "", visible: true, ordre: 1, stationId: "sta_chaud", creeLe: now, majLe: now },
        { id: "cat_desserts", nom: "Desserts", description: "", imageMediaId: "", visible: true, ordre: 2, stationId: "sta_froid", creeLe: now, majLe: now },
      );
      const base = { description: "", imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: [], tempsPreparationMin: 10, disponible: true, visible: true, creeLe: now, majLe: now };
      db.Produits.push(
        { ...base, id: "prd_pizza", nom: "Pizza della casa", categorieId: "cat_pizzas", prixCentimes: 1850, ordre: 1 },
        { ...base, id: "prd_tiramisu", nom: "Tiramisu", categorieId: "cat_desserts", prixCentimes: 750, ordre: 2 },
      );
    });
    await pub.publish(ACTOR, "maintenant");

    lea = fakeAuth(uLea, role, ["commandes.voir", "preparation.changer"]);
    marco = fakeAuth(uMarco, role, ["commandes.voir", "preparation.changer"]);

    const session = await cart.openTableSession(ACTOR, tableId);
    vera = (await cart.joinSession(tableId, session.code, "Vera")).jeton;
    await cart.addCartLine(vera, { produitId: "prd_pizza", quantite: 2, instructions: "Bien cuite" });
    await cart.addCartLine(vera, { produitId: "prd_tiramisu", quantite: 1 });
    commandeId = (await cart.confirmCart(vera, "cle-cuisine-1")).commandeId;

    // Une seconde commande, uniquement au garde-manger : Léa ne doit jamais la voir.
    await cart.addCartLine(vera, { produitId: "prd_tiramisu", quantite: 2 });
    dessertId = (await cart.confirmCart(vera, "cle-cuisine-2")).commandeId;
  });
  after(() => s.__releaseLock());

  it("chaque station ne voit que ses plats, et le reste de la commande est signalé", async () => {
    const db = await s.readDb();
    const vueLea = cuisine.kitchenOf(db, lea);
    assert.deepEqual(vueLea.stations, ["Cuisine chaude"]);
    assert.equal(vueLea.aPreparer.length, 1, "la commande de desserts seuls ne la concerne pas");
    const cmd = vueLea.aPreparer[0];
    assert.deepEqual(cmd.lignes.map((l) => l.nom), ["Pizza della casa"]);
    assert.equal(cmd.lignes[0].quantite, 2);
    assert.equal(cmd.lignes[0].instructions, "Bien cuite");
    assert.equal(cmd.partielle, true, "le tiramisu part ailleurs");
    assert.equal(cmd.suivant?.nom, "En préparation");

    const vueMarco = cuisine.kitchenOf(db, marco);
    assert.deepEqual(vueMarco.aPreparer.map((c) => c.id).sort(), [commandeId, dessertId].sort());
  });

  it("la cuisine fait avancer sa commande, jamais celle d'une autre station", async () => {
    // Léa ne connaît pas la commande de desserts, et l'identifiant ne lui ouvre rien.
    await assert.rejects(() => cuisine.advanceKitchenOrder(lea, dessertId, "preparation"), (e) => code(e) === "introuvable");

    await cuisine.advanceKitchenOrder(lea, commandeId, "preparation");
    let db = await s.readDb();
    assert.equal(table.tableState(db, vera).commandes.find((c) => c.id === commandeId)?.statut, "preparation", "le convive voit le changement");
    assert.equal(cuisine.kitchenOf(db, lea).aPreparer[0].statutNom, "En préparation");

    await cuisine.advanceKitchenOrder(lea, commandeId, "prete");
    db = await s.readDb();
    const vue = cuisine.kitchenOf(db, lea);
    assert.equal(vue.aPreparer.length, 0, "le travail de cuisine est terminé");
    assert.equal(vue.pretes.length, 1, "la commande attend le service");
    assert.equal(vue.pretes[0].suivant, null, "la cuisine ne propose jamais de servir");
  });

  it("servir ne relève pas de la cuisine, même en forçant le statut", async () => {
    await assert.rejects(() => cuisine.advanceKitchenOrder(lea, commandeId, "servie"), (e) => code(e) === "interdit");
    assert.equal((await s.readDb()).Commandes.find((c) => c.id === commandeId)?.statut, "prete");
  });

  it("sans station attribuée, l'écran reste vide plutôt que de tout montrer", async () => {
    const orphelin = { ...lea.user, id: "usr_orphelin", stationId: "" };
    const sansStation = fakeAuth(orphelin, lea.role, ["commandes.voir", "preparation.changer"]);
    const vue = cuisine.kitchenOf(await s.readDb(), sansStation);
    assert.deepEqual(vue.stations, []);
    assert.equal(vue.toutesStations, false);
    assert.equal(vue.aPreparer.length, 0);
    assert.equal(vue.pretes.length, 0);
  });
});
