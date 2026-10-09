// Quién recibe el correo "te extrañamos" (cron en server/index.js).
// - 4 o más días sin entrar, pero no más de 45 (a quien se fue hace meses no se le insiste)
// - una vez por ausencia: no se le ha escrito desde su última visita
// - no pidió darse de baja, la cuenta no está suspendida y no es una cuenta de prueba
const { QA_EMAIL_RE } = require("./testAccounts");

const DAY = 86400000;
const MIN_DAYS = 4, MAX_DAYS = 45;

async function pickNudgeTargets({ User, Profile, now = new Date(), limit = 30 }) {
  const profiles = await Profile.find({
    lastActiveDate: { $lte: new Date(now - MIN_DAYS * DAY), $gte: new Date(now - MAX_DAYS * DAY) },
  }).select("user lastActiveDate nickname").sort({ lastActiveDate: -1 }).limit(500).lean();

  const out = [];
  for (const p of profiles) {
    if (out.length >= limit) break;
    const u = await User.findOne({
      _id: p.user,
      emailOptOut: { $ne: true },
      isDisabled: { $ne: true },
      $or: [{ nudgeSentAt: null }, { nudgeSentAt: { $lt: p.lastActiveDate } }],
    }).select("email name").lean();
    if (!u || !u.email || QA_EMAIL_RE.test(u.email)) continue;
    out.push({
      userId: u._id,
      email: u.email,
      name: String(p.nickname || "").trim() || String(u.name || "").trim().split(/\s+/)[0] || "",
      days: Math.floor((now - new Date(p.lastActiveDate)) / DAY),
    });
  }
  return out;
}

module.exports = { pickNudgeTargets, MIN_DAYS, MAX_DAYS };
