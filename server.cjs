const { createServer } = require("http");
const { Server } = require("socket.io");
const fs = require("fs"); // 1. Import File System
const path = require("path");


const RENDER_DISK_PATH = "/recordings-disk";
const uploadDir = fs.existsSync(RENDER_DISK_PATH) 
    ? RENDER_DISK_PATH 
    : path.join(__dirname, "recordings");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 1. Create HTTP Server with Upload Handler
const httpServer = createServer((req, res) => {
    // Enable CORS for the Upload Endpoint
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }

    // Handle File Upload
    if (req.method === "POST" && req.url === "/upload") {
        const filename = `rec-${Date.now()}.webm`;
        const filePath = path.join(uploadDir, filename);
        const writeStream = fs.createWriteStream(filePath);

        req.pipe(writeStream);

        req.on("end", () => {
            console.log(`[UPLOAD] Saved: ${filename}`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, filename }));
        });

        req.on("error", (err) => {
            console.error("[UPLOAD ERROR]", err);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: "Upload Failed" }));
        });
        return;

        
    }

    if (req.method === "GET" && req.url === "/admin/recordings") {
        fs.readdir(uploadDir, (err, files) => {
            if (err) {
                res.writeHead(500);
                res.end("Error reading folder");
                return;
            }
            // Simple HTML list
            const fileLinks = files.map(f => `<li><a href="/recordings/${f}">${f}</a></li>`).join("");
            const html = `
                <h1>Call Recordings</h1>
                <ul>${fileLinks || "<li>No recordings yet</li>"}</ul>
            `;
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html);
        });
        return;
    }

    if (req.method === "GET" && req.url.startsWith("/recordings/")) {
        const filename = req.url.split("/")[2];
        const filePath = path.join(uploadDir, filename);
        
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { "Content-Type": "video/webm" });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end("File not found");
        }
        return;
    }
});

const io = new Server(httpServer, {
  cors: {
    origin: ["https://www.letsdocall.com","https://my-video-app-peach.vercel.app/", "http://localhost:3000"], // Only allow your app,
    methods: ["GET", "POST"]
  }
});


// 2. Helper function to log to "Database" (call_logs.json)
const logEvent = (type, data) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        eventType: type,
        ...data
    };

    // Append to a file named 'call_logs.json'
    const logFile = path.join(__dirname, "call_logs.json");
    
    // Read existing, append, save (Simple JSON DB approach)
    fs.appendFile(logFile, JSON.stringify(logEntry) + ",\n", (err) => {
        if (err) console.error("Error logging to DB:", err);
    });
    
    console.log(`[${type}]`, data); // Keep console log for live debugging
};

io.on("connection", (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  logEvent("CONNECTION", { socketId: socket.id, ip: clientIp });
  console.log('User connected:', socket.id);

  // 1. Send the user their own ID immediately
  socket.emit("me", socket.id);

  socket.on("disconnect", () => {
    logEvent("DISCONNECT", { socketId: socket.id });
    socket.broadcast.emit("callEnded");
  });

  // 2. Handle the "Call User" request
  socket.on("callUser", (data) => {
    logEvent("CALL_INITIATED", { from: data.from, to: data.userToCall, callerName: data.name });
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
        logEvent("CALL_FAILED", { from: data.from, reason: "User Offline/NotFound" });
        io.to(data.from).emit("callFailed");
    }
  });

  // 3. Handle the "Answer Call" request
  socket.on("answerCall", (data) => {
    logEvent("CALL_ACCEPTED", { acceptor: socket.id, caller: data.to });
    io.to(data.to).emit("callAccepted", data.signal);
  });
});

// Start the server on Render's port (or 3001 locally)
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Signaling Server running on port ${PORT}`);
});