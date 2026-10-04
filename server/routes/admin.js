const r = require("express").Router();
const { protect } = require("../middleware/auth");
const User         = require("../models/User");
const Profile      = require("../models/Profile");
const Conversation = require("../models/Conversation");
const Payment      = require("../models/Payment");
const ContactLead  = require("../models/ContactLead");
const { QA_EMAIL_RE } = require("../utils/testAccounts");

// Admin gate — solo el email registrado como admin
function adminOnly(req, res, next) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || req.user.email !== adminEmail) {
    return res.status(403).json({ message: "Acceso denegado" });
  }
  next();
}

r.get("/stats", protect, adminOnly, async (req, res) => {
  try {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week  = new Date(today.getTime() - 7 * 86400000);
    const month = new Date(today.getTime() - 30 * 86400000);

    // Las cuentas QA (@zyratest.com) no cuentan en ninguna métrica, ni sus pagos
    const qaIds    = await User.distinct("_id", { email: QA_EMAIL_RE });
    const realUser = { email: { $not: QA_EMAIL_RE } };
    const realPaid = { status: "paid", period: { $ne: "demo" }, user: { $nin: qaIds } };
    const realLead = { spam: { $ne: true } };

    const [
      totalUsers, newToday, newWeek, newMonth,
      basicUsers, premiumUsers,
      totalConvs, convsToday,
      totalPayments, revenueAll,
      totalLeads, leadsMonth,
    ] = await Promise.all([
      User.countDocuments(realUser),
      User.countDocuments({ ...realUser, createdAt: { $gte: today } }),
      User.countDocuments({ ...realUser, createdAt: { $gte: week } }),
      User.countDocuments({ ...realUser, createdAt: { $gte: month } }),
      User.countDocuments({ ...realUser, plan: "basic",   planExpiresAt: { $gt: now } }),
      User.countDocuments({ ...realUser, plan: "premium", planExpiresAt: { $gt: now } }),
      Conversation.countDocuments({ user: { $nin: qaIds } }),
      Conversation.countDocuments({ user: { $nin: qaIds }, createdAt: { $gte: today } }),
      Payment.countDocuments(realPaid),
      Payment.aggregate([{ $match: realPaid }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      ContactLead.countDocuments(realLead),
      ContactLead.countDocuments({ ...realLead, createdAt: { $gte: month } }),
    ]);

    // Últimos 10 usuarios reales
    const recentUsers = await User.find(realUser).sort({ createdAt: -1 }).limit(10)
      .select("name email plan createdAt planExpiresAt isDisabled").lean();

    // Últimos 5 pagos reales
    const recentPayments = await Payment.find(realPaid)
      .sort({ createdAt: -1 }).limit(5)
      .populate("user", "name email").lean();

    res.json({
      excluded: { qaAccounts: qaIds.length },
      users: { total: totalUsers, newToday, newWeek, newMonth, basic: basicUsers, premium: premiumUsers, free: totalUsers - basicUsers - premiumUsers },
      conversations: { total: totalConvs, today: convsToday },
      payments: { count: totalPayments, revenue: revenueAll[0]?.total || 0 },
      // Embudo B2B: solicitudes de demo del formulario (sin rastreo, solo datos propios)
      leads: { total: totalLeads, month: leadsMonth },
      recentUsers,
      recentPayments,
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

/* GET /api/admin/search?email=... */
r.get("/search", protect, adminOnly, async (req, res) => {
  try {
    const email = (req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email requerido" });
    const user = await User.findOne({ email })
      .select("name email plan planExpiresAt planActivatedAt createdAt isDisabled messagesUsedToday").lean();
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    const profile = await Profile.findOne({ user: user._id })
      .select("streakDays coins achievements unlockedItems").lean();
    const convCount = await Conversation.countDocuments({ user: user._id });
    res.json({ user, profile, convCount });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/admin/user/:id/plan  { plan: "free"|"basic"|"premium", days: 30 } */
r.post("/user/:id/plan", protect, adminOnly, async (req, res) => {
  try {
    const { plan, days } = req.body;
    if (!["free","basic","premium"].includes(plan)) {
      return res.status(400).json({ message: "Plan inválido" });
    }
    const update = { plan };
    if (plan !== "free") {
      const d = parseInt(days) || 30;
      update.planExpiresAt   = new Date(Date.now() + d * 86400000);
      update.planActivatedAt = new Date();
    } else {
      update.planExpiresAt   = null;
      update.planActivatedAt = null;
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select("name email plan planExpiresAt");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ success: true, user });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/admin/payments/all?page=1&limit=20  — historial global paginado */
r.get("/payments/all", protect, adminOnly, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      Payment.find({ status: "paid", period: { $ne: "demo" } })
        .sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate("user", "name email").lean(),
      Payment.countDocuments({ status: "paid", period: { $ne: "demo" } }),
    ]);
    res.json({ payments, total, page, pages: Math.ceil(total / limit) });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

/* GET /api/admin/user/:id/payments  — historial de pagos de un usuario */
r.get("/user/:id/payments", protect, adminOnly, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.params.id })
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ payments });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

/* POST /api/admin/user/:id/disable  — toggle suspend/unsuspend */
r.post("/user/:id/disable", protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("name email isDisabled");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    user.isDisabled = !user.isDisabled;
    user.disabledAt = user.isDisabled ? new Date() : null;
    await user.save();
    res.json({ success: true, isDisabled: user.isDisabled, name: user.name });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = r;
