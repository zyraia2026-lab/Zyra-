const User    = require("../models/User");
const Payment = require("../models/Payment");

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_")) {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    console.log("💳 Stripe conectado correctamente");
  } else {
    console.log("⚠️  STRIPE_SECRET_KEY no configurada — pagos deshabilitados");
  }
} catch(e) { console.log("Stripe no disponible:", e.message); }

// Precios en COP (Stripe los maneja en centavos × 100)
const PLANS = {
  basic: {
    name:        "Zyra Plan Básico",
    description: "100 mensajes/día · 10 metas · Diario ilimitado · Contacto emergencia",
    monthly:     990000,   // $9,900 COP
    annual:      9900000,  // $99,000 COP (ahorra 17%)
    currency:    "cop",
    durationMonthly: 30,
    durationAnnual:  365,
  },
  premium: {
    name:        "Zyra Plan Premium",
    description: "Mensajes ilimitados · Todo incluido · Llamadas de voz IA · Reportes PDF",
    monthly:     2490000,  // $24,900 COP
    annual:      24900000, // $249,000 COP (ahorra 17%)
    currency:    "cop",
    durationMonthly: 30,
    durationAnnual:  365,
  },
};

/* ── Crear sesión de pago ── */
exports.createCheckout = async (req, res) => {
  try {
    const { plan, period = "monthly" } = req.body;
    if (!["basic", "premium"].includes(plan)) {
      return res.status(400).json({ message: "Plan inválido" });
    }
    const isAnnual = period === "annual";

    if (!stripe) {
      // Modo demo: actualizar plan directamente (para pruebas sin Stripe)
      const duration = isAnnual ? PLANS[plan].durationAnnual : PLANS[plan].durationMonthly;
      const expires = new Date();
      expires.setDate(expires.getDate() + duration);
      await User.findByIdAndUpdate(req.user._id, {
        plan,
        planExpiresAt:   expires,
        planActivatedAt: new Date(),
      });
      const demoAmt = isAnnual ? PLANS[plan].annual : PLANS[plan].monthly;
      await Payment.create({ user: req.user._id, plan, period: "demo", amount: demoAmt, currency: PLANS[plan].currency }).catch(()=>{});
      return res.json({ demo: true, plan, message: "Plan actualizado en modo demo" });
    }

    const appUrl = process.env.APP_URL || "http://localhost:438";
    const p      = PLANS[plan];
    const amount = isAnnual ? p.annual : p.monthly;
    const label  = isAnnual ? `${p.name} — Anual` : `${p.name} — Mensual`;

    // Stripe Price IDs para suscripciones recurrentes (crear en dashboard.stripe.com → Products)
    // Agregar al .env: STRIPE_PRICE_BASIC_M, STRIPE_PRICE_BASIC_Y, STRIPE_PRICE_PREMIUM_M, STRIPE_PRICE_PREMIUM_Y
    const priceKey = `STRIPE_PRICE_${plan.toUpperCase()}_${isAnnual ? "Y" : "M"}`;
    const priceId  = process.env[priceKey];

    let sessionConfig;
    if (priceId) {
      // Modo suscripción recurrente
      sessionConfig = {
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        subscription_data: { metadata: { userId: req.user._id.toString(), plan, period } },
        success_url: `${appUrl}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        cancel_url:  `${appUrl}/?cancelled=1`,
        metadata:    { userId: req.user._id.toString(), plan, period },
        customer_email: req.user.email,
      };
    } else {
      // Fallback: pago único (hasta configurar Price IDs)
      sessionConfig = {
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency:     p.currency,
            product_data: { name: label, description: p.description },
            unit_amount:  amount,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${appUrl}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        cancel_url:  `${appUrl}/?cancelled=1`,
        metadata:    { userId: req.user._id.toString(), plan, period },
        customer_email: req.user.email,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ url: session.url, sessionId: session.id });
  } catch(e) {
    console.error("createCheckout error:", e.message);
    res.status(500).json({ message: "Error al crear sesión de pago", error: e.message });
  }
};

/* ── Verificar sesión completada (redirect de vuelta) ── */
exports.verifySession = async (req, res) => {
  try {
    const { session_id, plan } = req.query;
    if (!stripe || !session_id) {
      return res.status(400).json({ message: "Sesión inválida" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return res.status(402).json({ message: "Pago no completado" });
    }

    // Verificar que el userId del metadata coincide
    if (session.metadata?.userId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Sesión no pertenece a este usuario" });
    }

    const planName = session.metadata?.plan || plan;
    if (!["basic","premium"].includes(planName)) {
      return res.status(400).json({ message: "Plan inválido en metadata" });
    }

    const isAnnual = session.metadata?.period === "annual";
    const duration = isAnnual ? PLANS[planName].durationAnnual : PLANS[planName].durationMonthly;
    const expires = new Date();
    expires.setDate(expires.getDate() + duration);

    const upd = { plan: planName, planExpiresAt: expires, planActivatedAt: new Date() };
    if (session.customer) upd.stripeCustomerId = session.customer;
    await User.findByIdAndUpdate(req.user._id, upd);

    const isAnnualV = session.metadata?.period === "annual";
    const amt = PLANS[planName] ? (isAnnualV ? PLANS[planName].annual : PLANS[planName].monthly) : 0;
    await Payment.create({ user: req.user._id, plan: planName, period: isAnnualV ? "annual" : "monthly", amount: amt, currency: PLANS[planName]?.currency || "cop", stripeSessionId: session.id }).catch(()=>{});

    res.json({ success: true, plan: planName, expiresAt: expires });
  } catch(e) {
    console.error("verifySession error:", e.message);
    res.status(500).json({ message: "Error al verificar pago" });
  }
};

/* ── Cancelar plan ── */
exports.cancelPlan = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      plan: "free",
      planExpiresAt: null,
      planActivatedAt: null,
    });
    res.json({ success: true, message: "Plan cancelado correctamente" });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};

/* ── Webhook de Stripe (sin auth — usa firma del webhook) ── */
exports.webhook = async (req, res) => {
  if (!stripe) return res.status(200).json({ received: true });

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch(e) {
    console.error("Webhook signature error:", e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      const { userId, plan } = session.metadata || {};
      if (userId && plan && PLANS[plan]) {
        try {
          const isAnnualWh = session.metadata?.period === "annual";
          const durationWh = isAnnualWh ? PLANS[plan].durationAnnual : PLANS[plan].durationMonthly;
          const expires = new Date();
          expires.setDate(expires.getDate() + durationWh);
          const wUpd = { plan, planExpiresAt: expires, planActivatedAt: new Date() };
          if (session.customer) wUpd.stripeCustomerId = session.customer;
          await User.findByIdAndUpdate(userId, wUpd);
          const wIsAnnual = session.metadata?.period === "annual";
          const wAmt = PLANS[plan] ? (wIsAnnual ? PLANS[plan].annual : PLANS[plan].monthly) : 0;
          await Payment.create({ user: userId, plan, period: wIsAnnual ? "annual" : "monthly", amount: wAmt, currency: PLANS[plan]?.currency || "cop", stripeSessionId: session.id }).catch(()=>{});
          console.log(`✅ Plan ${plan} activado para usuario ${userId}`);
        } catch(e) {
          console.error("Error activando plan via webhook:", e.message);
        }
      }
    }
  }

  res.status(200).json({ received: true });
};

/* ── Historial de pagos ── */
exports.paymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ payments });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};

/* ── Portal de facturación de Stripe ── */
exports.billingPortal = async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ message: "Stripe no está configurado. Contacta soporte para gestionar tu suscripción." });
  }
  try {
    const user = await User.findById(req.user._id);
    if (!user.stripeCustomerId) {
      return res.status(400).json({ message: "No tienes una suscripción activa de Stripe. Contáctanos en soporte@zyra.app" });
    }
    const appUrl = process.env.APP_URL || "http://localhost:438";
    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripeCustomerId,
      return_url: appUrl + "/",
    });
    res.json({ url: session.url });
  } catch(e) {
    console.error("billingPortal error:", e.message);
    res.status(500).json({ message: "Error al abrir portal de facturación" });
  }
};
