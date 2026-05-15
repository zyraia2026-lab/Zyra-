const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ["user","assistant"] },
  content:   String,
  timestamp: { type: Date, default: Date.now },
  cards: [new mongoose.Schema({
    type:    { type: String, enum: ["song","book","place","quote"] },
    title:   String,
    artist:  String,
    author:  String,
    name:    String,
    text:    String,
    videoId: String,
  }, { _id: false })]
});

const conversationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:     { type: String, default: "Nueva sesión" },
  mood:      { type: String, default: "" },
  messages:  [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Conversation", conversationSchema);