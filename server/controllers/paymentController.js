const crypto  = require("crypto");
const User    = require("../models/User");
const Payment = require("../models/Payment");

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
if (WOMPI_PUBLIC_KEY) console.log("💳 Wompi conectado correctamente" + (WOMPI_PUBLIC_KEY.startsWith("pub_test_") ? " (sandbox)" : ""));

// Firma de integridad del Web Checkout: SHA256(reference + amountInCents + currency + secreto)
// https://docs.wompi.co/docs/colombia/widget-checkout-web/
function wompiIntegritySignature(reference, amountInCents, currency) {
  return crypto.createHash("sha256")
    .update(`${reference}${amountInCents}${currency}${process.env.WOMPI_INTEGRITY_SECRET}`)
    .digest("hex");
}

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
    description: "1.800 cargas/mes · 6 llamadas de 10 min · Diario ilimitado · Contacto emergencia",
    monthly:     1190000,   // $11,900 COP
    annual:      11900000,  // $119,000 COP
    currency:    "cop",
    durationMonthly: 30,
    durationAnnual:  365,
  },
  premium: {
    name:        "Zyra Plan Premium",
    description: "6.000 cargas/mes · 12 llamadas de 20 min · Todo ilimitado · Reportes PDF",
    monthly:     1990000,  // $19,900 COP
    annual:      19900000, // $199,000 COP
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

    if (WOMPI_PUBLIC_KEY) {
      const p = PLANS[plan];
      const amountInCents = isAnnual ? p.annual : p.monthly; // ya vienen en "centavos" (COP x100)
      // Referencia codifica quién y qué plan es -- el webhook no tiene sesión,
      // solo el payload de Wompi, así que esto es lo único que lo conecta de
      // vuelta al usuario correcto.
      const reference = `zyra_${req.user._id}_${plan}_${period}_${Date.now()}`;
      const signature = wompiIntegritySignature(reference, amountInCents, "COP");
      const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
      return res.json({
        wompi: true,
        publicKey: WOMPI_PUBLIC_KEY,
        currency: "COP",
        amountInCents,
        reference,
        signature,
        redirectUrl: `${appUrl}/?p=planes&wompi_redirect=1`,
        customerEmail: req.user.email,
      });
    }

    if (!stripe) {
      // Modo demo: activa el plan sin cobrar nada — solo para pruebas del
      // equipo. Restringido a ADMIN_EMAIL: sin esto, si Wompi/Stripe alguna
      // vez quedan mal configurados (typo en una env var, llave vencida,
      // etc.), CUALQUIER usuario que llame este endpoint quedaría con plan
      // pago gratis para siempre. Ya con Wompi activo este branch ni se
      // alcanza en el flujo normal, pero debe seguir cerrado por si acaso.
      if (req.user.email !== process.env.ADMIN_EMAIL) {
        return res.status(503).json({ message: "Pagos no disponibles en este momento. Intenta más tarde o contacta soporte." });
      }
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

    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
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

    const amt = PLANS[planName] ? (isAnnual ? PLANS[planName].annual : PLANS[planName].monthly) : 0;
    await Payment.findOneAndUpdate(
      { stripeSessionId: session.id },
      { user: req.user._id, plan: planName, period: isAnnual ? "annual" : "monthly", amount: amt, currency: PLANS[planName]?.currency || "cop", stripeSessionId: session.id },
      { upsert: true, new: true }
    ).catch(()=>{});

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
  if (!webhookSecret) return res.status(400).json({ error: "Webhook secret no configurado en el servidor." });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch(e) {
    console.error("Webhook signature error:", e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  // Renovación automática de suscripción
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    const customerId = invoice.customer;
    if (customerId && invoice.subscription) {
      try {
        // Idempotencia: Stripe mismo advierte que un evento se puede reenviar
        // mas de una vez aunque ya se proceso bien -- sin esto, un reenvio
        // legitimo sumaria dias de plan dos veces por la misma factura.
        const already = await Payment.findOne({ stripeInvoiceId: invoice.id }).lean();
        if (already) return res.status(200).json({ received: true, alreadyProcessed: true });

        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const { plan } = sub.metadata || {};
        if (plan && PLANS[plan]) {
          const isAnnual = sub.items?.data?.[0]?.price?.recurring?.interval === "year";
          const duration = isAnnual ? PLANS[plan].durationAnnual : PLANS[plan].durationMonthly;
          const expires = new Date();
          expires.setDate(expires.getDate() + duration);
          const user = await User.findOneAndUpdate({ stripeCustomerId: customerId }, {
            plan, planExpiresAt: expires, planActivatedAt: new Date(),
          });
          if (user) {
            await Payment.create({
              user: user._id, plan, period: isAnnual ? "annual" : "monthly",
              amount: invoice.amount_paid, currency: (invoice.currency || "cop"),
              stripeInvoiceId: invoice.id,
            }).catch(() => {});
          }
          console.log(`🔄 Renovación de ${plan} para customer ${customerId}`);
        }
      } catch(e) {
        console.error("invoice.payment_succeeded error:", e.message);
      }
    }
  }

  // Cancelación/expiración de suscripción desde Stripe
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    try {
      await User.findOneAndUpdate({ stripeCustomerId: sub.customer }, {
        plan: "free", planExpiresAt: null, planActivatedAt: null,
      });
      console.log(`❌ Suscripción cancelada para customer ${sub.customer}`);
    } catch(e) {
      console.error("subscription.deleted error:", e.message);
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      const { userId, plan } = session.metadata || {};
      if (userId && plan && PLANS[plan]) {
        try {
          // Idempotencia: Stripe puede reenviar el mismo evento mas de una
          // vez aunque ya se haya procesado -- sin esto, el reenvio sumaria
          // dias de plan otra vez por el mismo pago.
          const already = await Payment.findOne({ stripeSessionId: session.id }).lean();
          if (already) return res.status(200).json({ received: true, alreadyProcessed: true });

          const isAnnualWh = session.metadata?.period === "annual";
          const durationWh = isAnnualWh ? PLANS[plan].durationAnnual : PLANS[plan].durationMonthly;
          const expires = new Date();
          expires.setDate(expires.getDate() + durationWh);
          const wUpd = { plan, planExpiresAt: expires, planActivatedAt: new Date() };
          if (session.customer) wUpd.stripeCustomerId = session.customer;
          await User.findByIdAndUpdate(userId, wUpd);
          const wAmt = PLANS[plan] ? (isAnnualWh ? PLANS[plan].annual : PLANS[plan].monthly) : 0;
          await Payment.findOneAndUpdate(
            { stripeSessionId: session.id },
            { user: userId, plan, period: isAnnualWh ? "annual" : "monthly", amount: wAmt, currency: PLANS[plan]?.currency || "cop", stripeSessionId: session.id },
            { upsert: true, new: true }
          ).catch(()=>{});
          console.log(`✅ Plan ${plan} activado para usuario ${userId}`);
        } catch(e) {
          console.error("Error activando plan via webhook:", e.message);
        }
      }
    }
  }

  res.status(200).json({ received: true });
};

/* ── Webhook de Wompi (sin auth -- se valida con checksum propio de Wompi) ──
   https://docs.wompi.co/docs/colombia/eventos/
   El checksum se calcula sobre los VALORES ya parseados del JSON (no bytes
   crudos como Stripe), así que puede ir después del parser normal de express.json(). */
exports.wompiWebhook = async (req, res) => {
  try {
    const { data, signature, timestamp } = req.body || {};
    const tx = data?.transaction;
    if (!tx || !signature?.checksum || !Array.isArray(signature?.properties)) {
      return res.status(400).json({ message: "Payload inválido" });
    }

    const values = signature.properties.map(path =>
      path.split(".").reduce((o, k) => (o == null ? o : o[k]), data)
    );
    const base = values.join("") + timestamp + process.env.WOMPI_EVENTS_SECRET;
    const checksum = crypto.createHash("sha256").update(base).digest("hex");
    // Comparación en tiempo constante -- un === normal en un hash de firma es
    // vulnerable (en teoría) a timing attacks; ambos lados deben ser el mismo
    // largo para timingSafeEqual, así que primero se descarta un largo distinto.
    const checksumBuf  = Buffer.from(checksum, "hex");
    const receivedBuf  = Buffer.from(String(signature.checksum || ""), "hex");
    const checksumsMatch = checksumBuf.length === receivedBuf.length && crypto.timingSafeEqual(checksumBuf, receivedBuf);
    if (!checksumsMatch) {
      console.error("Wompi webhook: checksum inválido");
      return res.status(400).json({ message: "Firma inválida" });
    }

    // Anti-repeticion: un checksum valido captado una vez (log filtrado,
    // proxy comprometido, etc.) seguiria siendo valido para siempre si no se
    // revisa que el timestamp sea reciente -- sin esto, reenviar el MISMO
    // webhook de un pago real de hace meses volveria a extender el plan desde
    // hoy, otorgando premium gratis indefinidamente con un solo payload
    // capturado una vez.
    const tsNum = Number(timestamp);
    if (!tsNum || Math.abs(Date.now() / 1000 - tsNum) > 300) {
      console.error("Wompi webhook: timestamp fuera de rango (posible repeticion)");
      return res.status(400).json({ message: "Timestamp inválido o expirado" });
    }

    if (tx.status === "APPROVED") {
      // reference = zyra_<userId>_<plan>_<period>_<timestamp>
      const parts = String(tx.reference || "").split("_");
      if (parts[0] === "zyra" && parts.length >= 5 && PLANS[parts[2]]) {
        const [, userId, plan, period] = parts;
        // Idempotencia real: si esta transaccion ya se proceso (Wompi puede
        // reintentar el mismo webhook por su cuenta si nuestra respuesta se
        // demoro o se perdio), no volver a sumar dias de plan de nuevo.
        const already = await Payment.findOne({ wompiTransactionId: tx.id }).lean();
        if (already) {
          return res.status(200).json({ received: true, alreadyProcessed: true });
        }
        const isAnnualWh = period === "annual";
        const duration = isAnnualWh ? PLANS[plan].durationAnnual : PLANS[plan].durationMonthly;
        const expires = new Date();
        expires.setDate(expires.getDate() + duration);
        await User.findByIdAndUpdate(userId, { plan, planExpiresAt: expires, planActivatedAt: new Date() }).catch(() => {});
        await Payment.findOneAndUpdate(
          { wompiTransactionId: tx.id },
          { user: userId, plan, period: isAnnualWh ? "annual" : "monthly", amount: tx.amount_in_cents, currency: "cop", wompiTransactionId: tx.id },
          { upsert: true, new: true }
        ).catch(() => {});
        console.log(`✅ [Wompi] Plan ${plan} activado para usuario ${userId}`);
      }
    }

    res.status(200).json({ received: true });
  } catch(e) {
    console.error("wompiWebhook error:", e.message);
    // Confirmar recepción igual -- un bug nuestro no debe hacer que Wompi reintente indefinidamente.
    res.status(200).json({ received: true });
  }
};

/* ── Historial de pagos ── */
exports.paymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20).lean();
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
    const user = await User.findById(req.user._id).select("stripeCustomerId").lean();
    if (!user.stripeCustomerId) {
      return res.status(400).json({ message: "No tienes una suscripción activa de Stripe. Contáctanos en soporte@zyra.app" });
    }
    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
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
