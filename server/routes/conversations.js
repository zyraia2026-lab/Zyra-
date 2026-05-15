const r = require("express").Router();
const { getConversations, getConversation, deleteConversation } = require("../controllers/conversationController");
const { protect } = require("../middleware/auth");
r.get("/", protect, getConversations);
r.get("/:id", protect, getConversation);
r.delete("/:id", protect, deleteConversation);
module.exports = r;