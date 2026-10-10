"use client";

import { Translate } from "@phosphor-icons/react/dist/ssr";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { LANG_COOKIE, type UiLang } from "@/lib/i18n/config";
import type { Translator } from "@/lib/i18n/engine";

const Ctx = createContext<{ lang: UiLang; setLang: (l: UiLang) => void }>({ lang: "fr", setLang: () => undefined });
export const useUiLang = () => useContext(Ctx);

function readCookie(): UiLang {
  try {
    return new RegExp(`(?:^|; )${LANG_COOKIE}=en(?:;|$)`).test(document.cookie) ? "en" : "fr";
  } catch {
    return "fr";
  }
}

/** Traducteur intégré à certains navigateurs (Chrome sur ordinateur), exécuté sur l'appareil. Absent ailleurs. */
interface BrowserTranslator {
  availability: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
  create: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<{ translate: (s: string) => Promise<string> }>;
}

type Session = { translate: (s: string) => Promise<string> };
const PAIR = { sourceLanguage: "fr", targetLanguage: "en" };
let session: Promise<Session | null> | null = null;

/**
 * Prépare le traducteur du navigateur. Après un clic sur EN (`allowDownload`), le navigateur peut télécharger
 * son modèle de langue ; au simple chargement d'une page, il n'est utilisé que s'il est déjà installé.
 */
function browserSession(allowDownload: boolean): Promise<Session | null> | null {
  const api = (globalThis as { Translator?: BrowserTranslator }).Translator;
  if (!api) return null;
  if (session && !allowDownload) return session;
  const previous = session;
  session = (async () => {
    const ready = previous ? await previous : null;
    if (ready) return ready;
    const state = await api.availability(PAIR);
    if (state === "available" || (allowDownload && state !== "unavailable")) return api.create(PAIR);
    return null;
  })().catch(() => null);
  return session;
}

function browserFallback(): ((source: string) => Promise<string | null>) | undefined {
  if (!(globalThis as { Translator?: BrowserTranslator }).Translator) return undefined;
  const cache = new Map<string, Promise<string | null>>();
  return (source) => {
    let out = cache.get(source);
    if (!out) {
      out = (browserSession(false) ?? Promise.resolve(null)).then((t) => (t ? t.translate(source) : null)).catch(() => null);
      if (cache.size > 2000) cache.clear();
      cache.set(source, out);
    }
    return out;
  };
}

/** Attendre la fin du chargement et un moment de repos : React doit avoir fini d'hydrater la page en français. */
function whenSettled(run: () => void): () => void {
  let cancelled = false;
  let timer = 0;
  const go = () => {
    timer = window.setTimeout(() => {
      if (!cancelled) run();
    }, 250);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    window.removeEventListener("load", go);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("fr");
  useEffect(() => setLangState(readCookie()), []);

  const setLang = useCallback((next: UiLang) => {
    try {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* cookies refusés : le choix vaut pour la page affichée */
    }
    if (next === "en") browserSession(true);
    setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang !== "en") return;
    let translator: Translator | null = null;
    let cancelled = false;
    const cancelWait = whenSettled(() => {
      void Promise.all([import("@/lib/i18n/engine"), import("@/lib/i18n/en.json")]).then(([engine, dict]) => {
        if (cancelled) return;
        translator = engine.createTranslator(dict.default as Record<string, string>, browserFallback());
        translator.start();
      });
    });
    return () => {
      cancelled = true;
      cancelWait();
      translator?.stop();
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Sélecteur FR / EN. Sur la carte publique, `content` indique les langues publiées par le restaurant :
 * quand la langue choisie en fait partie, la page est rechargée avec ses traductions saisies dans l'administration.
 */
export function LanguageSwitch({ floating, className, content }: { floating?: boolean; className?: string; content?: { current: string; langs: string[] } }) {
  const { lang, setLang } = useUiLang();
  const others = content?.langs.filter((l) => l !== "fr" && l !== "en") ?? [];
  const otherActive = content ? others.includes(content.current) : false;
  const choose = (next: UiLang) => {
    setLang(next);
    if (content && content.current !== next && content.langs.includes(next)) window.location.assign(`?lang=${next}`);
  };
  const segment = (active: boolean) => cn("px-2 py-1 font-sans text-[12.5px] leading-5 font-semibold uppercase", active ? "bg-olive text-white" : "text-muted hover:bg-olive-tint");
  return (
    <div
      role="group"
      aria-label="Langue de l'interface"
      className={cn("no-print inline-flex shrink-0 items-center overflow-hidden rounded-full border border-line bg-white", floating && "fixed top-4 right-4 z-40 shadow-card", className)}
    >
      <Translate size={16} aria-hidden className="mr-0.5 ml-2 hidden text-muted sm:block" />
      {(["fr", "en"] as const).map((l) => (
        <button key={l} type="button" translate="no" lang={l} aria-pressed={!otherActive && lang === l} title={l === "fr" ? "Français" : "English"} onClick={() => choose(l)} className={segment(!otherActive && lang === l)}>
          {l}
        </button>
      ))}
      {others.map((l) => (
        <a key={l} href={`?lang=${l}`} translate="no" lang={l} aria-current={content?.current === l ? "true" : undefined} className={segment(content?.current === l)}>
          {l}
        </a>
      ))}
    </div>
  );
}
