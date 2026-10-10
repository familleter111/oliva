import "server-only";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { paths } from "./env";
import { AppError, isAppError } from "./errors";
import { changeMarker } from "./db-utils";
import { initialDb } from "./defaults";
import { RELATIONS, SHEETS, SHEET_LABEL, columnsOf, type AnyRow, type Db, type SheetName } from "./schema";
import { decodeWorkbook, encodeWorkbook, fingerprint } from "./workbook";

/**
 * Service central de stockage.
 * Toute écriture suit : verrou -> lecture de la dernière version -> modification sur une copie
 * -> validation -> historique -> fichier temporaire -> relecture de contrôle -> remplacement atomique.
 * Un seul processus à la fois peut écrire dans un dossier de stockage.
 */

export interface Actor {
  id: string;
  nom: string;
  /** Identifiant de l'onglet à l'origine de l'action : sert à ne pas le prévenir de son propre enregistrement. */
  client?: string;
}
export interface LogEntry {
  action: string;
  libelle: string;
  entite: SheetName | "";
  entiteId?: string;
  entiteNom?: string;
  resultat?: string;
  avant?: Record<string, unknown> | null;
  apres?: Record<string, unknown> | null;
}
export interface Tx {
  now: string;
  actor: Actor | null;
  id: (prefix: string) => string;
  log: (entry: LogEntry) => void;
  /** Sujet diffusé aux abonnés (SSE) une fois la sauvegarde réussie. */
  publish: (topic: string) => void;
}
export interface CommitEvent {
  revision: number;
  topics: string[];
  actorId: string | null;
  clientId: string | null;
  /** Repère du dernier changement utile (voir `changeMarker`). */
  marque: string;
}

interface State {
  root: string;
  instanceId: string;
  cache: { db: Db; sig: string } | null;
  queue: Promise<unknown>;
  lockHeld: boolean;
  heartbeat: NodeJS.Timeout | null;
  exitHook: boolean;
  lastAutoBackup: number;
  bus: EventEmitter;
  fault: string | null;
}

const HISTORY_MAX = 5000;
const HISTORY_ARCHIVE_BATCH = 1000;
const IDEMPOTENCY_TTL_MS = 48 * 3600 * 1000;
const AUTO_BACKUP_EVERY_MS = 60 * 60 * 1000;
const AUTO_BACKUP_KEEP = 24;
const LOCK_STALE_MS = 45_000;
const SAME_HOST_STALE_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 10_000;

// Next.js peut évaluer ce module plusieurs fois dans un même processus : l'état vit sur globalThis.
const holder = globalThis as unknown as { __olivaStorage?: State };

function state(): State {
  const root = paths.root;
  let s = holder.__olivaStorage;
  if (!s || s.root !== root) {
    if (s?.heartbeat) clearInterval(s.heartbeat);
    if (s?.lockHeld) releaseLockSync(s);
    const bus = new EventEmitter();
    bus.setMaxListeners(500);
    s = {
      root,
      instanceId: randomBytes(8).toString("hex"),
      cache: null,
      queue: Promise.resolve(),
      lockHeld: false,
      heartbeat: null,
      exitHook: s?.exitHook ?? false,
      lastAutoBackup: 0,
      bus,
      fault: null,
    };
    holder.__olivaStorage = s;
  }
  return s;
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;
export const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ verrous */

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const s = state();
  const run = s.queue.then(fn, fn);
  s.queue = run.catch(() => undefined);
  return run;
}

interface LockFile {
  pid: number;
  instanceId: string;
  host: string;
  at: number;
}

