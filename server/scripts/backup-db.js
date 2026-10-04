#!/usr/bin/env node
// Copia completa de la base de datos a archivos JSON (formato EJSON: conserva
// fechas, IDs y tipos exactos) más los índices de cada colección.
//
// Uso, desde la carpeta server/:   node scripts/backup-db.js [carpeta]
//
// Por defecto guarda en Documentos/zyra-backups/<fecha>/, FUERA del repositorio:
// el respaldo contiene diarios y conversaciones privadas de los usuarios.
// No lo subas a ningún lado ni lo compartas.
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { BSON } = require("mongodb");
const { connectMongo } = require("./mongo-connect");

(async () => {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const outDir = path.resolve(process.argv[2] || path.join(os.homedir(), "Documents", "zyra-backups", stamp));
  const repoRoot = path.resolve(__dirname, "..", "..");
  if ((outDir + path.sep).startsWith(repoRoot + path.sep)) {
    console.error("❌ El respaldo no puede quedar dentro del repositorio: tiene datos privados de los usuarios.");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const client = await connectMongo();
  const db = client.db();
  const manifest = { createdAt: new Date().toISOString(), database: db.databaseName, collections: {} };
  let total = 0;

  const collections = (await db.listCollections({ type: "collection" }).toArray())
    .map(c => c.name).filter(n => !n.startsWith("system.")).sort();
  for (const name of collections) {
    const col = db.collection(name);
    const docs = await col.find({}).toArray();
    const json = BSON.EJSON.stringify(docs, { relaxed: false });
    fs.writeFileSync(path.join(outDir, name + ".json"), json);
    const indexes = (await col.indexes()).filter(ix => ix.name !== "_id_");
    manifest.collections[name] = {
      count: docs.length,
      sha256: crypto.createHash("sha256").update(json).digest("hex"),
      indexes,
    };
    total += docs.length;
    console.log(`  ${name.padEnd(20)} ${String(docs.length).padStart(6)}`);
  }

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await client.close();
  console.log(`✅ Respaldo listo: ${total} documentos de ${collections.length} colecciones en ${outDir}`);
})().catch(e => { console.error("❌ Error en el respaldo:", e.message); process.exit(1); });
