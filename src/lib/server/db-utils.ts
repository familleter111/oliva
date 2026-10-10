import "server-only";
import { conflit, introuvable } from "./errors";
import { RELATIONS, ROLE_ADMIN, SENSITIVE, SHEET_LABEL, columnsOf, type AnyRow, type Db, type Row, type SheetName } from "./schema";

export const rowsOf = (db: Db, sheet: SheetName) => db[sheet] as unknown as AnyRow[];

export const fullName = (u: { prenom: string; nom: string; email: string }) => `${u.prenom} ${u.nom}`.trim() || u.email;

export const isActiveAdmin = (u: Row<"Utilisateurs">) => u.statut === "actif" && u.roleId === ROLE_ADMIN;
export const activeAdminCount = (db: Db) => db.Utilisateurs.filter(isActiveAdmin).length;

/** Ligne vide typée selon le schéma : texte vide, zéro, faux, liste vide. */
export function blankRow(sheet: SheetName): AnyRow {
  const out: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(columnsOf(sheet))) {
    out[k] = t === "int" ? 0 : t === "bool" ? false : t === "ids" ? [] : t === "int?" || t === "json" ? null : "";
  }
  return out as AnyRow;
}

export function find<S extends SheetName>(db: Db, sheet: S, id: string): Row<S> | undefined {
  return (db[sheet] as unknown as (Row<S> & { id: string })[]).find((r) => r.id === id);
}

export function must<S extends SheetName>(db: Db, sheet: S, id: string): Row<S> {
  const row = find(db, sheet, id);
  if (!row) throw introuvable(`${SHEET_LABEL[sheet]} introuvable.`);
  return row;
}

export const labelOf = (row: AnyRow): string => {
  const prenom = typeof row.prenom === "string" ? `${row.prenom} ` : "";
  return `${prenom}${String(row.nom ?? row.libelle ?? row.evenement ?? row.email ?? row.date ?? "")}`.trim();
};

export interface Usage {
  sheet: SheetName;
  type: string;
  id: string;
  nom: string;
  col: string;
}

const refs = (v: unknown, id: string) => (Array.isArray(v) ? v.includes(id) : v === id);

/** Liste des lignes qui référencent `id` dans `sheet`. */
export function usagesOf(db: Db, sheet: SheetName, id: string): Usage[] {
  const out: Usage[] = [];
  for (const rel of RELATIONS) {
    if (rel.ref !== sheet) continue;
    for (const row of rowsOf(db, rel.sheet)) {
      if (refs(row[rel.col], id)) out.push({ sheet: rel.sheet, type: SHEET_LABEL[rel.sheet], id: row.id, nom: labelOf(row), col: rel.col });
    }
  }
  return out;
}

/**
 * Supprime une ligne en respectant les relations : blocage si elle est encore utilisée (restrict),
 * suppression des dépendances (cascade) ou retrait de la référence (nullify).
 */
export function removeRow(db: Db, sheet: SheetName, id: string): void {
  const rows = rowsOf(db, sheet);
  if (!rows.some((r) => r.id === id)) throw introuvable(`${SHEET_LABEL[sheet]} introuvable.`);

  const toDelete: [SheetName, string][] = [];
  const toNullify: [AnyRow, string][] = [];
  const visit = (s: SheetName, target: string) => {
    toDelete.push([s, target]);
    for (const rel of RELATIONS) {
      if (rel.ref !== s) continue;
      const users = rowsOf(db, rel.sheet).filter((row) => refs(row[rel.col], target));
      if (users.length === 0) continue;
      if (rel.mode === "restrict") {
        const names = users.slice(0, 3).map(labelOf).join(", ");
        throw conflit(
          `Suppression impossible : ${users.length} élément(s) « ${SHEET_LABEL[rel.sheet]} » utilisent encore « ${SHEET_LABEL[s]} » (${names}${users.length > 3 ? ", ..." : ""}). Réaffectez-les ou détachez-les d'abord.`,
        );
      }
      if (rel.mode === "cascade") users.forEach((u) => visit(rel.sheet, u.id));
      else users.forEach((u) => toNullify.push([u, rel.col]));
    }
  };
  visit(sheet, id);

  const doomed = new Map<SheetName, Set<string>>();
  for (const [s, target] of toDelete) (doomed.get(s) ?? doomed.set(s, new Set()).get(s)!).add(target);
  for (const [row, col] of toNullify) {
    const v = row[col];
    row[col] = Array.isArray(v) ? v.filter((x) => !toDelete.some(([, t]) => t === x)) : "";
  }
  for (const [s, set] of doomed) {
    (db as unknown as Record<SheetName, AnyRow[]>)[s] = rowsOf(db, s).filter((r) => !set.has(r.id));
  }
}

/** Champs modifiés entre deux états, sans les colonnes sensibles. */
export function changedFields(sheet: SheetName, before: AnyRow | null, after: AnyRow | null) {
  const hidden = new Set([...(SENSITIVE[sheet] ?? []), "majLe", "creeLe"]);
  const avant: Record<string, unknown> = {};
  const apres: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (hidden.has(k) || k === "id") continue;
    const a = before?.[k];
    const b = after?.[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      if (before) avant[k] = a ?? null;
      if (after) apres[k] = b ?? null;
    }
  }
  return { avant: before ? avant : null, apres: after ? apres : null, count: Math.max(Object.keys(avant).length, Object.keys(apres).length) };
}

/** Copie sans les colonnes sensibles, destinée au navigateur. */
export function safe<S extends SheetName>(sheet: S, row: Row<S>): Row<S> {
  const hidden = SENSITIVE[sheet];
  if (!hidden) return row;
  const out = { ...row } as Record<string, unknown>;
  for (const k of hidden) delete out[k];
  return out as Row<S>;
}

const BOOKKEEPING = new Set(["connexion", "deconnexion"]);
/**
 * Repère du dernier changement utile aux écrans (hors connexions et déconnexions).
 * Les onglets ouverts le comparent au leur pour savoir si leurs données sont périmées.
 */
export function changeMarker(db: Db): string {
  for (let i = db.HistoriqueActions.length - 1; i >= 0; i--) {
    if (!BOOKKEEPING.has(db.HistoriqueActions[i].action)) return db.HistoriqueActions[i].id;
  }
  return "";
}

export const nextOrdre = (rows: { ordre: number }[]) => rows.reduce((m, r) => Math.max(m, r.ordre), 0) + 1;
