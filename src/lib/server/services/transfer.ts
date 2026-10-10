import "server-only";
import ExcelJS from "exceljs";
import { parseMoney } from "../../format";
import { blankRow, fullName, nextOrdre } from "../db-utils";
import { AppError, conflit, invalide } from "../errors";
import type { Db, Row } from "../schema";
import { transaction, type Actor, type Tx } from "../storage";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const IMPORT_MAX_ROWS = 1000;

/* ================================================================ export */

interface ExportColumn<R> {
  key: string;
  label: string;
  get: (row: R, db: Db) => string | number;
}
interface ExportDef<R> {
  label: string;
  rows: (db: Db) => R[];
  columns: ExportColumn<R>[];
}
const oui = (b: boolean) => (b ? "oui" : "non");

const produits: ExportDef<Row<"Produits">> = {
  label: "Produits",
  rows: (db) => [...db.Produits].sort((a, b) => a.ordre - b.ordre),
  columns: [
    { key: "nom", label: "Nom", get: (p) => p.nom },
    { key: "categorie", label: "Catégorie", get: (p, db) => db.Categories.find((c) => c.id === p.categorieId)?.nom ?? "" },
    { key: "prix", label: "Prix TTC", get: (p) => p.prixCentimes / 100 },
    { key: "description", label: "Description", get: (p) => p.description },
    { key: "disponible", label: "Disponible", get: (p) => oui(p.disponible) },
    { key: "visible", label: "Visible", get: (p) => oui(p.visible) },
    { key: "allergenes", label: "Allergènes", get: (p, db) => p.allergeneIds.map((id) => db.Allergenes.find((a) => a.id === id)?.nom ?? "").filter(Boolean).join(", ") },
    { key: "temps", label: "Temps de préparation (min)", get: (p) => p.tempsPreparationMin ?? "" },
  ],
};
const categories: ExportDef<Row<"Categories">> = {
  label: "Catégories",
  rows: (db) => [...db.Categories].sort((a, b) => a.ordre - b.ordre),
  columns: [
    { key: "nom", label: "Nom", get: (c) => c.nom },
    { key: "description", label: "Description", get: (c) => c.description },
    { key: "visible", label: "Visible", get: (c) => oui(c.visible) },
    { key: "produits", label: "Nombre de produits", get: (c, db) => db.Produits.filter((p) => p.categorieId === c.id).length },
  ],
};
const tables: ExportDef<Row<"Tables">> = {
  label: "Tables",
  rows: (db) => db.Tables.filter((t) => !t.archiveeLe),
  columns: [
    { key: "nom", label: "Nom", get: (t) => t.nom },
    { key: "zone", label: "Zone", get: (t, db) => db.Zones.find((z) => z.id === t.zoneId)?.nom ?? "" },
    { key: "capacite", label: "Capacité", get: (t) => t.capacite },
    { key: "active", label: "Active", get: (t) => oui(t.active) },
  ],
};
const utilisateurs: ExportDef<Row<"Utilisateurs">> = {
  label: "Utilisateurs",
  rows: (db) => db.Utilisateurs,
  // Les empreintes de mots de passe et les jetons ne sont jamais exportés.
  columns: [
    { key: "nom", label: "Nom", get: (u) => fullName(u) },
    { key: "email", label: "E-mail", get: (u) => u.email },
    { key: "role", label: "Rôle", get: (u, db) => db.Roles.find((r) => r.id === u.roleId)?.nom ?? "" },
    { key: "statut", label: "Statut", get: (u) => u.statut },
    { key: "zones", label: "Zones", get: (u, db) => u.zoneIds.map((id) => db.Zones.find((z) => z.id === id)?.nom ?? "").filter(Boolean).join(", ") },
  ],
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EXPORTS: Record<string, ExportDef<any>> = { produits, categories, tables, utilisateurs };

export const exportCatalog = () => Object.entries(EXPORTS).map(([type, d]) => ({ type, label: d.label, colonnes: d.columns.map((c) => ({ key: c.key, label: c.label })) }));

/** Un texte commençant par = + - @ serait interprété comme une formule par un tableur : il est neutralisé. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const toCsv = (rows: (string | number)[][]) => `﻿${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;

export async function exportData(db: Db, type: string, format: "xlsx" | "csv", wanted: string[]) {
  const def = EXPORTS[type];
  if (!def) throw invalide("Type d'export inconnu.");
  const columns = wanted.length > 0 ? def.columns.filter((c) => wanted.includes(c.key)) : def.columns;
  if (columns.length === 0) throw invalide("Choisissez au moins une colonne.");
  const rows = def.rows(db).map((r) => columns.map((c) => c.get(r, db)));
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `oliva-${type}-${stamp}.${format}`;

  if (format === "csv") {
    return { filename, contentType: "text/csv; charset=utf-8", body: Buffer.from(toCsv([columns.map((c) => c.label), ...rows]), "utf8") };
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Oliva";
  const ws = wb.addWorksheet(def.label);
  ws.addRow(columns.map((c) => c.label));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const row = ws.addRow(r);
    // Les textes sont écrits comme valeurs texte : jamais comme formules.
    row.eachCell((cell) => {
      if (typeof cell.value === "string") cell.numFmt = "@";
    });
  }
  columns.forEach((c, i) => (ws.getColumn(i + 1).width = Math.max(14, c.label.length + 6)));
  return { filename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: Buffer.from(await wb.xlsx.writeBuffer()) };
}

/* ================================================================ import */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw invalide("Ce fichier Excel est illisible.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw invalide("Le classeur ne contient aucune feuille.");
  const rows: string[][] = [];
  ws.eachRow((row) => {
    const out: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value;
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        const o = v as unknown as Record<string, unknown>;
        // Les formules ne sont pas évaluées : la cellule est signalée, jamais interprétée.
        if ("formula" in o || "sharedFormula" in o) out.push("#FORMULE");
        else if (Array.isArray(o.richText)) out.push((o.richText as { text: string }[]).map((p) => p.text).join(""));
        else out.push(String(o.text ?? ""));
      } else out.push(v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    }
    rows.push(out);
  });
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

interface Field {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}
export interface ImportLine {
  n: number;
  cells: Record<string, string>;
  action: "creation" | "mise_a_jour";
  erreurs: string[];
}
export interface ImportPreview {
  type: string;
  colonnes: { key: string; label: string }[];
  colonnesManquantes: string[];
  lignes: ImportLine[];
  valides: number;
  aCorriger: number;
}
interface ImportDef {
  label: string;
  fields: Field[];
  /** Valide une ligne et retourne la fonction qui l'appliquera. */
  plan: (cells: Record<string, string>, db: Db, seen: Set<string>) => { erreurs: string[]; action: ImportLine["action"]; apply: (db: Db, tx: Tx) => void };
}

const yes = (s: string, fallback: boolean) => (s.trim() === "" ? fallback : ["oui", "o", "true", "vrai", "1", "yes"].includes(norm(s)));

const IMPORTS: Record<string, ImportDef> = {
  produits: {
    label: "Produits",
    fields: [
      { key: "nom", label: "Nom", aliases: ["nom", "name", "produit"], required: true },
      { key: "categorie", label: "Catégorie", aliases: ["categorie", "category"], required: true },
      { key: "prix", label: "Prix TTC", aliases: ["prix", "prix ttc", "price"], required: true },
      { key: "description", label: "Description", aliases: ["description"] },
      { key: "disponible", label: "Disponible", aliases: ["disponible"] },
      { key: "visible", label: "Visible", aliases: ["visible"] },
    ],
    plan: (cells, db, seen) => {
      const erreurs: string[] = [];
      const nomP = cells.nom.trim();
      if (!nomP) erreurs.push("Nom manquant");
      else if (nomP.length > 80) erreurs.push("Nom trop long (80 caractères)");
      const cat = db.Categories.find((c) => norm(c.nom) === norm(cells.categorie));
      if (!cells.categorie.trim()) erreurs.push("Catégorie manquante");
      else if (!cat) erreurs.push(`Catégorie inconnue : ${cells.categorie.trim()}`);
      const prix = parseMoney(cells.prix);
      if (!cells.prix.trim()) erreurs.push("Prix manquant");
      else if (prix === null) erreurs.push("Prix invalide");
      if (cells.description.length > 500) erreurs.push("Description trop longue (500 caractères)");
      const key = `${norm(nomP)}|${cat?.id ?? ""}`;
      if (nomP && seen.has(key)) erreurs.push("Ligne en double dans le fichier");
      seen.add(key);
      const existing = cat ? db.Produits.find((p) => p.categorieId === cat.id && norm(p.nom) === norm(nomP)) : undefined;
      return {
        erreurs,
        action: existing ? "mise_a_jour" : "creation",
        apply: (d, tx) => {
          const target = d.Produits.find((p) => p.categorieId === cat!.id && norm(p.nom) === norm(nomP));
          if (target) {
            target.prixCentimes = prix!;
            if (cells.description.trim()) target.description = cells.description.trim();
            if (cells.disponible.trim()) target.disponible = yes(cells.disponible, target.disponible);
            if (cells.visible.trim()) target.visible = yes(cells.visible, target.visible);
            target.majLe = tx.now;
          } else {
            d.Produits.push({ ...(blankRow("Produits") as unknown as Row<"Produits">), id: tx.id("prd"), nom: nomP, description: cells.description.trim(), categorieId: cat!.id, prixCentimes: prix!, disponible: yes(cells.disponible, true), visible: yes(cells.visible, true), ordre: nextOrdre(d.Produits), creeLe: tx.now, majLe: tx.now });
          }
        },
      };
    },
  },
  categories: {
    label: "Catégories",
    fields: [
      { key: "nom", label: "Nom", aliases: ["nom", "name", "categorie"], required: true },
      { key: "description", label: "Description", aliases: ["description"] },
      { key: "visible", label: "Visible", aliases: ["visible"] },
    ],
    plan: (cells, db, seen) => {
      const erreurs: string[] = [];
      const nomC = cells.nom.trim();
      if (!nomC) erreurs.push("Nom manquant");
      else if (nomC.length > 60) erreurs.push("Nom trop long (60 caractères)");
      if (cells.description.length > 300) erreurs.push("Description trop longue (300 caractères)");
      if (nomC && seen.has(norm(nomC))) erreurs.push("Ligne en double dans le fichier");
      seen.add(norm(nomC));
      const existing = db.Categories.find((c) => norm(c.nom) === norm(nomC));
      return {
        erreurs,
        action: existing ? "mise_a_jour" : "creation",
        apply: (d, tx) => {
          const target = d.Categories.find((c) => norm(c.nom) === norm(nomC));
          if (target) {
            if (cells.description.trim()) target.description = cells.description.trim();
            if (cells.visible.trim()) target.visible = yes(cells.visible, target.visible);
            target.majLe = tx.now;
          } else {
            d.Categories.push({ ...(blankRow("Categories") as unknown as Row<"Categories">), id: tx.id("cat"), nom: nomC, description: cells.description.trim(), visible: yes(cells.visible, true), ordre: nextOrdre(d.Categories), creeLe: tx.now, majLe: tx.now });
          }
        },
      };
    },
  },
  tables: {
    label: "Tables",
    fields: [
      { key: "nom", label: "Nom", aliases: ["nom", "name", "table"], required: true },
      { key: "zone", label: "Zone", aliases: ["zone", "salle"], required: true },
      { key: "capacite", label: "Capacité", aliases: ["capacite", "places", "couverts"], required: true },
    ],
    plan: (cells, db, seen) => {
      const erreurs: string[] = [];
      const nomT = cells.nom.trim();
      if (!nomT) erreurs.push("Nom manquant");
      else if (nomT.length > 30) erreurs.push("Nom trop long (30 caractères)");
      const zone = db.Zones.find((z) => norm(z.nom) === norm(cells.zone));
      if (!cells.zone.trim()) erreurs.push("Zone manquante");
      else if (!zone) erreurs.push(`Zone inconnue : ${cells.zone.trim()}`);
      const cap = Number(cells.capacite.trim());
      if (!cells.capacite.trim()) erreurs.push("Capacité manquante");
      else if (!Number.isInteger(cap) || cap < 1 || cap > 50) erreurs.push("Capacité invalide (1 à 50)");
      if (nomT && seen.has(norm(nomT))) erreurs.push("Ligne en double dans le fichier");
      seen.add(norm(nomT));
      const existing = db.Tables.find((t) => !t.archiveeLe && norm(t.nom) === norm(nomT));
      return {
        erreurs,
        action: existing ? "mise_a_jour" : "creation",
        apply: (d, tx) => {
          const target = d.Tables.find((t) => !t.archiveeLe && norm(t.nom) === norm(nomT));
          if (target) {
            target.zoneId = zone!.id;
            target.capacite = cap;
            target.majLe = tx.now;
          } else {
            d.Tables.push({ ...(blankRow("Tables") as unknown as Row<"Tables">), id: tx.id("tbl"), nom: nomT, zoneId: zone!.id, capacite: cap, active: true, couleur: "#8FA382", creeLe: tx.now, majLe: tx.now });
          }
        },
      };
    },
  },
};

export const importCatalog = () => Object.entries(IMPORTS).map(([type, d]) => ({ type, label: d.label, colonnes: d.fields.map((f) => ({ label: f.label, obligatoire: !!f.required })) }));

async function analyse(db: Db, type: string, buf: Buffer) {
  const def = IMPORTS[type];
  if (!def) throw invalide("Type d'import inconnu.");
  if (buf.length === 0) throw invalide("Le fichier est vide.");
  if (buf.length > IMPORT_MAX_BYTES) throw invalide("Fichier trop volumineux : 2 Mo maximum.");
  const isXlsx = buf[0] === 0x50 && buf[1] === 0x4b;
  const rows = isXlsx ? await parseXlsx(buf) : parseCsv(buf.toString("utf8"));
  if (rows.length < 2) throw invalide("Le fichier ne contient aucune ligne de données sous l'en-tête.");
  if (rows.length - 1 > IMPORT_MAX_ROWS) throw invalide(`Trop de lignes : ${IMPORT_MAX_ROWS} maximum par import.`);

  const header = rows[0].map(norm);
  const index = new Map<string, number>();
  for (const f of def.fields) {
    const i = header.findIndex((h) => f.aliases.includes(h));
    if (i >= 0) index.set(f.key, i);
  }
  const colonnesManquantes = def.fields.filter((f) => f.required && !index.has(f.key)).map((f) => f.label);

  const seen = new Set<string>();
  const plans = rows.slice(1).map((r, i) => {
    const cells: Record<string, string> = {};
    for (const f of def.fields) cells[f.key] = index.has(f.key) ? (r[index.get(f.key)!] ?? "").trim() : "";
    const p = def.plan(cells, db, seen);
    if (Object.values(cells).includes("#FORMULE")) p.erreurs.push("Formule non autorisée");
    return { n: i + 1, cells, ...p };
  });
  const preview: ImportPreview = {
    type,
    colonnes: def.fields.map((f) => ({ key: f.key, label: f.label })),
    colonnesManquantes,
    lignes: plans.map(({ n, cells, action, erreurs }) => ({ n, cells, action, erreurs })),
    valides: plans.filter((p) => p.erreurs.length === 0).length,
    aCorriger: plans.filter((p) => p.erreurs.length > 0).length,
  };
  return { def, plans, preview };
}

/** Analyse sans rien écrire. */
export async function previewImport(db: Db, type: string, buf: Buffer): Promise<ImportPreview> {
  return (await analyse(db, type, buf)).preview;
}

/** Applique l'import d'un bloc, uniquement si toutes les lignes sont valides au moment de l'écriture. */
export function applyImport(actor: Actor, type: string, buf: Buffer) {
  return transaction({ actor }, async (db, tx) => {
    const { def, plans, preview } = await analyse(db, type, buf);
    if (preview.colonnesManquantes.length > 0) throw conflit(`Import refusé : colonne(s) manquante(s) : ${preview.colonnesManquantes.join(", ")}. Aucune donnée n'a été modifiée.`);
    if (preview.aCorriger > 0) throw new AppError("conflit", `Import refusé : ${preview.aCorriger} ligne(s) à corriger. Aucune donnée n'a été modifiée.`);
    for (const p of plans) p.apply(db, tx);
    const creations = plans.filter((p) => p.action === "creation").length;
    tx.log({ action: "import", libelle: "Import de données", entite: "", entiteNom: def.label, apres: { lignes: plans.length, creations, misesAJour: plans.length - creations } });
    return { lignes: plans.length, creations, misesAJour: plans.length - creations };
  });
}
