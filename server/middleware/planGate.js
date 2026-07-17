/* ════════════════════════════════════════
   PLAN GATE MIDDLEWARE
   Enforces plan limits on every protected route
════════════════════════════════════════ */

const LIMITS = {
  free:    { messagesPerDay: 15,  goals: 3,  journal: 10,  conversations: 5,  voice: false, emergencyContact: false, export: false, report: false },
  basic:   { messagesPerDay: 100, goals: 10, journal: 30,  conversations: 30, voice: false, emergencyContact: true,  export: true,  report: false },
  premium: { messagesPerDay: Infinity, goals: Infinity, journal: Infinity, conversations: Infinity, voice: true, emergencyContact: true, export: true, report: true },
};

exports.LIMITS = LIMITS;

/* Returns the effective plan limits for a user, auto-expiring plans */
exports.getPlan = function(user) {
  // Auto-expire if past date
  if (user.plan !== "free" && user.planExpiresAt && new Date() > new Date(user.planExpiresAt)) {
    return { plan: "free", limits: LIMITS.free, expired: true };
  }
  const plan = user.plan || "free";
  return { plan, limits: LIMITS[plan] || LIMITS.free, expired: false };
};

/* Middleware: blocks the request if the user is on free and the feature requires higher plan */
exports.requirePlan = (minPlan) => (req, res, next) => {
  const ORDER = { free: 0, basic: 1, premium: 2 };
  const { plan } = exports.getPlan(req.user);
  if (ORDER[plan] < ORDER[minPlan]) {
    return res.status(403).json({
      planRequired: minPlan,
      currentPlan:  plan,
      message: `Esta función requiere el plan ${minPlan === "basic" ? "Básico" : "Premium"}.`,
    });
  }
  next();
};

/* Middleware: checks + increments daily message count (atomic — race-condition safe) */
exports.checkMessageLimit = async (req, res, next) => {
  try {
    const User = require("../models/User");
    const { plan, limits, expired } = exports.getPlan(req.user);

    // Auto-expire: save downgrade
    if (expired) {
      await User.findByIdAndUpdate(req.user._id, { plan: "free", planExpiresAt: null });
      req.user.plan = "free";
    }

    if (limits.messagesPerDay === Infinity) return next(); // premium = unlimited

    const now    = new Date();
    const today  = now.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

    // Atomically: if the stored reset date is today, $inc by 1; otherwise reset to 1.
    // Pipeline update (MongoDB 4.2+) guarantees read-modify-write in a single op.
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      [
        {
          $set: {
            messagesResetAt: now,
            messagesUsedToday: {
              $cond: [
                {
                  $eq: [
                    { $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$messagesResetAt", new Date(0)] } } },
                    today,
                  ],
                },
                { $add: [{ $ifNull: ["$messagesUsedToday", 0] }, 1] },
                1,
              ],
            },
          },
        },
      ],
      { new: true }
    ).select("messagesUsedToday").lean();

    const usedAfter = updated?.messagesUsedToday ?? 1;

    if (usedAfter > limits.messagesPerDay) {
      return res.status(429).json({
        limitReached: true,
        plan,
        messagesUsedToday: usedAfter,
        messagesPerDay:    limits.messagesPerDay,
        message: `Has alcanzado el límite de ${limits.messagesPerDay} mensajes diarios del plan ${plan === "free" ? "Gratis" : "Básico"}. Actualiza tu plan para seguir chateando.`,
      });
    }

    req.messagesRemaining = limits.messagesPerDay - usedAfter;
    next();
  } catch(e) {
    console.error("checkMessageLimit:", e.message);
    next(); // fail open — don't block users on middleware errors
  }
};
