#!/usr/bin/env node
// Revisa el JavaScript del cliente sin abrir un navegador (lo corre CI en cada push).
//  1. Compila cada <script> incrustado en client/index.html y los .js de client/.
//     Un error de sintaxis ahí deja la app entera en blanco.
//  2. Valida que el JSON-LD sea JSON válido.
//  3. Falla si aparece un lookbehind en una regex: en Safari < 16.4 (iPhone con
//     iOS 15/16.0-16.3) eso es error de sintaxis y tumba el bloque completo.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CLIENT = path.join(__dirname, "..", "client");
const LOOKBEHIND = /\(\?<[=!]/;
const errors = [];

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkJs(code, label, baseLine = 1) {
  try {
    new vm.Script(code, { filename: label, lineOffset: baseLine - 1 });
  } catch (e) {
    errors.push(`${label}: ${e.message}${e.stack ? " (" + (e.stack.split("\n")[0]) + ")" : ""}`);
    return;
  }
  code.split("\n").forEach((line, i) => {
    if (LOOKBEHIND.test(line)) errors.push(`${label}:${baseLine + i}: lookbehind en regex (rompe Safari < 16.4)`);
  });
}

const htmlPath = path.join(CLIENT, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let m, blocks = 0;
while ((m = re.exec(html))) {
  const attrs = m[1];
  if (/\bsrc=/.test(attrs)) continue;
  const body = m[2];
  const startLine = lineOf(html, m.index + m[0].indexOf(">") + 1);
  if (/application\/ld\+json/.test(attrs)) {
    try { JSON.parse(body); } catch (e) { errors.push(`index.html:${startLine}: JSON-LD inválido (${e.message})`); }
    continue;
  }
  blocks++;
  checkJs(body, `index.html`, startLine);
}

let files = 0;
for (const f of fs.readdirSync(CLIENT)) {
  if (!f.endsWith(".js")) continue;
  files++;
  checkJs(fs.readFileSync(path.join(CLIENT, f), "utf8"), f);
}

if (errors.length) {
  console.error("❌ Problemas en el JavaScript del cliente:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✅ Cliente OK: ${blocks} bloques <script> en index.html y ${files} archivo(s) .js compilan; sin lookbehind.`);
