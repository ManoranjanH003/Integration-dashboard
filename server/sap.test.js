import test from 'node:test';
import assert from 'node:assert/strict';
import {createSap,sapDate,message} from './sap.js';
import {createPoller} from './poller.js';
import {loadConfig} from './config.js';
const config={base:'https://tenant.example/api/v1/',tokenUrl:'https://auth.example/oauth/token',clientId:'id',clientSecret:'secret',timeout:1000,maxPages:3,maxMessages:5,hours:24,pollMs:30000,mode:'sap'};
test('SAP dates, UTC dates and in-progress durations',()=>{
  assert.equal(sapDate('/Date(0+0000)/'),'1970-01-01T00:00:00.000Z');
  assert.equal(sapDate('2026-01-01T00:00:00'),'2026-01-01T00:00:00.000Z');
  assert.equal(sapDate('invalid'),null);assert.equal(message({LogStart:'/Date(0)/'}).durationMs,null);
});
test('OAuth single flight, continuation and normalization',async()=>{
  let tokens=0;
  const client=createSap(config,async(url,opts)=>{
    const u=String(url);
    if(u===config.tokenUrl){tokens++;assert.equal(opts.method,'POST');assert.match(opts.headers.Authorization,/^Basic /);return Response.json({access_token:'token',expires_in:3600});}
    assert.equal(opts.headers.Authorization,'Bearer token');
    if(u.includes('IntegrationRuntimeArtifacts'))return Response.json({d:{results:[{Id:'a',DeployedOn:'/Date(0)/'}]}});
    if(u.includes('skiptoken'))return Response.json({d:{results:[{MessageGuid:'b',Status:'FAILED'}]}});
    return Response.json({d:{results:[{MessageGuid:'a',Status:'COMPLETED'}],__next:'?skiptoken=2'}});
  });
  const data=await client.snapshot();assert.equal(tokens,1);assert.equal(data.messages.length,2);assert.equal(data.artifacts[0].deployedAt,'1970-01-01T00:00:00.000Z');
});
test('cross-origin continuation never receives token',async()=>{
  const calls=[];
  const client=createSap(config,async(url)=>{calls.push(String(url));return String(url)===config.tokenUrl?Response.json({access_token:'t',expires_in:3600}):Response.json({d:{results:[],__next:'https://evil.example/steal'}});});
  await assert.rejects(()=>client.snapshot(),/Rejected/);assert.ok(calls.every(u=>!u.includes('evil')));
});
test('401 refreshes token once; further 401 fails',async()=>{
  let tokens=0,api=0;
  const client=createSap(config,async url=>String(url)===config.tokenUrl?(tokens++,Response.json({access_token:'t',expires_in:3600})):(api++,new Response('',{status:401})));
  await assert.rejects(()=>client.error('a'.repeat(20)),/401/);assert.equal(tokens,2);assert.equal(api,2);
});
test('row cap explicitly reports partial results',async()=>{
  const client=createSap({...config,maxMessages:1},async url=>String(url)===config.tokenUrl?Response.json({access_token:'t',expires_in:3600}):Response.json({d:{results:[{MessageGuid:'a'},{MessageGuid:'b'}]}}));
  const data=await client.snapshot();assert.equal(data.messages.length,1);assert.equal(data.messagesTruncated,true);
});
test('last good snapshot survives a refresh failure',async()=>{
  let fail=false;
  const poller=createPoller({snapshot:async()=>{if(fail)throw Error('secret');return {messages:[{id:'a'}]};}},config);
  await poller.refresh();fail=true;await poller.refresh();assert.equal(poller.state().snapshot.messages[0].id,'a');assert.equal(poller.state().stale,true);assert.ok(!poller.state().lastError.includes('secret'));
});
test('configuration fails closed for external binding and non-HTTPS SAP',()=>{
  assert.throws(()=>loadConfig({HOST:'0.0.0.0'}),/authenticated proxy/);
  assert.throws(()=>loadConfig({DATA_MODE:'sap',SAP_API_BASE_URL:'http://tenant/',SAP_TOKEN_URL:config.tokenUrl,SAP_CLIENT_ID:'id',SAP_CLIENT_SECRET:'secret'}),/HTTPS/);
});
