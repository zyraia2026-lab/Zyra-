/* ════════════════════════════════════════
   CARGAS GATE — sistema de saldo de Zyra
   Gratis: 20/día, sin acumulación.
   Básico: 1.800/mes, acumula hasta la mitad (900).
   Premium: 6.000/mes, acumula hasta la mitad (3.000).
   Nunca bloquea: si no alcanza, la acción sigue en "modo ligero"
   (req.cargasLight = true) en vez de devolver un error. El saldo puede
   quedar en negativo internamente -- es solo la señal de "no alcanzaba",
   se muestra como 0 en pantalla y no afecta el próximo reinicio porque
   el cálculo de acumulación siempre se recorta a >=0 primero.
════════════════════════════════════════ */
const User = require("../models/User");
const { getPlan } = require("./planGate");

const CARGAS_LIMITS = {
  free:    { amount: 20,   cycle: "daily",   rollover: 0 },
  basic:   { amount: 1800, cycle: "monthly", rollover: 900 },
  premium: { amount: 6000, cycle: "monthly", rollover: 3000 },
};
exports.CARGAS_LIMITS = CARGAS_LIMITS;

function colDate(d) { return new Date(d.getTime() - 5 * 60 * 60 * 1000); } // Colombia = UTC-5

function periodStr(cfg, date) {
  const c = colDate(date);
  return cfg.cycle === "daily"
    ? c.getUTCFullYear() + "-" + String(c.getUTCMonth() + 1).padStart(2, "0") + "-" + String(c.getUTCDate()).padStart(2, "0")
    : c.getUTCFullYear() + "-" + String(c.getUTCMonth() + 1).padStart(2, "0");
}

/* Expresión Mongo: saldo tras aplicar reinicio/acumulación del periodo,
   ANTES de restar el costo de esta acción. */
function resetExpr(cfg, currentPeriod) {
  const fmt = cfg.cycle === "daily" ? "%Y-%m-%d" : "%Y-%m";
  return {
    $cond: [
      {
        $eq: [
          { $dateToString: { format: fmt, date: { $ifNull: ["$cargasResetAt", new Date(0)] }, timezone: "America/Bogota" } },
          currentPeriod,
        ],
      },
      { $ifNull: ["$cargas", cfg.amount] }, // mismo periodo -- saldo tal cual está
      { $add: [{ $min: [cfg.rollover, { $max: [0, { $ifNull: ["$cargas", 0] }] }] }, cfg.amount] }, // periodo nuevo -- rollover (nunca negativo) + cupo lleno
    ],
  };
}

/* Middleware factory: descuenta `cost` cargas (1 normal, 5 profunda).
   Nunca bloquea la request -- si no alcanza, deja req.cargasLight=true
   y el saldo puede quedar negativo (solo como señal interna). */
exports.checkCargas = (cost) => async (req, res, next) => {
  try {
    const { plan, expired } = getPlan(req.user);
    if (expired) {
      await User.findByIdAndUpdate(req.user._id, { plan: "free", planExpiresAt: null });
      req.user.plan = "free";
    }
    const cfg = CARGAS_LIMITS[plan] || CARGAS_LIMITS.free;
    const now = new Date();
    const currentPeriod = periodStr(cfg, now);
    const balExpr = resetExpr(cfg, currentPeriod);

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      [{ $set: { cargas: { $subtract: [balExpr, cost] }, cargasResetAt: now } }],
      { new: true }
    ).select("cargas").lean();

    const raw = updated?.cargas ?? (cfg.amount - cost);
    req.cargasLight     = raw < 0;
    req.cargasRemaining = Math.max(0, raw);
    next();
  } catch (e) {
    console.error("checkCargas:", e.message);
    req.cargasLight = false;
    next(); // fail open — nunca bloquear al usuario por un error de middleware
  }
};

/* Saldo actual sin descontar (para mostrar el medidor en el dashboard) */
exports.getCargasStatus = async (user) => {
  const { plan, expired } = getPlan(user);
  const cfg = CARGAS_LIMITS[expired ? "free" : plan] || CARGAS_LIMITS.free;
  const now = new Date();
  const currentPeriod = periodStr(cfg, now);
  const stored = await User.findById(user._id).select("cargas cargasResetAt").lean();
  const lastPeriod = stored?.cargasResetAt ? periodStr(cfg, new Date(stored.cargasResetAt)) : null;
  const current = lastPeriod === currentPeriod
    ? Math.max(0, stored?.cargas ?? cfg.amount)
    : Math.min(cfg.rollover, Math.max(0, stored?.cargas ?? 0)) + cfg.amount;
  return { cargas: current, cargasMax: cfg.amount, cycle: cfg.cycle, plan };
};