function readLockSync(): LockFile | null {
  try {
    return JSON.parse(fs.readFileSync(paths.lock, "utf8")) as LockFile;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Un verrou est périmé quand son propriétaire n'existe plus.
 * Même machine : le processus est mort (ou son battement s'est arrêté depuis très longtemps, cas d'un
 * numéro de processus réattribué). Autre machine : seul l'âge du battement permet d'en juger.
 */
function lockIsStale(l: LockFile): boolean {
  const age = Date.now() - l.at;
  if (l.host === os.hostname()) return !pidAlive(l.pid) || age > SAME_HOST_STALE_MS;
  return age > LOCK_STALE_MS;
}

function releaseLockSync(s: State) {
  try {
    const l = readLockSync();
    if (l?.instanceId === s.instanceId) fs.unlinkSync(paths.lock);
  } catch {
    /* rien : le verrou sera considéré périmé au prochain démarrage */
  }
  s.lockHeld = false;
}

async function ensureInstanceLock(): Promise<void> {
  const s = state();
  const payload = () => JSON.stringify({ pid: process.pid, instanceId: s.instanceId, host: os.hostname(), at: Date.now() } satisfies LockFile);

  if (s.lockHeld) {
    // Contrôle de propriété avant chaque écriture : un verrou repris par un autre processus bloque celui-ci.
    const l = readLockSync();
    if (l?.instanceId === s.instanceId) return;
    s.lockHeld = false;
    if (l && !lockIsStale(l)) throw lockedError(l);
  }

  await fsp.mkdir(paths.data, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fh = await fsp.open(paths.lock, "wx");
      await fh.writeFile(payload());
      await fh.close();
      s.lockHeld = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new AppError("stockage", "Impossible de créer le verrou du stockage. Vérifiez les droits d'écriture du dossier.", { cause: e });
      }
      const other = readLockSync();
      if (other?.instanceId === s.instanceId) {
        s.lockHeld = true;
        break;
      }
      if (other && !lockIsStale(other)) throw lockedError(other);
      await fsp.rm(paths.lock, { force: true });
    }
  }
  if (!s.lockHeld) throw new AppError("verrou", "Le verrou du stockage n'a pas pu être obtenu. Réessayez dans un instant.");

  if (!s.heartbeat) {
    s.heartbeat = setInterval(() => {
      const cur = holder.__olivaStorage;
      if (!cur?.lockHeld) return;
      const l = readLockSync();
      if (l && l.instanceId !== cur.instanceId) {
        cur.lockHeld = false;
        return;
      }
      fsp.writeFile(paths.lock, JSON.stringify({ pid: process.pid, instanceId: cur.instanceId, host: os.hostname(), at: Date.now() })).catch(() => undefined);
    }, HEARTBEAT_MS);
    s.heartbeat.unref();
  }
  if (!s.exitHook) {
    s.exitHook = true;
    process.once("exit", () => {
      const cur = holder.__olivaStorage;
      if (cur?.lockHeld) releaseLockSync(cur);
    });
  }
}

function lockedError(l: LockFile) {
  return new AppError(
    "verrou",
    `Une autre instance de l'application (processus ${l.pid} sur ${l.host}) écrit déjà dans ce stockage. Une seule instance peut modifier les données : arrêtez l'autre instance, puis réessayez.`,
  );
}

/* ------------------------------------------------------------------ lecture */

