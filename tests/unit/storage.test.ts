import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import ExcelJS from "exceljs";
import { ACTOR, restart, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");

describe("stockage Excel", () => {
  let s: Storage;
  let dir: string;
  let workbook: string;

  before(async () => {
    ({ storage: s, dir, workbook } = await setup("stockage"));
  });
  after(() => s.__releaseLock());

  it("crée un classeur neuf avec le schéma et les réglages par défaut, sans aucun compte", async () => {
    const db = await s.readDb();
    assert.ok(fs.existsSync(workbook));
    assert.equal(db.Utilisateurs.length, 0, "aucun compte ni mot de passe par défaut");
    assert.equal(db.Roles.length, 4);
    assert.equal(db.Restaurant[0].devise, "EUR");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(workbook);
    for (const name of ["Restaurant", "Produits", "Utilisateurs", "SessionsPersonnel", "Commandes", "HistoriqueActions", "OperationsIdempotentes", "VersionsConfiguration"]) {
      assert.ok(wb.getWorksheet(name), `feuille ${name} présente`);
    }
  });

  it("sérialise 40 écritures concurrentes sans en perdre aucune", async () => {
    const before = await s.readDb();
    const rev = before._meta.revision;
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        s.transaction({ actor: ACTOR }, (db, tx) => {
          db.Categories.push({ id: tx.id("cat"), nom: `Concurrente ${i}`, description: "", imageMediaId: "", visible: true, ordre: i + 1, stationId: "", creeLe: tx.now, majLe: tx.now });
        }),
      ),
    );
    const onDisk = await s.readWorkbookFile(workbook);
    assert.equal(onDisk.Categories.filter((c) => c.nom.startsWith("Concurrente")).length, 40);
    assert.equal(new Set(onDisk.Categories.map((c) => c.id)).size, onDisk.Categories.length, "identifiants uniques");
    assert.equal(onDisk._meta.revision, rev + 40);
  });

  it("empêche les mises à jour perdues sur un même champ", async () => {
    const start = (await s.readDb()).ParametresCommandes[0].instructionsMax;
    await Promise.all(Array.from({ length: 30 }, () => s.transaction({ actor: ACTOR }, (db) => void (db.ParametresCommandes[0].instructionsMax += 1))));
    assert.equal((await s.readWorkbookFile(workbook)).ParametresCommandes[0].instructionsMax, start + 30);
  });

  it("rejoue une clé d'idempotence sans réécrire", async () => {
    const run = () => s.transaction({ actor: ACTOR, idempotencyKey: "cle-unique-1", scope: "test" }, (db, tx) => {
      const id = tx.id("alg");
      db.Allergenes.push({ id, nom: "Idempotent", ordre: 99 });
      return { id };
    });
    const [a, b] = await Promise.all([run(), run()]);
    assert.deepEqual(a, b);
    assert.equal((await s.readDb()).Allergenes.filter((x) => x.nom === "Idempotent").length, 1);
  });

  for (const step of ["write", "verify", "rename"] as const) {
    it(`échec disque à l'étape « ${step} » : erreur explicite, aucune donnée modifiée`, async () => {
      const bytes = fs.readFileSync(workbook);
      s.__injectFault(step);
      await assert.rejects(
        s.transaction({ actor: ACTOR }, (db) => void (db.Restaurant[0].nom = "Ne doit pas être enregistré")),
        (e: { code?: string; message: string }) => e.code === "stockage" && /rien n'a été modifié/i.test(e.message),
      );
      assert.deepEqual(fs.readFileSync(workbook), bytes, "le fichier principal est intact");
      assert.equal((await s.readDb()).Restaurant[0].nom, "Oliva", "le cache ne contient pas la modification échouée");
      assert.equal(fs.readdirSync(path.join(dir, "tmp")).length, 0, "aucun fichier temporaire oublié");
      // L'écriture suivante fonctionne normalement.
      await s.transaction({ actor: ACTOR }, (db) => void (db.Restaurant[0].sousTitre = `après ${step}`));
      assert.equal((await s.readWorkbookFile(workbook)).Restaurant[0].sousTitre, `après ${step}`);
    });
  }

  it("refuse une modification qui casse une relation, sans rien écrire", async () => {
    const rev = (await s.readDb())._meta.revision;
    await assert.rejects(
      s.transaction({ actor: ACTOR }, (db, tx) => {
        db.Produits.push({ id: tx.id("prd"), nom: "Orphelin", description: "", categorieId: "cat_inexistante", prixCentimes: 100, imageMediaId: "", allergeneIds: [], etiquetteIds: [], groupeOptionIds: [], tempsPreparationMin: null, disponible: true, visible: true, ordre: 1, creeLe: tx.now, majLe: tx.now });
      }),
      (e: { code?: string }) => e.code === "invalide",
    );
    assert.equal((await s.readWorkbookFile(workbook))._meta.revision, rev);
  });

  it("écrit un texte commençant par = comme du texte, jamais comme une formule", async () => {
    await s.transaction({ actor: ACTOR }, (db, tx) => void db.Allergenes.push({ id: tx.id("alg"), nom: "=1+1", ordre: 100 }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(workbook);
    let found = false;
    wb.getWorksheet("Allergenes")!.eachRow((row) => {
      const cell = row.getCell(2);
      if (cell.value === "=1+1") {
        found = true;
        assert.equal(cell.type, ExcelJS.ValueType.String);
      }
    });
    assert.ok(found, "la valeur est relue telle quelle, comme texte");
  });

  it("conserve les données après un redémarrage", async () => {
    const before = await s.readDb();
    restart(s);
    const afterRestart = await s.readDb();
    assert.equal(afterRestart._meta.revision, before._meta.revision);
    assert.equal(afterRestart.Categories.length, before.Categories.length);
    assert.equal(afterRestart.HistoriqueActions.length, before.HistoriqueActions.length);
  });

  it("refuse une seconde instance qui tente d'écrire dans le même stockage", async () => {
    restart(s);
    // Verrou tenu par une autre instance vivante (même machine, processus en cours d'exécution).
    fs.writeFileSync(path.join(dir, "data", "oliva.lock"), JSON.stringify({ pid: process.pid, instanceId: "autre-instance", host: (await import("node:os")).hostname(), at: Date.now() }));
    await assert.rejects(
      s.transaction({ actor: ACTOR }, (db) => void (db.Restaurant[0].nom = "Seconde instance")),
      (e: { code?: string; message: string }) => e.code === "verrou" && /autre instance/i.test(e.message),
    );
    assert.equal((await s.readDb()).Restaurant[0].nom, "Oliva", "la lecture reste possible, rien n'a été écrit");
    fs.rmSync(path.join(dir, "data", "oliva.lock"));
  });

  it("reprend un verrou périmé laissé par un processus arrêté", async () => {
    restart(s);
    fs.writeFileSync(path.join(dir, "data", "oliva.lock"), JSON.stringify({ pid: 999999, instanceId: "morte", host: (await import("node:os")).hostname(), at: Date.now() - 120_000 }));
    await s.transaction({ actor: ACTOR }, (db) => void (db.Restaurant[0].sousTitre = "verrou repris"));
    assert.equal((await s.readWorkbookFile(workbook)).Restaurant[0].sousTitre, "verrou repris");
  });

  it("ne remplace jamais un classeur corrompu par des données vides", async () => {
    restart(s);
    const good = fs.readFileSync(workbook);
    const garbage = Buffer.from("ceci n'est pas un classeur Excel");
    fs.writeFileSync(workbook, garbage);
    await assert.rejects(s.readDb(), (e: { code?: string; message: string }) => e.code === "stockage" && /Classeur invalide/.test(e.message));
    await assert.rejects(s.transaction({ actor: ACTOR }, (db) => void (db.Restaurant[0].nom = "X")), (e: { code?: string }) => e.code === "stockage");
    assert.deepEqual(fs.readFileSync(workbook), garbage, "le fichier corrompu n'a pas été écrasé");
    fs.writeFileSync(workbook, good);
    restart(s);
    assert.equal((await s.readDb()).Restaurant[0].nom, "Oliva");
  });

  it("ne recrée pas un classeur disparu d'un stockage déjà initialisé", async () => {
    restart(s);
    const good = fs.readFileSync(workbook);
    fs.rmSync(workbook);
    await assert.rejects(s.readDb(), (e: { code?: string; message: string }) => e.code === "stockage" && /introuvable/.test(e.message));
    assert.ok(!fs.existsSync(workbook), "aucun classeur vide n'a été créé");
    fs.writeFileSync(workbook, good);
  });

  it("restaure explicitement le classeur précédent avec la commande dédiée", async () => {
    restart(s);
    const previous = path.join(dir, "data", "oliva.precedent.xlsx");
    assert.ok(fs.existsSync(previous), "une copie de la version précédente est conservée");
    const out = await s.restoreWorkbookFrom(previous);
    assert.ok(out.revision > 0);
    assert.ok(out.ancien && fs.existsSync(out.ancien), "l'ancien classeur est gardé à côté");
    assert.equal((await s.readDb())._meta.revision, out.revision);
  });
});
