const User = require("../models/User");

const REWARD_DAYS = 7;

exports.getInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("referralCode referralCount referredBy referralRewardUsed");
    res.json({
      referralCode:       user.referralCode || null,
      referralCount:      user.referralCount || 0,
      referredBy:         !!user.referredBy,
      referralRewardUsed: user.referralRewardUsed || false,
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};

exports.applyCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Código requerido" });

    const me = await User.findById(req.user._id);

    if (me.referredBy) return res.status(400).json({ message: "Ya aplicaste un código de referido anteriormente" });
    if (me.referralCode === code.trim().toUpperCase()) return res.status(400).json({ message: "No puedes usar tu propio código" });

    const referrer = await User.findOne({ referralCode: code.trim().toUpperCase() });
    if (!referrer) return res.status(404).json({ message: "Código no encontrado" });

    const giveReward = async (u) => {
      const expires = new Date(u.planExpiresAt && u.planExpiresAt > new Date() ? u.planExpiresAt : new Date());
      expires.setDate(expires.getDate() + REWARD_DAYS);
      await User.findByIdAndUpdate(u._id, {
        plan: "premium",
        planExpiresAt: expires,
        planActivatedAt: u.planActivatedAt || new Date(),
      });
    };

    await Promise.all([giveReward(me), giveReward(referrer)]);

    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { referredBy: referrer._id, referralRewardUsed: true }),
      User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } }),
    ]);

    res.json({ success: true, message: `¡Código aplicado! Tú y ${referrer.name} reciben ${REWARD_DAYS} días de Premium gratis ✦` });
  } catch(e) {
    console.error("applyCode error:", e.message);
    res.status(500).json({ message: e.message });
  }
};
