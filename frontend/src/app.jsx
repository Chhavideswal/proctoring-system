import React, { useState } from "react";
import VideoProctor from "./components/VideoProctor";
import InterviewerDashboard from "./components/InterviewerDashboard";

export default function App() {
  const [view, setView] = useState("candidate"); // 'candidate' or 'interviewer'
  return (
    <div className="container">
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Focus & Object Detection — Proctoring</h2>
        <div>
          <button onClick={() => setView("candidate")} style={{marginRight:8}}>Candidate</button>
          <button onClick={() => setView("interviewer")}>Interviewer</button>
        </div>
      </header>
      <hr />
      {view === "candidate" ? <VideoProctor /> : <InterviewerDashboard />}
    </div>
  );
}
