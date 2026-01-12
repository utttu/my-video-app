"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";

// REPLACE WITH YOUR RENDER URL
const socket = io("https://my-video-server.onrender.com"); 

export default function Home() {
  const [stream, setStream] = useState(null);
  const [me, setMe] = useState("");
  const [callUser, setCallUser] = useState("");
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [name, setName] = useState("");
  
  // New state for UI feedback
  const [status, setStatus] = useState("idle"); // idle, calling, connected, failed, incoming
  
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  // --- 1. HELPER FUNCTIONS ---

  const copyToClipboard = () => {
    navigator.clipboard.writeText(me);
    alert("ID Copied!");
  };

  const answerCall = (data) => {
    setCallAccepted(true);
    setStatus("connected");
    
    const peer = new SimplePeer({
  initiator: false,
  trickle: false,
  stream: stream,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" }
    ]
  }
});

    peer.on("signal", (data) => {
      socket.emit("answerCall", { signal: data, to: callUser });
    });

    peer.on("stream", (currentStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }
    });

    peer.signal(data.signal);
    connectionRef.current = peer;
  };

  const callId = (id) => {
    if (!id) return alert("Please enter an ID");
    
    setStatus("calling"); // Show "Calling..." feedback

   const peer = new SimplePeer({
  initiator: true,
  trickle: false,
  stream: stream,
  config: { // <--- ADD THIS BLOCK
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
      if (userVideo.current) {
        userVideo.current.srcObject = currentStream;
      }
    });

    socket.on("callAccepted", (signal) => {
      setCallAccepted(true);
      setStatus("connected");
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  // --- 2. SETUP & LISTENERS ---

  useEffect(() => {
    // Standard constraints for mobile compatibility
    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" }, // Forces front camera on mobile
        audio: true 
    })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) {
            myVideo.current.srcObject = currentStream;
        }
      })
      .catch((err) => {
          // THIS IS IMPORTANT: Show us why it failed
          alert("Camera Error: " + err.message); 
          console.error(err);
      });

    // ... (rest of the socket code) ...

    socket.on("connect", () => {
        setMe(socket.id);
    });

    socket.on("callUser", (data) => {
      setCallUser(data.from);
      setName(data.name);
      setStatus("incoming"); // Change status to show incoming call
      answerCall(data); 
    });

    // NEW: Listen for failed calls (User offline)
    socket.on("callFailed", () => {
        setStatus("failed");
        alert("User is offline or ID is wrong.");
        window.location.reload(); // Refresh to reset connection for now
    });

  }, []);

  // --- 3. UI RENDER ---

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Video Call App</h1>
      
      {/* ID Display & Copy */}
      <div style={styles.idContainer}>
        <p style={styles.idText}>My ID: {me ? me : "Connecting..."}</p>
        {me && (
            <button onClick={copyToClipboard} style={styles.copyButton}>
                Copy ID
            </button>
        )}
      </div>

      {/* Video Area */}
      <div style={styles.videoGrid}>
        {/* My Video */}
        <div style={styles.videoWrapper}>
            <p style={styles.videoLabel}>You</p>
            {stream && <video playsInline muted ref={myVideo} autoPlay style={styles.video} />}
        </div>

        {/* Guest Video */}
        <div style={styles.videoWrapper}>
            <p style={styles.videoLabel}>Guest ({status})</p>
            {callAccepted && !callEnded ? (
                <video playsInline ref={userVideo} autoPlay style={styles.video} />
            ) : (
                <div style={styles.placeholder}>
                    {status === "calling" ? "Calling..." : "Waiting..."}
                </div>
            )}
        </div>
      </div>

      {/* Call Controls */}
      <div style={styles.controls}>
        <input 
            type="text" 
            placeholder="Paste Friend's ID here" 
            onChange={(e) => setCallUser(e.target.value)} 
            style={styles.input}
        />
        
        {status === "calling" ? (
             <button disabled style={{...styles.button, backgroundColor: 'gray'}}>Calling...</button>
        ) : (
             <button onClick={() => callId(callUser)} style={styles.button}>Call Now</button>
        )}
      </div>
    </div>
  );
}

// --- 4. CSS STYLES (Clean & Mobile Friendly) ---
const styles = {
    container: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', 
        padding: '20px', minHeight: '100vh', backgroundColor: '#1a1a1a', 
        color: 'white', fontFamily: 'Arial, sans-serif'
    },
    header: { marginBottom: '20px' },
    idContainer: { 
        display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px',
        background: '#333', padding: '10px 20px', borderRadius: '8px'
    },
    idText: { margin: 0, fontSize: '0.9rem', wordBreak: 'break-all' },
    copyButton: {
        padding: '5px 10px', fontSize: '0.8rem', cursor: 'pointer',
        backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px'
    },
    videoGrid: {
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px',
        width: '100%', maxWidth: '800px', marginBottom: '30px'
    },
   videoWrapper: {
        flex: '1 1 300px', 
        position: 'relative', 
        minWidth: '280px',
        background: 'black', 
        borderRadius: '10px', 
        overflow: 'hidden', 
        minHeight: '250px', // <--- ADD THIS (Forces box to be open)
    },
    video: { 
        width: '100%', 
        height: '100%', 
        objectFit: 'cover',
        transform: 'scaleX(-1)' // <--- Optional: Mirrors your camera like a selfie
    },
    videoLabel: {
        position: 'absolute', top: '10px', left: '10px', margin: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px', fontSize: '0.8rem'
    },
    placeholder: {
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'gray', fontSize: '1.2rem'
    },
    controls: {
        display: 'flex', gap: '10px', width: '100%', maxWidth: '400px',
        background: '#333', padding: '20px', borderRadius: '10px'
    },
    input: {
        flex: 1, padding: '12px', borderRadius: '5px', border: 'none',
        fontSize: '1rem', color: 'black', backgroundColor: 'white' // High contrast
    },
    button: {
        padding: '12px 20px', borderRadius: '5px', border: 'none',
        backgroundColor: '#2196F3', color: 'white', fontSize: '1rem',
        cursor: 'pointer', fontWeight: 'bold'
    }
};