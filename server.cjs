const { createServer } = require("http");
const { Server } = require("socket.io");
const fs = require("fs"); // 1. Import File System
const path = require("path");


const RENDER_DISK_PATH = "/recordings-disk";
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

const checkAuth = (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === ADMIN_USER && password === ADMIN_PASS) return true;

    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Admin Area"' });
    res.end('Authentication required.');
    return false;
};
let uploadDir;
if (fs.existsSync(RENDER_DISK_PATH)) {
    uploadDir = RENDER_DISK_PATH;
    console.log(`[STORAGE] Using Render Disk at: ${uploadDir}`);
} else {
    uploadDir = path.join(__dirname, "recordings");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    console.log(`[STORAGE] Using Local Folder at: ${uploadDir}`);
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
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        const filename = `rec-${dateStr}_${timeStr}.webm`;
        const filePath = path.join(uploadDir, filename);
        console.log(`[UPLOAD START] Receiving file... Saving to: ${filePath}`);
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

   // 2. NEW: List All Recordings (With Debug Info)
    if (req.method === "GET" && req.url === "/admin/recordings") {
        fs.readdir(uploadDir, (err, files) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "text/html" });
                res.end(`<h1>Error Reading Directory</h1><p>${err.message}</p><p>Path: ${uploadDir}</p>`);
                return;
            }

            const fileLinks = files.map(f => `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 10px;">
                        <a href="/recordings/${f}" target="_blank" style="color: #007bff; text-decoration: none;">${f}</a>
                    </td>
                    <td style="padding: 10px; text-align: right; color: #666; font-size: 0.9em;">
                        ${(fs.statSync(path.join(uploadDir, f)).size / 1024 / 1024).toFixed(2)} MB
                    </td>
                    <td style="padding: 10px; text-align: right;">
                        <button onclick="downloadFile('${f}')" style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Download</button>
                        <button onclick="renameFile('${f}')" style="background: #ffc107; color: black; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Rename</button>
                        <button onclick="deleteFile('${f}')" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
                    </td>
                </tr>`
            ).join("");

            const html = `
                <div style="font-family: sans-serif; padding: 20px; max-width: 900px; margin: 0 auto;">
                    <h1>🎥 Recording Dashboard</h1>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <strong>Storage Status:</strong>
                        <ul style="margin: 5px 0 0 20px;">
                            <li>Active Path: <code>${uploadDir}</code></li>
                            <li>Files Found: ${files.length}</li>
                        </ul>
                        <br/>
                        <a href="/admin/test-disk" style="background: #007bff; color: white; padding: 5px 10px; text-decoration: none; border-radius: 4px;">Run Disk Write Test</a>
                    </div>
                    
                    <h3>Saved Recordings:</h3>
                    <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <thead style="background: #f8f9fa;">
                            <tr>
                                <th style="padding: 10px; text-align: left; font-weight: bold;">Filename</th>
                                <th style="padding: 10px; text-align: right; font-weight: bold;">Size</th>
                                <th style="padding: 10px; text-align: right; font-weight: bold;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fileLinks || "<tr><td colspan='3' style='padding: 20px; text-align: center; color: #999;'>No recordings found yet.</td></tr>"}
                        </tbody>
                    </table>
                </div>

                <script>
                    function downloadFile(filename) {
                        const link = document.createElement('a');
                        link.href = \`/recordings/\${filename}\`;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }

                    function renameFile(oldName) {
                        const newName = prompt("Enter new filename (without .webm):", oldName.replace('.webm', ''));
                        if (newName && newName.trim()) {
                            fetch(\`/admin/rename\`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ oldName, newName: newName.trim() + '.webm' })
                            })
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    alert('File renamed successfully!');
                                    location.reload();
                                } else {
                                    alert('Error: ' + data.error);
                                }
                            });
                        }
                    }

                    function deleteFile(filename) {
                        if (confirm(\`Are you sure you want to delete \${filename}?\`)) {
                            fetch(\`/admin/delete\`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filename })
                            })
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    alert('File deleted successfully!');
                                    location.reload();
                                } else {
                                    alert('Error: ' + data.error);
                                }
                            });
                        }
                    }
                </script>
            `;
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html);
        });
        return;
    }

if (req.method === "GET" && req.url === "/admin/test-disk") {
        const testFile = path.join(uploadDir, `test-${Date.now()}.txt`);
        try {
            fs.writeFileSync(testFile, "This is a test file to verify disk permissions.");
            console.log("[TEST] Write successful");
            
            // Redirect back to dashboard
            res.writeHead(302, { "Location": "/admin/recordings" });
            res.end();
        } catch (err) {
            console.error("[TEST FAILED]", err);
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(`<h1>Disk Write Failed</h1><p>Could not write to <code>${uploadDir}</code></p><pre>${err.message}</pre>`);
        }
        return;
    }

    // NEW: Delete endpoint
    if (req.method === "POST" && req.url === "/admin/delete") {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { filename } = JSON.parse(body);
                const filePath = path.join(uploadDir, filename);

                // Security: Prevent directory traversal
                if (!filePath.startsWith(uploadDir)) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "Invalid filename" }));
                    return;
                }

                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[DELETE] Removed: ${filename}`);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true, message: "File deleted" }));
                } else {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "File not found" }));
                }
            } catch (err) {
                console.error("[DELETE ERROR]", err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // NEW: Rename endpoint
    if (req.method === "POST" && req.url === "/admin/rename") {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { oldName, newName } = JSON.parse(body);
                const oldPath = path.join(uploadDir, oldName);
                const newPath = path.join(uploadDir, newName);

                // Security: Prevent directory traversal
                if (!oldPath.startsWith(uploadDir) || !newPath.startsWith(uploadDir)) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "Invalid filename" }));
                    return;
                }

                if (fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                    console.log(`[RENAME] ${oldName} -> ${newName}`);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true, message: "File renamed" }));
                } else {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "File not found" }));
                }
            } catch (err) {
                console.error("[RENAME ERROR]", err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    if (req.method === "GET" && req.url.startsWith("/recordings/")) {
        const filename = req.url.split("/")[2];
        const filePath = path.join(uploadDir, filename);
        
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            res.writeHead(200, { 
                "Content-Type": "video/webm",
                "Content-Length": stat.size
            });
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
    origin: "*", // Only allow your app,
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