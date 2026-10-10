import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import ExcelJS from "exceljs";
import { bucket as depot } from "@/lib/server/store/bucket";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Backups = typeof import("@/lib/server/services/backups");


describe("sauvegardes et restauration", () => {
  let s: Storage;
  let b: Backups;
  let dir: string;
  let backupId = "";

  before(async () => {
    ({ storage: s, dir } = await setup("sauvegardes"));
    b = await import("@/lib/server/services/backups");
    fs.mkdirSync(path.join(dir, "media"), { recursive: true });
    fs.writeFileSync(path.join(dir, "media", `${"c".repeat(32)}.webp`), "image");
    fs.writeFileSync(path.join(dir, "media", `${"c".repeat(32)}-s.webp`), "miniature");
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      const now = tx.now;
      db.Utilisateurs.push({ id: "usr_admin", prenom: "Ada", nom: "Admin", email: "ada@example.test", identifiant: "", motDePasseHash: "scrypt$x", roleId: "role_admin", statut: "actif", zoneIds: [], stationId: "", jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: now, majLe: now });
      db.SessionsPersonnel.push({ id: "ses_admin", utilisateurId: "usr_admin", jetonHash: "h", creeLe: now, vueLe: now, expireLe: new Date(Date.now() + 3600e3).toISOString(), revoqueeLe: "", navigateur: "", ip: "" });
      db.Medias.push({ id: "med_1", nom: "plat.jpg", fichier: `${"c".repeat(32)}.webp`, miniature: `${"c".repeat(32)}-s.webp`, format: "JPG", largeur: 800, hauteur: 600, taille: 5, alt: "", categorie: "produits", creeLe: now, creePar: "", majLe: now });
      db.Zones.push({ id: "zon_salle", nom: "Salle", icone: "house", ordre: 1, active: true });
      db.Tables.push({ id: "tbl_1", nom: "Table 01", zoneId: "zon_salle", capacite: 4, active: true, serveurId: "", couleur: "#8FA382", archiveeLe: "", creeLe: now, majLe: now });
      db.Categories.push({ id: "cat_origine", nom: "Catégorie d'origine", description: "", imageMediaId: "med_1", visible: true, ordre: 1, stationId: "", creeLe: now, majLe: now });
      db.Restaurant[0].nom = "Avant sauvegarde";
      tx.log({ action: "modification", libelle: "État initial", entite: "Restaurant", entiteNom: "Avant sauvegarde" });
    });
  });
  after(() => s.__releaseLock());

  it("crée une copie cohérente du classeur et des images", async () => {
    const m = await b.createBackup(ACTOR, "Avant la carte d'hiver");
    backupId = m.id;
    assert.match(m.id, /^manuel-\d{8}-\d{6}-[a-f0-9]{4}$/);
    assert.equal(m.note, "Avant la carte d'hiver");
    assert.equal(m.medias, 2);
    const folder = path.join(dir, "backups", m.id);
    assert.ok(fs.existsSync(path.join(folder, "oliva.xlsx")));
    assert.ok(fs.existsSync(path.join(folder, "media", `${"c".repeat(32)}.webp`)));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(folder, "oliva.xlsx"));
    assert.ok(wb.getWorksheet("Categories"), "la sauvegarde est un vrai classeur Excel");
    assert.equal((await b.listBackups()).manuelles.length, 1);
  });

  it("refuse un identifiant de sauvegarde qui sortirait du dossier", async () => {
    const db = await s.readDb();
    for (const id of ["../data", "..\\..\\data", "manuel-20260101-000000-zzzz/../..", ""]) {
      await assert.rejects(b.previewRestore(id, db), (e: { code?: string }) => e.code === "invalide");
      assert.throws(() => b.backupWorkbookKey(id), (e: { code?: string }) => e.code === "invalide");
    }
  });

  it("prépare la restauration sans rien écrire", async () => {
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      db.Restaurant[0].nom = "Après sauvegarde";
      db.Categories.push({ id: "cat_ajoutee", nom: "Ajoutée ensuite", description: "", imageMediaId: "", visible: true, ordre: 2, stationId: "", creeLe: tx.now, majLe: tx.now });
      tx.log({ action: "modification", libelle: "Changement postérieur", entite: "Restaurant", entiteNom: "Après sauvegarde" });
    });
    const before = await s.readDb();
    const preview = await b.previewRestore(backupId, before);
    assert.deepEqual(preview.blocages, []);
    const cats = preview.comparaison.find((c) => c.element === "Catégorie");
    assert.deepEqual([cats?.actuel, cats?.sauvegarde], [2, 1]);
    assert.equal((await s.readDb())._meta.revision, before._meta.revision, "la préparation ne modifie pas le classeur");
  });

  it("bloque la restauration tant qu'une session de table est ouverte", async () => {
    await s.transaction({ actor: ACTOR }, (db, tx) => void db.SessionsTable.push({ id: "stb_1", tableId: "tbl_1", statut: "ouverte", code: "1234", ouverteLe: tx.now, ouvertePar: "usr_admin", fermeeLe: "", fermeePar: "" }));
    const preview = await b.previewRestore(backupId, await s.readDb());
    assert.equal(preview.blocages.length, 1);
    await assert.rejects(b.restoreBackup(ACTOR, backupId), (e: { code?: string }) => e.code === "conflit");
    assert.equal((await s.readDb()).Restaurant[0].nom, "Après sauvegarde", "rien n'a été restauré");
    await s.transaction({ actor: ACTOR }, (db) => void (db.SessionsTable[0].statut = "fermee"));
  });

  it("restaure la configuration en conservant l'historique et les sessions du personnel", async () => {
    fs.rmSync(path.join(dir, "media", `${"c".repeat(32)}.webp`));
    const out = await b.restoreBackup(ACTOR, backupId);
    const db = await s.readDb();
    assert.equal(db.Restaurant[0].nom, "Avant sauvegarde");
    assert.deepEqual(db.Categories.map((c) => c.id), ["cat_origine"]);
    assert.ok(db.HistoriqueActions.some((e) => e.libelle === "Changement postérieur"), "l'historique postérieur à la sauvegarde est conservé");
    assert.ok(db.HistoriqueActions.some((e) => e.libelle === "Sauvegarde restaurée"));
    assert.equal(db.SessionsPersonnel.length, 1, "la session de l'administrateur reste valide");
    assert.equal(db.SessionsTable.length, 0, "les sessions de table ne sont pas rouvertes");
    assert.ok(fs.existsSync(path.join(dir, "media", `${"c".repeat(32)}.webp`)), "l'image manquante est recopiée depuis la sauvegarde");

    const list = await b.listBackups();
    assert.equal(list.manuelles.length, 2, "une sauvegarde de sécurité a été créée avant la restauration");
    const safety = list.manuelles.find((m) => m.id === out.securite);
    assert.equal(safety?.note, "Avant restauration");
    const kept = await s.readWorkbookBuffer((await depot().get(b.backupWorkbookKey(out.securite)))!);
    assert.equal(kept.Restaurant[0].nom, "Après sauvegarde", "l'état d'avant restauration reste récupérable");
  });

  it("refuse une sauvegarde sans administrateur actif", async () => {
    const cle = b.backupWorkbookKey(backupId);
    const original = (await depot().get(cle))!;
    const db = await s.readWorkbookBuffer(original);
    db.Utilisateurs[0].statut = "suspendu";
    const { encodeWorkbook } = await import("@/lib/server/workbook");
    await depot().put(cle, await encodeWorkbook(db), { ecraser: true });
    const preview = await b.previewRestore(backupId, await s.readDb());
    assert.ok(preview.blocages.some((x) => /aucun administrateur actif/.test(x)));
    await assert.rejects(b.restoreBackup(ACTOR, backupId), (e: { code?: string }) => e.code === "conflit");
    await depot().put(cle, original, { ecraser: true });
  });

  it("supprime une sauvegarde sur demande", async () => {
    await b.deleteBackup(ACTOR, backupId);
    assert.ok(!fs.existsSync(path.join(dir, "backups", backupId)));
    await assert.rejects(b.deleteBackup(ACTOR, backupId), (e: { code?: string }) => e.code === "introuvable");
  });
});

