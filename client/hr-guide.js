/* Zyra — guía de pulso.
   Interpreta una lectura de pulso según la edad, cuánto ejercicio hace la persona y si
   está en reposo o moviéndose, y devuelve un mensaje con consejos. Es orientativo:
   no diagnostica nada.

   Fuentes de los rangos:
   - Reposo normal en adultos: 60–100 lpm; en atletas a veces en los 40; buscar ayuda
     si está por debajo de 35–40 o por encima de 100 con palpitaciones, falta de aire,
     dolor de pecho o mareo. Cleveland Clinic, "Heart Rate":
     https://my.clevelandclinic.org/health/diagnostics/heart-rate
   - Adolescentes (12–18 años): 60–100 lpm; un pulso bajo puede ser normal si son
     activos; la ansiedad, el estrés, el ejercicio o la deshidratación lo suben.
     Cleveland Clinic, "Pediatric Vital Signs":
     https://health.clevelandclinic.org/pediatric-vital-signs
   - Pulso máximo estimado = 220 − edad; zona de ejercicio = 50–85 % de ese máximo.
     University of Iowa Health Care, "Target heart rate for exercise":
     https://uihc.org/health-topics/target-heart-rate-exercise

   Zyra es para mayores de 13 años (Términos, punto 3), y desde esa edad el rango en
   reposo es el mismo; por eso la edad cambia sobre todo la zona de ejercicio.

   Lo usan el navegador (window.ZyraHR) y el servidor (require). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ZyraHR = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_AGE = 13;
  var MAX_AGE = 110;
  var REST_LOW = 60;
  var REST_HIGH = 100;
  var ACTIVITY_LEVELS = ["bajo", "medio", "alto"];
  // Emociones que suben el pulso por sí solas (Cleveland Clinic: ansiedad y estrés)
  var AROUSAL_EMOTIONS = { ansioso: "ansiedad", enojado: "enojo" };

  // Solo se guarda el año (no la fecha exacta): la edad puede quedar un año corrida
  function ageFromBirthYear(birthYear, now) {
    var y = Number(birthYear);
    if (!isFinite(y) || Math.floor(y) !== y) return null;
    var age = (now || new Date()).getFullYear() - y;
    return age >= MIN_AGE && age <= MAX_AGE ? age : null;
  }

  function maxHR(age) {
    return age ? 220 - age : null;
  }

  function exerciseZone(age) {
    var max = maxHR(age);
    return max ? { low: Math.round(max * 0.5), high: Math.round(max * 0.85), max: max } : null;
  }

  var MEDICAL_NOW = "Si sientes dolor en el pecho, falta de aire, mareo o palpitaciones, busca atención médica ya (en Colombia, línea 123).";

  /* bpm: lectura en latidos por minuto.
     opts.age: edad en años (o null) · opts.activityLevel: "bajo" | "medio" | "alto" | null
     opts.context: "rest" (en reposo) | "active" (moviéndose) | "unknown"
     opts.emotion: emoción registrada hoy (por ejemplo "ansioso")
     Devuelve { level, tone, title, message, tips, watchText, notify, emergency }.
     tone: "good" (felicitar) | "info" | "warn" | "alert". notify: vale la pena avisar solo.
     emergency: valores extremos, en los que se ofrece llamar al 123. */
  function evaluate(bpm, opts) {
    opts = opts || {};
    bpm = Math.round(Number(bpm));
    var age = opts.age || null;
    var fit = opts.activityLevel === "alto";
    var context = opts.context === "rest" || opts.context === "active" ? opts.context : "unknown";
    var forAge = age ? " para tus " + age + " años" : "";
    var emotionWord = AROUSAL_EMOTIONS[opts.emotion] || null;

    if (!isFinite(bpm) || bpm < 25 || bpm > 250) return null;

    // ── En movimiento: se compara con la zona de ejercicio según la edad ──
    if (context === "active") {
      var zone = exerciseZone(age);
      if (!zone) {
        return {
          level: "ejercicio", tone: "info", title: "En movimiento",
          message: "Te estás moviendo, así que es normal que el pulso suba (" + bpm + " lpm). Si me dices tu edad, te digo cuál es tu zona de ejercicio.",
          tips: [], watchText: "Pulso " + bpm + " en movimiento", notify: false,
        };
      }
      if (bpm > zone.max) {
        return {
          level: "ejercicio_maximo", tone: "alert", title: "Por encima de tu máximo",
          message: "Tu pulso (" + bpm + " lpm) está por encima de tu máximo estimado (" + zone.max + " lpm" + forAge + ").",
          tips: ["Para y camina despacio hasta que baje.", "Respira lento: inhala en 4 tiempos y exhala en 6.", MEDICAL_NOW],
          watchText: "Pulso muy alto: para y descansa", notify: true, emergency: true,
        };
      }
      if (bpm > zone.high) {
        return {
          level: "ejercicio_alto", tone: "warn", title: "Por encima de tu zona",
          message: "Vas un poco por encima de tu zona de ejercicio (" + zone.low + "–" + zone.high + " lpm" + forAge + "). Baja un poco el ritmo.",
          tips: ["Reduce la intensidad hasta volver a tu zona.", "Toma agua."],
          watchText: "Baja un poco el ritmo", notify: true,
        };
      }
      if (bpm >= zone.low) {
        return {
          level: "ejercicio_zona", tone: "good", title: "En tu zona de ejercicio",
          message: "¡Muy bien! Estás en tu zona de ejercicio (" + zone.low + "–" + zone.high + " lpm" + forAge + "). Así es como el corazón se fortalece.",
          tips: [], watchText: "Zona de ejercicio: muy bien", notify: false,
        };
      }
      return {
        level: "ejercicio_suave", tone: "info", title: "Actividad suave",
        message: "Actividad suave (" + bpm + " lpm). Para que cuente como ejercicio, tu zona va de " + zone.low + " a " + zone.high + " lpm" + forAge + ".",
        tips: [], watchText: "Actividad suave", notify: false,
      };
    }

    // ── En reposo o sin saber: rango de reposo 60–100 ──
    var ifResting = context === "unknown" ? "Si estás en reposo, " : "";
    var ifMoved = context === "unknown" ? " Si acabas de moverte o subir escaleras, es normal que esté así." : "";

    if (bpm < 40) {
      return {
        level: "muy_bajo", tone: "alert", title: "Muy bajo",
        message: "Tu pulso está muy bajo (" + bpm + " lpm).",
        tips: [
          "Si sientes mareo, desmayo, falta de aire o dolor en el pecho, busca atención médica ya (en Colombia, línea 123).",
          fit ? "En deportistas puede ser normal, pero conviene comentarlo con tu médico." : "Comenta esta lectura con un médico, sobre todo si se repite.",
        ],
        watchText: "Pulso muy bajo", notify: true, emergency: true,
      };
    }
    if (bpm < REST_LOW) {
      return fit ? {
        level: "bajo_atleta", tone: "good", title: "Bajo, de deportista",
        message: "Tu pulso en reposo es bajo (" + bpm + " lpm), algo típico de quien entrena. ¡Buena señal de buen estado físico!",
        tips: [], watchText: "Pulso " + bpm + ": buen estado fisico", notify: false,
      } : {
        level: "bajo", tone: "info", title: "Un poco bajo",
        message: "Tu pulso está un poco bajo (" + bpm + " lpm). Si te sientes bien, normalmente no es un problema.",
        tips: ["Si tienes mareo o mucho cansancio, coméntalo con un médico."],
        watchText: "Pulso " + bpm + ": un poco bajo", notify: false,
      };
    }
    if (bpm <= REST_HIGH) {
      return {
        level: "saludable", tone: "good", title: "Saludable",
        message: "¡Muy bien! Tu pulso (" + bpm + " lpm) está en el rango saludable en reposo (60–100 lpm" + forAge + ").",
        tips: ["Para mantenerlo: muévete un rato cada día, duerme bien y toma agua."],
        watchText: "Pulso " + bpm + ": muy bien", notify: false,
      };
    }

    var tipsHigh = [
      "Siéntate y respira lento 2 minutos: inhala en 4 tiempos y exhala en 6.",
      "Toma un vaso de agua.",
      "Evita café o bebidas energéticas por hoy.",
      "Vuelve a medir en 5 minutos, en reposo.",
    ];
    if (emotionWord) tipsHigh.unshift("Hoy registraste " + emotionWord + ", y eso sube el pulso. ¿Respiramos juntos un momento?");

    if (bpm <= 120) {
      return {
        level: "alto", tone: "warn", title: "Alto",
        message: (ifResting ? ifResting + "tu pulso está alto" : "Tu pulso en reposo está alto") + " (" + bpm + " lpm; lo normal es 60–100)." + ifMoved,
        tips: tipsHigh, watchText: "Pulso " + bpm + ": respira lento", notify: true,
      };
    }
    return {
      level: "muy_alto", tone: "alert", title: "Muy alto",
      message: (ifResting ? ifResting + "tu pulso está muy alto" : "Tu pulso en reposo está muy alto") + " (" + bpm + " lpm)." + ifMoved,
      tips: ["Detente, siéntate y respira despacio.", "Vuelve a medir en 5 minutos.", MEDICAL_NOW],
      watchText: "Pulso muy alto: descansa", notify: true, emergency: true,
    };
  }

  // Una línea para la IA: la lectura ya interpretada y los rangos de la persona
  function summaryForAI(bpm, opts) {
    opts = opts || {};
    var ev = evaluate(bpm, opts);
    if (!ev) return "";
    var where = opts.context === "active" ? "en movimiento" : opts.context === "rest" ? "en reposo" : "sin saber si estaba en reposo";
    var parts = ["pulso " + Math.round(bpm) + " lpm " + where + ": " + ev.title.toLowerCase()];
    var zone = exerciseZone(opts.age);
    if (opts.age) parts.push("edad " + opts.age + " años");
    if (zone) parts.push("zona de ejercicio " + zone.low + "–" + zone.high + " lpm (máximo estimado " + zone.max + ")");
    if (opts.activityLevel) parts.push("hace ejercicio: " + ({ bajo: "poco", medio: "algunas veces por semana", alto: "casi a diario" }[opts.activityLevel] || opts.activityLevel));
    return parts.join(" · ");
  }

  // ── Días en hora de Colombia (UTC−5), igual que las rachas y misiones del servidor ──
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dayKeyFromNumber(num) {
    var d = new Date(num * 86400000);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  // "AAAA-MM-DD" del día en Colombia para una fecha (por defecto, ahora)
  function colombiaDay(date) {
    var t = date != null ? new Date(date).getTime() : Date.now();
    return dayKeyFromNumber(Math.floor((t - 5 * 3600000) / 86400000));
  }
  function dayNumber(key) {
    if (!DAY_RE.test(String(key))) return null;
    var p = String(key).split("-");
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function addDays(key, n) {
    var num = dayNumber(key);
    return num == null ? null : dayKeyFromNumber(num + n);
  }

  /* Racha del check-in cuerpo y mente: días seguidos hasta hoy. Si hoy todavía no lo
     hizo, cuenta hasta ayer (la racha sigue viva hasta medianoche).
     days: lista de "AAAA-MM-DD" · today: "AAAA-MM-DD" (por defecto, hoy en Colombia) */
  function checkinStreak(days, today) {
    var set = {}, nums = [];
    (days || []).forEach(function (k) {
      var n = dayNumber(k);
      if (n != null && !set[n]) { set[n] = true; nums.push(n); }
    });
    var t = dayNumber(today || colombiaDay());
    if (!nums.length || t == null) return { current: 0, best: 0, doneToday: false };
    nums.sort(function (a, b) { return a - b; });
    var best = 1, run = 1;
    for (var i = 1; i < nums.length; i++) {
      run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    var doneToday = !!set[t];
    var current = 0;
    for (var d = doneToday ? t : t - 1; set[d]; d--) current++;
    return { current: current, best: best, doneToday: doneToday };
  }

  function median(values) {
    var v = values.filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
  }
  function validBpm(x) { return isFinite(x) && x >= 30 && x <= 220; }

  /* Respiración con el pulso en vivo: compara el pulso del comienzo con el del final.
     readings: [{ bpm, ts }] en orden de llegada.
     opts.startBpm: lectura de justo antes de empezar (si la hay) · opts.startedAt: cuándo empezó.
     Usa la mediana de las primeras y de las últimas lecturas, para que una lectura suelta
     no cambie el resultado. Devuelve null si no alcanzó a leer lo suficiente. */
  function breathSummary(readings, opts) {
    opts = opts || {};
    var r = (readings || []).filter(function (x) { return x && validBpm(x.bpm) && isFinite(x.ts); });
    var pre = validBpm(opts.startBpm) ? Math.round(opts.startBpm) : null;
    if (!r.length || (!pre && r.length < 2)) return null;
    var half = Math.max(1, Math.min(3, Math.floor(r.length / 2)));
    var lastPart = r.slice(r.length - half);
    var firstMed = median(r.slice(0, half).map(function (x) { return x.bpm; }));
    // La lectura de antes solo vale si se parece a las primeras en vivo: si no, ya no
    // describe cómo estaba la persona al empezar (por ejemplo, se movió entre tanto)
    var usePre = pre && (r.length < 2 || Math.abs(firstMed - pre) <= 10);
    if (!usePre && r.length < 2) return null;
    // El final tiene que estar al menos 20 s después del comienzo
    var t0 = usePre && isFinite(opts.startedAt) ? opts.startedAt : r[0].ts;
    if (lastPart[lastPart.length - 1].ts - t0 < 20000) return null;
    var start = usePre ? pre : firstMed;
    var end = median(lastPart.map(function (x) { return x.bpm; }));
    var delta = end - start;
    var base = { start: start, end: end, delta: delta, readings: r.length };
    function out(o) { for (var k in base) o[k] = base[k]; return o; }
    if (delta <= -3) {
      return out({
        level: "bajo", tone: "good", title: "Tu cuerpo se calmó",
        message: "Empezaste en " + start + " lpm y terminaste en " + end + " lpm: tu pulso bajó " + (-delta) + " lpm mientras respirabas.",
        watchText: "Pulso bajo " + (-delta) + " lpm: muy bien",
      });
    }
    if (delta <= 2) {
      return out({
        level: "estable", tone: "good", title: "Pulso estable",
        message: "Tu pulso se mantuvo estable (" + end + " lpm). Respirar así también entrena la calma.",
        watchText: "Pulso estable: muy bien",
      });
    }
    return out({
      level: "subio", tone: "info", title: "Subió un poco",
      message: "Tu pulso subió " + delta + " lpm. A veces pasa al principio, mientras el cuerpo se acomoda. Prueba otra ronda con «Calma 4-6», soltando el aire más despacio.",
      watchText: "Prueba otra ronda mas lenta",
    });
  }

  // ── Check-in cuerpo y mente ──
  var POSITIVE_EMOTIONS = { feliz: 1, tranquilo: 1, esperanzado: 1, motivado: 1 };
  var LOW_EMOTIONS = { triste: 1, agotado: 1, nostalgico: 1, confundido: 1 };
  // Sustantivos para no asumir el género de la persona ("sientes calma", no "tranquilo/a")
  var EMOTION_NOUN = {
    feliz: "felicidad", tranquilo: "calma", ansioso: "ansiedad", triste: "tristeza", enojado: "enojo",
    confundido: "confusión", esperanzado: "esperanza", agotado: "agotamiento", motivado: "motivación", nostalgico: "nostalgia",
  };
  // Cómo siente el cuerpo quien no tiene con qué medirse el pulso
  var BODY_FEELINGS = ["relajado", "normal", "energia", "cansado", "tenso"];
  function feelPhrase(emotion) {
    if (emotion === "feliz") return "te sientes feliz";
    return EMOTION_NOUN[emotion] ? "sientes " + EMOTION_NOUN[emotion] : "te sientes así";
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Junta el cuerpo (pulso en reposo o, si no midió, cómo lo siente) con la emoción.
     bpm: lectura en reposo o null · emotion: clave de emoción
     opts: { age, activityLevel, body } (body: uno de BODY_FEELINGS, cuando no hay pulso)
     Devuelve { tone, title, message, action, emergency, ev }.
     action: "breathe" (respirar) | "chat" (hablar con Zyra) | null. */
  function bodyMind(bpm, emotion, opts) {
    opts = opts || {};
    var ev = bpm ? evaluate(bpm, { age: opts.age, activityLevel: opts.activityLevel, context: "rest", emotion: emotion }) : null;
    var body = null;
    if (ev) body = ev.emergency ? "alerta" : ev.level === "alto" ? "acelerado" : "bien";
    else body = { relajado: "bien", normal: "bien", energia: "bien", cansado: "cansado", tenso: "acelerado" }[opts.body] || null;
    var mind = POSITIVE_EMOTIONS[emotion] ? "bien" : AROUSAL_EMOTIONS[emotion] ? "acelerada" : LOW_EMOTIONS[emotion] ? "baja" : null;
    var feel = feelPhrase(emotion);
    var n = ev ? Math.round(bpm) : null;
    function res(tone, title, message, action) {
      return { tone: tone, title: title, message: message, action: action || null, emergency: false, ev: ev };
    }

    if (body === "alerta") {
      return { tone: "alert", title: "Tu pulso necesita atención", message: ev.message, action: "breathe", emergency: true, ev: ev };
    }
    if (body === "bien") {
      var low = ev && ev.level === "bajo";
      var pulseOk = !ev ? "Tu cuerpo se siente bien"
        : ev.level === "bajo_atleta" ? "Tu pulso (" + n + " lpm) es de deportista"
        : low ? "Tu pulso está un poco bajo (" + n + " lpm)"
        : "Tu pulso (" + n + " lpm) está saludable";
      if (mind === "acelerada") return res("info", "Tu mente va más rápido que tu cuerpo",
        cap(feel) + ", pero " + (ev ? "tu pulso está en calma (" + n + " lpm)" : "tu cuerpo está en calma") + ". Aprovecha esa calma: un minuto de respiración lenta ayuda a que la mente la alcance.", "breathe");
      if (mind === "baja") return res("info", "Tu cuerpo está bien; tu mente carga algo",
        pulseOk + ", pero " + feel + ". ¿Me cuentas qué pasa?", "chat");
      if (!mind) return res("good", ev ? ev.title : "Todo en orden", pulseOk + ".");
      if (low) return res("good", "Todo en orden",
        cap(feel) + " y tu pulso está un poco bajo (" + n + " lpm); si te sientes bien, no suele ser un problema.");
      return res("good", "Cuerpo y mente en equilibrio", pulseOk + " y " + feel + ". ¡Cuerpo y mente en equilibrio!");
    }
    if (body === "acelerado") {
      var fast = ev ? "tu pulso está alto (" + n + " lpm)" : "notas tu cuerpo tenso";
      if (mind === "acelerada") return res("warn", "Cuerpo y mente acelerados",
        cap(feel) + " y tu cuerpo también lo muestra" + (ev ? " (pulso de " + n + " lpm)" : "") + ". Respirar lento un minuto ayuda a " + (ev ? "bajar el pulso" : "soltar esa tensión") + ". ¿Lo hacemos juntos?", "breathe");
      if (mind === "baja") return res("warn", "Tu cuerpo siente lo que cargas",
        cap(feel) + " y " + fast + ". Respira conmigo un minuto y después, si quieres, me cuentas.", "breathe");
      return res("info", "Tu cuerpo va más rápido que tu mente", ev
        ? cap(feel) + ", pero " + fast + ". A veces es café, calor o que te moviste hace poco: toma un vaso de agua y vuelve a medir en 5 minutos, en reposo."
        : cap(feel) + ", pero " + fast + ". Estira el cuello y los hombros un minuto y suelta el aire despacio.", "breathe");
    }
    if (body === "cansado") {
      if (mind === "acelerada") return res("info", "Cansancio y tensión", "Cansancio y " + (EMOTION_NOUN[emotion] || "tensión") + " juntos pesan. Una pausa de respiración ahora y acostarte temprano hoy te pueden ayudar.", "breathe");
      if (mind === "baja") return res("info", "Cuerpo y mente piden descanso", "Hoy tu cuerpo y tu mente están cansados. Sé amable contigo: descansa y, si quieres, cuéntame cómo te sientes.", "chat");
      return res("info", "Mente bien, cuerpo cansado", cap(feel) + ", pero tu cuerpo pide descanso. Toma agua y date una pausa corta cuando puedas.");
    }
    // Sin dato del cuerpo: solo la emoción
    if (mind === "acelerada") return res("info", "Un momento para ti", cap(feel) + ". Un minuto de respiración lenta ayuda a bajarle el volumen.", "breathe");
    if (mind === "baja") return res("info", "Aquí estoy", cap(feel) + ". ¿Me cuentas qué pasa?", "chat");
    return res("good", "¡Qué bueno!", "¡Qué bueno que " + feel + "!");
  }

  /* "Tu corazón esta semana": pulso en reposo y su tendencia, días de check-in,
     respiraciones con reloj, pulso según la emoción y una meta para la semana.
     data.checkins: [{ day, bpm, emotion, ts }] · data.history: [{ date, minHR }]
     data.breaths: [{ ts, startBpm, endBpm }] · data.now: fin de la semana (por defecto, ahora)
     Devuelve null si no hay nada que mostrar. */
  function weeklyHeart(data) {
    data = data || {};
    var DAY = 86400000, WEEK = 7 * DAY;
    var now = data.now != null ? new Date(data.now).getTime() : Date.now();
    function t(x) { return new Date(x).getTime(); }
    function within(ms, from, to) { return isFinite(ms) && ms > from && ms <= to; }
    function avg(arr) { return arr.length ? Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) : null; }

    var checkins = (data.checkins || []).filter(function (c) { return c && c.ts && isFinite(t(c.ts)); });
    var ckBpm = checkins.filter(function (c) { return validBpm(c.bpm); });
    // El historial diario guarda la fecha como texto ("Wed Oct 07 2026"): se toma el mediodía de ese día
    var hist = (data.history || []).filter(function (d) { return d && validBpm(d.minHR) && d.date && isFinite(t(d.date)); });
    function hTime(d) { return t(d.date) + 12 * 3600000; }

    // Fuente del pulso en reposo: los check-ins (medidos quieto y sentado) o, si no hay,
    // el pulso más bajo de cada día
    var source = null, series = [];
    if (ckBpm.some(function (c) { return within(t(c.ts), now - WEEK, now); })) {
      source = "checkin";
      series = ckBpm.map(function (c) { return { ts: t(c.ts), bpm: Math.round(c.bpm) }; });
    } else if (hist.some(function (d) { return within(hTime(d), now - WEEK, now); })) {
      source = "diario";
      series = hist.map(function (d) { return { ts: hTime(d), bpm: Math.round(d.minHR) }; });
    }
    var thisWeek = series.filter(function (p) { return within(p.ts, now - WEEK, now); }).map(function (p) { return p.bpm; });
    var prevWeek = series.filter(function (p) { return within(p.ts, now - 2 * WEEK, now - WEEK); }).map(function (p) { return p.bpm; });
    var restAvg = avg(thisWeek);
    var prevAvg = prevWeek.length ? avg(prevWeek) : null;
    var delta = restAvg != null && prevAvg != null && thisWeek.length >= 2 && prevWeek.length >= 2 ? restAvg - prevAvg : null;
    // Un punto por día (el último), de las últimas 4 semanas, para la gráfica
    var byDay = {};
    series.forEach(function (p) {
      if (!within(p.ts, now - 28 * DAY, now)) return;
      var k = colombiaDay(p.ts);
      if (!byDay[k] || byDay[k].ts < p.ts) byDay[k] = p;
    });
    var points = Object.keys(byDay).sort().map(function (k) { return { day: k, bpm: byDay[k].bpm }; });

    var ckDays = {};
    checkins.forEach(function (c) { if (within(t(c.ts), now - WEEK, now)) ckDays[c.day || colombiaDay(c.ts)] = true; });
    var checkinDays = Object.keys(ckDays).length;

    var drops = (data.breaths || []).filter(function (b) {
      return b && validBpm(b.startBpm) && validBpm(b.endBpm) && within(t(b.ts), now - WEEK, now);
    }).map(function (b) { return Math.round(b.startBpm - b.endBpm); });
    var breath = drops.length ? { count: drops.length, avgDrop: avg(drops), best: Math.max.apply(null, drops) } : null;

    // Pulso según la emoción del check-in (últimos 30 días; mínimo 2 lecturas por emoción)
    var byEmo = {};
    ckBpm.forEach(function (c) {
      if (!c.emotion || !EMOTION_NOUN[c.emotion] || !within(t(c.ts), now - 30 * DAY, now)) return;
      (byEmo[c.emotion] = byEmo[c.emotion] || []).push(c.bpm);
    });
    var groups = Object.keys(byEmo).filter(function (e) { return byEmo[e].length >= 2; })
      .map(function (e) { return { emotion: e, avg: avg(byEmo[e]), n: byEmo[e].length }; })
      .sort(function (a, b) { return b.avg - a.avg; });
    var emotionLink = groups.length >= 2 && groups[0].avg - groups[groups.length - 1].avg >= 5
      ? { high: groups[0], low: groups[groups.length - 1] } : null;

    if (restAvg == null && !checkinDays && !breath) return null;

    var goal;
    if (checkinDays < 4) goal = { id: "checkin", text: "Haz tu check-in cuerpo y mente al menos 5 días esta semana." };
    else if (restAvg != null && restAvg > 90) goal = { id: "breathe", text: "Haz dos respiraciones «Calma 4-6» al día: es de lo que más ayuda a bajar el pulso en reposo." };
    else if (emotionLink && AROUSAL_EMOTIONS[emotionLink.high.emotion]) goal = { id: "emotion", text: "Cuando sientas " + EMOTION_NOUN[emotionLink.high.emotion] + ", respira un minuto con el reloj puesto y mira cómo baja tu pulso." };
    else if (delta != null && delta <= -2) goal = { id: "keep", text: "Sigue así: tu pulso en reposo va bajando. Mantén lo que hiciste esta semana." };
    else goal = { id: "walk", text: "Camina 20 minutos al menos 4 días: es de lo que más ayuda al corazón." };

    var parts = [];
    if (restAvg != null) {
      parts.push((source === "checkin" ? "pulso en reposo promedio (check-in) " : "pulso más bajo del día, en promedio, ") + restAvg + " lpm"
        + (delta == null ? "" : " (semana anterior " + prevAvg + " lpm: " + (delta < 0 ? "bajó " + (-delta) : delta > 0 ? "subió " + delta : "igual") + ")"));
    }
    parts.push("check-in cuerpo y mente " + checkinDays + " de 7 días");
    if (breath) parts.push("respiraciones con reloj: " + breath.count + ", el pulso bajó en promedio " + breath.avgDrop + " lpm");
    if (emotionLink) parts.push("con " + EMOTION_NOUN[emotionLink.high.emotion] + " el pulso promedió " + emotionLink.high.avg + " lpm; con " + EMOTION_NOUN[emotionLink.low.emotion] + ", " + emotionLink.low.avg + " lpm");

    return {
      restAvg: restAvg, prevAvg: prevAvg, delta: delta, source: source, points: points,
      checkinDays: checkinDays, breath: breath, emotionLink: emotionLink, goal: goal, summary: parts.join(" · "),
    };
  }

  return {
    MIN_AGE: MIN_AGE, MAX_AGE: MAX_AGE, ACTIVITY_LEVELS: ACTIVITY_LEVELS,
    EMOTION_NOUN: EMOTION_NOUN, BODY_FEELINGS: BODY_FEELINGS,
    ageFromBirthYear: ageFromBirthYear, maxHR: maxHR, exerciseZone: exerciseZone,
    evaluate: evaluate, summaryForAI: summaryForAI,
    colombiaDay: colombiaDay, addDays: addDays, checkinStreak: checkinStreak,
    breathSummary: breathSummary, bodyMind: bodyMind, weeklyHeart: weeklyHeart,
  };
});
