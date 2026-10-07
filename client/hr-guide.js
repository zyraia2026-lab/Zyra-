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
     Devuelve { level, tone, title, message, tips, watchText, notify }.
     tone: "good" (felicitar) | "info" | "warn" | "alert". notify: vale la pena avisar solo. */
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
          watchText: "Pulso muy alto: para y descansa", notify: true,
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
        watchText: "Pulso muy bajo", notify: true,
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
      "Vuelve a medir en 5 minutos, quieto y sentado.",
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
      watchText: "Pulso muy alto: descansa", notify: true,
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

  return {
    MIN_AGE: MIN_AGE, MAX_AGE: MAX_AGE, ACTIVITY_LEVELS: ACTIVITY_LEVELS,
    ageFromBirthYear: ageFromBirthYear, maxHR: maxHR, exerciseZone: exerciseZone,
    evaluate: evaluate, summaryForAI: summaryForAI,
  };
});
