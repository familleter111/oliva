import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { SCHEMA_VERSION } from "@/lib/server/schema";
import { bucket } from "@/lib/server/store/bucket";
import { ACTOR, setup } from "./helpers";

type Storage = typeof import("@/lib/server/storage");
type Workbook = typeof import("@/lib/server/workbook");

/**
 * La forme JSON est ce qui part en base de données. Elle doit rendre exactement
 * le même contenu que le classeur Excel, et refuser tout enregistrement douteux.
 */
describe("forme JSON de la base", () => {
  let s: Storage;
  let w: Workbook;

  before(async () => {
    ({ storage: s } = await setup("base-json"));
    w = await import("@/lib/server/workbook");
    await s.transaction({ actor: ACTOR }, (db) => {
      db.Restaurant[0].sousTitre = "Cuisine d'été";
      db.Categories.push({ id: "cat_json", nom: "Tapas", description: "", imageMediaId: "", visible: true, ordre: 9, stationId: "", creeLe: "2026-01-01T00:00:00.000Z", majLe: "2026-01-01T00:00:00.000Z" });
    });
  });

  it("rend exactement le même contenu après un aller-retour", async () => {
    const db = await s.readDb();
    const relu = w.decodeJsonDb(w.encodeJsonDb(db));
    assert.equal(w.fingerprint(relu), w.fingerprint(db));
    assert.equal(relu.Categories.find((c) => c.id === "cat_json")?.nom, "Tapas");
    assert.equal(relu.Restaurant[0].sousTitre, "Cuisine d'été");
  });

  it("donne le même contenu que le classeur Excel", async () => {
    const db = await s.readDb();
    const parExcel = await w.decodeWorkbook(await w.encodeWorkbook(db));
    const parJson = w.decodeJsonDb(w.encodeJsonDb(db));
    assert.equal(w.fingerprint(parJson), w.fingerprint(parExcel));
  });

  it("ignore les colonnes inconnues et refuse les types faux", async () => {
    const db = await s.readDb();
    const brut = JSON.parse(w.encodeJsonDb(db)) as Record<string, unknown>;
    (brut.Categories as Record<string, unknown>[])[0].colonneInventee = "à jeter";
    assert.ok(!("colonneInventee" in w.decodeJsonDb(JSON.stringify(brut)).Categories[0]), "la colonne parasite ne revient pas");

    const faux = JSON.parse(w.encodeJsonDb(db)) as Record<string, unknown>;
    (faux.Categories as Record<string, unknown>[])[0].ordre = "trois";
    assert.throws(() => w.decodeJsonDb(JSON.stringify(faux)), (e: { code?: string }) => e.code === "stockage");
  });

  it("refuse un enregistrement illisible ou venu d'une version plus récente", async () => {
    assert.throws(() => w.decodeJsonDb("{ pas du json"), (e: { code?: string }) => e.code === "stockage");
    assert.throws(() => w.decodeJsonDb(JSON.stringify({ _meta: { schemaVersion: 99 } })), (e: { code?: string }) => e.code === "stockage");
  });

  it("met à niveau un enregistrement écrit par une version plus ancienne", async () => {
    const db = await s.readDb();
    const ancien = JSON.parse(w.encodeJsonDb(db)) as Record<string, unknown>;
    // Version 1 du schéma : ni les demandes des clients, ni les additions, ni les demandes d'accès n'existaient.
    (ancien._meta as Record<string, unknown>).schemaVersion = 1;
    delete ancien.DemandesClient;
    delete ancien.AdditionsTable;
    delete ancien.DemandesAcces;
    // La colonne du jeton de QR code est apparue en version 4 : elle manque, elle doit prendre sa valeur par défaut.
    for (const t of ancien.Tables as Record<string, unknown>[]) delete t.qrJeton;
    const relu = w.decodeJsonDb(JSON.stringify(ancien));
    assert.equal(relu._meta.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(relu.DemandesClient, []);
    assert.deepEqual(relu.AdditionsTable, []);
    assert.deepEqual(relu.DemandesAcces, [], "les tables ajoutées depuis sont vides");
    assert.equal(relu.Categories.length, db.Categories.length, "le reste des données est intact");
  });

  it("refuse une table absente qui existait déjà dans cette version du schéma", async () => {
    const db = await s.readDb();
    const amputé = JSON.parse(w.encodeJsonDb(db)) as Record<string, unknown>;
    delete amputé.Produits;
    assert.throws(() => w.decodeJsonDb(JSON.stringify(amputé)), (e: { message: string }) => /Produits/.test(e.message));
  });
});

/** Le dépôt de fichiers sert les images et les sauvegardes, sur disque comme en ligne. */
describe("dépôt de fichiers", () => {
  before(async () => {
    await setup("base-depot");
  });

  it("écrit, relit, liste et efface", async () => {
    const d = bucket();
    assert.equal(d.nom, "disque");
    await d.put("media/aaaa.webp", Buffer.from("image"));
    assert.equal((await d.get("media/aaaa.webp"))?.toString(), "image");
    assert.equal(await d.get("media/absent.webp"), null);

    await d.copy("media/aaaa.webp", "backups/manuel-20260101-000000-abcd/media/aaaa.webp");
    const liste = await d.list("media");
    assert.deepEqual(liste.map((e) => e.cle), ["media/aaaa.webp"]);

    await d.removeAll("backups/manuel-20260101-000000-abcd");
    assert.equal((await d.list("backups/manuel-20260101-000000-abcd/media")).length, 0);

    await d.remove("media/aaaa.webp");
    assert.equal(await d.get("media/aaaa.webp"), null);
  });

  it("choisit le dépôt d'après la configuration, sans jamais préférer le disque éphémère", () => {
    const avant = { blob: process.env.BLOB_READ_WRITE_TOKEN, base: process.env.DATABASE_URL };
    try {
      assert.equal(bucket().nom, "disque", "sans configuration distante, le disque");
      process.env.DATABASE_URL = "postgres://exemple/base";
      assert.equal(bucket().nom, "base", "une base configurée accueille aussi les fichiers");
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_exemple";
      assert.equal(bucket().nom, "blob", "un dépôt Blob reste prioritaire sur la base");
    } finally {
      process.env.BLOB_READ_WRITE_TOKEN = avant.blob ?? "";
      process.env.DATABASE_URL = avant.base ?? "";
    }
    assert.equal(bucket().nom, "disque", "la configuration d'essai est bien retirée");
  });

  it("refuse une clé qui sortirait du dépôt", async () => {
    const d = bucket();
    for (const cle of ["../secret", "media/../../etc/passwd", "/absolu", ""]) {
      await assert.rejects(d.put(cle, Buffer.from("x")), (e: { code?: string }) => e.code === "invalide", cle);
    }
  });
});
