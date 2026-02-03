"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";

// REPLACE WITH YOUR RENDER URL
const socket = io("https://my-video-server.onrender.com"); 

export default function Home() {
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [me, setMe] = useState("");
  const [callUser, setCallUser] = useState("");
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle");
  const [isCopied, setIsCopied] = useState(false); 
  
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();
  const streamRef = useRef(); 

  const addLog = (message) => {
    console.log(message);
    // Logs are hidden from UI but useful for debugging if needed
  };

  const answerCall = (data, callerId) => {
    setCallAccepted(true);
    setStatus("connected");
    
    if (!streamRef.current) {
        console.error("Camera not ready.");
        return;
    }

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
      socket.emit("answerCall", { signal: signal, to: callerId });
    });

    peer.on("stream", (currentStream) => {
      setRemoteStream(currentStream);
    });

    peer.signal(data.signal);
    connectionRef.current = peer;
  };

  const callId = (id) => {
    if (!id) return alert("Please enter an ID");
    
    if (!streamRef.current) {
        alert("Camera not ready yet.");
        return;
    }

    setStatus("calling");

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
      setRemoteStream(currentStream);
    });

    socket.on("callAccepted", (signal) => {
      setCallAccepted(true);
      setStatus("connected");
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  const copyLink = () => {
    const link = `${window.location.origin}?call=${me}`;
    navigator.clipboard.writeText(link);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); 
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCallId = params.get('call');
    if (urlCallId) {
        setCallUser(urlCallId);
    }

    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" }, 
        audio: true 
    })
      .then((currentStream) => {
        setStream(currentStream);
        streamRef.current = currentStream; 
        if (myVideo.current) {
            myVideo.current.srcObject = currentStream;
        }
      })
      .catch((err) => console.error(err));

    socket.on("connect", () => setMe(socket.id));

    socket.on("callUser", (data) => {
      setCallUser(data.from);
      setName(data.name);
      setStatus("incoming");
      answerCall(data, data.from); 
    });

    socket.on("callFailed", () => {
        setStatus("failed");
        alert("User is offline or wrong ID.");
    });

    return () => {
        socket.off("connect");
        socket.off("callUser");
        socket.off("callFailed");
    };
  }, []);

  useEffect(() => {
    if (stream && me && callUser && status === "idle") {
        const params = new URLSearchParams(window.location.search);
        if (params.get('call') === callUser) {
             callId(callUser);
        }
    }
  }, [stream, me, callUser, status]);

  useEffect(() => {
    if (stream && myVideo.current) myVideo.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (remoteStream && userVideo.current) userVideo.current.srcObject = remoteStream;
  }, [remoteStream, callAccepted]);

  // --- NEW RENDER LOGIC ---
  return (
    <div style={styles.container}>
      {/* 1. Main Video Layer (Full Screen) */}
      <div style={styles.fullScreenVideo}>
         {callAccepted && !callEnded && remoteStream ? (
             /* CONNECTED: Show Guest Full Screen */
            <video playsInline ref={userVideo} autoPlay style={styles.videoObj} />
         ) : stream ? (
             /* WAITING: Show Me Full Screen */
            <video playsInline muted ref={myVideo} autoPlay style={styles.videoObj} />
         ) : (
            <div style={styles.placeholder}>Loading Camera...</div>
         )}
      </div>

      {/* 2. Floating Video Layer (Picture-in-Picture) */}
      {callAccepted && !callEnded && stream && (
          <div style={styles.floatingVideo}>
              <video playsInline muted ref={myVideo} autoPlay style={styles.videoObj} />
          </div>
      )}

      {/* 3. Controls Overlay (Bottom) */}
      <div style={styles.controlsOverlay}>
          <h1 style={styles.title}>Lets Do a Call</h1>
          
          {/* Status Badge */}
          <div style={styles.statusBadge}>
            Status: {status.toUpperCase()}
          </div>

          {!callAccepted && (
            <div style={styles.controlBox}>
                <div style={styles.copyContainer}>
                    <span style={styles.idText}>ID: {me ? me.substr(0,5) + "..." : "..."}</span>
                    <button onClick={copyLink} style={styles.miniBtn}>{isCopied ? "Copied" : "Copy Link"}</button>
                </div>
                
                <div style={styles.inputGroup}>
                    <input 
                        type="text" 
                        placeholder="Enter ID..." 
                        value={callUser} 
                        onChange={(e) => setCallUser(e.target.value)} 
                        style={styles.input}
                    />
                    <button onClick={() => callId(callUser)} style={styles.joinBtn}>
                        {callUser ? "Join" : "Call"}
                    </button>
                </div>
            </div>
          )}
      </div>
    </div>
  );
}

// --- NEW MOBILE-FIRST STYLES ---
const styles = {
    container: { 
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
        backgroundColor: '#000', overflow: 'hidden' 
    },
    
    // Video Layers
    fullScreenVideo: {
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
        zIndex: 1 
    },
    floatingVideo: {
        position: 'absolute', top: '20px', right: '20px', 
        width: '100px', height: '150px', 
        backgroundColor: '#333', borderRadius: '10px', overflow: 'hidden', 
        zIndex: 10, border: '2px solid rgba(255,255,255,0.2)', 
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
    },
    videoObj: { 
        width: '100%', height: '100%', objectFit: 'cover', 
        transform: 'scaleX(-1)' // Mirror effect
    },
    placeholder: {
        width: '100%', height: '100%', display: 'flex', 
        alignItems: 'center', justifyContent: 'center', color: '#555'
    },

    // UI Overlay
    controlsOverlay: {
        position: 'absolute', bottom: 0, left: 0, width: '100%', 
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', 
        padding: '20px', paddingBottom: '40px', zIndex: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px'
    },
    title: {
        margin: 0, color: 'white', fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)'
    },
    statusBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: '5px 10px', 
        borderRadius: '20px', fontSize: '0.8rem', color: '#ddd'
    },
    controlBox: {
        width: '100%', maxWidth: '350px', backgroundColor: 'rgba(20,20,20,0.8)', 
        borderRadius: '15px', padding: '15px', backdropFilter: 'blur(10px)'
    },
    copyContainer: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '10px'
    },
    idText: { fontSize: '0.9rem', color: '#aaa', fontFamily: 'monospace' },
    miniBtn: {
        backgroundColor: '#333', color: 'white', border: 'none', 
        padding: '5px 10px', borderRadius: '5px', fontSize: '0.7rem', cursor: 'pointer'
    },
    inputGroup: { display: 'flex', gap: '10px' },
    input: {
        flex: 1, padding: '12px', borderRadius: '8px', border: 'none', 
        outline: 'none', fontSize: '1rem', background: '#333', color: 'white'
    },
    joinBtn: {
        padding: '0 20px', borderRadius: '8px', border: 'none', 
        backgroundColor: '#007AFF', color: 'white', fontWeight: 'bold', 
        fontSize: '1rem', cursor: 'pointer'
    }
};