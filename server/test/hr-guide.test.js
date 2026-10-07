// Pruebas de la guía de pulso (client/hr-guide.js). Sin red ni base de datos: las
// corre CI en cada push.   npm run test:unit
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const HR = require(path.join(__dirname, "..", "..", "client", "hr-guide.js"));

const NOW = new Date("2026-10-07T12:00:00Z");

test("edad desde el año: respeta la edad mínima de los términos (13) y descarta valores raros", () => {
  assert.equal(HR.ageFromBirthYear(2000, NOW), 26);
  assert.equal(HR.ageFromBirthYear(2013, NOW), 13);
  assert.equal(HR.ageFromBirthYear(2014, NOW), null);   // 12 años: menor que la edad mínima
  assert.equal(HR.ageFromBirthYear(1900, NOW), null);   // 126 años
  assert.equal(HR.ageFromBirthYear("abc", NOW), null);
  assert.equal(HR.ageFromBirthYear(1999.5, NOW), null);
});

test("zona de ejercicio: 220 - edad, del 50 % al 85 %", () => {
  assert.deepEqual(HR.exerciseZone(40), { low: 90, high: 153, max: 180 }); // ejemplo de la fuente
  assert.equal(HR.exerciseZone(null), null);
});

test("en reposo: 60-100 es saludable y felicita", () => {
  for (const bpm of [60, 72, 100]) {
    const ev = HR.evaluate(bpm, { context: "rest", age: 25 });
    assert.equal(ev.level, "saludable", "bpm " + bpm);
    assert.equal(ev.tone, "good");
    assert.equal(ev.notify, false);
    assert.match(ev.message, /para tus 25 años/);
  }
});

test("en reposo alto: da consejos y avisa; muy alto menciona atención médica", () => {
  const alto = HR.evaluate(110, { context: "rest" });
  assert.equal(alto.level, "alto");
  assert.equal(alto.notify, true);
  assert.ok(alto.tips.some(t => /respira/i.test(t)));
  const muyAlto = HR.evaluate(135, { context: "rest" });
  assert.equal(muyAlto.level, "muy_alto");
  assert.ok(muyAlto.tips.some(t => /123/.test(t)));
});

test("sin saber si está en reposo: no asusta, aclara que moverse lo sube", () => {
  const ev = HR.evaluate(110, { context: "unknown" });
  assert.match(ev.message, /^Si estás en reposo/);
  assert.match(ev.message, /acabas de moverte/);
});

test("pulso bajo: normal en deportistas, consejo suave en el resto, alerta si es muy bajo", () => {
  assert.equal(HR.evaluate(48, { context: "rest", activityLevel: "alto" }).level, "bajo_atleta");
  assert.equal(HR.evaluate(48, { context: "rest", activityLevel: "alto" }).tone, "good");
  assert.equal(HR.evaluate(55, { context: "rest", activityLevel: "bajo" }).level, "bajo");
  const muyBajo = HR.evaluate(36, { context: "rest" });
  assert.equal(muyBajo.level, "muy_bajo");
  assert.equal(muyBajo.notify, true);
});

test("en movimiento: zona según la edad", () => {
  // 40 años -> zona 90-153, máximo 180
  assert.equal(HR.evaluate(80, { context: "active", age: 40 }).level, "ejercicio_suave");
  assert.equal(HR.evaluate(120, { context: "active", age: 40 }).level, "ejercicio_zona");
  assert.equal(HR.evaluate(120, { context: "active", age: 40 }).tone, "good");
  assert.equal(HR.evaluate(160, { context: "active", age: 40 }).level, "ejercicio_alto");
  assert.equal(HR.evaluate(185, { context: "active", age: 40 }).level, "ejercicio_maximo");
  // el mismo pulso puede ser normal a los 20 y alto a los 60
  assert.equal(HR.evaluate(160, { context: "active", age: 20 }).level, "ejercicio_zona");
  assert.equal(HR.evaluate(160, { context: "active", age: 60 }).level, "ejercicio_alto"); // 160 = su máximo exacto
  assert.equal(HR.evaluate(165, { context: "active", age: 60 }).level, "ejercicio_maximo");
  // sin edad no inventa una zona
  assert.equal(HR.evaluate(150, { context: "active" }).level, "ejercicio");
});

test("pulso alto con ansiedad registrada: lo conecta con la emoción", () => {
  const ev = HR.evaluate(108, { context: "rest", emotion: "ansioso" });
  assert.match(ev.tips[0], /ansiedad/);
});

test("lecturas imposibles se ignoran; mensajes del reloj cortos", () => {
  assert.equal(HR.evaluate(10, {}), null);
  assert.equal(HR.evaluate(300, {}), null);
  for (const [bpm, ctx] of [[72, "rest"], [110, "rest"], [135, "unknown"], [120, "active"], [190, "active"]]) {
    const ev = HR.evaluate(bpm, { context: ctx, age: 30 });
    assert.ok(ev.watchText.length <= 40, ev.watchText);
  }
});

test("resumen para la IA incluye la interpretación y los rangos", () => {
  const s = HR.summaryForAI(72, { context: "rest", age: 30, activityLevel: "medio" });
  assert.match(s, /72 lpm en reposo: saludable/);
  assert.match(s, /edad 30 años/);
  assert.match(s, /zona de ejercicio 95–162 lpm/);
});