describe("archivage de l'historique", () => {
  let s: Storage;
  let dir: string;
  before(async () => {
    ({ storage: s, dir } = await setup("historique"));
  });
  after(() => s.__releaseLock());

  it("déplace les plus anciennes actions dans un classeur d'archive quand le journal grossit", async () => {
    await s.transaction({ actor: ACTOR }, (db, tx) => {
      for (let i = 0; i < 5001; i++) {
        db.HistoriqueActions.push({ id: `evt_${String(i).padStart(5, "0")}`, date: tx.now, auteurId: "", auteurNom: "Test", action: "modification", libelle: `Action ${i}`, entite: "", entiteId: "", entiteNom: "", resultat: "Appliqué", avant: null, apres: null });
      }
    });
    const db = await s.readDb();
    assert.equal(db.HistoriqueActions.length, 4001);
    assert.equal(db.HistoriqueActions[0].libelle, "Action 1000", "les plus anciennes sont sorties du classeur principal");
    const files = fs.readdirSync(path.join(dir, "data", "archives"));
    assert.equal(files.length, 1);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(dir, "data", "archives", files[0]));
    assert.equal(wb.worksheets[0].rowCount, 1001, "1000 actions archivées et une ligne d'en-tête");
    assert.equal(wb.worksheets[0].getRow(2).getCell(6).value, "Action 0");
  });
});
