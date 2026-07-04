const r = require("express").Router();
const { protect } = require("../middleware/auth");
const G = require("../controllers/gamificationController");

r.get("/status",          protect, G.getStatus);
r.post("/visit",          protect, G.recordVisit);
r.post("/mission/:id",    protect, G.completeMission);
r.post("/redeem/:id",     protect, G.redeemReward);
r.post("/equip/:itemId",  protect, G.equipItem);

module.exports = r;
