'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createFohBroadcaster}=require('../lib/fohBroadcaster');
const {createTestFohStore}=require('./helpers/fohStore');
const index={id:'fixture',revision:'v1',cues:[{id:'a',order:1,act:1,kind:'dialog',text:'satu',page:1},{id:'b',order:2,act:2,kind:'sulukan',text:'dua',page:2},{id:'c',order:3,act:3,kind:'dialog',text:'tiga',page:3}]};
async function setup(t){
 const store=createTestFohStore();
 async function server(){const app=express();app.use(express.json());createFohBroadcaster({io:{to:()=>({emit(){}})},store,authenticate:async x=>x==='owner'?{uid:'owner'}:x==='other'?{uid:'other'}:null,logger:{log(){},error(){}}}).installRoutes(app);const s=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x))});t.after(()=>new Promise(resolve=>s.close(resolve)));return `http://127.0.0.1:${s.address().port}`;}
 const base=await server();
 const response=await fetch(`${base}/api/foh-stream/session`,{method:'POST',headers:{authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({streamKey:'script-pos'})});
 return {base,session:await response.json(),server};
}
function update(base,token,body,user='owner'){return fetch(`${base}/api/foh-stream/script-pos/script-position`,{method:'POST',headers:{authorization:`Bearer ${user}`,'content-type':'application/json','x-foh-token':token},body:JSON.stringify(body)})}

test('manual position is saved, recovered after server restart, and rejects old token',async t=>{
 const {base,session,server}=await setup(t);
 let r=await update(base,session.uploadToken,{index,expectedRevision:0,action:'seek',cueId:'b'}); assert.equal(r.status,200,await r.clone().text());
 const saved=(await r.json()).cursor;assert.equal(saved.act,2);assert.equal(saved.cueId,'b');assert.equal(saved.mode,'manual');assert.equal(saved.revision,1);
 const read=await fetch(`${base}/api/foh-stream/script-pos/script-position`,{headers:{authorization:'Bearer owner','x-foh-token':session.uploadToken}});assert.equal(read.status,200);assert.equal((await read.json()).cursor.cueId,'b');
 const restarted=await server();
 const resumed=await fetch(`${restarted}/api/foh-stream/script-pos/resume`,{method:'POST',headers:{authorization:'Bearer owner'}});assert.equal(resumed.status,200);const recovered=await resumed.json();assert.equal(recovered.scriptCursor.cueId,'b');assert.equal(recovered.scriptCursor.act,2);
 r=await update(restarted,session.uploadToken,{index,expectedRevision:1,action:'seek',cueId:'a'});assert.equal(r.status,401);
 r=await update(restarted,recovered.uploadToken,{index,expectedRevision:1,action:'seek',cueId:'c'});assert.equal(r.status,200);assert.equal((await r.json()).cursor.act,3);
});

test('position updates reject wrong owner, stale revision, and mismatched index',async t=>{
 const {base,session}=await setup(t);const body={index,expectedRevision:0,action:'seek',cueId:'a'};
 assert.equal((await update(base,session.uploadToken,body,'other')).status,401);
 assert.equal((await update(base,session.uploadToken,body)).status,200);
 assert.equal((await update(base,session.uploadToken,body)).status,409);
 assert.equal((await update(base,session.uploadToken,{...body,index:{...index,revision:'different'},expectedRevision:1})).status,409);
 const altered={...index,cues:index.cues.map(cue=>cue.id==='a'?{...cue,text:'different text'}:cue)};
 assert.equal((await update(base,session.uploadToken,{...body,index:altered,expectedRevision:1})).status,409);
});

test('script replacement is explicit, revision checked, and preserves the stream key',async t=>{
 const {base,session,server}=await setup(t);
 assert.equal((await update(base,session.uploadToken,{index,expectedRevision:0,action:'seek',cueId:'a'})).status,200);
 const revised={...index,revision:'v2'};
 assert.equal((await update(base,session.uploadToken,{index:revised,expectedRevision:0,action:'replace',cueId:'b'})).status,409);
 const response=await update(base,session.uploadToken,{index:revised,expectedRevision:1,action:'replace',cueId:'b'});
 assert.equal(response.status,200,await response.clone().text());
 const cursor=(await response.json()).cursor;assert.equal(cursor.scriptRevision,'v2');assert.equal(cursor.act,2);assert.equal(cursor.revision,2);assert.equal(cursor.mode,'manual');
 const restarted=await server();const resumed=await fetch(`${restarted}/api/foh-stream/script-pos/resume`,{method:'POST',headers:{authorization:'Bearer owner'}});const recovered=await resumed.json();
 assert.equal(recovered.streamKey,'script-pos');assert.equal(recovered.scriptCursor.scriptRevision,'v2');
});