async function signature(): Promise<string | null> {
  try {
    const st = await fsp.stat(paths.workbook);
    return `${st.mtimeMs}:${st.size}`;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AppError("stockage", "Le classeur de données est inaccessible. Vérifiez le disque et les droits du dossier de stockage.", { cause: e });
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function hasEarlierData(): Promise<boolean> {
  if ((await exists(paths.marker)) || (await exists(paths.previous))) return true;
  for (const dir of [paths.backups, paths.autoBackups]) {
    try {
      if ((await fsp.readdir(dir)).some((f) => f.endsWith(".xlsx") || f.startsWith("manuel-"))) return true;
    } catch {
      /* dossier absent */
    }
  }
  return false;
}

/** À appeler sous mutex. Retourne la dernière version enregistrée sur disque. */
async function loadLatest(): Promise<Db> {
  const s = state();
  const sig = await signature();
  if (sig !== null) {
    if (s.cache?.sig === sig) return s.cache.db;
    let buf: Buffer;
    try {
      buf = await fsp.readFile(paths.workbook);
    } catch (e) {
      throw new AppError("stockage", "Le classeur de données est illisible. Vérifiez le disque.", { cause: e });
    }
    const db = await decodeWorkbook(buf);
    try {
      validateDb(db);
    } catch (e) {
      throw new AppError("stockage", `Classeur invalide : ${(e as Error).message} Aucune donnée n'a été modifiée.`, { cause: e });
    }
    s.cache = { db: deepFreeze(db), sig };
    return db;
  }

  // Classeur absent : on ne crée un classeur vide que pour une toute première installation.
  if (await hasEarlierData()) {
    throw new AppError(
      "stockage",
      "Le classeur principal est introuvable alors que ce stockage a déjà été initialisé. Il n'a pas été recréé pour ne rien écraser : restaurez `oliva.precedent.xlsx` ou une sauvegarde avec `npm run storage:restaurer`.",
    );
  }
  await ensureInstanceLock();
  const db = initialDb(nowIso());
  await commit(db);
  await fsp.writeFile(paths.marker, `${nowIso()}\n`);
  return db;
}

/** Lecture seule de la dernière version. L'objet retourné ne doit jamais être modifié. */
export async function readDb(): Promise<Db> {
  const s = state();
  const sig = await signature();
  if (sig !== null && s.cache?.sig === sig) return s.cache.db;
  return withMutex(loadLatest);
}

/* ---------------------------------------------------------------- validation */

function refValues(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  return typeof v === "string" && v !== "" ? [v] : [];
}

/** Identifiants uniques et relations cohérentes sur l'ensemble du classeur. */
export function validateDb(db: Db): void {
  const ids = new Map<SheetName, Set<string>>();
  for (const name of SHEETS) {
    const set = new Set<string>();
    for (const row of db[name] as AnyRow[]) {
      if (typeof row.id !== "string" || row.id === "") throw new AppError("invalide", `Identifiant manquant (${SHEET_LABEL[name]}).`);
      if (set.has(row.id)) throw new AppError("invalide", `Identifiant en double : ${row.id} (${SHEET_LABEL[name]}).`);
      set.add(row.id);
    }
    ids.set(name, set);
  }
  for (const rel of RELATIONS) {
    const target = ids.get(rel.ref)!;
    for (const row of db[rel.sheet] as AnyRow[]) {
      for (const v of refValues(row[rel.col])) {
        if (!target.has(v)) {
          throw new AppError(
            "invalide",
            `Référence invalide : ${SHEET_LABEL[rel.sheet]} « ${String(row.nom ?? row.id)} » pointe vers un élément ${SHEET_LABEL[rel.ref].toLowerCase()} inexistant.`,
          );
        }
      }
    }
  }
}

function sanitize(db: Db): void {
  for (const name of SHEETS) {
    const cols = columnsOf(name);
    for (const row of db[name] as AnyRow[]) {
      for (const [k, t] of Object.entries(cols)) {
        const v = row[k];
        if ((t === "string" || t === "date") && typeof v === "string") {
          // Caractères de contrôle interdits en XML, fins de ligne unifiées, espaces de bord retirés.
          row[k] = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").trim();
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ écriture */

function fail(step: string) {
  const s = state();
  if (process.env.OLIVA_TEST === "1" && s.fault === step) {
    s.fault = null;
    throw Object.assign(new Error(`ENOSPC: défaillance simulée (${step})`), { code: "ENOSPC" });
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (e) {
      last = e;
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") break;
      await new Promise((r) => setTimeout(r, 80 * (i + 1)));
    }
  }
  throw last;
}

async function autoBackup(): Promise<void> {
  const s = state();
  if (s.lastAutoBackup === 0) {
    try {
      const files = await fsp.readdir(paths.autoBackups);
      const stamps = await Promise.all(files.map(async (f) => (await fsp.stat(path.join(paths.autoBackups, f))).mtimeMs));
      s.lastAutoBackup = Math.max(1, ...stamps);
    } catch {
      s.lastAutoBackup = 1;
    }
  }
  if (Date.now() - s.lastAutoBackup < AUTO_BACKUP_EVERY_MS) return;
  await fsp.mkdir(paths.autoBackups, { recursive: true });
  const stamp = nowIso().replace(/[-:]/g, "").replace(/\..+$/, "");
  await fsp.copyFile(paths.workbook, path.join(paths.autoBackups, `oliva-${stamp}.xlsx`));
  s.lastAutoBackup = Date.now();
  const all = (await fsp.readdir(paths.autoBackups)).filter((f) => f.endsWith(".xlsx")).sort();
  for (const old of all.slice(0, Math.max(0, all.length - AUTO_BACKUP_KEEP))) {
    await fsp.rm(path.join(paths.autoBackups, old), { force: true });
  }
}

async function archiveHistory(db: Db): Promise<void> {
  if (db.HistoriqueActions.length <= HISTORY_MAX) return;
  const moved = db.HistoriqueActions.splice(0, HISTORY_ARCHIVE_BATCH);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("HistoriqueActions");
  const keys = Object.keys(columnsOf("HistoriqueActions"));
  ws.addRow(keys);
  for (const row of moved as AnyRow[]) {
    ws.addRow(keys.map((k) => (typeof row[k] === "object" ? JSON.stringify(row[k]) : (row[k] as string))));
  }
  await fsp.mkdir(paths.archives, { recursive: true });
  const stamp = nowIso().replace(/[-:]/g, "").replace(/\..+$/, "");
  await fsp.writeFile(path.join(paths.archives, `historique-${stamp}.xlsx`), Buffer.from(await wb.xlsx.writeBuffer()));
}

/** Écrit `db` comme nouvelle version. Ne met le cache à jour qu'après le remplacement réussi. */
async function commit(db: Db): Promise<void> {
  const s = state();
  const tmp = path.join(paths.tmp, `oliva-${Date.now()}-${randomBytes(4).toString("hex")}.xlsx`);
  try {
    sanitize(db);
    await archiveHistory(db);
    db._meta.revision += 1;
    db._meta.majLe = nowIso();
    const buf = await encodeWorkbook(db);

    await fsp.mkdir(paths.tmp, { recursive: true });
    fail("write");
    const fh = await fsp.open(tmp, "wx");
    try {
      await fh.writeFile(buf);
      await fh.sync();
    } finally {
      await fh.close();
    }

    // Relecture de contrôle : le fichier écrit doit redonner exactement les données attendues.
    fail("verify");
    const check = await decodeWorkbook(await fsp.readFile(tmp));
    if (fingerprint(check) !== fingerprint(db)) {
      throw new Error("la relecture du fichier temporaire ne correspond pas aux données à enregistrer");
    }

    if (await exists(paths.workbook)) {
      await autoBackup();
      await fsp.copyFile(paths.workbook, paths.previous);
    }
    fail("rename");
    await renameWithRetry(tmp, paths.workbook);
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    if (isAppError(e)) throw e;
    console.error("[oliva:stockage] échec d'écriture", e);
    const code = (e as NodeJS.ErrnoException).code;
    const hint =
      code === "EPERM" || code === "EBUSY" || code === "EACCES"
        ? " Le classeur est peut-être ouvert dans une autre application."
        : code === "ENOSPC"
          ? " Le disque est plein."
          : "";
    throw new AppError("stockage", `L'enregistrement a échoué : rien n'a été modifié.${hint} Réessayez, puis vérifiez le disque si le problème persiste.`, { cause: e });
  }

  // La nouvelle version est en place. Ce qui suit est du confort : aucun échec ici ne remet l'écriture en cause.
  await syncDirectory(paths.data);
  const sig = await signature().catch(() => null);
  s.cache = sig ? { db: deepFreeze(db), sig } : null;
}

/** Rend le renommage durable sur les systèmes POSIX. Sans objet sous Windows. */
async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const dh = await fsp.open(dir, "r");
    try {
      await dh.sync();
    } finally {
      await dh.close();
    }
  } catch {
    /* au mieux : le fichier lui-même a déjà été synchronisé */
  }
}

/** Gèle les données servies en lecture : une modification hors transaction lève une erreur au lieu de corrompre le cache. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const v of Object.values(value as object)) deepFreeze(v);
  return Object.freeze(value);
}

export interface TxOptions {
  actor: Actor | null;
  /** Clé d'idempotence : la même clé rejouée renvoie le premier résultat sans rien réécrire. */
  idempotencyKey?: string;
  scope?: string;
}

/**
 * Lecture-modification-écriture sérialisée. `fn` reçoit une copie de travail ; rien n'est gardé s'il lève une erreur.
 * `fn` ne doit appeler ni `readDb` ni `transaction` : le verrou est déjà tenu, l'appel attendrait sa propre fin.
 */
export function transaction<R>(opts: TxOptions, fn: (db: Db, tx: Tx) => R | Promise<R>): Promise<R> {
  return withMutex(async () => {
    await ensureInstanceLock();
    const current = await loadLatest();
    const now = nowIso();

    if (opts.idempotencyKey) {
      const hit = current.OperationsIdempotentes.find((o) => o.id === opts.idempotencyKey);
      if (hit) {
        if (hit.portee !== (opts.scope ?? "")) throw new AppError("conflit", "Cette clé d'opération a déjà servi pour une autre action.");
        return hit.resultat as R;
      }
    }

    const draft = structuredClone(current);
    const logs: LogEntry[] = [];
    const topics = new Set<string>();
    const tx: Tx = { now, actor: opts.actor, id: newId, log: (e) => logs.push(e), publish: (t) => topics.add(t) };

    const result = await fn(draft, tx);

    for (const e of logs) {
      draft.HistoriqueActions.push({
        id: newId("evt"),
        date: now,
        auteurId: tx.actor?.id ?? "",
        auteurNom: tx.actor?.nom ?? "Système",
        action: e.action,
        libelle: e.libelle,
        entite: e.entite,
        entiteId: e.entiteId ?? "",
        entiteNom: e.entiteNom ?? "",
        resultat: e.resultat ?? "Appliqué",
        avant: e.avant ?? null,
        apres: e.apres ?? null,
      });
    }
    if (opts.idempotencyKey) {
      const limit = Date.now() - IDEMPOTENCY_TTL_MS;
      draft.OperationsIdempotentes = draft.OperationsIdempotentes.filter((o) => Date.parse(o.creeLe) > limit);
      draft.OperationsIdempotentes.push({ id: opts.idempotencyKey, portee: opts.scope ?? "", resultat: (result ?? null) as unknown, creeLe: now });
    }

    validateDb(draft);
    await commit(draft);

    const event: CommitEvent = { revision: draft._meta.revision, topics: [...topics], actorId: tx.actor?.id ?? null, clientId: tx.actor?.client ?? null, marque: changeMarker(draft) };
    try {
      state().bus.emit("commit", event);
    } catch (e) {
      console.error("[oliva:stockage] diffusion impossible après une écriture réussie", e);
    }
    return result;
  });
}

/** Abonnement aux sauvegardes réussies (diffusion SSE). Retourne la fonction de désabonnement. */
export function onCommit(listener: (e: CommitEvent) => void): () => void {
  const bus = state().bus;
  bus.on("commit", listener);
  return () => bus.off("commit", listener);
}

/* --------------------------------------------------------------- maintenance */

/** Exécute `fn` avec le verrou d'écriture, sans modifier le classeur (copie cohérente pour une sauvegarde). */
export function exclusive<R>(fn: (db: Db) => Promise<R>): Promise<R> {
  return withMutex(async () => {
    await ensureInstanceLock();
    return fn(await loadLatest());
  });
}

/**
 * Remet en place un classeur choisi explicitement (commande `storage:restaurer`).
 * Le fichier est validé avant tout remplacement et le classeur actuel est conservé à côté.
 */
export function restoreWorkbookFrom(file: string): Promise<{ revision: number; ancien: string | null }> {
  return withMutex(async () => {
    const db = await readWorkbookFile(file);
    await ensureInstanceLock();
    await fsp.mkdir(paths.tmp, { recursive: true });
    const tmp = path.join(paths.tmp, `restauration-${Date.now()}.xlsx`);
    await fsp.copyFile(file, tmp);
    let ancien: string | null = null;
    if (await exists(paths.workbook)) {
      ancien = path.join(paths.data, `oliva.remplace-${Date.now()}.xlsx`);
      await fsp.copyFile(paths.workbook, ancien);
    }
    await renameWithRetry(tmp, paths.workbook);
    await fsp.writeFile(paths.marker, `${nowIso()}\n`);
    state().cache = null;
    return { revision: db._meta.revision, ancien };
  });
}

export async function readWorkbookFile(file: string): Promise<Db> {
  const db = await decodeWorkbook(await fsp.readFile(file));
  validateDb(db);
  return db;
}

export async function storageInfo() {
  const db = await readDb();
  const st = await fsp.stat(paths.workbook);
  return {
    revision: db._meta.revision,
    majLe: db._meta.majLe,
    tailleOctets: st.size,
    lignes: SHEETS.reduce((n, sName) => n + db[sName].length, 0),
    historique: db.HistoriqueActions.length,
    demo: db._meta.donneesDemo,
  };
}

/** Réservé aux tests : provoque une défaillance à l'étape indiquée lors de la prochaine écriture. */
export function __injectFault(step: "write" | "verify" | "rename" | null) {
  state().fault = step;
}

/** Réservé aux tests et scripts : libère le verrou d'instance. */
export function __releaseLock() {
  const s = state();
  if (s.heartbeat) clearInterval(s.heartbeat);
  s.heartbeat = null;
  releaseLockSync(s);
}
