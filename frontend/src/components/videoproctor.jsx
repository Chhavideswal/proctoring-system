import React, { useEffect, useRef, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs";
import io from "socket.io-client";
import axios from "axios";

const BACKEND = "http://localhost:5000"; // change if backend runs elsewhere

export default function VideoProctor() {
  const videoRef = useRef(null);
  const hiddenCanvasRef = useRef(null); // for TF detection
  const overlayRef = useRef(null); // drawing overlays from FaceMesh
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({ lookingAway:0, absence:0, phone:0, notes:0, multiFace:0 });
  const socketRef = useRef(null);
  const modelRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  const candidateName = "Chhavi"; // make dynamic as needed

  // cooldown for repeating same logs too often
  const lastLogTimes = useRef({});

  useEffect(() => {
    // connect socket (used to notify interviewer instantly)
    socketRef.current = io(BACKEND);
    socketRef.current.on("connect", () => addLog("Connected to socket server"));
    socketRef.current.on("disconnect", () => addLog("Socket disconnected"));

    // load coco-ssd
    cocoSsd.load().then(model => {
      modelRef.current = model;
      addLog("Object detection model loaded (coco-ssd)");
    }).catch(e => addLog("Coco load error: "+e.message));

    // init camera and mediapipe
    startCamera();

    return () => {
      if(cameraRef.current && cameraRef.current.stop) cameraRef.current.stop();
      if(socketRef.current) socketRef.current.disconnect();
    };
    // eslint-disable-next-line
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // init MediaPipe FaceMesh (available via CDN script in index.html)
      if(window.FaceMesh && window.Camera) {
        const fm = new window.FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        fm.setOptions({ maxNumFaces: 2, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        fm.onResults(onFaceResults);
        faceMeshRef.current = fm;

        // use provided Camera util so FaceMesh receives frames
        cameraRef.current = new window.Camera(videoRef.current, {
          onFrame: async () => { await fm.send({ image: videoRef.current }); },
          width: 1280,
          height: 720
        });
        cameraRef.current.start();
      } else {
        addLog("MediaPipe not available. Ensure CDN script included.");
        // fallback: still run object detection loop
        runObjectLoop();
      }
      // start periodic object detection loop regardless
      runObjectLoop();
    } catch (e) {
      addLog("Camera error: " + e.message);
    }
  }

  // throttle map for object detection
  const lastObj = useRef(0);
  async function runObjectLoop() {
    if(!videoRef.current) return;
    const now = Date.now();
    if(!modelRef.current) {
      setTimeout(runObjectLoop, 500);
      return;
    }
    if(now - lastObj.current < 700) {
      requestAnimationFrame(runObjectLoop);
      return;
    }
    lastObj.current = now;
    // draw current frame onto hidden canvas
    try {
      const c = hiddenCanvasRef.current;
      const w = videoRef.current.videoWidth || 640;
      const h = videoRef.current.videoHeight || 480;
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0, w, h);
      const preds = await modelRef.current.detect(c);
      handleObjectDetections(preds);
    } catch (e) {
      console.warn("object loop error", e);
    }
    requestAnimationFrame(runObjectLoop);
  }

  function onFaceResults(results) {
    const faces = results.multiFaceLandmarks || [];
    // overlay draw
    const overlay = overlayRef.current;
    if(overlay) {
      overlay.width = results.image.width;
      overlay.height = results.image.height;
      const ctx = overlay.getContext("2d");
      ctx.clearRect(0,0,overlay.width, overlay.height);
      ctx.fillStyle = "rgba(0,255,0,0.9)";
      faces.forEach(landmarks => {
        // mark nose tip approx (landmark index 1)
        if(landmarks[1]) {
          const nx = landmarks[1].x * overlay.width;
          const ny = landmarks[1].y * overlay.height;
          ctx.beginPath(); ctx.arc(nx, ny, 4, 0, Math.PI*2); ctx.fill();
        }
      });
    }

    // multiple faces
    if(faces.length > 1) {
      addLogIfCooldown("Multiple faces detected", 4000);
      incrementCount("multiFace");
      sendEventToServer("Multiple faces detected");
    }

    // absence
    if(faces.length === 0) {
      addLogIfCooldown("Face not detected", 1500);
      incrementCount("absence");
      sendEventToServer("Face not detected");
      return;
    }

    // gaze heuristic using nose.x (normalized 0..1) relative to 0.5 center
    const primary = faces[0];
    // index 1 is approximate nose tip in MediaPipe's mesh
    const nose = primary[1] || primary[4] || primary[0];
    if(nose) {
      const diff = nose.x - 0.5;
      if(Math.abs(diff) > 0.12) { // tuned threshold for demo
        addLogIfCooldown("Looking away from screen", 2000);
        incrementCount("lookingAway");
        sendEventToServer("Looking away from screen");
      }
    }

    // also run object detection once here (for faster detection when faces present)
    // object detection loop is already running; nothing else needed
  }

  function handleObjectDetections(preds=[]) {
    for(const p of preds) {
      if(p.score < 0.6) continue;
      const cls = p.class.toLowerCase();
      if(cls.includes("cell phone") || cls.includes("phone") || cls.includes("mobile")) {
        addLogIfCooldown(`Phone detected (${Math.round(p.score*100)}%)`, 4000);
        incrementCount("phone");
        sendEventToServer(`Phone detected (${p.class})`);
      }
      if(cls.includes("book") || cls.includes("notebook") || cls.includes("paper")) {
        addLogIfCooldown(`Notes/book detected (${Math.round(p.score*100)}%)`, 4000);
        incrementCount("notes");
        sendEventToServer(`Notes/book detected (${p.class})`);
      }
      if(cls.includes("laptop")) {
        // optional: treat laptop as allowed/unallowed depending on rules; here we log it
        addLogIfCooldown(`Laptop detected (${Math.round(p.score*100)}%)`, 4000);
        sendEventToServer(`Laptop detected (${p.class})`);
      }
    }
  }

  function addLog(text) {
    const ts = new Date().toISOString();
    setLogs(l => [{ timestamp: ts, text }, ...l].slice(0,500));
  }
  function addLogIfCooldown(text, cooldown=3000) {
    const now = Date.now();
    if((lastLogTimes.current[text] || 0) + cooldown < now) {
      addLog(text);
      lastLogTimes.current[text] = now;
    }
  }
  function incrementCount(key) {
    setCounts(c => ({ ...c, [key]: (c[key]||0) + 1 }));
  }

  // send event to backend and also emit socket
  async function sendEventToServer(eventText) {
    const payload = { candidateName, eventType: eventText, timestamp: new Date().toISOString() };
    // POST to backend
    axios.post(`${BACKEND}/api/proctor/event`, payload).catch(e => console.warn("post failed", e.message));
    // emit socket for immediate alert
    if(socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("candidate_event", payload);
    }
  }

  return (
    <div>
      <div className="grid">
        <div className="videoWrap">
          <video ref={videoRef} playsInline muted autoPlay />
          <canvas className="overlay" ref={overlayRef} style={{width:'100%', height:'100%'}} />
          <canvas ref={hiddenCanvasRef} style={{display:'none'}} />
          <div className="controls">
            <div className="badge">Candidate: {candidateName}</div>
            <div className="small">Object model: {modelRef.current ? "loaded" : "loading..."}</div>
            <div className="small">FaceMesh: {faceMeshRef.current ? "ready" : "loading..."}</div>
          </div>
        </div>

        <div>
          <h4>Event Log</h4>
          <div className="log">
            {logs.map((l, i) => <div key={i}>{l.timestamp} | {l.text}</div>)}
          </div>
          <div style={{marginTop:12}}>
            <strong>Counts:</strong>
            <div>Looking away: {counts.lookingAway || 0}</div>
            <div>Absence: {counts.absence || 0}</div>
            <div>Phone: {counts.phone || 0}</div>
            <div>Notes: {counts.notes || 0}</div>
            <div>Multiple Faces: {counts.multiFace || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
