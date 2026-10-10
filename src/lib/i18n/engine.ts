/**
 * Traduction automatique de l'interface, appliquée à la page affichée.
 *
 * Le code source reste en français. Quand l'anglais est choisi, chaque texte visible et chaque libellé
 * (placeholder, aria-label, title, alt) est remplacé par sa traduction issue de `en.json`, y compris ceux
 * qui apparaissent plus tard : onglets, fenêtres, notifications. Les nœuds ne sont jamais ajoutés ni retirés,
 * seul leur texte change : React continue de les mettre à jour normalement.
 *
 * Clés du dictionnaire : le texte français, où chaque nombre est remplacé par `#` et chaque valeur
 * insérée par le code par `{}`. Une valeur vide signifie « ne pas traduire ».
 */
type Dict = Record<string, string>;
type Pattern = { re: RegExp; out: string; weight: number };

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const SKIP = "script,style,noscript,code,pre,textarea,svg,[translate='no'],[contenteditable='true']";
const LETTERS = /\p{L}{2}/u;

export interface Translator {
  /** Traduction d'un texte, ou `null` s'il n'est pas dans le dictionnaire. */
  text: (source: string) => string | null;
  start: () => void;
  stop: () => void;
}

export function createTranslator(dict: Dict, fallback?: (source: string) => Promise<string | null>): Translator {
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [key, value] of Object.entries(dict)) {
    if (!value) continue;
    if (!key.includes("{}")) {
      exact.set(key, value);
      continue;
    }
    const parts = key.split("{}");
    const weight = parts.join("").replace(/[^\p{L}]/gu, "").length;
    if (weight < 3) continue; // trop peu de texte fixe pour reconnaître la phrase sans ambiguïté
    const re = new RegExp(`^${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.*?)")}$`, "s");
    patterns.push({ re, out: value, weight });
  }
  patterns.sort((a, b) => b.weight - a.weight);

  /** Recherche sur une clé où les nombres sont déjà remplacés par `#`. */
  function lookup(key: string, depth = 0): string | null {
    const hit = exact.get(key);
    if (hit !== undefined) return hit;
    if (depth > 2 || key.length > 600) return null;
    for (const p of patterns) {
      const m = p.re.exec(key);
      if (!m) continue;
      let i = 1;
      return p.out.replace(/\{\}/g, () => {
        const part = m[i++] ?? "";
        return lookup(part.trim(), depth + 1) ?? part;
      });
    }
    // Titres composés : « Produits · Administration Oliva ».
    if (key.includes(" · ")) {
      const parts = key.split(" · ");
      const done = parts.map((p) => lookup(p, depth + 1));
      if (done.some((d) => d !== null)) return parts.map((p, i) => done[i] ?? p).join(" · ");
    }
    return null;
  }

  const cache = new Map<string, string | null>();
  function text(source: string): string | null {
    const core = source.replace(/\s+/g, " ").trim();
    if (core.length < 2 || !LETTERS.test(core)) return null;
    let out = cache.get(core);
    if (out === undefined) {
      const numbers = core.match(/\d+/g) ?? [];
      const found = lookup(core.replace(/\d+/g, "#"));
      let n = 0;
      out = found === null ? null : found.replace(/#/g, (h) => numbers[n++] ?? h);
      if (cache.size > 5000) cache.clear();
      cache.set(core, out);
    }
    if (out === null) return null;
    const lead = /^\s*/.exec(source)?.[0] ?? "";
    const trail = /\s*$/.exec(source)?.[0] ?? "";
    return `${lead}${out}${trail}`;
  }

  type Done = { src: string; out: string };
  const texts = new WeakMap<Text, Done>();
  const attrs = new WeakMap<Element, Map<string, Done>>();
  let observer: MutationObserver | null = null;
  let running = false;
  const missing = (globalThis as { __olivaMissing?: Set<string> }).__olivaMissing;

  const skipped = (el: Element | null) => !el || el.closest(SKIP) !== null;

  /** Texte absent du dictionnaire (contenu saisi par le restaurant) : traducteur du navigateur, s'il existe. */
  function later(source: string, apply: (out: string) => void): void {
    missing?.add(source.replace(/\s+/g, " ").trim().replace(/\d+/g, "#"));
    if (!fallback || source.trim().split(/\s+/).length < 3) return;
    void fallback(source.trim())
      .then((out) => {
        if (out && running) apply(out);
      })
      .catch(() => undefined);
  }

  function doText(node: Text): void {
    const current = node.nodeValue ?? "";
    const done = texts.get(node);
    if (done && done.out === current) return;
    if (skipped(node.parentElement)) return;
    const out = text(current);
    if (out !== null) {
      if (out === current) return;
      texts.set(node, { src: current, out });
      node.nodeValue = out;
    } else if (LETTERS.test(current)) {
      later(current, (translated) => {
        if (node.nodeValue !== current || !node.isConnected) return;
        texts.set(node, { src: current, out: translated });
        node.nodeValue = translated;
      });
    }
  }

  function doAttrs(el: Element): void {
    if (skipped(el)) return;
    for (const name of ATTRS) {
      const current = el.getAttribute(name);
      if (!current) continue;
      const done = attrs.get(el)?.get(name);
      if (done && done.out === current) continue;
      const out = text(current)?.trim() ?? null;
      if (out === null || out === current) continue;
      let map = attrs.get(el);
      if (!map) attrs.set(el, (map = new Map()));
      map.set(name, { src: current, out });
      el.setAttribute(name, out);
    }
  }

  function walk(root: Node): void {
    if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (skipped(root as Element)) return;
      doAttrs(root as Element);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
      else doAttrs(n as Element);
    }
  }

  function restore(): void {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const done = texts.get(n as Text);
        if (done && n.nodeValue === done.out) n.nodeValue = done.src;
        texts.delete(n as Text);
      } else {
        const map = attrs.get(n as Element);
        if (!map) continue;
        for (const [name, done] of map) if ((n as Element).getAttribute(name) === done.out) (n as Element).setAttribute(name, done.src);
        attrs.delete(n as Element);
      }
    }
  }

  return {
    text,
    start() {
      if (running) return;
      running = true;
      walk(document.documentElement);
      observer = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "characterData") {
            if (r.target.nodeType === Node.TEXT_NODE) doText(r.target as Text);
          } else if (r.type === "attributes") doAttrs(r.target as Element);
          else r.addedNodes.forEach(walk);
        }
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    },
    stop() {
      if (!running) return;
      running = false;
      observer?.disconnect();
      observer = null;
      restore();
    },
  };
}
