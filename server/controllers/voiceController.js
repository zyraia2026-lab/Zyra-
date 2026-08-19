const Profile = require("../models/Profile");
const { getPlan, LIMITS } = require("../middleware/planGate");

function colDate(d) { return new Date(d.getTime() - 5 * 60 * 60 * 1000); } // Colombia = UTC-5
function monthStr(d) { const c = colDate(d); return c.getUTCFullYear() + "-" + String(c.getUTCMonth() + 1).padStart(2, "0"); }

/* POST /api/voice/start — revisa y descuenta 1 llamada del cupo mensual */
exports.startCall = async (req, res) => {
  try {
    const { plan } = getPlan(req.user);
    const limits = LIMITS[plan] || LIMITS.free;
    const now = new Date();
    const currentMonth = monthStr(now);

    let p = await Profile.findOne({ user: req.user._id }).select("callsUsedThisMonth callsResetAt").lean();
    if (!p) p = (await Profile.create({ user: req.user._id })).toObject();

    const sameMonth = p.callsResetAt && monthStr(new Date(p.callsResetAt)) === currentMonth;
    const usedSoFar = sameMonth ? (p.callsUsedThisMonth || 0) : 0;

    if (usedSoFar >= limits.callsPerMonth) {
      return res.status(403).json({
        allowed: false,
        callsUsed: usedSoFar,
        callsPerMonth: limits.callsPerMonth,
        message: `Ya usaste tus ${limits.callsPerMonth} llamadas de este mes. Vuelven el mes que viene, o mejora tu plan para tener más.`,
      });
    }

    await Profile.findOneAndUpdate(
      { user: req.user._id },
      { callsUsedThisMonth: usedSoFar + 1, callsResetAt: now }
    );

    res.json({
      allowed: true,
      maxMinutes: limits.callMaxMinutes,
      callsUsed: usedSoFar + 1,
      callsPerMonth: limits.callsPerMonth,
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

/* POST /api/voice/discard — llamada de menos de 30s, no debe contar */
exports.discardCall = async (req, res) => {
  try {
    await Profile.findOneAndUpdate(
      { user: req.user._id, callsUsedThisMonth: { $gt: 0 } },
      { $inc: { callsUsedThisMonth: -1 } }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
