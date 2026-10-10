/**
 * Relève les textes français de l'interface dans le code source et liste ceux qui manquent
 * au dictionnaire anglais (src/lib/i18n/en.json). Usage : node scripts/i18n-extract.cjs [fichier de sortie]
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..");
const DICT = path.join(ROOT, "src/lib/i18n/en.json");
const SKIP_ATTR = /^(className|class|href|src|id|name|type|key|role|htmlFor|rel|target|method|action|accept|autoComplete|inputMode|pattern|style|d|viewBox|fill|stroke|lang|sizes|variant|tone|size|value|defaultValue|mode|align|side|position|as)$/;
const SKIP_CALL = /^(cn|buttonClass|tab|width|require|fetch|api|push|replace|redirect|find|must|usagesOf|RegExp|querySelector|querySelectorAll|getAttribute|setAttribute|addEventListener|removeEventListener|includes|startsWith|endsWith|split|join|has|get|set|can|requirePage|requireApi|append|createElement|getItem|setItem|localeCompare|toLocaleString|toLocaleDateString|toLocaleTimeString|padStart|padEnd|indexOf|test|match|error|warn|log|info)$/;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !p.includes(`${path.sep}i18n${path.sep}`)) files.push(p);
  }
})(path.join(ROOT, "src"));
// Les contenus de démonstration sont traduits eux aussi, pour que la carte d'exemple soit entièrement en anglais.
files.push(path.join(ROOT, "scripts/demo-seed.ts"));

const norm = (s) => s.replace(/\s+/g, " ").trim();
/** Un texte destiné à une personne : une majuscule ou un accent, et pas un identifiant technique. */
function human(s) {
  if (s.length < 2 || !/\p{L}{2}/u.test(s)) return false;
  if (/^[a-z0-9_.:\/\-#%\[\]()@=,;!&*+'"`<>|?\s]+$/.test(s) && !/\s/.test(s)) return false; // identifiant
  if (/^[\w.-]+\.(tsx?|json|webp|svg|png|jpg|xlsx|csv)$/i.test(s)) return false;
  if (/^(https?:|\/|\.\/|@\/|#[0-9a-f]{3,8}$)/i.test(s)) return false;
  if (/^[a-z]+([A-Z][a-z0-9]+)+$/.test(s) || /^[A-Z][a-z]+([A-Z][a-z0-9]+)+$/.test(s)) return false; // camelCase, PascalCase
  if (/^[A-Z0-9_]+$/.test(s) && s.length > 4 && s.includes("_")) return false;
  if (/^[a-z-]+(:[a-z-]+)*(-\[?[\w.%\/#()-]+\]?)+(\s|$)/.test(s) && /(^|\s)(flex|grid|text-|bg-|px-|py-|mt-|mb-|gap-|w-|h-|rounded|border|items-|justify-|hidden|block|inline|size-|min-|max-|font-|shadow|absolute|relative|sticky|fixed|overflow|truncate|sr-only|press|animate-)/.test(s)) return false; // classes
  if (/(^|\s)(flex|grid|hidden|block|truncate|sr-only|relative|absolute)(\s|$)/.test(s) && !/[A-ZÀ-Ý.,!?]/.test(s)) return false;
  if (!/\s/.test(s) && !/^[A-ZÀ-Ý]/.test(s) && !/[à-ÿ]/.test(s)) return false; // mot technique en minuscules
  if (/^[a-z]+(\.[a-z]+)+$/i.test(s)) return false; // clé pointée
  return true;
}

const found = new Map(); // clé -> fichier
const add = (raw, file) => {
  const k = norm(raw).replace(/\d+/g, "#");
  if (human(k) && !found.has(k)) found.set(k, path.relative(ROOT, file).split(path.sep).join("/"));
};

for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const skip = (node) => {
    const p = node.parent;
    if (!p) return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p)) return true;
    if (ts.isJsxAttribute(p) && SKIP_ATTR.test(p.name.getText())) return true;
    if (ts.isPropertyAssignment(p) && p.name === node) return true;
    if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return true;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText())) return true;
    if (ts.isCallExpression(p)) {
      const callee = p.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText();
      if (SKIP_CALL.test(name)) return true;
    }
    return false;
  };
  (function visit(node) {
    if (ts.isJsxText(node)) add(node.text, file);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!skip(node)) add(node.text, file);
    } else if (ts.isTemplateExpression(node)) {
      if (!skip(node)) {
        let s = node.head.text;
        node.templateSpans.forEach((span) => (s += "{}" + span.literal.text));
        add(s, file);
      }
    }
    ts.forEachChild(node, visit);
  })(src);
}

const dict = fs.existsSync(DICT) ? JSON.parse(fs.readFileSync(DICT, "utf8")) : {};
const missing = [...found].filter(([k]) => !(k in dict));
const byFile = new Map();
for (const [k, f] of missing) byFile.set(f, [...(byFile.get(f) ?? []), k]);
const out = [...byFile].map(([f, ks]) => `## ${f}\n${ks.join("\n")}`).join("\n\n");
if (process.argv[2]) fs.writeFileSync(process.argv[2], out + "\n");
console.log(`${found.size} texte(s) relevé(s), ${missing.length} absent(s) du dictionnaire.`);
if (missing.length > 0) process.exitCode = 1;
