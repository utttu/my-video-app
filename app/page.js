"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import SimplePeer from "simple-peer";

// Connect to our signaling server
const socket = io("https://my-video-server.onrender.com");

export default function Home() {
  const [stream, setStream] = useState(null);
  const [me, setMe] = useState("");
  const [callUser, setCallUser] = useState("");
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [name, setName] = useState("");
  
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  // --- 1. DEFINE FUNCTIONS FIRST ---

  const answerCall = (data) => {
    setCallAccepted(true);
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream: stream,
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
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: stream,
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
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  // --- 2. THEN USE THEM IN USEEFFECT ---

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) {
            myVideo.current.srcObject = currentStream;
        }
      });

    socket.on("connect", () => {
        console.log("Connected with ID:", socket.id);
        setMe(socket.id);
    });

    socket.on("callUser", (data) => {
      setCallUser(data.from);
      setName(data.name);
      answerCall(data); // Now this works because answerCall exists!
    });
  }, []); 

  // ... (Return HTML stays the same) ...
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px' }}>
      <h1 style={{color: 'white'}}>Video Call Test</h1>
      
      <div style={{ display: 'flex', gap: '20px' }}>
        {/* My Video */}
        <div>
            <h3 style={{color: 'white'}}>My Video (ID: {me})</h3>
            {stream && <video playsInline muted ref={myVideo} autoPlay style={{ width: "300px", border: "2px solid white" }} />}
        </div>

        {/* User Video */}
        <div>
            <h3 style={{color: 'white'}}>Guest Video</h3>
            {callAccepted && !callEnded ? (
            <video playsInline ref={userVideo} autoPlay style={{ width: "300px", border: "2px solid green" }} />
            ) : null}
        </div>
      </div>

      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '20px' }}>
        <input 
            type="text" 
            placeholder="Paste ID here" 
            onChange={(e) => setCallUser(e.target.value)} 
            style={{ padding: '10px', marginRight: '10px', color: 'black' }}
        />
        <button 
            onClick={() => callId(callUser)}
            style={{ padding: '10px 20px', backgroundColor: 'blue', color: 'white', border: 'none', cursor: 'pointer' }}
        >
            Call ID
        </button>
      </div>
    </div>
  );
}