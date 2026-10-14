#!/usr/bin/env node
// Fails when a user-facing string is hard-coded in app/ or src/ instead
// of going through t(). Run: npm run check:i18n  (add --json to dump
// every finding as JSON, used when sweeping a new screen).
//
// What counts as user-facing:
//   * JSX text between tags
//   * string values of the props / object keys listed in TEXT_PROPS
//   * string arguments of Alert.alert(), setError(), toast.*()
//   * string literals inside a JSX expression ({cond ? "A" : "B"})
// A string only counts when it contains a letter run of 2+ characters,
// so glyphs ("›", "₹", "✓"), numbers and units pass.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "src"];
// Dictionaries, generated types and dev-only helpers are not screens.
const SKIP = [
  /src\/lib\/i18n\//,
  /src\/lib\/database\.types\.ts$/,
  /src\/types\//,
  /src\/auth\/dev-test\.ts$/,
  /src\/theme\.ts$/,
];

const TEXT_PROPS = new Set([
  "label",
  "title",
  "subtitle",
  "placeholder",
  "body",
  "hint",
  "message",
  "confirmLabel",
  "cancelLabel",
  "actionLabel",
  "accessibilityLabel",
  "accessibilityHint",
  "backTitle",
  "footnote",
  "promptMessage",
  "fallbackLabel",
  "text",
  "error",
  "emptyText",
  "helper",
  "description",
  "meta",
  "sub",
  "sublabel",
  "chase",
]);
const TEXT_CALLS = new Set(["setError", "setMessage", "setNotice"]);

const HAS_WORD = /[A-Za-zऀ-ॿ]{2,}/;
// Values that are identifiers, not copy: enum members, routes, keys.
const LOOKS_LIKE_CODE = /^([A-Z0-9_]+|[a-z][A-Za-z0-9]*([._:/-][A-Za-z0-9_\-[\]()]+)+|\/.*|#[0-9A-Fa-f]{3,8})$/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
}

// Units and acronyms that read the same in every language.
const UNITS = /\b(kg|KG|PCS|NOS|LR|UPI|NEFT|RTGS|GST|OTP|ml|px)\b/g;

function isCopy(s) {
  const v = s.trim();
  if (!v || LOOKS_LIKE_CODE.test(v)) return false;
  // Interpolations and units are not copy on their own: "{n} kg".
  return HAS_WORD.test(v.replace(/\{[^}]*\}/g, " ").replace(UNITS, " "));
}

// "x === 'ios'" compares a value; it is not shown to anyone.
function isComparisonOperand(node) {
  const p = node.parent;
  if (!p || !ts.isBinaryExpression(p)) return false;
  const k = p.operatorToken.kind;
  return (
    k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    k === ts.SyntaxKind.EqualsEqualsToken ||
    k === ts.SyntaxKind.ExclamationEqualsToken
  );
}

// Two or more words, starting with a capital or a Devanagari letter.
function isSentence(s) {
  const v = s.replace(/\{[^}]*\}/g, "x").trim();
  return /^[A-Z\u0900-\u097F][^\n]*[A-Za-z\u0900-\u097F] [A-Za-z\u0900-\u097F]/.test(v) || /^[A-Z][a-z]{2,}[.…!?]?$/.test(v);
}

// Strings that never reach a screen: queries, logs, imports, types,
// t() keys/arguments and developer-only diagnostics.
const PLUMBING_CALLS =
  /^(console\.|crumb$|reportError$|Sentry\.|require$|t$|tn$|.*\.(select|from|rpc|eq|neq|in|is|or|not|order|ilike|like|channel|on|filter|getItem|setItem|getItemAsync|setItemAsync|deleteItemAsync|multiRemove|test|match|startsWith|endsWith|includes|split|join|replace|padStart)$)/;
const NON_TEXT_ATTRS =
  /^(style|contentContainerStyle|testID|key|name|href|pathname|behavior|keyboardType|inputMode|autoCapitalize|autoComplete|textContentType|returnKeyType|variant|mode|display|animationType|accessibilityRole|accessibilityLiveRegion|importantForAccessibility|pointerEvents|viewBox|d|fill|stroke|strokeLinecap|strokeLinejoin|size|resizeMode|edges|backBehavior|backFallback|fallback|kind|glyph)$/;
function isPlumbing(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p)) return true;
    if (ts.isJsxAttribute(p)) return NON_TEXT_ATTRS.test(p.name.getText());
    if (ts.isPropertyAssignment(p) && p.name === node) return true;
    if (ts.isPropertyAssignment(p) && /^(fontFamily|authorization)$/.test(p.name.getText())) return true;
    if (ts.isCallExpression(p) && PLUMBING_CALLS.test(calleeName(p))) return true;
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) break;
  }
  return isComparisonOperand(node);
}

