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

test("extremos: solo muy bajo, muy alto y por encima del máximo ofrecen llamar al 123", () => {
  assert.equal(HR.evaluate(35, { context: "rest" }).emergency, true);
  assert.equal(HR.evaluate(135, { context: "rest" }).emergency, true);
  assert.equal(HR.evaluate(200, { context: "active", age: 30 }).emergency, true);
  assert.ok(!HR.evaluate(110, { context: "rest" }).emergency);
  assert.ok(!HR.evaluate(72, { context: "rest" }).emergency);
});

test("día en Colombia (UTC-5) y racha del check-in", () => {
  assert.equal(HR.colombiaDay("2026-10-08T03:00:00Z"), "2026-10-07"); // 10 p. m. en Colombia
  assert.equal(HR.colombiaDay("2026-10-08T06:00:00Z"), "2026-10-08");
  assert.equal(HR.addDays("2026-10-01", -1), "2026-09-30");
  assert.deepEqual(HR.checkinStreak(["2026-10-05", "2026-10-06", "2026-10-07"], "2026-10-07"), { current: 3, best: 3, doneToday: true });
  // Hoy todavía no lo hace: la racha de ayer sigue viva
  assert.deepEqual(HR.checkinStreak(["2026-10-05", "2026-10-06"], "2026-10-07"), { current: 2, best: 2, doneToday: false });
  // Faltó un día: se reinicia, pero se recuerda la mejor
  assert.deepEqual(HR.checkinStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-06"], "2026-10-08"), { current: 0, best: 3, doneToday: false });
  assert.deepEqual(HR.checkinStreak(["2026-10-07", "2026-10-07", "basura"], "2026-10-07"), { current: 1, best: 1, doneToday: true });
  assert.deepEqual(HR.checkinStreak([], "2026-10-07"), { current: 0, best: 0, doneToday: false });
});

test("respiración con pulso en vivo: compara el comienzo con el final", () => {
  const t0 = Date.parse("2026-10-07T12:00:00Z");
  const series = (arr, step) => arr.map((bpm, i) => ({ bpm, ts: t0 + i * step }));
  const bajo = HR.breathSummary(series([98, 97, 95, 92, 90, 88, 85, 83, 82], 9000));
  assert.equal(bajo.level, "bajo");
  assert.equal(bajo.start, 97);   // mediana de las 3 primeras
  assert.equal(bajo.end, 83);     // mediana de las 3 últimas
  assert.match(bajo.message, /bajó 14 lpm/);
  assert.ok(bajo.watchText.length <= 40);
  assert.equal(HR.breathSummary(series([72, 73, 72, 71], 9000)).level, "estable");
  assert.equal(HR.breathSummary(series([80, 82, 85, 88], 9000)).level, "subio");
  // Muy poco tiempo midiendo: no inventa un resultado
  assert.equal(HR.breathSummary(series([80, 82], 5000)), null);
  assert.equal(HR.breathSummary([]), null);
  // Con la lectura de justo antes de empezar
  const pre = HR.breathSummary([{ bpm: 84, ts: t0 + 30000 }], { startBpm: 95, startedAt: t0 });
  assert.equal(pre.start, 95);
  assert.equal(pre.end, 84);
  // Una lectura absurda sola no mueve el resultado
  const conRuido = HR.breathSummary(series([90, 300, 89, 88, 20, 87, 86, 85], 9000));
  assert.equal(conRuido.start, 89);
  assert.equal(conRuido.end, 86);
});

test("check-in cuerpo y mente: junta el pulso o el cuerpo con la emoción", () => {
  const ok = HR.bodyMind(72, "tranquilo");
  assert.equal(ok.tone, "good");
  assert.match(ok.message, /saludable y sientes calma/);
  assert.equal(HR.bodyMind(72, "ansioso").action, "breathe");
  assert.equal(HR.bodyMind(72, "triste").action, "chat");
  const acelerados = HR.bodyMind(108, "ansioso");
  assert.equal(acelerados.tone, "warn");
  assert.equal(acelerados.action, "breathe");
  assert.match(HR.bodyMind(108, "feliz").message, /te sientes feliz, pero tu pulso está alto/i);
  const extremo = HR.bodyMind(130, "ansioso");
  assert.equal(extremo.emergency, true);
  assert.equal(extremo.tone, "alert");
  // Sin medir: usa cómo siente el cuerpo
  assert.equal(HR.bodyMind(null, "triste", { body: "cansado" }).action, "chat");
  assert.equal(HR.bodyMind(null, "enojado", { body: "tenso" }).tone, "warn");
  assert.equal(HR.bodyMind(null, "motivado", { body: "energia" }).tone, "good");
  assert.equal(HR.bodyMind(50, "motivado", { activityLevel: "alto" }).tone, "good"); // pulso de deportista
  // Nunca asume el género: "sientes calma", no "tranquilo/a"
  for (const e of Object.keys(HR.EMOTION_NOUN)) {
    for (const bpm of [55, 72, 108]) assert.doesNotMatch(HR.bodyMind(bpm, e).message, /tranquil[oa]\b|ansios[oa]\b|cansad[oa]\b/);
  }
});

test("tu corazón esta semana: promedio, tendencia, respiraciones, emociones y meta", () => {
  const DAY = 86400000, now = Date.parse("2026-10-07T23:00:00Z");
  const ck = (daysAgo, bpm, emotion) => ({ day: HR.colombiaDay(now - daysAgo * DAY), bpm, emotion, ts: new Date(now - daysAgo * DAY) });
  const checkins = [ck(13, 82, "ansioso"), ck(11, 79, "tranquilo"), ck(9, 80, "ansioso"), ck(8, 78, "tranquilo"),
    ck(6, 76, "tranquilo"), ck(5, 88, "ansioso"), ck(3, 72, "tranquilo"), ck(2, 74, "feliz"), ck(1, 70, "tranquilo"), ck(0, 86, "ansioso")];
  const breaths = [{ ts: new Date(now - 2 * DAY), startBpm: 95, endBpm: 84 }, { ts: new Date(now - DAY), startBpm: 90, endBpm: 83 }];
  const w = HR.weeklyHeart({ checkins, breaths, now });
  assert.equal(w.source, "checkin");
  assert.equal(w.restAvg, 78);
  assert.equal(w.prevAvg, 80);
  assert.equal(w.delta, -2);
  assert.equal(w.checkinDays, 6);
  assert.deepEqual(w.breath, { count: 2, avgDrop: 9, best: 11 });
  assert.equal(w.emotionLink.high.emotion, "ansioso");
  assert.equal(w.emotionLink.low.emotion, "tranquilo");
  assert.equal(w.goal.id, "emotion");
  assert.equal(w.points.length, 10);
  assert.match(w.summary, /bajó 2/);
  // Sin check-ins: usa el pulso más bajo de cada día que guarda el reloj
  const history = [6, 5, 4, 3, 2, 1, 0].map(d => ({ date: new Date(now - d * DAY).toDateString(), minHR: 60 + d }));
  const h = HR.weeklyHeart({ history, now });
  assert.equal(h.source, "diario");
  assert.equal(h.goal.id, "checkin");
  // Sin datos: nada que mostrar
  assert.equal(HR.weeklyHeart({ now }), null);
});

test("respiración: una lectura previa vieja o distinta no se usa como comienzo", () => {
  const t0 = Date.parse("2026-10-07T12:00:00Z");
  const r = [96, 95, 93, 91, 89, 87, 85, 84, 83].map((bpm, i) => ({ bpm, ts: t0 + (i + 1) * 9000 }));
  const s = HR.breathSummary(r, { startBpm: 76, startedAt: t0 }); // 76 era de antes de moverse
  assert.equal(s.start, 95);
  assert.equal(s.level, "bajo");
  const cerca = HR.breathSummary(r, { startBpm: 100, startedAt: t0 }); // se parece: sí se usa
  assert.equal(cerca.start, 100);
});
