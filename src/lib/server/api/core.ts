import "server-only";
import { z } from "zod";
import { assertCsrf, assertSameOrigin, requireApi, requireStaffApi, type Auth } from "../auth/session";
import { blankRow, changeMarker, changedFields, labelOf, must, nextOrdre, removeRow, rowsOf, safe } from "../db-utils";
import { AppError, introuvable, invalide, isAppError } from "../errors";
import { COL_LABEL, SHEET_LABEL, type AnyRow, type Db, type PermissionCode, type Row, type SheetName } from "../schema";
import { readDb, transaction, type Actor, type Tx } from "../storage";

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  /** Null uniquement pour les routes déclarées `public`. */
  auth: Auth;
  actor: Actor;
}
type Perm = PermissionCode | PermissionCode[] | "public" | "session";
export interface Route {
  /** Permission exigée. Aucune route ne peut être enregistrée sans cette déclaration. */
  perm: Perm;
  input?: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (c: Ctx, input: any) => unknown;
}
export type Routes = Record<string, Route>;

function match(table: Routes, method: string, segments: string[]) {
  for (const [key, route] of Object.entries(table)) {
    const [m, pattern] = key.split(" ");
    if (m !== method) continue;
    const parts = pattern.split("/");
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = segments[i];
      else if (parts[i] !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function zodProblem(error: z.ZodError): AppError {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    details[key] ??= issue.message;
  }
  const first = error.issues[0];
  const field = first?.path.length ? `${COL_LABEL[String(first.path[0])] ?? first.path.join(".")} : ` : "";
  return invalide(`${field}${first?.message ?? "Données invalides."}`, details);
}

export function errorResponse(e: unknown): Response {
  if (isAppError(e)) {
    const headers = new Headers();
    if (e.retryAfter) headers.set("Retry-After", String(e.retryAfter));
    return Response.json({ ok: false, error: { code: e.code, message: e.message, details: e.details } }, { status: e.status, headers });
  }
  console.error("[oliva:api]", e);
  return Response.json({ ok: false, error: { code: "interne", message: "Une erreur inattendue s'est produite. Rien n'a été enregistré." } }, { status: 500 });
}

const JSON_MAX_BYTES = 256 * 1024;

/** Refuse d'emblée un envoi dont la taille annoncée dépasse la limite. */
export function assertBodySize(req: Request, max: number): void {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > max) throw new AppError("trop_volumineux", "Le contenu envoyé est trop volumineux.");
}

/** Lit un corps JSON en s'arrêtant dès que la limite est dépassée, même sans taille annoncée. */
export async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw invalide("Format non pris en charge : un contenu JSON est attendu.");
  }
  assertBodySize(req, JSON_MAX_BYTES);
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > JSON_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new AppError("trop_volumineux", "Le contenu envoyé est trop volumineux.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw invalide("Le contenu envoyé est illisible.");
  }
}

/**
 * Point d'entrée unique des API du personnel : origine, session, jeton, permission, puis validation.
 * `garde` choisit le contrôle : l'administration exige `admin.acces`, les espaces du personnel non.
 */
export async function handle(req: Request, segments: string[], table: Routes, garde: "admin" | "personnel" = "admin"): Promise<Response> {
  const gate = garde === "personnel" ? requireStaffApi : requireApi;
  try {
    const method = req.method.toUpperCase();
    const mutating = method !== "GET" && method !== "HEAD";
    if (mutating) assertSameOrigin(req);

    const found = match(table, method, segments);
    // Sans session valide, une route inconnue répond comme une route protégée.
    if (!found) {
      await gate("session");
      throw introuvable("Cette ressource n'existe pas.");
    }
    const { route, params } = found;

    let auth: Auth | null = null;
    if (route.perm !== "public") {
      auth = await gate(route.perm === "session" ? "session" : Array.isArray(route.perm) ? route.perm : [route.perm]);
      if (mutating) assertCsrf(req, auth);
    }

    const url = new URL(req.url);
    let input: unknown;
    if (route.input) {
      const body = mutating ? await readJson(req) : Object.fromEntries(url.searchParams);
      const parsed = route.input.safeParse(body);
      if (!parsed.success) throw zodProblem(parsed.error);
      input = parsed.data;
    }

    // L'onglet à l'origine de la requête est mémorisé pour la diffusion en direct.
    const client = (req.headers.get("x-oliva-client") ?? "").slice(0, 64);
    const actor = auth ? ({ ...auth.actor, ...(client ? { client } : {}) } satisfies Actor) : (undefined as unknown as Actor);
    const out = await route.run({ req, url, params, auth: auth as Auth, actor }, input);
    if (out instanceof Response) return out;
    const headers = new Headers();
    if (mutating && auth) headers.set("X-Oliva-Marque", changeMarker(await readDb()));
    return Response.json({ ok: true, data: out ?? null }, { headers });
  } catch (e) {
    return errorResponse(e);
  }
}

/* ------------------------------------------------------------ validateurs */

export const txt = (max: number) => z.string().trim().max(max, `${max} caractères maximum.`);
export const nom = (max = 80) => z.string().trim().min(1, "Ce champ est obligatoire.").max(max, `${max} caractères maximum.`);
export const ref = z.string().trim().max(60);
export const refs = z.array(z.string().trim().min(1).max(60)).max(200);
export const cents = z.number("Montant invalide.").int("Montant invalide.").min(0, "Le montant ne peut pas être négatif.").max(100_000_00, "Montant trop élevé.");
export const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #RRGGBB.");
export const entier = (min: number, max: number) => z.number("Nombre attendu.").int("Nombre entier attendu.").min(min, `Minimum ${min}.`).max(max, `Maximum ${max}.`);
export const choix = <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values, "Valeur non reconnue.");

