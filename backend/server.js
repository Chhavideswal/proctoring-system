require('dotenv').config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const proctorRoutes = require("./routes/proctorRoutes");

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } }); // restrict origin in production

app.use(cors());
app.use(bodyParser.json({ limit:'10mb' }));

// MongoDB
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proctoring_demo';
mongoose.connect(MONGO).then(()=>console.log("Mongo connected")).catch(e=>console.error(e));

// Routes
app.use("/api/proctor", proctorRoutes);

// Socket.io: on connection, listen for candidate_event (from candidate frontend) and broadcast to interviewer
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // If candidate emits event via socket, forward to all clients including interviewers
  socket.on("candidate_event", (payload) => {
    // broadcast event to everyone (in production you can use rooms)
    io.emit("candidate_event", payload);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// Also, when POST /event is called we want to emit via socket to ensure immediate alerts.
// We'll patch the saveEvent controller to emit — easiest: add a simple middleware here to watch POST /api/proctor/event.
const postEventUrl = "/api/proctor/event";
app.post(postEventUrl, (req, res, next) => {
  // after saving (the controller will send response), we also emit — but we need emission after controller saves.
  // To keep design simple and avoid duplicating logic, intercept request body and broadcast here
  const payload = { candidateName: req.body.candidateName, eventType: req.body.eventType, timestamp: req.body.timestamp || new Date().toISOString() };
  // emit immediately (the controller will still save to DB)
  io.emit("candidate_event", payload);
  next();
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
