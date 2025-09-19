const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LogSchema = new Schema({
  candidateName: { type: String, default: "unknown" },
  eventType: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Log", LogSchema);
