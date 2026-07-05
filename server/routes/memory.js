const r = require("express").Router();
const { protect } = require("../middleware/auth");
const { getMemories, deleteMemory, clearMemories } = require("../controllers/memoryController");

r.get("/",          protect, getMemories);
r.delete("/all",    protect, clearMemories);
r.delete("/:id",    protect, deleteMemory);

module.exports = r;
