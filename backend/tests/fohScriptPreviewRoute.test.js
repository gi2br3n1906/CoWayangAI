'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createFohBroadcaster } = require('../lib/fohBroadcaster');
const { createTestFohStore } = require('./helpers/fohStore');

async function setup(t, providerOverride, providerTimeoutMs) {
 const calls = [], published = [];
 const googleGenAi = { GoogleGenAI: class { models = { generateContent: async request => { calls.push(request); return {text: JSON.stringify(calls.length % 2 ? {vocal:true, judgments:[{cueId:'a',score:0.1},{cueId:'b',score:0.9}]} : {indonesia:'Wahai anakku',inggris:'Oh my child'})}; } }; } };
 const app=express(); app.use(express.json({limit:'12mb'}));
 const io={to:()=>({emit:(...event)=>published.push(event)})};
 const store=createTestFohStore();
 createFohBroadcaster({io,store,googleGenAi:providerOverride || googleGenAi,providerTimeoutMs,env:{GEMINI_API_KEY:'fixture-key'},authenticate:async token=>token==='owner'?{uid:'owner'}:token==='other'?{uid:'other'}:null,logger:{log(){},error(){}}}).installRoutes(app);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const sessionResponse=await fetch(`${base}/api/foh-stream/session`,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({streamKey:'script-test'})});
 assert.equal(sessionResponse.status,200); const session=await sessionResponse.json();
 return {base,session,store,calls,published};
}
const payload=()=>({
 index:{id:'fixture',revision:'v1',cues:[{id:'a',order:1,act:1,kind:'dialog',text:'Sugeng rawuh',page:1},{id:'b',order:2,act:2,kind:'sulukan',text:'Dhuh kulup',page:2},{id:'c',order:3,act:3,kind:'dialog',text:'Liyane',page:3}]},
 cursor:{scriptId:'fixture',scriptRevision:'v1',revision:1,act:1,cueId:'a',offset:0,mode:'auto'},
 config:{lookBehind:0,lookAhead:2,boundarySize:1,nextActSize:1,minScore:0.7,minMargin:0.2},
 audioBase64:Buffer.alloc(256).toString('base64'),mimeType:'audio/webm',model:'gemini-3.8-flash',
});
function send(base,token,body=payload(),owner='owner') { return fetch(`${base}/api/foh-stream/script-test/script-preview`,{method:'POST',headers:{authorization:`Bearer ${owner}`,'x-foh-token':token,'content-type':'application/json'},body:JSON.stringify(body)}); }

test('authenticated preview selects bounded script and translates without persistence or publication',async t=>{
 const {base,session,store,calls,published}=await setup(t);
 const before=await store.getOwnedStream('script-test','owner');
 const response=await send(base,session.uploadToken);
 assert.equal(response.status,200,await response.clone().text());
 const result=await response.json();
 assert.equal(result.status,'matched'); assert.equal(result.cue.id,'b');
 assert.equal(result.subtitle.jawa,'Dhuh kulup'); assert.equal(result.subtitle.indonesia,'Wahai anakku');
 assert.equal(calls.length,2); assert.ok(!JSON.stringify(calls[0].contents).includes('Liyane'));
 assert.deepEqual(await store.getOwnedStream('script-test','owner'),before); assert.equal(published.length,0);
});

test('preview rejects invalid token, wrong owner, invalid model or payload before provider',async t=>{
 const {base,session,calls}=await setup(t);
 assert.equal((await send(base,'wrong')).status,401);
 assert.equal((await send(base,session.uploadToken,payload(),'other')).status,401);
 assert.equal((await send(base,session.uploadToken,{...payload(),model:'invalid'})).status,400);
 assert.equal((await send(base,session.uploadToken,{...payload(),audioBase64:'###'})).status,400);
 assert.equal((await send(base,session.uploadToken,{...payload(),cursor:{...payload().cursor,scriptRevision:'wrong'}})).status,400);
 assert.equal((await send(base,session.uploadToken,{...payload(),config:{...payload().config,minScore:2}})).status,400);
 assert.equal(calls.length,0);
});

test('preview does not return stale results after session token rotates',async t=>{
 let release, notifyStarted; const started=new Promise(resolve=>{notifyStarted=resolve}); let n=0;
 const google={GoogleGenAI:class{models={generateContent:async()=>{n++; if(n===1){notifyStarted();await new Promise(resolve=>{release=resolve});return {text:JSON.stringify({vocal:true,judgments:[{cueId:'a',score:0.1},{cueId:'b',score:0.9}]})};}return {text:JSON.stringify({indonesia:'Wahai',inggris:'Oh'})};}}}};
 const {base,session,store}=await setup(t,google);
 const pending=send(base,session.uploadToken); await started;
 await store.createOrResume({streamKey:'script-test',ownerUid:'owner',outputs:session.outputs,tokenHash:'new-hash',now:Date.now()});
 release(); const response=await pending;
 assert.equal(response.status,401);
 assert.equal((await response.json()).subtitle,undefined);
});

test('blocks parallel previews for the same owner before another provider call',async t=>{
 let release, startedResolve; const started=new Promise(resolve=>{startedResolve=resolve}); let calls=0;
 const google={GoogleGenAI:class{models={generateContent:async()=>{calls++;if(calls===1){startedResolve();await new Promise(resolve=>{release=resolve});return {text:JSON.stringify({vocal:false,judgments:[]})};}return {text:'{}'};}}}};
 const {base,session}=await setup(t,google);
 const first=send(base,session.uploadToken); await started;
 try { const second=await send(base,session.uploadToken); assert.equal(second.status,429);assert.equal(calls,1); }
 finally { release(); await first; }
});

test('keeps the preview slot after timeout until an uncancellable provider call settles',async t=>{
 let release,startedResolve;const started=new Promise(resolve=>{startedResolve=resolve});let calls=0;
 const google={GoogleGenAI:class{models={generateContent:async()=>{calls++;startedResolve();await new Promise(resolve=>{release=resolve});return {text:JSON.stringify({vocal:false,judgments:[]})};}}}};
 const {base,session}=await setup(t,google,50);
 const first=send(base,session.uploadToken);await started;
 assert.equal((await first).status,504);
 try { assert.equal((await send(base,session.uploadToken)).status,429);assert.equal(calls,1); }
 finally { release(); }
});

test('accepts a valid 8 MiB base64 audio payload without regex overflow',async t=>{
 const {base,session}=await setup(t);
 const response=await send(base,session.uploadToken,{...payload(),audioBase64:Buffer.alloc(8*1024*1024).toString('base64')});
 assert.equal(response.status,200,await response.clone().text());
});

test('rejects preview using a modified index with the saved id and revision',async t=>{
 const {base,session,calls}=await setup(t); const body=payload();
 const saved=await fetch(`${base}/api/foh-stream/script-test/script-position`,{method:'POST',headers:{authorization:'Bearer owner','x-foh-token':session.uploadToken,'content-type':'application/json'},body:JSON.stringify({index:body.index,expectedRevision:0,action:'seek',cueId:'a'})});
 assert.equal(saved.status,200);
 const modified={...body.index,cues:body.index.cues.map(c=>c.id==='a'?{...c,text:'different'}:c)};
 assert.equal((await send(base,session.uploadToken,{...body,index:modified})).status,409);
 assert.equal(calls.length,0);
});
