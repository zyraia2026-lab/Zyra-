// Pruebas del correo "te extrañamos" (server/utils/nudge.js) y del enlace para darse de baja.
// Sin red ni base de datos: modelos falsos en memoria.   npm run test:unit
const test = require("node:test");
const assert = require("node:assert");
process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba";
const { pickNudgeTargets } = require("../utils/nudge");
const { unsubscribeUrl, validUnsubscribe } = require("../utils/unsubscribe");

const DAY = 86400000;
const now = new Date("2026-10-08T15:00:00Z");
const ago = d => new Date(now - d * DAY);

// Imita lo justo de Mongoose: find().select().sort().limit().lean() y findOne().select().lean()
function fakeModels(profiles, users) {
  const chain = rows => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => rows });
  const Profile = {
    find(q) {
      const lte = q.lastActiveDate.$lte, gte = q.lastActiveDate.$gte;
      return chain(profiles.filter(p => p.lastActiveDate && p.lastActiveDate <= lte && p.lastActiveDate >= gte));
    },
  };
  const User = {
    findOne(q) {
      const u = users.find(x => x._id === q._id);
      const ok = u && u.emailOptOut !== true && u.isDisabled !== true &&
        (u.nudgeSentAt == null || u.nudgeSentAt < q.$or[1].nudgeSentAt.$lt);
      return chain(ok ? u : null);
    },
  };
  return { Profile, User };
}

test("te extrañamos: solo a quien lleva 4+ días sin entrar, una vez por ausencia", async () => {
  const profiles = [
    { user: "a", lastActiveDate: ago(6), nickname: "Vale" },  // sí
    { user: "b", lastActiveDate: ago(1) },                    // entró ayer: no
    { user: "c", lastActiveDate: ago(10) },                   // ya se le escribió en esta ausencia: no
    { user: "d", lastActiveDate: ago(8) },                    // se dio de baja: no
    { user: "e", lastActiveDate: ago(90) },                   // se fue hace meses: no
    { user: "f", lastActiveDate: ago(7) },                    // cuenta de prueba: no
    { user: "g", lastActiveDate: ago(5) },                    // se le escribió en una ausencia anterior: sí
  ];
  const users = [
    { _id: "a", email: "a@gmail.com", name: "Valentina Pérez" },
    { _id: "b", email: "b@gmail.com", name: "Bruno" },
    { _id: "c", email: "c@gmail.com", name: "Carla", nudgeSentAt: ago(3) },
    { _id: "d", email: "d@gmail.com", name: "Diego", emailOptOut: true },
    { _id: "e", email: "e@gmail.com", name: "Elena" },
    { _id: "f", email: "f@zyratest.com", name: "QA" },
    { _id: "g", email: "g@gmail.com", name: "Gabriel Ruiz", nudgeSentAt: ago(30) },
  ];
  const { User, Profile } = fakeModels(profiles, users);
  const out = await pickNudgeTargets({ User, Profile, now });
  assert.deepEqual(out.map(t => t.userId).sort(), ["a", "g"]);
  const a = out.find(t => t.userId === "a");
  assert.equal(a.name, "Vale");     // usa el apodo de "Sobre ti"
  assert.equal(a.days, 6);
  assert.equal(out.find(t => t.userId === "g").name, "Gabriel"); // sin apodo: primer nombre
});

test("enlace para darse de baja: firmado, no se puede adivinar para otra cuenta", () => {
  const url = new URL(unsubscribeUrl("64f1a2b3c4d5e6f708192a3b"));
  assert.equal(url.pathname, "/api/email/unsubscribe");
  const t = url.searchParams.get("t");
  assert.ok(validUnsubscribe("64f1a2b3c4d5e6f708192a3b", t));
  assert.ok(!validUnsubscribe("64f1a2b3c4d5e6f708192a3c", t)); // otra cuenta
  assert.ok(!validUnsubscribe("64f1a2b3c4d5e6f708192a3b", "x"));
  assert.ok(!validUnsubscribe("64f1a2b3c4d5e6f708192a3b", undefined));
});
