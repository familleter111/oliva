import "server-only";
import ExcelJS from "exceljs";
import { AppError } from "./errors";
import { COLUMN_SINCE, SCHEMA_VERSION, SHEETS, SHEET_SINCE, columnsOf, type AnyRow, type Db, type Meta, type SheetName } from "./schema";

/** Limite d'Excel : 32 767 caractères par cellule. Marge conservée. */
export const MAX_CELL = 32000;
const META_SHEET = "_Meta";

type Cell = string | number | boolean | null;

const invalid = (message: string) =>
  new AppError("stockage", `Classeur invalide : ${message} Aucune donnée n'a été modifiée.`);

function toCell(t: string, v: unknown, where: string): Cell {
  switch (t) {
    case "string":
    case "date":
      if (typeof v !== "string") throw invalid(`${where} doit être un texte.`);
      if (v.length > MAX_CELL) throw new AppError("invalide", `${where} dépasse la longueur autorisée (${MAX_CELL} caractères).`);
      return v;
    case "int":
      if (!Number.isInteger(v)) throw invalid(`${where} doit être un entier.`);
      return v as number;
    case "int?":
      if (v === null) return null;
      if (!Number.isInteger(v)) throw invalid(`${where} doit être un entier ou vide.`);
      return v as number;
    case "bool":
      if (typeof v !== "boolean") throw invalid(`${where} doit être vrai ou faux.`);
      return v;
    case "ids":
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw invalid(`${where} doit être une liste d'identifiants.`);
      return encodeJson(v, where);
    default:
      return encodeJson(v ?? null, where);
  }
}

function encodeJson(v: unknown, where: string): string {
  const s = JSON.stringify(v);
  if (s.length > MAX_CELL) throw new AppError("invalide", `${where} est trop volumineux pour une cellule Excel.`);
  return s;
}

function plain(v: ExcelJS.CellValue, where: string): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) throw invalid(`${where} contient une formule. Remplacez-la par une valeur.`);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((p) => p.text).join("");
    if ("text" in o) return plain(o.text as ExcelJS.CellValue, where);
    if ("error" in o) throw invalid(`${where} contient une erreur Excel.`);
    return null;
  }
  return v as Cell;
}

function fromCell(t: string, raw: Cell, where: string): unknown {
  switch (t) {
    case "string":
      return raw === null ? "" : String(raw);
    case "date": {
      const s = raw === null ? "" : String(raw);
      if (s && Number.isNaN(Date.parse(s))) throw invalid(`${where} n'est pas une date ISO valide.`);
      return s;
    }
    case "int":
    case "int?": {
      if (raw === null || raw === "") {
        if (t === "int?") return null;
        throw invalid(`${where} est vide alors qu'un entier est attendu.`);
      }
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isInteger(n)) throw invalid(`${where} doit être un entier.`);
      return n;
    }
    case "bool": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw ?? "").trim().toLowerCase();
      if (["true", "vrai", "1"].includes(s)) return true;
      if (["false", "faux", "0"].includes(s)) return false;
      throw invalid(`${where} doit valoir VRAI ou FAUX.`);
    }
    case "ids": {
      if (raw === null || raw === "") return [];
      const v = parseJson(String(raw), where);
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw invalid(`${where} doit être une liste d'identifiants.`);
      return v;
    }
    default:
      if (raw === null || raw === "") return null;
      return parseJson(String(raw), where);
  }
}

function parseJson(s: string, where: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw invalid(`${where} contient un JSON illisible.`);
  }
}

