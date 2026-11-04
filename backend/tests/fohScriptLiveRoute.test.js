'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createFohBroadcaster}=require('../lib/fohBroadcaster');
const {createTestFohStore}=require('./helpers/fohStore');
const provisionalIndex=require('../data/naskah-bambang-sumantri-provisional.json');

const index={id:'fixture',revision:'v1',reviewRequired:false,cues:[
 {id:'a',order:1,act:1,kind:'dialog',text:'Wong Agung rawuh',page:1},
 {id:'b',order:2,act:1,kind:'sulukan',text:'Sang Resi ngandika',page:1},
 {id:'c',order:3,act:2,kind:'dialog',text:'Raden lunga',page:2},
 {id:'d',order:4,act:2,kind:'dialog',text:'Wonten ing alas',page:2},
]};
const config={lookBehind:1,lookAhead:2,boundarySize:2,nextActSize:1,minScore:0.7,minMargin:0.2};
async function setup(t,provider){
 const store=createTestFohStore(),published=[],calls=[];
 const google=provider||{GoogleGenAI:class{models={generateContent:async request=>{calls.push(request);return {text:JSON.stringify({transcript:'live transcript',indonesia:'terjemahan lama',inggris:'legacy translation'})}}}}};
 const app=express();app.use(express.raw({type:'audio/*',limit:'8mb'}));app.use(express.json({limit:'12mb'}));
 const io={to:room=>({emit:(...args)=>published.push({room,args})})};
 createFohBroadcaster({io,store,googleGenAi:google,env:{GEMINI_API_KEY:'fixture-key'},authenticate:async token=>token==='owner'?{uid:'owner'}:null,logger:{log(){},error(){}}}).installRoutes(app);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const created=await fetch(`${base}/api/foh-stream/session`,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({streamKey:'script-live'})});
 assert.equal(created.status,200);return {base,session:await created.json(),store,calls,published};
}
const post=(base,path,token,body)=>fetch(`${base}${path}`,{method:'POST',headers:{authorization:'Bearer owner','x-foh-token':token,'content-type':'application/json'},body:JSON.stringify(body)});
const upload=(base,token,model='gemini-3.8-flash')=>fetch(`${base}/api/foh-stream/script-live/audio`,{method:'POST',headers:{authorization:'Bearer owner','x-foh-token':token,'x-foh-rms':'0.1','x-foh-model':model,'content-type':'audio/webm'},body:Buffer.alloc(256)});
async function bindScript(base,token){
 const saved=await post(base,'/api/foh-stream/script-live/script-position',token,{index,expectedRevision:0,action:'seek',cueId:'a'});
 assert.equal(saved.status,200,await saved.clone().text());
 const cursor=(await saved.json()).cursor;
 const selected=await post(base,'/api/foh-stream/script-live/subtitle-mode',token,{mode:'script'});
 assert.equal(selected.status,200,await selected.clone().text());
}

test('new streams remain in legacy mode unless script mode is explicitly enabled',async t=>{
 const {base,session,calls}=await setup(t);
 assert.equal(session.subtitleMode,'legacy');assert.equal(session.scriptIndex,null);
 const response=await upload(base,session.uploadToken);assert.equal(response.status,200);
 assert.equal((await response.json()).subtitle.jawa,'live transcript');assert.equal(calls.length,1);
});

test('script mode publishes exact selected cue, translates with selected model, and persists next cursor',async t=>{
 const requests=[];const google={GoogleGenAI:class{models={generateContent:async request=>{requests.push(request);return requests.length===1?{text:JSON.stringify({vocal:true,judgments:[{cueId:'a',score:0.05},{cueId:'b',score:0.97},{cueId:'c',score:0.01},{cueId:'d',score:0.02}]})}:{text:JSON.stringify({indonesia:'Sang Resi berbicara',inggris:'The sage speaks'})}}}}};
 const {base,session,store,published}=await setup(t,google);await bindScript(base,session.uploadToken);
 const response=await upload(base,session.uploadToken);assert.equal(response.status,200,await response.clone().text());
 const result=await response.json();assert.equal(result.subtitle.jawa,'Sang Resi ngandika');assert.equal(result.subtitle.indonesia,'Sang Resi berbicara');assert.equal(result.model,'gemini-3.8-flash');
 assert.equal(requests.length,2);assert.ok(requests.every(request=>request.model==='gemini-3.8-flash'));
 assert.equal(requests[1].contents[0].parts[0].text.includes('Sang Resi ngandika'),true);
 const saved=await store.getOwnedStream('script-live','owner');assert.equal(saved.subtitleMode,'script');assert.equal(saved.scriptCursor.cueId,'b');assert.equal(saved.scriptCursor.revision,3);
 assert.ok(published.some(item=>item.args[0]==='foh-subtitle'&&item.args[1].jawa==='Sang Resi ngandika'));
});

