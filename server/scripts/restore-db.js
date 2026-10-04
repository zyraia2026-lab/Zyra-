#!/usr/bin/env node
// Restaura un respaldo hecho con backup-db.js en una base de datos.
//
// Uso, desde la carpeta server/:
//   node scripts/restore-db.js <carpeta-del-respaldo> --target <nombre-de-la-base>
//
// Por seguridad SOLO escribe en una base vacía: nunca mezcla ni sobrescribe datos.
// Para recuperar producción después de una pérdida total, la base "zyra" estará
// vacía y se puede usar como destino. Verifica la integridad de cada archivo
// (sha256) y que los conteos finales coincidan con el respaldo.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { BSON } = require("mongodb");
const { connectMongo } = require("./mongo-connect");

const INDEX_OPTIONS = ["name", "unique", "sparse", "expireAfterSeconds", "partialFilterExpression", "collation"];

(async () => {
  const args = process.argv.slice(2);
  const ti = args.indexOf("--target");
  const target = ti >= 0 ? args[ti + 1] : null;
  const dir = args.find((a, i) => !a.startsWith("--") && i !== ti + 1);
  if (!dir || !target) {
    console.error("Uso: node scripts/restore-db.js <carpeta-del-respaldo> --target <nombre-de-la-base>");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));

  const client = await connectMongo();
  const db = client.db(target);

  // Base de destino vacía o nada
  for (const { name } of await db.listCollections({ type: "collection" }).toArray()) {
    if (name.startsWith("system.")) continue;
    if (await db.collection(name).estimatedDocumentCount() > 0) {
      console.error(`❌ La base "${target}" no está vacía (colección "${name}" tiene datos). No se restauró nada.`);
      await client.close();
      process.exit(1);
    }
  }

  let total = 0;
  for (const [name, info] of Object.entries(manifest.collections)) {
    const json = fs.readFileSync(path.join(dir, name + ".json"), "utf8");
    const hash = crypto.createHash("sha256").update(json).digest("hex");
    if (hash !== info.sha256) throw new Error(`El archivo ${name}.json está dañado o fue modificado (sha256 distinto).`);
    const docs = BSON.EJSON.parse(json, { relaxed: false });
    const col = db.collection(name);
    if (docs.length) await col.insertMany(docs, { ordered: true });
    else await db.createCollection(name).catch(() => {});
    for (const ix of info.indexes || []) {
      const opts = {};
      for (const k of INDEX_OPTIONS) if (ix[k] !== undefined) opts[k] = ix[k];
      await col.createIndex(ix.key, opts);
    }
    const count = await col.countDocuments();
    if (count !== info.count) throw new Error(`${name}: se esperaban ${info.count} documentos y hay ${count}.`);
    total += count;
    console.log(`  ${name.padEnd(20)} ${String(count).padStart(6)}  ok`);
  }

  await client.close();
  console.log(`✅ Restaurado en "${target}": ${total} documentos de ${Object.keys(manifest.collections).length} colecciones, conteos e integridad verificados.`);
})().catch(e => { console.error("❌ Error en la restauración:", e.message); process.exit(1); });
