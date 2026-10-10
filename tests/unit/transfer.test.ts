import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import ExcelJS from "exceljs";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Transfer = typeof import("@/lib/server/services/transfer");

describe("import et export", () => {
  let s: Storage;
  let t: Transfer;

  before(async () => {
    ({ storage: s } = await setup("transfert"));
    t = await import("@/lib/server/services/transfer");
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      db.Categories.push({ id: "cat_pizzas", nom: "Pizzas", description: "", imageMediaId: "", visible: true, ordre: 1, stationId: "", creeLe: tx.now, majLe: tx.now });
    });
  });
  after(() => s.__releaseLock());

  const csv = (lines: string[]) => Buffer.from(["Nom;Catégorie;Prix TTC", ...lines].join("\n"), "utf8");

  it("un import invalide est refusé d'un bloc et n'écrit rien", async () => {
    const before = await s.readDb();
    const file = csv(["Pizza Margherita;Pizzas;18,50", "Salade de saison;Salades;12,50", "Boisson du jour;Pizzas;"]);
    const preview = await t.previewImport(before, "produits", file);
    assert.equal(preview.valides, 1);
    assert.equal(preview.aCorriger, 2);
    assert.match(preview.lignes[1].erreurs.join(), /Catégorie inconnue/);
    assert.match(preview.lignes[2].erreurs.join(), /Prix manquant/);
    await assert.rejects(t.applyImport(ACTOR, "produits", file), (e: { code?: string; message: string }) => e.code === "conflit" && /Aucune donnée n'a été modifiée/.test(e.message));
    const afterDb = await s.readDb();
    assert.equal(afterDb.Produits.length, 0, "aucune ligne valide n'a été importée seule");
    assert.equal(afterDb._meta.revision, before._meta.revision, "le classeur n'a pas été réécrit");
  });

  it("refuse un fichier illisible ou sans colonne obligatoire", async () => {
    const db = await s.readDb();
    await assert.rejects(t.previewImport(db, "produits", Buffer.from("PK\u0003\u0004 faux classeur")), (e: { code?: string }) => e.code === "invalide");
    const missing = await t.previewImport(db, "produits", Buffer.from("Nom;Catégorie\nPizza;Pizzas", "utf8"));
    assert.deepEqual(missing.colonnesManquantes, ["Prix TTC"]);
    await assert.rejects(t.applyImport(ACTOR, "produits", Buffer.from("Nom;Catégorie\nPizza;Pizzas", "utf8")), (e: { code?: string }) => e.code === "conflit");
  });

  it("un import valide crée les produits avec des montants en centimes", async () => {
    const out = await t.applyImport(ACTOR, "produits", csv(["Pizza Margherita;Pizzas;18,50", "Pizza Regina;Pizzas;19"]));
    assert.deepEqual(out, { lignes: 2, creations: 2, misesAJour: 0 });
    const db = await s.readDb();
    assert.deepEqual(db.Produits.map((p) => p.prixCentimes).sort(), [1850, 1900]);
    const again = await t.applyImport(ACTOR, "produits", csv(["Pizza Margherita;Pizzas;17,00"]));
    assert.equal(again.misesAJour, 1);
    assert.equal((await s.readDb()).Produits.length, 2);
  });

  it("les exports neutralisent les textes qui ressemblent à des formules", async () => {
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      db.Produits.push({ id: tx.id("prd"), nom: '=HYPERLINK("http://exemple.test";"piège")', description: "+33 danger", categorieId: "cat_pizzas", prixCentimes: 500, imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: [], tempsPreparationMin: null, disponible: true, visible: true, ordre: 9, creeLe: tx.now, majLe: tx.now });
    });
    const db = await s.readDb();
    const asCsv = (await t.exportData(db, "produits", "csv", [])).body.toString("utf8");
    assert.match(asCsv, /"'=HYPERLINK/, "le texte est préfixé pour ne pas être interprété");
    assert.match(asCsv, /"'\+33 danger"/);

    const xlsx = await t.exportData(db, "produits", "xlsx", ["nom", "prix"]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as unknown as ArrayBuffer);
    let found = false;
    wb.worksheets[0].eachRow((row) => {
      const cell = row.getCell(1);
      if (typeof cell.value === "string" && cell.value.startsWith("=HYPERLINK")) {
        found = true;
        assert.equal(cell.type, ExcelJS.ValueType.String, "cellule de type texte, pas formule");
      }
    });
    assert.ok(found);
    assert.equal(wb.worksheets[0].getRow(1).cellCount, 2, "seules les colonnes choisies sont exportées");
  });

  it("l'export des utilisateurs ne contient jamais d'empreinte de mot de passe", async () => {
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      db.Utilisateurs.push({ id: tx.id("usr"), prenom: "Léa", nom: "Martin", email: "lea@example.test", identifiant: "", motDePasseHash: "scrypt$secret-a-ne-pas-exporter", roleId: "role_cuisine", statut: "actif", zoneIds: [], stationId: "", jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: tx.now, majLe: tx.now });
    });
    const out = (await t.exportData(await s.readDb(), "utilisateurs", "csv", [])).body.toString("utf8");
    assert.match(out, /lea@example\.test/);
    assert.doesNotMatch(out, /scrypt|secret-a-ne-pas-exporter/);
  });
});
