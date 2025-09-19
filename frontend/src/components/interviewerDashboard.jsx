import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";

const BACKEND = "http://localhost:5000";

export default function InterviewerDashboard(){
  const [alerts, setAlerts] = useState([]);
  const [candidate, setCandidate] = useState("Chhavi");
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(BACKEND);
    socketRef.current.on("connect", () => console.log("Socket connected (interviewer)"));
    socketRef.current.on("candidate_event", (payload) => {
      setAlerts(a => [payload, ...a]);
    });
    return () => socketRef.current.disconnect();
  }, []);

  async function fetchReport(){
    try{
      const res = await axios.get(`${BACKEND}/api/proctor/report/${candidate}`);
      alert(`Fetched ${res.data.length} logs for ${candidate}. Check console.`);
      console.log(res.data);
    }catch(e){
      alert("Fetch failed: "+e.message);
    }
  }

  async function downloadPdf(){
    try{
      const res = await axios.get(`${BACKEND}/api/proctor/report/${candidate}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${candidate}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }catch(e){
      alert("PDF download failed: "+e.message);
    }
  }

  return (
    <div>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <input value={candidate} onChange={e=>setCandidate(e.target.value)} />
        <button onClick={fetchReport}>Fetch Report</button>
        <button onClick={downloadPdf}>Download PDF</button>
      </div>

      <h4 style={{marginTop:12}}>Real-time Alerts</h4>
      <div className="log" style={{height:300}}>
        {alerts.map((a,i)=>(
          <div key={i}>{a.timestamp} | {a.candidateName} | {a.eventType}</div>
        ))}
      </div>
    </div>
  );
}
