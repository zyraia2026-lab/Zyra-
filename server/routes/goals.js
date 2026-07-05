const r = require("express").Router();
const { getGoals, createGoal, toggleGoal, updateGoal, deleteGoal } = require("../controllers/goalController");
const { protect } = require("../middleware/auth");
r.get("/", protect, getGoals);
r.post("/", protect, createGoal);
r.put("/:id/toggle", protect, toggleGoal);
r.put("/:id", protect, updateGoal);
r.delete("/:id", protect, deleteGoal);
module.exports = r;