/* ------------------------------------------------------------ générateurs */

function changeLabel(fields: string[]): string {
  if (fields.length === 1) return `Modification : ${COL_LABEL[fields[0]] ?? fields[0]}`;
  return `Modification (${fields.length} champs)`;
}

export function logUpdate(tx: Tx, sheet: SheetName, before: AnyRow, after: AnyRow): boolean {
  const diff = changedFields(sheet, before, after);
  if (diff.count === 0) return false;
  tx.log({ action: "modification", libelle: changeLabel(Object.keys(diff.apres ?? {})), entite: sheet, entiteId: after.id, entiteNom: labelOf(after) || SHEET_LABEL[sheet], avant: diff.avant, apres: diff.apres });
  return true;
}

interface CollectionConfig<S extends SheetName> {
  path: string;
  sheet: S;
  perm: PermissionCode;
  prefix: string;
  /** Champs modifiables. Tous facultatifs à l'envoi ; `required` liste ceux qui ne peuvent pas rester vides. */
  schema: z.ZodObject;
  required?: string[];
  defaults?: (db: Db, tx: Tx) => Partial<Row<S>>;
  /** Règles métier, appelées après application des valeurs (création et modification). */
  check?: (row: Row<S>, db: Db, before: Row<S> | null) => void;
  canDelete?: (row: Row<S>, db: Db) => void;
  ordered?: boolean;
  stamped?: boolean;
}

/** Routes CRUD d'une feuille : création, modification partielle, suppression et réordonnancement. */
export function collection<S extends SheetName>(cfg: CollectionConfig<S>): Routes {
  const { path, sheet, perm } = cfg;
  const partial = cfg.schema.partial();
  const verify = (row: AnyRow, db: Db, before: AnyRow | null) => {
    for (const k of cfg.required ?? []) {
      if (row[k] === "" || row[k] === null || row[k] === undefined) throw invalide(`${COL_LABEL[k] ?? k} : ce champ est obligatoire.`, { [k]: "Ce champ est obligatoire." });
    }
    cfg.check?.(row as Row<S>, db, before as Row<S> | null);
  };
  const routes: Routes = {
    [`POST ${path}`]: {
      perm,
      input: partial,
      run: (c, input: Record<string, unknown>) =>
        transaction({ actor: c.actor }, (db, tx) => {
          const row = { ...blankRow(sheet), ...(cfg.defaults?.(db, tx) ?? {}), ...input, id: tx.id(cfg.prefix) } as AnyRow;
          if (cfg.ordered) row.ordre = nextOrdre(rowsOf(db, sheet) as unknown as { ordre: number }[]);
          if (cfg.stamped) row.creeLe = row.majLe = tx.now;
          verify(row, db, null);
          rowsOf(db, sheet).push(row);
          const diff = changedFields(sheet, null, row);
          tx.log({ action: "creation", libelle: "Création", entite: sheet, entiteId: row.id, entiteNom: labelOf(row), apres: diff.apres });
          return safe(sheet, row as Row<S>);
        }),
    },
    [`PATCH ${path}/:id`]: {
      perm,
      input: partial,
      run: (c, input: Record<string, unknown>) =>
        transaction({ actor: c.actor }, (db, tx) => {
          const row = must(db, sheet, c.params.id) as AnyRow;
          const before = structuredClone(row);
          Object.assign(row, input);
          verify(row, db, before);
          if (logUpdate(tx, sheet, before, row) && cfg.stamped) row.majLe = tx.now;
          return safe(sheet, row as Row<S>);
        }),
    },
    [`DELETE ${path}/:id`]: {
      perm,
      run: (c) =>
        transaction({ actor: c.actor }, (db, tx) => {
          const row = must(db, sheet, c.params.id) as AnyRow;
          cfg.canDelete?.(row as Row<S>, db);
          removeRow(db, sheet, row.id);
          tx.log({ action: "suppression", libelle: "Suppression", entite: sheet, entiteId: row.id, entiteNom: labelOf(row), avant: changedFields(sheet, row, null).avant });
          return { id: row.id };
        }),
    },
  };
  if (cfg.ordered) {
    routes[`POST ${path}/ordre`] = {
      perm,
      input: z.object({ ids: refs }),
      run: (c, input: { ids: string[] }) =>
        transaction({ actor: c.actor }, (db, tx) => {
          const rows = rowsOf(db, sheet);
          const known = new Set(rows.map((r) => r.id));
          if (input.ids.length !== known.size || input.ids.some((id) => !known.has(id))) {
            throw new AppError("conflit", "La liste a changé entre-temps. Rechargez la page avant de réordonner.");
          }
          input.ids.forEach((id, i) => (rows.find((r) => r.id === id)!.ordre = i + 1));
          tx.log({ action: "ordre", libelle: "Ordre modifié", entite: sheet, entiteNom: SHEET_LABEL[sheet] });
          return { ids: input.ids };
        }),
    };
  }
  return routes;
}

/** Route PUT d'une feuille à ligne unique (réglages). */
export function singleton<S extends SheetName>(cfg: { path: string; sheet: S; id: string; perm: PermissionCode; schema: z.ZodObject; check?: (row: Row<S>, db: Db) => void }): Routes {
  return {
    [`PUT ${cfg.path}`]: {
      perm: cfg.perm,
      input: cfg.schema.partial(),
      run: (c, input: Record<string, unknown>) =>
        transaction({ actor: c.actor }, (db, tx) => {
          const row = must(db, cfg.sheet, cfg.id) as AnyRow;
          const before = structuredClone(row);
          Object.assign(row, input);
          cfg.check?.(row as Row<S>, db);
          if (logUpdate(tx, cfg.sheet, before, row)) row.majLe = tx.now;
          return row;
        }),
    },
  };
}