test('manual operator mode freezes automatic matching until resumed',async t=>{
 let calls=0;const google={GoogleGenAI:class{models={generateContent:async()=>{calls++;return {text:'{}'}}}}};
 const {base,session}=await setup(t,google);await bindScript(base,session.uploadToken);
 const cursor=await (await fetch(`${base}/api/foh-stream/script-live/script-position`,{headers:{authorization:'Bearer owner','x-foh-token':session.uploadToken}})).json();
 const manual=await post(base,'/api/foh-stream/script-live/script-position',session.uploadToken,{index,expectedRevision:cursor.cursor.revision,action:'mode',mode:'manual'});assert.equal(manual.status,200);
 const response=await upload(base,session.uploadToken);assert.equal(response.status,200);assert.equal(calls,0);const result=await response.json();assert.equal(result.scriptStatus,'manual');assert.deepEqual(result.subtitle,{jawa:'',indonesia:'',inggris:''});
 const saved=await (await fetch(`${base}/api/foh-stream/script-live/script-position`,{headers:{authorization:'Bearer owner','x-foh-token':session.uploadToken}})).json();assert.equal(saved.cursor.cueId,'a');
});

test('no confident script match clears current subtitle without advancing cue',async t=>{
 const google={GoogleGenAI:class{models={generateContent:async()=>({text:JSON.stringify({vocal:true,judgments:[{cueId:'a',score:0.2},{cueId:'b',score:0.1},{cueId:'c',score:0.1},{cueId:'d',score:0.05}]})})}}};
 const {base,session,store}=await setup(t,google);await bindScript(base,session.uploadToken);
 const response=await upload(base,session.uploadToken);assert.equal(response.status,200);
 assert.equal((await response.json()).scriptStatus,'no_match');
 const saved=await store.getOwnedStream('script-live','owner');assert.equal(saved.scriptCursor.cueId,'a');assert.deepEqual(saved.subtitle,{jawa:'',indonesia:'',inggris:'',updatedAt:saved.subtitle.updatedAt});
});

test('switching back to legacy clears script output and subsequent audio uses legacy transcription',async t=>{
 const {base,session,store,calls}=await setup(t);await bindScript(base,session.uploadToken);
 const changed=await post(base,'/api/foh-stream/script-live/subtitle-mode',session.uploadToken,{mode:'legacy'});
 assert.equal(changed.status,200,await changed.clone().text());assert.equal((await changed.json()).subtitleMode,'legacy');
 const response=await upload(base,session.uploadToken);assert.equal(response.status,200);
 assert.equal((await response.json()).subtitle.jawa,'live transcript');assert.equal(calls.length,1);
 assert.equal((await store.getOwnedStream('script-live','owner')).subtitleMode,'legacy');
});

test('legacy takeover during an in-flight script match rejects its stale translation and publication',async t=>{
 let release,startedResolve;const started=new Promise(resolve=>{startedResolve=resolve});const published=[],calls=[];
 const google={GoogleGenAI:class{models={generateContent:async request=>{calls.push(request);if(calls.length===1){startedResolve();return await new Promise(resolve=>{release=resolve})}return {text:JSON.stringify({indonesia:'late',inggris:'late'})}}}}};
 const {base,session}=await setup(t,google);await bindScript(base,session.uploadToken);
 const send=upload(base,session.uploadToken);await started;
 const mode=await post(base,'/api/foh-stream/script-live/subtitle-mode',session.uploadToken,{mode:'legacy'});assert.equal(mode.status,200);
 release({text:JSON.stringify({vocal:true,judgments:[{cueId:'a',score:0.01},{cueId:'b',score:0.99},{cueId:'c',score:0.01},{cueId:'d',score:0.01}]})});
 const response=await send;assert.equal(response.status,409,await response.clone().text());assert.equal(calls.length,1);
});

test('source-derived provisional cues can be enabled for fast context testing',async t=>{
 const {base,session,store}=await setup(t);
 const saved=await post(base,'/api/foh-stream/script-live/script-position',session.uploadToken,{index:provisionalIndex,expectedRevision:0,action:'seek',cueId:provisionalIndex.cues[0].id});assert.equal(saved.status,200);
 const enabled=await post(base,'/api/foh-stream/script-live/subtitle-mode',session.uploadToken,{mode:'script'});
 assert.equal(enabled.status,200,await enabled.clone().text());
 assert.equal((await store.getOwnedStream('script-live','owner')).subtitleMode,'script');
});

test('switching from legacy to script rejects the in-flight legacy transcript',async t=>{
 let release,startedResolve;const started=new Promise(resolve=>{startedResolve=resolve});const calls=[];
 const google={GoogleGenAI:class{models={generateContent:async request=>{calls.push(request);startedResolve();return await new Promise(resolve=>{release=resolve})}}}};
 const {base,session,store,published}=await setup(t,google);
 await post(base,'/api/foh-stream/script-live/script-position',session.uploadToken,{index,expectedRevision:0,action:'seek',cueId:'a'});
 const send=upload(base,session.uploadToken);await started;
 const mode=await post(base,'/api/foh-stream/script-live/subtitle-mode',session.uploadToken,{mode:'script'});assert.equal(mode.status,200,await mode.clone().text());
 release({text:JSON.stringify({transcript:'stale legacy transcript',indonesia:'stale',inggris:'stale'})});
 const response=await send;assert.equal(response.status,409,await response.clone().text());assert.equal(calls.length,1);
 const saved=await store.getOwnedStream('script-live','owner');assert.equal(saved.subtitleMode,'script');assert.equal(saved.scriptCursor.revision,2);
 assert.equal(published.some(item=>item.args[0]==='foh-subtitle'&&item.args[1].jawa==='stale legacy transcript'),false);
});
