const r = require("express").Router();
const { getConversations, getConversation, deleteConversation, renameConversation } = require("../controllers/conversationController");
const { protect } = require("../middleware/auth");
r.get("/", protect, getConversations);
r.get("/:id", protect, getConversation);
r.delete("/:id", protect, deleteConversation);
r.patch("/:id/title", protect, renameConversation);
module.exports = r;