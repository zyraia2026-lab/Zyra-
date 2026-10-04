/* ══════════════════════════════════════════════════════════════
   PRUEBAS DE HUMO (smoke tests) -- Zyra
   ══════════════════════════════════════════════════════════════
   Corren contra el servidor REAL desplegado (no un entorno aislado), igual
   que las pruebas manuales que se hicieron durante el desarrollo: registran
   una cuenta de prueba de verdad, prueban los flujos principales, y la
   borran al final. Sin esto, cada cambio al servidor solo quedaba validado
   "a mano" -- esto deja algo repetible que cualquiera puede correr antes de
   desplegar.

   Uso:
     cd server
     npm test
     BASE_URL=http://localhost:438 npm test   (para probar en local)

   Requiere .env con MONGODB_URI (para leer el codigo OTP del registro de
   prueba -- el flujo real de login/registro siempre pasa por un codigo
   enviado por correo, no hay forma de evitarlo sin tocar produccion).
   ══════════════════════════════════════════════════════════════ */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { MongoClient } = require("mongodb");

const BASE_URL = process.env.BASE_URL || "https://zyra-app-8qva.onrender.com";

// ── Conexion a Mongo con respaldo directo (sin +srv) ──────────────────────
// En algunos entornos la resolucion DNS de tipo SRV que usa Node falla
// (querySrv ECONNREFUSED) aunque el resto de la red funcione bien. Si pasa,
// se cae a una conexion directa con los hosts de shard ya conocidos del
// cluster (no son secretos, se obtienen del mismo SRV publico con
// `nslookup -type=SRV _mongodb._tcp.<cluster>`; si el cluster migra de
// shards hay que refrescarlos con ese comando).
const _KNOWN_SHARD_HOSTS = [
  "ac-u2owcwm-shard-00-00.kum1w7r.mongodb.net:27017",
  "ac-u2owcwm-shard-00-01.kum1w7r.mongodb.net:27017",
  "ac-u2owcwm-shard-00-02.kum1w7r.mongodb.net:27017",
];
const _KNOWN_REPLICA_SET = "atlas-b0c4l1-shard-0";

function _toDirectUri(srvUri) {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]*)\??(.*)$/);
  if (!m) return null;
  const [, user, pass, , dbname] = m;
  return `mongodb://${user}:${pass}@${_KNOWN_SHARD_HOSTS.join(",")}/${dbname}?ssl=true&replicaSet=${_KNOWN_REPLICA_SET}&authSource=admin&retryWrites=true&w=majority`;
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI no configurado en server/.env");
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
    await client.connect();
    return client;
  } catch (e) {
    if (!/querySrv/.test(e.message)) throw e;
    console.log("  (DNS SRV bloqueado en este entorno, usando conexión directa de respaldo)");
    const direct = _toDirectUri(uri);
    if (!direct) throw e;
    const client = new MongoClient(direct, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    return client;
  }
}

async function api(path, method = "GET", body = null, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(BASE_URL + "/api" + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { status: r.status, ok: r.ok, data, headers: r.headers };
}

// ── Estado compartido entre pruebas ───────────────────────────────────────
let mongo, db;
let testEmail, token, journalId, goalId;

before(async () => {
  mongo = await connectMongo();
  db = mongo.db();
  testEmail = `zyra-smoketest-${Date.now()}@example.com`;
});

after(async () => {
  // Limpieza: nunca dejar la cuenta de prueba ni sus datos en la base real.
  if (db && testEmail) {
    const user = await db.collection("users").findOne({ email: testEmail });
    if (user) {
      await db.collection("users").deleteOne({ _id: user._id });
      await db.collection("profiles").deleteOne({ user: user._id }).catch(() => {});
      await db.collection("journals").deleteMany({ user: user._id }).catch(() => {});
      await db.collection("goals").deleteMany({ user: user._id }).catch(() => {});
    }
    await db.collection("otpcodes").deleteOne({ key: testEmail }).catch(() => {});
  }
  if (mongo) await mongo.close();
});

test("servidor responde y esta sano", async () => {
  const r = await api("/health");
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "OK");
});

test("manifest y PWA basicos responden", async () => {
  const r = await fetch(BASE_URL + "/manifest.json");
  assert.equal(r.status, 200);
  const json = await r.json();
  assert.ok(Array.isArray(json.icons) && json.icons.length > 0);
});

