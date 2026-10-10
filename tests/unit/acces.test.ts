import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Access = typeof import("@/lib/server/services/access");
type Table = typeof import("@/lib/server/services/table");

const code = (e: unknown) => (e as { code?: string }).code;

/**
 * Demande d'accès à une table : depuis le QR code ou depuis la carte publique.
 * Rien n'est accordé avant que le personnel ait confirmé la personne.
 */
describe("demande d'accès à une table", () => {
  let s: Storage;
  let a: Access;
  let table: Table;
  let t1 = "";
  let t2 = "";

  before(async () => {
    ({ storage: s } = await setup("acces"));
    a = await import("@/lib/server/services/access");
    table = await import("@/lib/server/services/table");
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      db.Zones.push({ id: "zon_salle", nom: "Salle", icone: "house", ordre: 1, active: true });
      t1 = tx.id("tbl");
      t2 = tx.id("tbl");
      db.Tables.push({ id: t1, nom: "Table 01", zoneId: "zon_salle", capacite: 4, active: true, serveurId: "", couleur: "#8FA382", qrJeton: "", archiveeLe: "", creeLe: tx.now, majLe: tx.now });
      db.Tables.push({ id: t2, nom: "Table 02", zoneId: "zon_salle", capacite: 2, active: false, serveurId: "", couleur: "#8FA382", qrJeton: "", archiveeLe: "", creeLe: tx.now, majLe: tx.now });
    });
  });
  after(() => s.__releaseLock());

  it("la carte publique propose les tables en service, sans rien dévoiler du service", async () => {
    const tables = a.publicTables(await s.readDb());
    assert.deepEqual(
      tables.map((t) => t.nom),
      ["Table 01"],
      "une table désactivée n'est pas proposée",
    );
    assert.equal(tables[0].occupee, false);
    assert.deepEqual(Object.keys(tables[0]).sort(), ["capacite", "id", "nom", "occupee", "zone"]);
  });

  it("une demande n'ouvre aucun droit tant que le personnel n'a pas confirmé", async () => {
    const { jeton, statut } = await a.requestSeat(t1, "Camille", "accueil");
    assert.equal(statut, "en_attente");

    const db = await s.readDb();
    assert.equal(a.seatOf(db, t1, jeton)?.statut, "en_attente");
    assert.equal(table.tableGate(db, t1, jeton)?.demande, "en_attente");
    assert.equal(table.admitted(db, t1, jeton), false, "le jeton ne donne encore accès à rien");
    assert.throws(() => table.tableState(db, jeton), (e) => code(e) === "interdit");
    assert.equal(db.SessionsTable.length, 0, "aucune session n'est ouverte par une simple demande");

    const attente = a.pendingSeats(db);
    assert.equal(attente.length, 1);
    assert.equal(attente[0].pseudo, "Camille");
    assert.equal(attente[0].table, "Table 01");
    assert.ok(!JSON.stringify(attente).includes(jeton), "le jeton du client ne ressort jamais");
  });

  it("le personnel accepte : la session s'ouvre et le jeton déjà reçu devient celui du convive", async () => {
    const { jeton } = await a.requestSeat(t1, "Yanis", "qr");
    const demande = a.pendingSeats(await s.readDb()).find((d) => d.pseudo === "Yanis")!;
    await a.acceptSeat(ACTOR, demande.id);

    const db = await s.readDb();
    assert.equal(table.admitted(db, t1, jeton), true);
    const etat = table.tableState(db, jeton);
    assert.equal(etat.table.id, t1);
    assert.ok(etat.convives.some((c) => c.nom === "Yanis" && c.moi));
    assert.equal(db.SessionsTable.filter((x) => x.statut === "ouverte").length, 1, "la session de la table a été ouverte");
    assert.equal(db.Paniers.length, 1, "un panier partagé accompagne la session");
    await assert.rejects(a.acceptSeat(ACTOR, demande.id), (e) => code(e) === "conflit");
  });

  it("une table refusée le reste, et la personne peut redemander", async () => {
    const { jeton } = await a.requestSeat(t1, "Inès", "accueil");
    const demande = a.pendingSeats(await s.readDb()).find((d) => d.pseudo === "Inès")!;
    await a.refuseSeat(ACTOR, demande.id);

    const db = await s.readDb();
    assert.equal(a.seatOf(db, t1, jeton)?.statut, "refusee");
    assert.equal(table.tableGate(db, t1, jeton)?.demande, "refusee");
    assert.equal(table.admitted(db, t1, jeton), false);
    assert.ok(!a.pendingSeats(db).some((d) => d.pseudo === "Inès"), "la demande refusée quitte la liste du personnel");
    await assert.rejects(a.refuseSeat(ACTOR, demande.id), (e) => code(e) === "conflit");
  });

  it("une table hors service n'accepte aucune demande", async () => {
    await assert.rejects(a.requestSeat(t2, "Léo", "accueil"), (e) => code(e) === "introuvable");
    await assert.rejects(a.requestSeat("tbl_inventee", "Léo", "accueil"), (e) => code(e) === "introuvable");
  });

  it("le personnel remplace le QR code : l'ancienne affichette est reconnue comme périmée", async () => {
    const avant = (await s.readDb()).Tables.find((t) => t.id === t1)!;
    assert.equal(a.qrAccepte(avant, undefined), true, "sans remplacement, toute affichette reste valable");

    const { qrJeton } = await a.renewTableQr(ACTOR, t1);
    assert.ok(qrJeton.length > 8);
    const db = await s.readDb();
    const apres = db.Tables.find((t) => t.id === t1)!;
    assert.equal(a.qrAccepte(apres, qrJeton), true);
    assert.equal(a.qrAccepte(apres, "ancien-jeton"), false);
    assert.equal(a.qrAccepte(apres, undefined), false);
    assert.equal(table.tableGate(db, t1, undefined, "ancien-jeton")?.qrPerime, true);
    assert.equal(table.tableGate(db, t1, undefined, qrJeton)?.qrPerime, false);
  });
});
