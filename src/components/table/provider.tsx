"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { MenuData, MenuProduct } from "@/lib/server/services/menu";
import type { TableCartLine, TableState } from "@/lib/table-types";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export class TableError extends Error {
  constructor(
    message: string,
    /** 0 quand le serveur n'a pas pu être joint. */
    public status = 0,
  ) {
    super(message);
  }
}

/** Appel de l'API des convives. Une session devenue inaccessible renvoie à l'écran d'accueil de la table. */
export async function tableCall<T = unknown>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/table/${path}`, { method, credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new TableError("Connexion au serveur impossible. Vérifiez votre réseau.");
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json?.ok) throw new TableError(json?.error?.message ?? "Le serveur a renvoyé une erreur. Rien n'a été enregistré.", res.status);
  return json.data as T;
}

export type DialogState =
  | { type: "produit"; produit: MenuProduct }
  | { type: "instruction"; ligne: TableCartLine }
  | { type: "confirmation"; cle: string }
  /** La commande est partie : écran de réussite. */
  | { type: "envoyee" }
  /** La réponse du serveur s'est perdue pendant l'envoi : on ne sait pas encore si la commande est partie. */
  | { type: "verification"; cle: string }
  | { type: "aide" }
  | null;

interface Ctx {
  state: TableState;
  menu: MenuData;
  /** Vrai pendant l'envoi d'une modification. */
  pending: boolean;
  /** Faux quand le serveur ne répond plus : l'état affiché est le dernier reçu. */
  online: boolean;
  /** Heure de la dernière lecture réussie de l'état de la table. */
  syncedAt: string;
  /** Exécute une modification, affiche l'erreur éventuelle et recharge l'état de la table. Retourne vrai en cas de succès. */
  act: (run: () => Promise<unknown>, success?: string) => Promise<boolean>;
  refresh: () => Promise<boolean>;
  favorites: Set<string>;
  toggleFavorite: (produitId: string) => void;
  dialog: DialogState;
  setDialog: (d: DialogState) => void;
  /** Ouvre la confirmation d'envoi, ou envoie directement si le restaurant a désactivé la confirmation. */
  order: () => void;
  /** Envoie le panier en cuisine. La même clé peut être renvoyée sans risque : la commande ne part qu'une fois. */
  confirm: (cle: string) => Promise<void>;
}

const TableContext = createContext<Ctx | null>(null);
export function useTable(): Ctx {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error("useTable doit être utilisé dans TableProvider.");
  return ctx;
}

const newKey = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-cle`);

export function TableProvider({ initial, menu, children }: { initial: TableState; menu: MenuData; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState(() => new Date().toISOString());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const loading = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const storageKey = `oliva.envies.${initial.table.id}`;

  const refresh = useCallback((): Promise<boolean> => {
    // Une seule lecture à la fois ; une demande arrivée entre-temps relance une lecture à la fin.
    if (loading.current) {
      again.current = true;
      return loading.current;
    }
    loading.current = (async () => {
      try {
        do {
          again.current = false;
          setState(await tableCall<TableState>("GET", "etat"));
        } while (again.current);
        setOnline(true);
        setSyncedAt(new Date().toISOString());
        return true;
      } catch (e) {
        // Session fermée par le personnel, ou accès retiré : retour à l'écran d'accueil de la table.
        if (e instanceof TableError && e.status === 403) window.location.reload();
        else if (e instanceof TableError && e.status === 0) setOnline(false);
        return false;
      } finally {
        loading.current = null;
      }
    })();
    return loading.current;
  }, []);

  const act = useCallback(
    async (run: () => Promise<unknown>, success?: string) => {
      setPending(true);
      try {
        await run();
        if (success) toast.success(success);
        await refresh();
        return true;
      } catch (e) {
        if (e instanceof TableError && e.status === 403) {
          window.location.reload();
          return false;
        }
        if (e instanceof TableError && e.status === 0) setOnline(false);
        toast.error(e instanceof Error ? e.message : "Une erreur inattendue s'est produite.");
        await refresh();
        return false;
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  // Mises à jour en direct : le flux n'est ouvert que lorsque l'onglet est visible.
  useEffect(() => {
    let source: EventSource | null = null;
    let first = true;
    const open = () => {
      if (source || document.visibilityState !== "visible") return;
      source = new EventSource("/api/table/evenements");
      source.addEventListener("pret", () => {
        // À la reconnexion, l'état a pu changer pendant la coupure.
        if (!first) void refresh();
        first = false;
      });
      source.addEventListener("maj", () => void refresh());
      // Le navigateur se reconnecte seul ; une lecture de l'état dit si le serveur répond encore.
      source.addEventListener("error", () => void refresh());
    };
    const close = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        open();
        void refresh();
      } else close();
    };
    const onOffline = () => setOnline(false);
    const onOnline = () => void refresh();
    open();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", open);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", open);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      close();
    };
  }, [refresh]);

  // « Mes envies » : simple confort, gardé sur l'appareil.
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
      if (Array.isArray(raw)) setFavorites(new Set(raw.filter((x): x is string => typeof x === "string")));
    } catch {
      /* stockage indisponible : les envies ne sont pas mémorisées */
    }
  }, [storageKey]);

  const toggleFavorite = useCallback(
    (produitId: string) => {
      setFavorites((current) => {
        const next = new Set(current);
        if (!next.delete(produitId)) next.add(produitId);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* stockage indisponible */
        }
        return next;
      });
    },
    [storageKey],
  );

  const confirm = useCallback(
    async (cle: string) => {
      setPending(true);
      try {
        await tableCall("POST", "panier/confirmer", { cle });
        setOnline(true);
        await refresh();
        setDialog({ type: "envoyee" });
      } catch (e) {
        if (e instanceof TableError && e.status === 403) return window.location.reload();
        if (e instanceof TableError && e.status === 0) {
          // Impossible de savoir si le serveur a reçu la commande : on vérifiera avec la même clé.
          setOnline(false);
          setDialog({ type: "verification", cle });
          return;
        }
        toast.error(e instanceof Error ? e.message : "Une erreur inattendue s'est produite.");
        await refresh();
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  const order = useCallback(() => {
    const cle = newKey();
    if (state.reglages.confirmation) setDialog({ type: "confirmation", cle });
    else void confirm(cle);
  }, [state.reglages.confirmation, confirm]);

  const value = useMemo(
    () => ({ state, menu, pending, online, syncedAt, act, refresh, favorites, toggleFavorite, dialog, setDialog, order, confirm }),
    [state, menu, pending, online, syncedAt, act, refresh, favorites, toggleFavorite, dialog, order, confirm],
  );
  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}
