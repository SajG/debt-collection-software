#!/usr/bin/env node
// Accessibility floor for the mobile app. Run: npm run check:a11y
//   1. Every <Pressable> has accessibilityRole and accessibilityLabel
//      (or spreads props that carry them).
//   2. No fontSize below 13.
//   3. Text / TextInput come from @/components/Text (font scaling is
//      capped at 1.3× there), never straight from react-native.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN_FONT = 13;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
}
const files = [];
for (const d of ["app", "src"]) walk(join(ROOT, d), files);

const problems = [];
for (const file of files.sort()) {
  const rel = relative(ROOT, file);
  if (/src\/types\/|database\.types\.ts$/.test(rel)) continue;
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const at = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;

  const visit = (node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === "Pressable"
    ) {
      const attrs = node.attributes.properties;
      const spread = attrs.some((a) => ts.isJsxSpreadAttribute(a));
      const has = (name) =>
        attrs.some((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
      if (!spread) {
        const missing = ["accessibilityRole", "accessibilityLabel"].filter((n) => !has(n));
        if (missing.length) problems.push(`${rel}:${at(node)}  Pressable missing ${missing.join(" + ")}`);
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText() === "fontSize" &&
      ts.isNumericLiteral(node.initializer) &&
      Number(node.initializer.text) < MIN_FONT
    ) {
      problems.push(`${rel}:${at(node)}  fontSize ${node.initializer.text} is below ${MIN_FONT}`);
    }
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.getText() === '"react-native"' &&
      !/src\/components\/Text\.tsx$/.test(rel)
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if (!el.isTypeOnly && (el.name.text === "Text" || el.name.text === "TextInput")) {
            problems.push(`${rel}:${at(node)}  import ${el.name.text} from "@/components/Text", not react-native`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const p of problems) console.log(p);
console.log(
  problems.length === 0
    ? "check-a11y: every Pressable is labelled, no font below 13, Text is scaled."
    : `\ncheck-a11y: ${problems.length} problem(s).`,
);
process.exit(problems.length === 0 ? 0 : 1);
