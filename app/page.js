"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";

// REPLACE WITH YOUR RENDER URL
const socket = io("https://my-video-server.onrender.com"); 

export default function Home() {
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null); // <--- NEW ADDITION
  const [me, setMe] = useState("");
  const [callUser, setCallUser] = useState("");
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState([]);
  
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();
  const streamRef = useRef(); // Tracks local camera

  const addLog = (message) => {
    console.log(message);
    setLogs((prev) => [...prev, message]);
  };

  // FIX: Accept callerId directly to avoid React State delay
  const answerCall = (data, callerId) => {
    setCallAccepted(true);
    setStatus("connected");
    
    if (!streamRef.current) {
        addLog("CRITICAL ERROR: Camera not ready. Cannot answer.");
        return;
    }

    addLog(`Answering call from ${callerId}...`);

    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream: streamRef.current,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" }
        ]
      }
    });

    peer.on("signal", (signal) => {
      // FIX: Use the passed callerId, NOT the state callUser
      socket.emit("answerCall", { signal: signal, to: callerId });
    });

    peer.on("stream", (currentStream) => {
      addLog("Received User Stream!");
      setRemoteStream(currentStream); // <--- CHANGED THIS
      /*if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }*/
    });

    peer.on("error", (err) => {
        addLog("Peer Error: " + err.message);
    });

    peer.signal(data.signal);
    connectionRef.current = peer;
  };

  const callId = (id) => {
    if (!id) return alert("Please enter an ID");
    
    if (!streamRef.current) {
        alert("Wait for your camera to load first!");
        return;
    }

    setStatus("calling");
    addLog(`Calling ${id}...`);

    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: streamRef.current,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" }
        ]
      }
    });

    peer.on("signal", (data) => {
      socket.emit("callUser", {
        userToCall: id,
        signalData: data,
        from: me,
        name: name,
      });
    });

    peer.on("stream", (currentStream) => {
      addLog("Received Guest Stream!");
      setRemoteStream(currentStream); // <--- CHANGED THIS
      /*if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }*/
    });

    peer.on("error", (err) => {
        addLog("Peer Error: " + err.message);
    });

    socket.on("callAccepted", (signal) => {
      setCallAccepted(true);
      setStatus("connected");
      addLog("Call Accepted! Connecting video...");
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  useEffect(() => {
    addLog("Requesting Camera...");
    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" }, 
        audio: true 
    })
      .then((currentStream) => {
        addLog("Camera Access Granted!");
        setStream(currentStream);
        streamRef.current = currentStream; 
        
        if (myVideo.current) {
            myVideo.current.srcObject = currentStream;
        }
      })
      .catch((err) => {
        addLog("CAMERA ERROR: " + err.message);
        alert("Camera Failed: " + err.message);
      });

    socket.on("connect", () => {
        setMe(socket.id);
        addLog("Connected to Server: " + socket.id);
    });

    socket.on("callUser", (data) => {
      addLog("Incoming Call from " + data.from);
      setCallUser(data.from); // We still set state for UI
      setName(data.name);
      setStatus("incoming");
      
      // FIX: Pass data.from explicitly
      answerCall(data, data.from); 
    });

    socket.on("callFailed", () => {
        setStatus("failed");
        addLog("Call Failed: User offline or wrong ID");
        alert("User is offline or wrong ID.");
    });
  }, []);

  // Force video refresh
  useEffect(() => {
    if (stream && myVideo.current) {
        myVideo.current.srcObject = stream;
    }
  }, [stream]);
// NEW: Force remote video to play whenever it arrives
  useEffect(() => {
    if (remoteStream && userVideo.current) {
        userVideo.current.srcObject = remoteStream;
    }
  }, [remoteStream, callAccepted]); // Re-run when stream arrives or call connects
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Video Call Test</h1>
      
      <div style={styles.idContainer}>
        <p style={styles.idText}>My ID: {me || "Connecting..."}</p>
      </div>

      <div style={styles.videoGrid}>
        <div style={styles.videoWrapper}>
            <p style={styles.videoLabel}>You</p>
            {stream ? (
                <video playsInline muted ref={myVideo} autoPlay style={styles.video} />
            ) : <div style={styles.placeholder}>No Camera</div>}
        </div>
        <div style={styles.videoWrapper}>
            <p style={styles.videoLabel}>Guest</p>
            {callAccepted && !callEnded ? (
                <video playsInline ref={userVideo} autoPlay style={styles.video} />
            ) : <div style={styles.placeholder}>{status}</div>}
        </div>
      </div>

      <div style={styles.controls}>
        <input 
            type="text" 
            placeholder="ID to Call" 
            onChange={(e) => setCallUser(e.target.value)} 
            style={styles.input}
        />
        <button onClick={() => callId(callUser)} style={styles.button}>Call</button>
      </div>

      <div style={{ marginTop: '20px', width: '90%', background: '#000', color: '#0f0', padding: '10px', fontSize: '10px', fontFamily: 'monospace' }}>
        <p>DEBUG LOGS:</p>
        {logs.map((log, index) => (
            <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
}

const styles = {
    container: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', minHeight: '100vh', backgroundColor: '#1a1a1a', color: 'white' },
    header: { marginBottom: '20px' },
    idContainer: { marginBottom: '20px', background: '#333', padding: '10px', borderRadius: '8px' },
    idText: { margin: 0, fontSize: '0.9rem' },
    videoGrid: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px', width: '100%', maxWidth: '600px', marginBottom: '30px' },
    videoWrapper: { flex: '1 1 300px', position: 'relative', minWidth: '280px', background: 'black', borderRadius: '10px', overflow: 'hidden', minHeight: '250px' },
    video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
    videoLabel: { position: 'absolute', top: '10px', left: '10px', margin: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '4px', fontSize: '0.8rem', zIndex: 10 },
    placeholder: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'gray' },
    controls: { display: 'flex', gap: '10px', width: '100%', maxWidth: '400px' },
    input: { flex: 1, padding: '10px', borderRadius: '5px', border: 'none' },
    button: { padding: '10px 20px', borderRadius: '5px', border: 'none', backgroundColor: '#2196F3', color: 'white', cursor: 'pointer' }
};