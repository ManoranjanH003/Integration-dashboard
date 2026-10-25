import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {loadConfig} from './config.js';
import {createSap} from './sap.js';
import {createDemo} from './demo.js';
import {createPoller} from './poller.js';
const config=loadConfig();
const source=config.mode==='demo'?createDemo(config):createSap(config);
const poller=createPoller(source,config);
const app=express(); app.disable('x-powered-by');
app.use(helmet());
app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.get('/api/health',(_req,res)=>{const s=poller.state();res.status(s.stale?503:200).json({mode:s.mode,ready:!s.stale,updatedAt:s.snapshot?.updatedAt??null});});
app.get('/api/dashboard',(_req,res)=>res.json(poller.state()));
const errors=new Map();
app.get('/api/messages/:id/error',async(req,res)=>{
  const {id}=req.params;
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) return res.status(400).json({error:'Invalid message ID'});
  const row=poller.state().snapshot?.messages.find(m=>m.id===id);
  if (!row) return res.status(404).json({error:'Message is outside the current snapshot'});
  if (!['FAILED','RETRY','ESCALATED'].includes(row.status)) return res.json({text:'No error details requested for this status.'});
  try {
    let entry=errors.get(id);
    if (!entry || entry.until<Date.now()) {
      if (errors.size>=200) errors.delete(errors.keys().next().value);
      entry={until:Date.now()+config.errorCacheMs,promise:source.error(id)};errors.set(id,entry);
    }
    const text=await entry.promise;
    res.json({text:text || 'No error information is available. It may have expired or was not recorded.'});
  } catch {errors.delete(id);res.status(502).json({error:'Could not read SAP error details. Check permissions, availability and retention.'});}
});
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found'}));
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
if(existsSync(dist)) {app.use(express.static(dist));app.get('/',(_req,res)=>res.sendFile(`${dist}/index.html`));}
app.use((err,req,res,next)=>{res.status(500).json({error:'Internal server error'});});
const server=app.listen(config.port,config.host,()=>{console.log(`CPI dashboard API: http://${config.host}:${config.port} (${config.mode})`);poller.start();});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{poller.stop();server.close(()=>process.exit(0));});
