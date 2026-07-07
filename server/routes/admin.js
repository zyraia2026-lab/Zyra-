const r = require("express").Router();
const { protect } = require("../middleware/auth");
const User         = require("../models/User");
const Profile      = require("../models/Profile");
const Conversation = require("../models/Conversation");
const Payment      = require("../models/Payment");

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

    const [
      totalUsers, newToday, newWeek, newMonth,
      basicUsers, premiumUsers,
      totalConvs, convsToday,
      totalPayments, revenueAll,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: week } }),
      User.countDocuments({ createdAt: { $gte: month } }),
      User.countDocuments({ plan: "basic",   planExpiresAt: { $gt: now } }),
      User.countDocuments({ plan: "premium", planExpiresAt: { $gt: now } }),
      Conversation.countDocuments(),
      Conversation.countDocuments({ createdAt: { $gte: today } }),
      Payment.countDocuments({ status: "paid", period: { $ne: "demo" } }),
      Payment.aggregate([{ $match: { status: "paid", period: { $ne: "demo" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]);

    // Últimos 10 usuarios
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10)
      .select("name email plan createdAt planExpiresAt").lean();

    // Últimos 5 pagos reales
    const recentPayments = await Payment.find({ status: "paid", period: { $ne: "demo" } })
      .sort({ createdAt: -1 }).limit(5)
      .populate("user", "name email").lean();

    res.json({
      users: { total: totalUsers, newToday, newWeek, newMonth, basic: basicUsers, premium: premiumUsers, free: totalUsers - basicUsers - premiumUsers },
      conversations: { total: totalConvs, today: convsToday },
      payments: { count: totalPayments, revenue: revenueAll[0]?.total || 0 },
      recentUsers,
      recentPayments,
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = r;
