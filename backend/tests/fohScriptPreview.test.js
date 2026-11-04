'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { previewScriptAudio } = require('../lib/fohScriptPreview');
const index = { id: 'fixture', revision: 'v1', cues: [
 { id:'a1', order:1, act:1, page:1, kind:'dialog', text:'Sugeng rawuh' },
 { id:'b1', order:2, act:2, page:2, kind:'sulukan', text:'Dhuh kulup' },
 { id:'c1', order:3, act:3, page:3, kind:'dialog', text:'Ora kena' },
] };
const cursor = {scriptId:'fixture', scriptRevision:'v1', revision:2, act:1, cueId:'a1', offset:0, mode:'auto'};
const config = {lookBehind:0, lookAhead:2, boundarySize:1, nextActSize:1, minScore:0.7, minMargin:0.2};

test('preview matches audio to next act, translates source text, and never selects later acts', async () => {
 assert.equal(typeof previewScriptAudio, 'function');
 const calls = [];
 const generateContent = async request => {
  calls.push(request);
  if (calls.length === 1) return {text:JSON.stringify({vocal:true,judgments:[{cueId:'a1',score:0.1},{cueId:'b1',score:0.9}]})};
  return {text:JSON.stringify({indonesia:'Wahai anakku',inggris:'Oh my child',jawa:'invented'})};
 };
 const result = await previewScriptAudio({ index, cursor, config, bytes:Buffer.alloc(256), mimeType:'audio/webm', model:'test', generateContent });
 assert.equal(result.status, 'matched');
 assert.equal(result.cursor.act, 2);
 assert.equal(result.cue.id, 'b1');
 assert.deepEqual(result.subtitle,{jawa:'Dhuh kulup',indonesia:'Wahai anakku',inggris:'Oh my child'});
 assert.equal(calls.length,2);
 assert.ok(!JSON.stringify(calls[0].contents).includes('Ora kena'));
 assert.ok(JSON.stringify(calls[1].contents).includes('Dhuh kulup'));
 assert.equal(cursor.act,1);
});

test('no voice or ambiguous scores abstain without translating or advancing', async () => {
 for (const match of [
  {vocal:false, judgments:[]},
  {vocal:true, judgments:[{cueId:'a1',score:0.9},{cueId:'b1',score:0.85}]},
 ]) {
  let calls=0;
  const result = await previewScriptAudio({index,cursor,config,bytes:Buffer.alloc(256),mimeType:'audio/webm',model:'test',generateContent:async()=>{calls++; return {text:JSON.stringify(match)};}});
  assert.equal(result.status,'no_match'); assert.equal(result.cursor.act,1); assert.equal(calls,1); assert.equal(result.subtitle,undefined);
 }
});

test('manual mode and mismatched script fail closed before provider call', async () => {
 let calls=0; const generateContent=async()=>{calls++;return {text:'{}'}};
 const manual=await previewScriptAudio({index,cursor:{...cursor,mode:'manual'},config,bytes:Buffer.alloc(256),mimeType:'audio/webm',model:'test',generateContent});
 assert.equal(manual.status,'manual'); assert.equal(calls,0);
 await assert.rejects(()=>previewScriptAudio({index,cursor:{...cursor,scriptRevision:'other'},config,bytes:Buffer.alloc(256),mimeType:'audio/webm',model:'test',generateContent}));
 assert.equal(calls,0);
});
