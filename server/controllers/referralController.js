const crypto  = require("crypto");
const User    = require("../models/User");
const Profile = require("../models/Profile");
const { applyVisit, isStreakActive } = require("./gamificationController");

const REWARD_DAYS = 7;

// "ZYRA" + 6 caracteres SIEMPRE. Antes se usaba Math.random().toString(36),
// que a veces da menos dígitos y generaba códigos cortos que el formulario
// rechazaba como "código inválido".
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I: no se confunden al dictarlo
function genReferralCode() {
  const bytes = crypto.randomBytes(6);
  let s = "ZYRA";
  for (const b of bytes) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}
async function genUniqueReferralCode() {
  let code = genReferralCode();
  while (await User.exists({ referralCode: code })) code = genReferralCode();
  return code;
}
exports.genUniqueReferralCode = genUniqueReferralCode;

// Lo que el amigo pegue o escriba: " zyra-ab12 cd " → "ZYRAAB12CD"
const normalizeCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

exports.getInfo = async (req, res) => {
  try {
    let user = await User.findById(req.user._id).select("referralCode referralCount referredBy referralRewardUsed").lean();
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

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

// Amigos conectados por código, en ambas direcciones: los que yo invité y
// quien me invitó a mí (antes el invitado no veía a nadie en su lista).
// Incluye la racha de cada uno para mostrar que siguen activos.
exports.getFriendsList = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("referredBy").lean();
    const invited = await User.find({ referredBy: req.user._id })
      .select("name createdAt")
      .sort({ createdAt: -1 })
      .lean();
    const inviter = me?.referredBy
      ? await User.findById(me.referredBy).select("name createdAt").lean()
      : null;

    const people = [
      ...(inviter ? [{ ...inviter, relation: "inviter" }] : []),
      ...invited.map(f => ({ ...f, relation: "invited" })),
    ];
    const profiles = await Profile.find({ user: { $in: people.map(p => p._id) } })
      .select("user streakDays lastActiveDate")
      .lean();
    const byUser = new Map(profiles.map(p => [String(p.user), p]));

    res.json({
      friends: people.map(f => {
        const p = byUser.get(String(f._id));
        const active = isStreakActive(p);
        return {
          name:         f.name,
          joinedAt:     f.createdAt,
          relation:     f.relation,
          streak:       active ? p.streakDays : 0,
          streakActive: active,
        };
      }),
    });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};

exports.applyCode = async (req, res) => {
  try {
    const code = normalizeCode(req.body.code);
    if (!code) return res.status(400).json({ message: "Código requerido" });

    const me = await User.findById(req.user._id).select("_id referredBy referralCode planExpiresAt planActivatedAt").lean();
    if (!me) return res.status(404).json({ message: "Usuario no encontrado" });

    if (me.referredBy) return res.status(400).json({ message: "Ya aplicaste un código de referido anteriormente" });
    if (me.referralCode === code) return res.status(400).json({ message: "No puedes usar tu propio código" });

    const referrer = await User.findOne({ referralCode: code }).select("_id name referredBy planExpiresAt planActivatedAt").lean();
    if (!referrer) return res.status(404).json({ message: "Código no encontrado" });

    // Si ese amigo ya se registró con MI código, ya están conectados: aplicar
    // el suyo de vuelta volvía a dar el premio a los dos (premio doble).
    if (referrer.referredBy && String(referrer.referredBy) === String(me._id))
      return res.status(400).json({ message: `Tú y ${referrer.name} ya están conectados: ese código ya se usó con el tuyo 💚` });

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

    try {
      await Promise.all([
        giveReward(me),
        giveReward(referrer),
        User.findByIdAndUpdate(referrer._id, { $inc: { referralCount: 1 } }),
      ]);
    } catch (err) {
      // Si falla el premio, se libera el código para que pueda reintentarlo
      // (antes quedaba "usado" sin haber recibido nada).
      await User.updateOne({ _id: me._id, referredBy: referrer._id }, { referredBy: null, referralRewardUsed: false }).catch(() => {});
      throw err;
    }

    // Los dos amigos quedan con la racha activa hoy: si ya la tenían, sigue
    // igual (o sube si su último día fue ayer); si estaba rota o nunca la
    // habían empezado, arranca en 1. Un fallo aquí no deshace el premio.
    let myStreak = null, friendStreak = null;
    try {
      const [mine, theirs] = await Promise.all([
        applyVisit(me._id,       { countSession: false }),
        applyVisit(referrer._id, { countSession: false }),
      ]);
      myStreak = mine.streak; friendStreak = theirs.streak;
    } catch (err) {
      console.error("applyCode streak error:", err.message);
    }

    res.json({
      success: true,
      message: `¡Código aplicado! Tú y ${referrer.name} reciben ${REWARD_DAYS} días de Premium gratis y quedan con la racha activa 🔥`,
      friendName: referrer.name,
      streak: myStreak,
      friendStreak,
    });
  } catch(e) {
    console.error("applyCode error:", e.message);
    res.status(500).json({ message: e.message });
  }
};