test("flujo completo de registro (codigo por correo -> verificar -> token)", async () => {
  let r = await api("/auth/register/request", "POST", {
    name: "Smoke Test", email: testEmail, password: "SmokeTest1234!",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  // El codigo se envia por correo real -- se lee directo de la base para no
  // depender de una bandeja de entrada.
  let otpDoc = null;
  for (let i = 0; i < 10 && !otpDoc; i++) {
    otpDoc = await db.collection("otpcodes").findOne({ key: testEmail });
    if (!otpDoc) await new Promise(res => setTimeout(res, 800));
  }
  assert.ok(otpDoc, "no se encontró el código OTP en Mongo a tiempo");

  r = await api("/auth/register/verify", "POST", { email: testEmail, code: otpDoc.code });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.token, "no se recibió token");
  token = r.data.token;
});

test("perfil del usuario recien creado es correcto", async () => {
  const r = await api("/auth/me", "GET", null, token);
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, testEmail);
});

test("texto a voz: responde audio real con algun proveedor", async () => {
  const r = await fetch(BASE_URL + "/api/tts/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ text: "Prueba automática de voz." }),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(r.status, 200);
  const provider = r.headers.get("x-tts-provider");
  assert.ok(provider, "falta el header X-TTS-Provider");
  const buf = Buffer.from(await r.arrayBuffer());
  assert.ok(buf.length > 1000, `audio demasiado chico (${buf.length} bytes) -- ¿provider ${provider} roto?`);
});

test("plan de seguridad: guardar y leer de vuelta (siempre gratis, sin plan pago)", async () => {
  let r = await api("/profile/safety-plan", "PUT", {
    warningSigns: ["dejo de dormir"],
    copingStrategies: ["escuchar música", "salir a caminar"],
    supportPeople: [{ name: "Prueba Amiga", phone: "3000000000" }],
    safeEnvironmentNotes: "nota de prueba",
  }, token);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.safetyPlan.copingStrategies.length, 2);

  r = await api("/profile/safety-plan", "GET", null, token);
  assert.equal(r.status, 200);
  assert.equal(r.data.safetyPlan.supportPeople[0].name, "Prueba Amiga");
});

test("diario: crear y listar una entrada", async () => {
  let r = await api("/journal", "POST", { title: "Prueba", content: "Entrada de la prueba automática.", emotion: "tranquilo" });
  // la primera llamada aun no tiene token si el test de arriba fallo -- reintentar con token explicito
  r = await api("/journal", "POST", { title: "Prueba", content: "Entrada de la prueba automática.", emotion: "tranquilo" }, token);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  journalId = r.data.entry?._id;
  assert.ok(journalId, "no se devolvió el id de la entrada creada");

  r = await api("/journal", "GET", null, token);
  assert.equal(r.status, 200);
  assert.ok(r.data.entries.some(e => e._id === journalId));
});

test("metas: crear una meta", async () => {
  const r = await api("/goals", "POST", { title: "Meta de prueba automática" }, token);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  goalId = r.data.goal?._id;
  assert.ok(goalId, "no se devolvió el id de la meta creada");
});

test("pagos: el checkout de Wompi arma una sesion valida", async () => {
  const r = await api("/payments/checkout", "POST", { plan: "basic", period: "monthly" }, token);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.wompi, "se esperaba el flujo de Wompi (publicKey/signature)");
  assert.ok(r.data.publicKey && r.data.signature && r.data.reference, "faltan campos del checkout de Wompi");
});

test("rutas que deberian exigir login las exigen (sin token -> 401)", async () => {
  const r = await api("/journal", "GET");
  assert.equal(r.status, 401);
});

test("formulario B2B: rechaza un correo invalido sin guardar nada", async () => {
  // Una sola llamada por corrida: el formulario tiene limite de 5 envios por hora por IP
  const r = await api("/contact", "POST", { name: "Prueba", email: "no-es-correo" });
  assert.equal(r.status, 400);
});

test("guias publicas responden como pagina real (no la app)", async () => {
  const r = await fetch(BASE_URL + "/ansiedad");
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes("<h1>") && html.includes("Línea 106"), "la guia debe tener titulo y aviso de crisis");
});
