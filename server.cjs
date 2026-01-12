const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow connections from anywhere (for now)
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log('User connected:', socket.id);

  // When a user asks to join a specific room ID
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    // Tell everyone else in the room that a new user connected
    socket.to(roomId).emit("user-connected", userId);
    
    console.log(`User ${userId} joined room ${roomId}`);

    // If someone leaves, tell the others
    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userId);
    });
  });
});

// Start the signaling server on port 3001 (different from our website port 3000)
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Signaling Server running on port ${PORT}`);
});