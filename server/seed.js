/**
 * seed.js — Datos demo para presentación de Zyra
 * Uso: node seed.js
 * Crea un usuario demo con historial completo (emociones, metas, diario, conversaciones)
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mongoose  = require("mongoose");
const bcrypt    = require("bcryptjs");

const User         = require("./models/User");
const Profile      = require("./models/Profile");
const Goal         = require("./models/Goal");
const Journal      = require("./models/Journal");
const Conversation = require("./models/Conversation");
const Memory       = require("./models/Memory");

const DEMO_EMAIL    = "demo@zyra.app";
const DEMO_PASSWORD = "Demo1234!";
const DEMO_NAME     = "María Demo";

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log("✅ Conectado a MongoDB");

  // Limpiar demo anterior
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    await Promise.all([
      Profile.deleteOne({ user: existing._id }),
      Goal.deleteMany({ user: existing._id }),
      Journal.deleteMany({ user: existing._id }),
      Conversation.deleteMany({ user: existing._id }),
      Memory.deleteMany({ user: existing._id }),
      User.deleteOne({ _id: existing._id }),
    ]);
    console.log("🗑️  Demo anterior eliminado");
  }

  // Crear usuario demo
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await User.create({
    name:     DEMO_NAME,
    email:    DEMO_EMAIL,
    password: hash,
    plan:     "premium",
    planExpiresAt: new Date(Date.now() + 365 * 86400000),
    planActivatedAt: new Date(),
    _prehashed: true,
  });
  console.log(`👤 Usuario: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // ── Historial emocional (últimos 45 días) ──
  const EMOTIONS = ["feliz","tranquilo","ansioso","triste","motivado","esperanzado","agotado","confundido"];
  const NOTES = [
    "Tuve una buena reunión en el trabajo",
    "Dormí muy mal esta noche",
    "Me siento rara, no sé por qué",
    "Finalmente terminé el proyecto",
    "Hablé con mamá, me sentí mejor",
    "El examen salió bien",
    "Extraño mucho a mis amigos",
    "Hice ejercicio por primera vez en semanas",
    "No pude concentrarme en nada",
    "Me di un momento para mí hoy",
  ];
  const weightedEmotions = [
    "feliz","feliz","tranquilo","tranquilo","tranquilo",
    "motivado","esperanzado","ansioso","ansioso","triste","agotado",
  ];
  const emotionHistory = [];
  for (let i = 44; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    date.setHours(Math.floor(Math.random() * 4) + 19, Math.floor(Math.random() * 60), 0, 0);
    const emotion = weightedEmotions[Math.floor(Math.random() * weightedEmotions.length)];
    emotionHistory.push({
      emotion,
      intensity: Math.floor(Math.random() * 4) + 3,
      note: Math.random() > 0.5 ? NOTES[Math.floor(Math.random() * NOTES.length)] : "",
      date,
    });
  }

  // ── Crear perfil ──
  await Profile.create({
    user:             user._id,
    bio:              "Estudiante de psicología. Uso Zyra para procesar mis días.",
    currentEmotion:   "tranquilo",
    emotionHistory,
    streakDays:       12,
    sessionsCount:    38,
    lastActiveDate:   new Date(),
    coins:            340,
    achievements:     ["first_login","streak_3","streak_7","coins_50","coins_200","journal_10"],
    unlockedItems:    ["badge_fire","badge_star","theme_ocean"],
    equippedBadge:    "badge_star",
    reminderEnabled:  true,
    reminderHour:     20,
    reminderMinute:   0,
    onboardingDone:   true,
  });

  // ── Metas ──
  const goals = [
    { title: "Meditar 10 minutos al día", completed: true,  note: "Completé el reto de 30 días ✓" },
    { title: "Leer 1 libro al mes",       completed: true,  note: "Leí 'Atomic Habits' en enero" },
    { title: "Mejorar mis hábitos de sueño", completed: false, dueDate: new Date(Date.now() + 14 * 86400000) },
    { title: "Hablar con mamá más seguido",  completed: false },
    { title: "Terminar tesis de grado",      completed: false, dueDate: new Date(Date.now() + 60 * 86400000) },
    { title: "Ir al gimnasio 3 veces por semana", completed: false },
  ];
  for (const g of goals) {
    await Goal.create({ user: user._id, ...g, createdAt: new Date(Date.now() - Math.random() * 30 * 86400000) });
  }

  // ── Entradas de diario ──
  const journalEntries = [
    { title: "Un día difícil", content: "Hoy fue uno de esos días en que todo se siente pesado. Llegué a casa agotada, no quería hablar con nadie. Pero me puse a escribir y me di cuenta de que en realidad lo que siento es miedo a no llegar al examen final. Mañana estudiaré con más calma." },
    { title: "La conversación con Andrés", content: "Finalmente hablé con Andrés sobre cómo me sentía cuando cancela los planes. Se lo dije directamente y él lo entendió. Me sentí orgullosa de haberlo hecho en lugar de quedarme callada como siempre. Las conversaciones difíciles a veces son las más necesarias." },
    { title: "Gratitud de hoy", content: "Hoy quiero anotar tres cosas buenas: el café de la mañana que tomé sola en el balcón, la llamada con mamá que duró una hora, y que terminé el capítulo 3 de la tesis. No fue un día perfecto pero fue un día lleno." },
    { title: "¿Qué quiero de aquí a un año?", content: "Me puse a pensar en dónde quiero estar en un año. Graduada, con trabajo en algo que me guste, con más orden en mi cabeza. No sé si todo eso se puede, pero escribirlo hace que se sienta más real. Empiezo por la tesis." },
    { title: "La ansiedad del domingo", content: "Los domingos por la noche siempre me pasan lo mismo. Se me viene el lunes encima y empiezo a listar todo lo que no hice. Hoy respiré, puse música, y me dije que mañana es otro día. A veces eso es todo lo que se puede hacer." },
    { title: "Pequeño logro", content: "Fui al gimnasio. Suena a nada, pero llevo tres semanas diciéndome que voy y no voy. Hoy fui. Media hora. Me sentí bien. Es raro cómo cosas pequeñas pueden cambiar un poco el día." },
    { title: "Semana tranquila", content: "Esta semana estuvo bien. No pasó nada extraordinario pero tampoco nada malo. Estudié, dormí a horas razonables, comí bien. A veces el bienestar es solo eso: días normales sin drama." },
    { title: "Hablé con Zyra hoy", content: "Tenía un nudo en el estómago que no podía explicar. Hablé con Zyra y me preguntó cosas que yo no me había preguntado. Terminé entendiendo que tenía miedo de decepcionar a mis papás con la tesis. Eso me ayudó a soltar un poco." },
    { title: "El cumpleaños de Valeria", content: "Fue lindo ver a todo el grupo junto. Me reí mucho. Me di cuenta de que llevaba semanas sin reírme así. Necesito hacer esto más seguido — salir, ver gente, no quedarme encerrada estudiando todo el tiempo." },
    { title: "Hoy no tengo palabras", content: "No sé qué escribir. Estoy bien, creo. Solo quería abrir el diario y poner algo aunque sea esto. A veces no hay historia, solo estoy aquí." },
  ];
  for (let i = 0; i < journalEntries.length; i++) {
    const daysAgo = (journalEntries.length - i) * 4 + Math.floor(Math.random() * 3);
    await Journal.create({
      user: user._id,
      ...journalEntries[i],
      createdAt: new Date(Date.now() - daysAgo * 86400000),
    });
  }

  // ── Conversaciones con Zyra ──
  const conversations = [
    {
      title: "Me siento perdida con la tesis",
      messages: [
        { role: "user", content: "Zyra, no sé por dónde empezar con la tesis. Ya son las 11pm y llevo 3 horas mirando la pantalla en blanco." },
        { role: "assistant", content: "Eso es agotador. Tres horas frente a una pantalla en blanco no es procrastinación — es bloqueo, y son cosas distintas. ¿Qué parte de la tesis te tiene trabada hoy específicamente?" },
        { role: "user", content: "El marco teórico. No sé si lo que escribí está bien o si todo es basura." },
        { role: "assistant", content: "Oye, que lo puedas cuestionar ya es buena señal — los que escriben basura de verdad no lo notan. ¿Qué parte leíste hoy y te pareció mala?" },
        { role: "user", content: "La introducción del segundo capítulo. Suena forzado." },
        { role: "assistant", content: "Está bien que suene forzado en borrador. El trabajo de hoy es escribirlo aunque suene forzado, no escribirlo perfecto. Cierra la pantalla en 20 minutos y vuelve mañana con ojos frescos. ¿Qué pasaría si lo dejaras así por esta noche?" },
      ],
    },
    {
      title: "No pude dormir otra vez",
      messages: [
        { role: "user", content: "Son las 2am y no puedo dormir. Tengo la cabeza llena de pensamientos." },
        { role: "assistant", content: "2am con la cabeza a mil. ¿Qué tipo de pensamientos son — cosas del pasado, del futuro, o algo específico que pasó hoy?" },
        { role: "user", content: "Del futuro. Que si voy a conseguir trabajo, si la tesis saldrá bien, si estoy tomando buenas decisiones." },
        { role: "assistant", content: "Es ansiedad anticipatoria — tu cerebro está intentando 'resolver' el futuro a las 2am, que es justamente cuando menos puede. Ninguno de esos temas se resuelve a esta hora. ¿Tienes papel cerca? A veces anotar los pensamientos los saca de la cabeza y los pone 'en pausa' hasta mañana." },
        { role: "user", content: "Sí, voy a intentarlo. Gracias." },
        { role: "assistant", content: "Bien. Anota lo que sea, sin filtro. Y después cierra los ojos aunque no sientas sueño — el descanso también cuenta. Mañana todo se ve distinto." },
      ],
    },
    {
      title: "Hoy me siento bien",
      messages: [
        { role: "user", content: "Hola Zyra! Hoy fue un buen día. Fui al gym, estudié 3 horas y hablé con mi mamá." },
        { role: "assistant", content: "Eso es mucho para un solo día — y lo lograste tú sola. ¿Cuál de las tres cosas te gustó más?" },
        { role: "user", content: "Hablar con mamá. Llevaba semanas sin llamarla por el estrés de la tesis." },
        { role: "assistant", content: "Eso tiene sentido. El estrés nos aísla justo de las personas que nos hacen bien. Me alegra que hayas hecho esa llamada. ¿Cómo estuvo?" },
        { role: "user", content: "Bien, me contó de mis hermanos, nos reímos mucho. Me acordé de por qué me gusta hablar con ella." },
        { role: "assistant", content: "Ese tipo de conversaciones cargan pilas de una manera que Netflix no puede. Buen día, María. De verdad." },
      ],
    },
  ];
  for (let i = 0; i < conversations.length; i++) {
    await Conversation.create({
      user:      user._id,
      title:     conversations[i].title,
      messages:  conversations[i].messages,
      createdAt: new Date(Date.now() - (conversations.length - i) * 7 * 86400000),
      updatedAt: new Date(Date.now() - (conversations.length - i) * 7 * 86400000),
    });
  }

  // ── Memorias persistentes de Zyra ──
  const memories = [
    { content: "Está escribiendo su tesis de grado en psicología", type: "goal",      importance: 5 },
    { content: "Tiene ansiedad los domingos por la noche pensando en la semana", type: "emotional", importance: 4 },
    { content: "Su mamá se llama... no lo mencionó pero la llama cuando está estresada", type: "relationship", importance: 3 },
    { content: "Le cuesta arrancar con el marco teórico de la tesis, se bloquea", type: "situation", importance: 4 },
    { content: "Le gusta el café por las mañanas en el balcón", type: "preference",  importance: 2 },
    { content: "Fue al gimnasio después de semanas sin ir — le costó pero lo hizo", type: "personal", importance: 3 },
    { content: "Tiene un amigo o pareja llamado Andrés con quien tuvo conversación difícil sobre cancelar planes", type: "relationship", importance: 3 },
  ];
  for (const m of memories) {
    await Memory.create({ user: user._id, ...m });
  }

  console.log("\n🌊 ════════════════════════════════════");
  console.log("🌊  ZYRA — SEED COMPLETADO");
  console.log("🌊 ════════════════════════════════════");
  console.log(`📧  Email:      ${DEMO_EMAIL}`);
  console.log(`🔑  Contraseña: ${DEMO_PASSWORD}`);
  console.log(`📊  45 registros emocionales`);
  console.log(`🎯  6 metas (2 completadas)`);
  console.log(`📔  10 entradas de diario`);
  console.log(`💬  3 conversaciones con Zyra`);
  console.log(`🧠  7 memorias persistentes`);
  console.log("🌊 ════════════════════════════════════\n");

  await mongoose.disconnect();
}

seed().catch(e => { console.error("Error en seed:", e.message); process.exit(1); });
