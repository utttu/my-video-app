"use client";
import { useEffect, useRef, useState, useCallback } from "react";
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
  
  // NEW: UI Visibility & Dragging State
  const [uiVisible, setUiVisible] = useState(true);
  const [dragPos, setDragPos] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const uiTimer = useRef(null);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();
  const streamRef = useRef();

  // --- UI INTERACTION LOGIC ---

  const showUi = () => {
    setUiVisible(true);
    if (uiTimer.current) clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => {
        // Only hide if call is connected
        if (callAccepted && !callEnded) setUiVisible(false);
    }, 4000); // Hide after 4 seconds of inactivity
  };

  const handlePointerDown = (e) => {
    // Start dragging the self-view
    setIsDragging(true);
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    
    // Calculate offset so it doesn't jump to top-left corner
    dragOffset.current = {
        x: clientX - (window.innerWidth - dragPos.x - 100), // 100 is width of box
        y: clientY - dragPos.y
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling while dragging

    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    // Calculate new Right/Top positions (sticking to right side logic from original CSS)
    const newX = window.innerWidth - (clientX - dragOffset.current.x) - 100;
    const newY = clientY - dragOffset.current.y;

    setDragPos({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // --- CALL LOGIC ---

  const answerCall = (data, callerId) => {
    setCallAccepted(true);
    setStatus("connected");
    showUi(); // Reset UI timer
    
    if (!streamRef.current) {
        console.error("Camera not ready.");
        return;
    }

    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream: streamRef.current,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
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
    if (!streamRef.current) return alert("Camera not ready yet.");

    setStatus("calling");
    showUi();

    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: streamRef.current,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
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
    showUi(); // Initialize timer

    const params = new URLSearchParams(window.location.search);
    const urlCallId = params.get('call');
    if (urlCallId) setCallUser(urlCallId);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        streamRef.current = currentStream; 
        if (myVideo.current) myVideo.current.srcObject = currentStream;
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

  // Auto-join logic
  useEffect(() => {
    if (stream && me && callUser && status === "idle") {
        const params = new URLSearchParams(window.location.search);
        if (params.get('call') === callUser) callId(callUser);
    }
  }, [stream, me, callUser, status]);

  // FIX: Force re-attach video stream when layout changes (Fixes Gray Screen)
  useEffect(() => {
    if (stream && myVideo.current) myVideo.current.srcObject = stream;
  }, [stream, callAccepted, callEnded]); // Added callAccepted dependency

  useEffect(() => {
    if (remoteStream && userVideo.current) userVideo.current.srcObject = remoteStream;
  }, [remoteStream, callAccepted]);

  return (
    <div 
        style={styles.container} 
        onClick={showUi} 
        onMouseMove={isDragging ? handlePointerMove : showUi}
        onTouchMove={isDragging ? handlePointerMove : showUi}
        onMouseUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
    >
      {/* 1. Main Video Layer (Full Screen) */}
      <div style={styles.fullScreenVideo}>
         {callAccepted && !callEnded && remoteStream ? (
            <video playsInline ref={userVideo} autoPlay style={styles.videoObjRemote} />
         ) : stream ? (
            <video playsInline muted ref={myVideo} autoPlay style={styles.videoObj} />
         ) : (
            <div style={styles.placeholder}>Loading Camera...</div>
         )}
      </div>

      {/* 2. Draggable Self-View (Picture-in-Picture) */}
      {callAccepted && !callEnded && stream && (
          <div 
            style={{ ...styles.floatingVideo, top: dragPos.y, right: dragPos.x, cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
          >
              <video playsInline muted ref={myVideo} autoPlay style={styles.videoObj} />
          </div>
      )}

      {/* 3. Controls Overlay (Fades out) */}
      <div style={{ ...styles.controlsOverlay, opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? 'all' : 'none' }}>
          <h1 style={styles.title}>Lets Do a Call</h1>
          
          <div style={styles.statusBadge}>
            Status: {status.toUpperCase()}
          </div>

          {!callAccepted && (
            <div style={styles.controlBox}>
                <div style={styles.copyContainer}>
                    <span style={styles.idText}>ID: {me ? me.substr(0,5) + "..." : "..."}</span>
                    <button onClick={(e) => { e.stopPropagation(); copyLink(); }} style={styles.miniBtn}>
                        {isCopied ? "Copied" : "Copy Link"}
                    </button>
                </div>
                
                <div style={styles.inputGroup}>
                    <input 
                        type="text" 
                        placeholder="Enter ID..." 
                        value={callUser} 
                        onChange={(e) => setCallUser(e.target.value)} 
                        onClick={(e) => e.stopPropagation()} // Prevent hiding UI when typing
                        style={styles.input}
                    />
                    <button onClick={(e) => { e.stopPropagation(); callId(callUser); }} style={styles.joinBtn}>
                        {callUser ? "Join" : "Call"}
                    </button>
                </div>
            </div>
          )}
      </div>
    </div>
  );
}

const styles = {
    container: { 
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
        backgroundColor: '#000', overflow: 'hidden', touchAction: 'none' 
    },
    fullScreenVideo: {
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
        zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#1a1a1a' 
    },
    floatingVideo: {
        position: 'absolute', 
        width: '100px', height: '150px', 
        backgroundColor: '#333', borderRadius: '10px', overflow: 'hidden', 
        zIndex: 10, border: '2px solid rgba(255,255,255,0.2)', 
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
        touchAction: 'none' // Critical for touch dragging
    },
    videoObj: { 
        width: '100%', height: '100%', objectFit: 'cover', 
        transform: 'scaleX(-1)' 
    },
    // FIX: Remote video on PC uses 'contain' to avoid massive zoom, 'cover' on mobile
    videoObjRemote: { 
        width: '100%', height: '100%', 
        objectFit: typeof window !== 'undefined' && window.innerWidth > 768 ? 'contain' : 'cover'
    },
    placeholder: {
        width: '100%', height: '100%', display: 'flex', 
        alignItems: 'center', justifyContent: 'center', color: '#555'
    },
    controlsOverlay: {
        position: 'absolute', bottom: 0, left: 0, width: '100%', 
        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', 
        padding: '20px', paddingBottom: '40px', zIndex: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px',
        transition: 'opacity 0.5s ease-in-out' // Smooth fade
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