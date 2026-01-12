const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log('User connected:', socket.id);

  // 1. Send the user their own ID immediately
  socket.emit("me", socket.id);

  socket.on("disconnect", () => {
    socket.broadcast.emit("callEnded");
  });

  // 2. Handle the "Call User" request
  socket.on("callUser", (data) => {
    // Check if the user we are calling is actually connected
    const target = io.sockets.sockets.get(data.userToCall);
    
    if (target) {
        // User exists, send the call signal
        io.to(data.userToCall).emit("callUser", { 
            signal: data.signalData, 
            from: data.from, 
            name: data.name 
        });
    } else {
        // User does not exist (Offline or Wrong ID), tell the caller
        io.to(data.from).emit("callFailed");
    }
  });

  // 3. Handle the "Answer Call" request
  socket.on("answerCall", (data) => {
    io.to(data.to).emit("callAccepted", data.signal);
  });
});

// Start the server on Render's port (or 3001 locally)
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Signaling Server running on port ${PORT}`);
});