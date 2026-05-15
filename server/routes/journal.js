const r = require("express").Router();
const { getEntries, createEntry, deleteEntry } = require("../controllers/journalController");
const { protect } = require("../middleware/auth");
r.get("/", protect, getEntries);
r.post("/", protect, createEntry);
r.delete("/:id", protect, deleteEntry);
module.exports = r;