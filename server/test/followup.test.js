// Pruebas de "Zyra se acuerda de ti" (memoryController) y del tope diario de notificaciones
// (pushController). Sin red ni base de datos.   npm run test:unit
const test = require("node:test");
const assert = require("node:assert");
const { _chooseFollowUp: choose } = require("../controllers/memoryController");
const { _reservePushSlot: reserve } = require("../controllers/pushController");
const { escapeRegex, colombiaNow } = require("../utils/ai");

const DAY = 86400000;
// Las fechas de las memorias se guardan como el día a medianoche UTC ("2026-10-15")
const d = (iso) => new Date(iso + "T00:00:00Z");
// Hora de Colombia = UTC - 5
const col = (iso, hour) => new Date(new Date(iso + "T00:00:00Z").getTime() + (hour + 5) * 3600 * 1000);
const mem = (iso, extra = {}) => ({ _id: iso, content: "Tiene examen de cálculo", followUpDate: d(iso), ...extra });

test("la víspera da ánimo; el mismo día antes de las 5 pm también", () => {
  assert.strictEqual(choose([mem("2026-10-15")], col("2026-10-14", 18))?.kind, "cheer");
  assert.strictEqual(choose([mem("2026-10-15")], col("2026-10-15", 9))?.kind, "cheer");
});

test("después del evento pregunta cómo le fue (desde las 5 pm del mismo día y hasta 4 días)", () => {
  assert.strictEqual(choose([mem("2026-10-15")], col("2026-10-15", 18))?.kind, "ask");
  assert.strictEqual(choose([mem("2026-10-15")], col("2026-10-16", 8))?.kind, "ask");
  assert.strictEqual(choose([mem("2026-10-15")], col("2026-10-19", 12))?.kind, "ask");
  assert.strictEqual(choose([mem("2026-10-15")], col("2026-10-20", 12)), null, "más de 4 días: ya no");
});

test("no repite: lo ya preguntado o deseado no vuelve a salir", () => {
  assert.strictEqual(choose([mem("2026-10-15", { followUpAskedAt: new Date() })], col("2026-10-16", 10)), null);
  assert.strictEqual(choose([mem("2026-10-15", { followUpCheeredAt: new Date() })], col("2026-10-14", 18)), null);
  // Ya le deseó suerte, pero después sí le pregunta cómo le fue
  assert.strictEqual(choose([mem("2026-10-15", { followUpCheeredAt: new Date() })], col("2026-10-16", 10))?.kind, "ask");
});

test("lejos en el futuro no dice nada todavía", () => {
  assert.strictEqual(choose([mem("2026-10-25")], col("2026-10-14", 18)), null);
});

test("preguntar cómo le fue va antes que dar ánimo", () => {
  const r = choose([mem("2026-10-16"), mem("2026-10-14")], col("2026-10-15", 18));
  assert.strictEqual(r.kind, "ask");
  assert.strictEqual(r.mem._id, "2026-10-14");
});

test("la hora de Colombia se calcula bien desde UTC", () => {
  const c = colombiaNow(new Date("2026-10-15T02:30:00Z")); // 9:30 pm del 14 en Colombia
  assert.strictEqual(c.date, "2026-10-14");
  assert.strictEqual(c.hour, 21);
});

test("escapeRegex: un texto con paréntesis o signos ya no rompe la búsqueda de duplicados", () => {
  const s = "Tiene examen (cálculo)? [grupo 2] a+b";
  assert.ok(new RegExp(escapeRegex(s), "i").test("x " + s + " y"));
});

// Perfil falso que imita updateOne/exists de Mongoose con los filtros que usa reservePushSlot
function fakeProfile(start = {}) {
  const p = { pushDay: "", pushCount: 0, ...start };
  return {
    p,
    async updateOne(q, u) {
      if (q.pushDay && q.pushDay.$ne !== undefined && p.pushDay === q.pushDay.$ne) return { modifiedCount: 0 };
      if (typeof q.pushDay === "string" && p.pushDay !== q.pushDay) return { modifiedCount: 0 };
      if (q.pushCount && !(p.pushCount < q.pushCount.$lt)) return { modifiedCount: 0 };
      if (u.$set) Object.assign(p, u.$set);
      if (u.$inc) p.pushCount += u.$inc.pushCount;
      return { modifiedCount: 1 };
    },
    async exists() { return true; },
  };
}

test("tope de avisos: máximo 2 al día; los genéricos solo si es el primero del día", async () => {
  const P = fakeProfile();
  assert.strictEqual(await reserve("u", "reminder", P, "2026-10-15"), true);
  assert.strictEqual(await reserve("u", "generic", P, "2026-10-15"), false, "genérico después de otro: no");
  assert.strictEqual(await reserve("u", "followup", P, "2026-10-15"), true, "el segundo importante: sí");
  assert.strictEqual(await reserve("u", "goal", P, "2026-10-15"), false, "el tercero: no");
  assert.strictEqual(await reserve("u", "caring", P, "2026-10-15"), true, "el cuidado tras una crisis nunca se bloquea");
  assert.strictEqual(await reserve("u", "generic", P, "2026-10-16"), true, "al otro día se reinicia");
});