/** Sérialise la base complète dans un nouveau classeur. Les textes restent des textes (jamais de formules). */
export async function encodeWorkbook(db: Db): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Oliva";
  wb.created = new Date(db._meta.creeLe);
  wb.modified = new Date(db._meta.majLe);

  const meta = wb.addWorksheet(META_SHEET);
  meta.addRow(["cle", "valeur"]);
  for (const [k, v] of Object.entries(db._meta)) meta.addRow([k, String(v)]);
  meta.getRow(1).font = { bold: true };
  meta.getColumn(1).width = 22;
  meta.getColumn(2).width = 34;

  for (const name of SHEETS) {
    const cols = columnsOf(name);
    const keys = Object.keys(cols);
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(keys);
    ws.getRow(1).font = { bold: true };
    keys.forEach((k, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(12, Math.min(40, k.length + 8));
      if (cols[k] !== "int" && cols[k] !== "int?" && cols[k] !== "bool") col.numFmt = "@";
    });
    (db[name] as AnyRow[]).forEach((row, n) => {
      ws.addRow(keys.map((k) => toCell(cols[k], row[k], `${name}!${k} (ligne ${n + 2})`)));
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Lit et valide strictement un classeur. Lève une erreur explicite plutôt que de deviner. */
export async function decodeWorkbook(buf: Buffer): Promise<Db> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch (cause) {
    throw new AppError("stockage", "Classeur invalide : le fichier n'est pas un classeur Excel lisible. Aucune donnée n'a été modifiée.", { cause });
  }

  const metaSheet = wb.getWorksheet(META_SHEET);
  if (!metaSheet) throw invalid("la feuille _Meta est absente.");
  const kv = new Map<string, string>();
  metaSheet.eachRow((row, n) => {
    if (n === 1) return;
    const k = plain(row.getCell(1).value, "_Meta");
    const v = plain(row.getCell(2).value, "_Meta");
    if (k !== null) kv.set(String(k), v === null ? "" : String(v));
  });
  const schemaVersion = Number(kv.get("schemaVersion"));
  if (!Number.isInteger(schemaVersion)) throw invalid("la version du schéma est illisible.");
  if (schemaVersion > SCHEMA_VERSION) {
    throw invalid(`il a été écrit par une version plus récente de l'application (schéma ${schemaVersion}).`);
  }
  if (schemaVersion < 1) {
    throw invalid(`le schéma ${schemaVersion} demande une migration vers ${SCHEMA_VERSION}, non fournie par cette version.`);
  }
  // Un classeur d'une version précédente est mis à niveau en mémoire ; le fichier n'est réécrit qu'à la prochaine sauvegarde.
  const meta: Meta = {
    schemaVersion: SCHEMA_VERSION,
    revision: Number(kv.get("revision") ?? 0) || 0,
    creeLe: kv.get("creeLe") ?? "",
    majLe: kv.get("majLe") ?? "",
    donneesDemo: (kv.get("donneesDemo") ?? "false") === "true",
  };

  const db = { _meta: meta } as Db;
  for (const name of SHEETS) {
    const ws = wb.getWorksheet(name);
    if (!ws) {
      if ((SHEET_SINCE[name] ?? 1) > schemaVersion) {
        (db as unknown as Record<SheetName, AnyRow[]>)[name] = [];
        continue;
      }
      throw invalid(`la feuille « ${name} » est absente.`);
    }
    const cols = columnsOf(name);
    const index = new Map<string, number>();
    ws.getRow(1).eachCell((cell, c) => {
      const h = plain(cell.value, `${name}!en-tête`);
      if (h !== null) index.set(String(h).trim(), c);
    });
    for (const k of Object.keys(cols)) {
      // Une colonne ajoutée après l'écriture du classeur est simplement absente : elle prendra sa valeur par défaut.
      if (!index.has(k) && (COLUMN_SINCE[name]?.[k] ?? 1) <= schemaVersion) {
        throw invalid(`la colonne « ${k} » manque dans la feuille « ${name} ».`);
      }
    }
    const rows: AnyRow[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const out: Record<string, unknown> = {};
      for (const [k, t] of Object.entries(cols)) {
        const where = `${name}!${k} (ligne ${n})`;
        const c = index.get(k);
        out[k] = c === undefined ? defautJson(t) : fromCell(t, plain(row.getCell(c).value, where), where);
      }
      if (!out.id) throw invalid(`identifiant manquant dans « ${name} » (ligne ${n}).`);
      rows.push(out as AnyRow);
    });
    (db as unknown as Record<SheetName, AnyRow[]>)[name] = rows;
  }
  return db;
}

/** Empreinte stable du contenu, dans l'ordre des colonnes du schéma. */
export function fingerprint(db: Db): string {
  const parts: unknown[] = [db._meta.schemaVersion, db._meta.revision, db._meta.donneesDemo];
  for (const name of SHEETS) {
    const keys = Object.keys(columnsOf(name));
    parts.push((db[name] as AnyRow[]).map((row) => keys.map((k) => row[k] ?? null)));
  }
  return JSON.stringify(parts);
}

/* ------------------------------------------------------- forme JSON (base de données) */

/**
 * Même contenu que le classeur, sérialisé en JSON pour un stockage en base.
 * Seules les colonnes du schéma sont écrites, dans leur ordre : aucune donnée parasite ne passe.
 */
export function encodeJsonDb(db: Db): string {
  const out: Record<string, unknown> = { _meta: { ...db._meta, schemaVersion: SCHEMA_VERSION } };
  for (const name of SHEETS) {
    const cols = columnsOf(name);
    out[name] = (db[name] as AnyRow[]).map((row, n) => {
      const ligne: Record<string, unknown> = {};
      for (const [k, t] of Object.entries(cols)) ligne[k] = checkJson(t, row[k], `${name}!${k} (ligne ${n + 2})`);
      return ligne;
    });
  }
  return JSON.stringify(out);
}

function checkJson(t: string, v: unknown, where: string): unknown {
  switch (t) {
    case "string":
    case "date":
      if (typeof v !== "string") throw invalid(`${where} doit être un texte.`);
      return v;
    case "int":
      if (!Number.isInteger(v)) throw invalid(`${where} doit être un entier.`);
      return v;
    case "int?":
      if (v !== null && !Number.isInteger(v)) throw invalid(`${where} doit être un entier ou vide.`);
      return v ?? null;
    case "bool":
      if (typeof v !== "boolean") throw invalid(`${where} doit être vrai ou faux.`);
      return v;
    case "ids":
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw invalid(`${where} doit être une liste d'identifiants.`);
      return v;
    default:
      return v ?? null;
  }
}

/**
 * Relit la forme JSON avec la même sévérité que le classeur Excel.
 * Un enregistrement écrit par une version plus ancienne est mis à niveau en mémoire.
 */
export function decodeJsonDb(texte: string): Db {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (cause) {
    throw new AppError("stockage", "Enregistrement invalide : le contenu n'est pas du JSON lisible. Aucune donnée n'a été modifiée.", { cause });
  }
  if (!brut || typeof brut !== "object") throw invalid("l'enregistrement est vide.");
  const src = brut as Record<string, unknown>;
  const metaSrc = (src._meta ?? {}) as Record<string, unknown>;

  const schemaVersion = Number(metaSrc.schemaVersion);
  if (!Number.isInteger(schemaVersion)) throw invalid("la version du schéma est illisible.");
  if (schemaVersion > SCHEMA_VERSION) throw invalid(`il a été écrit par une version plus récente de l'application (schéma ${schemaVersion}).`);
  if (schemaVersion < 1) throw invalid(`le schéma ${schemaVersion} demande une migration vers ${SCHEMA_VERSION}, non fournie par cette version.`);

  const meta: Meta = {
    schemaVersion: SCHEMA_VERSION,
    revision: Number(metaSrc.revision ?? 0) || 0,
    creeLe: String(metaSrc.creeLe ?? ""),
    majLe: String(metaSrc.majLe ?? ""),
    donneesDemo: metaSrc.donneesDemo === true,
  };

  const db = { _meta: meta } as Db;
  for (const name of SHEETS) {
    const brutes = src[name];
    if (brutes === undefined) {
      if ((SHEET_SINCE[name] ?? 1) > schemaVersion) {
        (db as unknown as Record<SheetName, AnyRow[]>)[name] = [];
        continue;
      }
      throw invalid(`la table « ${name} » est absente.`);
    }
    if (!Array.isArray(brutes)) throw invalid(`la table « ${name} » devrait être une liste.`);
    const cols = columnsOf(name);
    (db as unknown as Record<SheetName, AnyRow[]>)[name] = brutes.map((ligne, i) => {
      if (!ligne || typeof ligne !== "object") throw invalid(`ligne illisible dans « ${name} » (${i + 1}).`);
      const row = ligne as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, t] of Object.entries(cols)) {
        const where = `${name}!${k} (ligne ${i + 2})`;
        if (row[k] === undefined) {
          if ((COLUMN_SINCE[name]?.[k] ?? 1) <= schemaVersion) throw invalid(`la colonne « ${k} » manque dans la table « ${name} ».`);
          out[k] = defautJson(t);
          continue;
        }
        out[k] = checkJson(t, row[k], where);
      }
      if (!out.id) throw invalid(`identifiant manquant dans « ${name} » (ligne ${i + 2}).`);
      return out as AnyRow;
    });
  }
  return db;
}

/** Valeur d'une colonne ajoutée par une version plus récente que l'enregistrement relu. */
function defautJson(t: string): unknown {
  switch (t) {
    case "string":
    case "date":
      return "";
    case "int":
      return 0;
    case "bool":
      return false;
    case "ids":
      return [];
    default:
      return null;
  }
}
