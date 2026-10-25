export class UpstreamError extends Error {
  constructor(status, context) { super(`${context}: HTTP ${status}`); this.status = status; }
}
export function sapDate(value) {
  if (!value) return null;
  const m = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(String(value));
  const s = String(value);
  const date = m ? new Date(Number(m[1])) : new Date(/T/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? `${s}Z` : s);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export const artifact = r => ({id:r.Id,name:r.Name || r.Id,version:r.Version,status:r.Status,type:r.Type,deployedAt:sapDate(r.DeployedOn)});
export function message(r) {
  const start = sapDate(r.LogStart), end = sapDate(r.LogEnd);
  return {id:r.MessageGuid, flow:r.IntegrationFlowName || r.ArtifactName || 'Unknown', status:r.Status,
    start,end,durationMs:start && end ? Math.max(0,Date.parse(end)-Date.parse(start)) : null,
    correlationId:r.CorrelationId || null};
}
export function createSap(config, fetcher = fetch) {
  const base = new URL(config.base);
  let cached, tokenPending;
  async function token() {
    if (cached && cached.until > Date.now()) return cached.value;
    if (tokenPending) return tokenPending;
    tokenPending = (async () => {
      const response = await fetcher(config.tokenUrl, {method:'POST',redirect:'error',signal:AbortSignal.timeout(config.timeout),
        headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
        body:new URLSearchParams({grant_type:'client_credentials'})});
      if (!response.ok) throw new UpstreamError(response.status,'OAuth token request');
      const data = await response.json();
      if (!data.access_token || !(Number(data.expires_in) > 0)) throw new Error('Invalid OAuth response');
      const lifetime = Number(data.expires_in)*1000;
      cached = {value:data.access_token,until:Date.now()+lifetime-Math.min(60000,lifetime/5)};
      return cached.value;
    })().finally(()=>{tokenPending=null;});
    return tokenPending;
  }
  function safeUrl(path) {
    const u = new URL(path,base);
    if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname) || u.username || u.password || u.hash)
      throw new Error('Rejected SAP continuation URL');
    return u;
  }
  async function request(path, text = false, retry = true) {
    const u = safeUrl(path);
    const response = await fetcher(u, {redirect:'error',signal:AbortSignal.timeout(config.timeout),headers:{Authorization:`Bearer ${await token()}`,Accept:text?'text/plain':'application/json'}});
    if (response.status === 401 && retry) {cached=null; return request(path,text,false);}
    if (!response.ok) throw new UpstreamError(response.status,'SAP API request');
    return text ? response.text() : response.json();
  }
  async function collection(path, limit = Infinity) {
    const rows=[]; const seen=new Set(); let next=path, pages=0;
    while (next && pages < config.maxPages && rows.length < limit) {
      const url = safeUrl(next).href;
      if (seen.has(url)) throw new Error('Repeated SAP continuation URL');
      seen.add(url);
      const data = await request(url);
      const batch = data.d?.results ?? data.value;
      if (!Array.isArray(batch)) throw new Error('Unexpected SAP collection response');
      const room=limit-rows.length;
      rows.push(...batch.slice(0,room)); pages++;
      const continuation=data.d?.__next ?? data['@odata.nextLink'];
      // Resolve query-only and relative continuation links against the current request.
      next=continuation ? new URL(continuation,url).href : null;
      if (batch.length > room) return {rows,truncated:true};
    }
    return {rows,truncated:Boolean(next)};
  }
  return {
    async snapshot() {
      const to=new Date(), from=new Date(to-config.hours*3600000);
      const dt=d=>d.toISOString().replace(/Z$/,'');
      // Ask for one extra row so a result cap cannot silently look like a complete window.
      const query=new URLSearchParams({'$format':'json','$filter':`LogStart ge datetime'${dt(from)}' and LogStart le datetime'${dt(to)}'`,'$orderby':'LogStart desc','$top':String(config.maxMessages+1)});
      const [a,m]=await Promise.all([collection('IntegrationRuntimeArtifacts?$format=json'),collection(`MessageProcessingLogs?${query}`,config.maxMessages)]);
      return {artifacts:a.rows.map(artifact),messages:m.rows.map(message),artifactsTruncated:a.truncated,messagesTruncated:m.truncated,
        from:from.toISOString(),to:to.toISOString()};
    },
    async error(id) {
      // GUID is validated at the HTTP boundary. Encode and escape OData literals as defense in depth.
      const key=encodeURIComponent(id.replaceAll("'","''")).replaceAll("'",'%27');
      try { return (await request(`MessageProcessingLogs('${key}')/ErrorInformation/$value`,true)).slice(0,20000); }
      catch(e) {if (e.status===404 || e.status===204) return ''; throw e;}
    }
  };
}
