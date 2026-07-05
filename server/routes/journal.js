const r = require("express").Router();
const { getEntries, createEntry, updateEntry, deleteEntry } = require("../controllers/journalController");
const { protect } = require("../middleware/auth");
r.get("/", protect, getEntries);
r.post("/", protect, createEntry);
r.put("/:id", protect, updateEntry);
r.delete("/:id", protect, deleteEntry);
module.exports = r;