import "server-only";
import { AppError } from "../errors";

interface Entry {
  count: number;
  first: number;
  lockedUntil: number;
}

const holder = globalThis as unknown as { __olivaAttempts?: Map<string, Entry> };
const store = () => (holder.__olivaAttempts ??= new Map<string, Entry>());
const WINDOW_MS = 15 * 60 * 1000;

/** Refuse la tentative si la clé (adresse IP ou identifiant) est verrouillée. */
export function assertNotLocked(key: string): void {
  const e = store().get(key);
  if (e && e.lockedUntil > Date.now()) {
    const wait = Math.ceil((e.lockedUntil - Date.now()) / 1000);
    throw new AppError("limite", `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 60)} minute(s).`, { retryAfter: wait });
  }
}

export function recordFailure(key: string, max: number, lockMinutes: number): void {
  const now = Date.now();
  const s = store();
  const e = s.get(key);
  if (!e || now - e.first > WINDOW_MS) {
    s.set(key, { count: 1, first: now, lockedUntil: 0 });
  } else {
    e.count += 1;
    if (e.count >= max) {
      e.lockedUntil = now + lockMinutes * 60 * 1000;
      e.count = 0;
      e.first = now;
    }
  }
  if (s.size > 5000) {
    for (const [k, v] of s) if (now - v.first > WINDOW_MS && v.lockedUntil < now) s.delete(k);
  }
}

export const clearFailures = (key: string) => void store().delete(key);
