import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
const time=v=>v?new Date(v).toLocaleString(): '—';
function Badge({value}) {return <span className={`badge ${value?.toLowerCase()}`}>{value || 'UNKNOWN'}</span>;}
function App() {
  const [data,setData]=useState(null),[network,setNetwork]=useState(''),[filter,setFilter]=useState('ALL'),[flow,setFlow]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[detail,setDetail]=useState(''),[paused,setPaused]=useState(false);
  useEffect(()=>{
    let alive=true,timer,controller;
    async function load() {
      controller=new AbortController();
      try {const r=await fetch('/api/dashboard',{signal:controller.signal});if(!r.ok)throw Error();const body=await r.json();if(alive){setData(body);setNetwork('');}}
      catch(e){if(alive && e.name!=='AbortError')setNetwork('Dashboard connection lost. Showing the last received snapshot.');}
      if(alive && !paused)timer=setTimeout(load,15000);
    }
    void load();return()=>{alive=false;clearTimeout(timer);controller?.abort();};
  },[paused]);
  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();setDetail('Loading error details…');
    fetch(`/api/messages/${encodeURIComponent(selected.id)}/error`,{signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error);return body;}).then(b=>setDetail(b.text)).catch(e=>{if(e.name!=='AbortError')setDetail(e.message);});
    return()=>controller.abort();
  },[selected]);
  const snap=data?.snapshot, messages=snap?.messages || [], artifacts=snap?.artifacts || [];
  const shown=messages.filter(m=>(filter==='ALL'||m.status===filter)&&(!flow||m.flow===flow)&&`${m.id} ${m.flow} ${m.correlationId || ''}`.toLowerCase().includes(query.toLowerCase()));
  const counts=messages.reduce((o,m)=>({...o,[m.status]:(o[m.status]||0)+1}),{});
  return <main>
    <header><div><div className="eyebrow">INTEGRATION OPERATIONS</div><h1>Cloud Integration Monitor</h1><p>Deployment inventory and message processing activity</p></div><div className="live"><Badge value={data?.mode==='demo'?'DEMO':'SAP'}/><button onClick={()=>setPaused(!paused)}>{paused?'Resume updates':'Pause updates'}</button></div></header>
    {data?.mode==='demo'&&<aside className="notice">Demo workspace · all interfaces, messages and errors shown here are synthetic.</aside>}
    {(network || data?.stale || paused)&&<aside role="status" className="warning">{network || (paused?'Browser updates paused.':data?.lastError || 'Waiting for a fresh SAP snapshot…')}</aside>}
    <div className="meta">Last successful refresh: {time(snap?.updatedAt)} · Server poll: {(data?.pollIntervalMs || 30000)/1000}s · All times in your browser’s timezone</div>
    <section className="cards" aria-label="Snapshot statistics">{[['Runtime artifacts',artifacts.length],['Messages loaded',messages.length],['Completed',counts.COMPLETED||0],['Failed',counts.FAILED||0],['Retry',counts.RETRY||0]].map(([label,n])=><article key={label}><small>{label}</small><strong>{n}</strong></article>)}</section>
    <section><div className="sectionhead"><h2>Deployed interfaces</h2><span>Current runtime inventory</span></div>{snap?.artifactsTruncated&&<p className="warning">Inventory is partial: SAP continuation page limit reached.</p>}<div className="scroll"><table><thead><tr><th>Interface</th><th>Type</th><th>Version</th><th>Runtime status</th><th>Deployed at</th></tr></thead><tbody>{artifacts.map(a=><tr key={a.id}><td><b>{a.name}</b><small className="sub">{a.id}</small></td><td>{a.type}</td><td>{a.version}</td><td><Badge value={a.status}/></td><td>{time(a.deployedAt)}</td></tr>)}</tbody></table></div>{!artifacts.length&&<p>No deployed artifacts available.</p>}</section>
    <section><div className="sectionhead"><h2>Message logs</h2><span>{shown.length} of {messages.length} loaded</span></div><p className="meta">Window: {time(snap?.from)} → {time(snap?.to)}. Counts cover loaded records only.</p>
    {snap?.messagesTruncated&&<p className="warning">Message results are partial. Increase MAX_MESSAGES / MAX_PAGES or reduce LOOKBACK_HOURS.</p>}
    <div className="filters"><label>Status<select value={filter} onChange={e=>setFilter(e.target.value)}>{['ALL',...new Set(messages.map(m=>m.status))].map(s=><option key={s}>{s}</option>)}</select></label><label>Interface<select value={flow} onChange={e=>setFlow(e.target.value)}><option value="">All interfaces</option>{[...new Set(messages.map(m=>m.flow))].sort().map(f=><option key={f}>{f}</option>)}</select></label><label className="search">Search<input placeholder="Interface, message ID or correlation ID" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="scroll"><table><thead><tr><th>Interface / message ID</th><th>Status</th><th>Started</th><th>Ended</th><th>Duration</th><th>Details</th></tr></thead><tbody>{shown.map(m=><tr key={m.id}><td><b>{m.flow}</b><code className="sub">{m.id}</code>{m.correlationId&&<small className="sub">Correlation: {m.correlationId}</small>}</td><td><Badge value={m.status}/></td><td>{time(m.start)}</td><td>{time(m.end)}</td><td>{m.durationMs===null?'—':`${(m.durationMs/1000).toFixed(2)} s`}</td><td>{['FAILED','RETRY','ESCALATED'].includes(m.status)?<button onClick={()=>setSelected(m)}>View error</button>:m.status==='COMPLETED'?'Processing completed':'—'}</td></tr>)}</tbody></table></div>{!shown.length&&<p>No messages match the current filters.</p>}</section>
    <footer>COMPLETED describes CPI processing status. Confirm downstream business acceptance separately. Payloads and trace attachments are not collected.</footer>
    {selected&&<div className="overlay" onClick={()=>setSelected(null)}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e=>e.stopPropagation()}><button autoFocus onClick={()=>setSelected(null)}>Close</button><h2 id="detail-title">SAP error information</h2><p>{selected.flow} · {time(selected.start)}</p><code>{selected.id}</code><pre>{detail}</pre><p className="meta">Error text reports what SAP recorded; it may require investigation to establish the root cause. Treat logs as sensitive.</p></section></div>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
