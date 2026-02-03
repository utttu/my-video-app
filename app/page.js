"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";

// REPLACE WITH YOUR RENDER URL
const SERVER_URL = "https://my-video-server.onrender.com";
const socket = io(SERVER_URL);

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
  
  // UI & Dragging State
  const [uiVisible, setUiVisible] = useState(true);
  const [dragPos, setDragPos] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  
  // Status Messages
  const [endStatus, setEndStatus] = useState(""); 
  
  const dragOffset = useRef({ x: 0, y: 0 });
  const uiTimer = useRef(null);

  // Recording Refs
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();
  const streamRef = useRef();

  // --- NEW: ROBUST CODEC SELECTOR ---
  const getSupportedMimeType = () => {
    // List of combinations to try (Video + Audio codecs)
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus", // FIX: Explicitly add opus for audio
      "video/webm;codecs=h264,opus",
      "video/mp4",
      "video/webm" // Generic fallback
    ];

    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        console.log(`Using supported codec: ${type}`);
        return type;
      }
    }
    console.warn("No specific codec supported, using browser default.");
    return ""; // Return empty string to let browser use its default
  };

  // --- RECORDING & UPLOAD ---

  const startRecording = (streamToRecord) => {
    // Safety check: Does the stream have tracks?
    if (!streamToRecord || streamToRecord.getTracks().length === 0) {
        console.error("Cannot start recording: Stream is empty");
        return;
    }

    try {
        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : undefined;
        
        let mediaRecorder;
        
        try {
            mediaRecorder = new MediaRecorder(streamToRecord, options);
        } catch (e) {
            console.warn("Codec failed, trying default browser settings...", e);
            // Fallback: Try without ANY options (Browser Default)
            mediaRecorder = new MediaRecorder(streamToRecord);
        }

        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = []; 

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log("Recorder stopped. Uploading...");
            uploadRecording(); 
        };

        // Capture every 1 second
        mediaRecorder.start(1000); 
        console.log("Recording started successfully.");
    } catch (err) {
        console.error("CRITICAL RECORDING ERROR:", err);
        setEndStatus("Recording System Failed: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
    } else {
        if (chunksRef.current.length > 0) {
            uploadRecording();
        } else {
             setEndStatus("Call Ended (No recording saved).");
        }
    }
  };

  const uploadRecording = async () => {
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    const sizeKB = (blob.size / 1024).toFixed(2);
    
    if (blob.size <= 0) {
        setEndStatus("Call Ended. (Recording was empty)");
        return;
    }

    setEndStatus(`Saving Call (${sizeKB} KB)...`);

    try {
        const response = await fetch(`${SERVER_URL}/upload`, {
            method: "POST",
            body: blob
        });

        if (response.ok) {
            setEndStatus("✅ Call Saved Successfully");
        } else {
            const errText = await response.text();
            setEndStatus("❌ Server Error: " + errText);
        }
    } catch (error) {
        console.error("Upload error:", error);
        setEndStatus("❌ Network Error: " + error.message);
    }
  };

  // --- UNIFIED END CALL LOGIC ---
  const handleCallEnd = () => {
      if (callEnded) return;
      
      setCallEnded(true);
      setEndStatus("Ending Call...");
      
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if(connectionRef.current) connectionRef.current.destroy();

      stopRecording();
  };

  // --- UI INTERACTION ---

  const showUi = () => {
    setUiVisible(true);
    if (uiTimer.current) clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => {
        if (callAccepted && !callEnded) setUiVisible(false);
    }, 4000); 
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    dragOffset.current = {
        x: clientX - (window.innerWidth - dragPos.x - 100), 
        y: clientY - dragPos.y
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    e.preventDefault(); 
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    const newX = window.innerWidth - (clientX - dragOffset.current.x) - 100;
    const newY = clientY - dragOffset.current.y;
    setDragPos({ x: newX, y: newY });
  };

  const handlePointerUp = () => setIsDragging(false);

  // --- CALL LOGIC ---

  const answerCall = (data, callerId) => {
    setCallAccepted(true);
    setStatus("connected");
    showUi(); 
    
    if (!streamRef.current) return console.error("Camera not ready.");

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
      startRecording(currentStream);
    });
    
    peer.on("close", () => {
        handleCallEnd();
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
      startRecording(currentStream);
    });

    peer.on("close", () => {
        handleCallEnd();
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
    showUi(); 
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
    
    socket.on("callEnded", () => {
        handleCallEnd();
    });

    return () => {
        socket.off("connect");
        socket.off("callUser");
        socket.off("callEnded");
    };
  }, []);

  useEffect(() => {
    if (stream && me && callUser && status === "idle") {
        const params = new URLSearchParams(window.location.search);
        if (params.get('call') === callUser) callId(callUser);
    }
  }, [stream, me, callUser, status]);

  useEffect(() => {
    if (stream && myVideo.current) myVideo.current.srcObject = stream;
  }, [stream, callAccepted, callEnded]);

  useEffect(() => {
    if (remoteStream && userVideo.current) userVideo.current.srcObject = remoteStream;
  }, [remoteStream, callAccepted]);

  // --- RENDER: CALL ENDED SCREEN ---
  if (callEnded) {
      return (
          <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100vh', backgroundColor: '#1a1a1a', color: 'white', textAlign: 'center'
          }}>
              <h1 style={{fontSize: '2rem', marginBottom: '20px'}}>Call Ended</h1>
              <div style={{
                  padding: '20px', borderRadius: '10px', 
                  backgroundColor: '#333', fontSize: '1.2rem', marginBottom: '30px'
              }}>
                  {endStatus || "Processing..."}
              </div>
              <p style={{color: '#888'}}>Refresh the page to start a new call.</p>
          </div>
      );
  }

  return (
    <div 
        style={styles.container} 
        onClick={showUi} 
        onMouseMove={isDragging ? handlePointerMove : showUi}
        onTouchMove={isDragging ? handlePointerMove : showUi}
        onMouseUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
    >
      <div style={styles.fullScreenVideo}>
         {callAccepted && !callEnded && remoteStream ? (
            <video playsInline ref={userVideo} autoPlay style={styles.videoObjRemote} />
         ) : stream ? (
            <video playsInline muted ref={myVideo} autoPlay style={styles.videoObj} />
         ) : (
            <div style={styles.placeholder}>Loading Camera...</div>
         )}
      </div>

      {callAccepted && !callEnded && stream && (
          <div 
            style={{ ...styles.floatingVideo, top: dragPos.y, right: dragPos.x, cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
          >
              <video playsInline muted ref={myVideo} autoPlay style={styles.videoObj} />
          </div>
      )}

      <div style={{ ...styles.controlsOverlay, opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? 'all' : 'none' }}>
          <h1 style={styles.title}>Lets Do a Call</h1>
          
          <div style={styles.statusBadge}>
            Status: {status.toUpperCase()}
          </div>
          
          {!callAccepted ? (
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
                        onClick={(e) => e.stopPropagation()} 
                        style={styles.input}
                    />
                    <button onClick={(e) => { e.stopPropagation(); callId(callUser); }} style={styles.joinBtn}>
                        {callUser ? "Join" : "Call"}
                    </button>
                </div>
            </div>
          ) : (
             <button onClick={handleCallEnd} style={{...styles.joinBtn, backgroundColor: 'red', marginTop: '20px'}}>
                 End Call
             </button>
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
        touchAction: 'none'
    },
    videoObj: { 
        width: '100%', height: '100%', objectFit: 'cover', 
        transform: 'scaleX(-1)' 
    },
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
        transition: 'opacity 0.5s ease-in-out'
    },
    title: {
        margin: 0, color: 'white', fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)'
    },
    statusBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: '5px 10px', 
        borderRadius: '20px', fontSize: '0.8rem', color: '#ddd', display: 'flex', alignItems: 'center'
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