// `${n} pages uploaded.` — words glued to interpolated values.
function hasWordsAroundValues(node) {
  const fixed = [node.head.text, ...node.templateSpans.map((sp) => sp.literal.text)].join("");
  return /[A-Za-z\u0900-\u097F]{3,}/.test(fixed.replace(UNITS, " ")) && /\s/.test(fixed.trim());
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let s = node.head.text;
  for (const span of node.templateSpans) s += "{}" + span.literal.text;
  return s;
}

function insideJsxExpression(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxExpression(p)) return !ts.isJsxAttribute(p.parent);
    if (ts.isCallExpression(p) || ts.isArrowFunction(p) || ts.isJsxAttribute(p)) return false;
  }
  return false;
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return `${e.expression.getText()}.${e.name.text}`;
  return "";
}

const findings = [];

function scan(file) {
  const rel = relative(ROOT, file);
  if (SKIP.some((re) => re.test(rel))) return;
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  // `// i18n-ignore: reason` on the same or previous line, or a block
  // between i18n-ignore-start and i18n-ignore-end, exempts data that is
  // deliberately not translated (stored notes, catalogue values).
  const lines = src.split("\n");
  const ignored = new Set();
  let inBlock = false;
  lines.forEach((l, i) => {
    if (l.includes("i18n-ignore-start")) inBlock = true;
    if (inBlock || /i18n-ignore(?!-)/.test(l)) ignored.add(i + 1);
    if (/i18n-ignore(?!-)/.test(l)) ignored.add(i + 2);
    if (l.includes("i18n-ignore-end")) inBlock = false;
  });
  const add = (node, kind, text) => {
    if (!isCopy(text) || isComparisonOperand(node)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    if (ignored.has(line + 1)) return;
    findings.push({ file: rel, line: line + 1, kind, text: text.trim().replace(/\s+/g, " ") });
  };
  const str = (n) =>
    ts.isStringLiteral(n)
      ? n.text
      : ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)
        ? templateText(n)
        : null;

  const visit = (node) => {
    if (ts.isJsxText(node)) add(node, "jsx-text", node.text);
    else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      if (TEXT_PROPS.has(name)) {
        const init = ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer;
        const s = init ? str(init) : null;
        if (s !== null) add(node, `prop:${name}`, s);
        else if (init) collectBranches(init, `prop:${name}`);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText().replace(/['"]/g, "");
      if (TEXT_PROPS.has(name)) {
        const s = str(node.initializer);
        if (s !== null) add(node, `key:${name}`, s);
        else collectBranches(node.initializer, `key:${name}`);
      }
    } else if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name === "Alert.alert" || TEXT_CALLS.has(name) || /^toast\./.test(name)) {
        for (const a of node.arguments) {
          const s = str(a);
          if (s !== null) add(a, `call:${name}`, s);
          else collectBranches(a, `call:${name}`);
        }
      }
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
      insideJsxExpression(node)
    ) {
      add(node, "jsx-expr", str(node));
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
      (isSentence(str(node)) || (ts.isTemplateExpression(node) && hasWordsAroundValues(node))) &&
      !isPlumbing(node)
    ) {
      // Catch-all: copy stored in a table, returned from a helper or
      // thrown and later shown via e.message.
      add(node, "sentence", str(node));
    }
    ts.forEachChild(node, visit);
  };

  // "a ? 'X' : 'Y'" and "a ?? 'X'" handed to a text prop.
  const collectBranches = (expr, kind) => {
    if (ts.isConditionalExpression(expr)) {
      collectBranches(expr.whenTrue, kind);
      collectBranches(expr.whenFalse, kind);
    } else if (ts.isBinaryExpression(expr)) {
      collectBranches(expr.left, kind);
      collectBranches(expr.right, kind);
    } else if (ts.isParenthesizedExpression(expr)) {
      collectBranches(expr.expression, kind);
    } else {
      const s = str(expr);
      if (s !== null) add(expr, kind, s);
    }
  };

  visit(sf);
}

const files = [];
for (const d of DIRS) walk(join(ROOT, d), files);
files.sort().forEach(scan);

// De-dupe (a literal can be reached by two rules).
const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.file}:${f.line}:${f.text}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(unique, null, 1));
} else {
  for (const f of unique) console.log(`${f.file}:${f.line}  [${f.kind}]  ${f.text}`);
  console.log(
    unique.length === 0
      ? "check-i18n: no hard-coded user-facing strings."
      : `\ncheck-i18n: ${unique.length} hard-coded user-facing string(s). Move them into t().`,
  );
}
process.exit(unique.length === 0 ? 0 : 1);
