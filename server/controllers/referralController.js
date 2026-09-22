const User = require("../models/User");

const REWARD_DAYS = 7;

async function genUniqueReferralCode() {
  const gen = () => "ZYRA" + Math.random().toString(36).slice(2, 8).toUpperCase();
  let code = gen();
  while (await User.exists({ referralCode: code })) code = gen();
  return code;
}

exports.getInfo = async (req, res) => {
  try {
    let user = await User.findById(req.user._id).select("referralCode referralCount referredBy referralRewardUsed").lean();

    // Cuentas creadas antes de que existiera esta función nunca recibieron
    // código (solo se generaba al registrarse) — se asigna aquí en el primer
    // acceso en vez de necesitar una migración aparte.
    if (!user.referralCode) {
      const code = await genUniqueReferralCode();
      await User.findByIdAndUpdate(req.user._id, { referralCode: code });
      user = { ...user, referralCode: code };
    }

    res.json({
      referralCode:       user.referralCode,
      referralCount:      user.referralCount || 0,
      referredBy:         !!user.referredBy,
      referralRewardUsed: user.referralRewardUsed || false,
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getFriendsList = async (req, res) => {
  try {
    const friends = await User.find({ referredBy: req.user._id })
      .select("name createdAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      friends: friends.map(f => ({ name: f.name, joinedAt: f.createdAt })),
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};

exports.applyCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Código requerido" });

    const me = await User.findById(req.user._id).select("_id referredBy referralCode planExpiresAt planActivatedAt").lean();

    if (me.referredBy) return res.status(400).json({ message: "Ya aplicaste un código de referido anteriormente" });
    if (me.referralCode === code.trim().toUpperCase()) return res.status(400).json({ message: "No puedes usar tu propio código" });

    const referrer = await User.findOne({ referralCode: code.trim().toUpperCase() }).select("_id name planExpiresAt planActivatedAt").lean();
    if (!referrer) return res.status(404).json({ message: "Código no encontrado" });

    // Atómico: solo marca referredBy si sigue en null — evita que peticiones
    // concurrentes con códigos distintos acumulen premium gratis varias veces.
    const claimed = await User.findOneAndUpdate(
      { _id: req.user._id, referredBy: null },
      { referredBy: referrer._id, referralRewardUsed: true },
      { new: false }
    );
    if (!claimed) return res.status(400).json({ message: "Ya aplicaste un código de referido anteriormente" });

    const giveReward = async (u) => {
      const expires = new Date(u.planExpiresAt && u.planExpiresAt > new Date() ? u.planExpiresAt : new Date());
      expires.setDate(expires.getDate() + REWARD_DAYS);
      await User.findByIdAndUpdate(u._id, {
        plan: "premium",
        planExpiresAt: expires,
        planActivatedAt: u.planActivatedAt || new Date(),
      });
    };

    await Promise.all([
      giveReward(me),
      giveReward(referrer),
      User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } }),
    ]);

    res.json({ success: true, message: `¡Código aplicado! Tú y ${referrer.name} reciben ${REWARD_DAYS} días de Premium gratis ✦` });
  } catch(e) {
    console.error("applyCode error:", e.message);
    res.status(500).json({ message: e.message });
  }
};
