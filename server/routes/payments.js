const r = require("express").Router();
const { protect } = require("../middleware/auth");
const P = require("../controllers/paymentController");

r.post("/checkout", protect, P.createCheckout);
r.get("/verify",    protect, P.verifySession);
r.post("/cancel",   protect, P.cancelPlan);
r.post("/portal",   protect, P.billingPortal);
r.get("/history",   protect, P.paymentHistory);

module.exports = r;
