export function createPoller(source, config) {
  let snapshot=null, lastError=null, lastAttempt=null, pending=null, timer, stopped=false, failures=0;
  async function refresh() {
    if (pending) return pending;
    lastAttempt=new Date().toISOString();
    pending=(async()=>{
      try {const data=await source.snapshot(); snapshot={...data,updatedAt:new Date().toISOString()};lastError=null;failures=0;}
      catch {lastError='SAP refresh failed. Check server connectivity, API permissions and credentials.';failures++;console.warn(JSON.stringify({event:'refresh_failed',at:new Date().toISOString()}));}
    })().finally(()=>{pending=null;});
    return pending;
  }
  async function tick() {
    await refresh();
    if (!stopped) timer=setTimeout(tick, Math.min(config.pollMs*2**Math.min(failures,4),300000)+Math.floor(Math.random()*1000));
  }
  return {start:()=>{stopped=false;void tick();},stop:()=>{stopped=true;clearTimeout(timer);},refresh,
    state:()=>({mode:config.mode,pollIntervalMs:config.pollMs,lastAttempt,lastError,stale:!snapshot || Boolean(lastError) || Date.now()-Date.parse(snapshot.updatedAt)>config.pollMs*2,snapshot})};
}
