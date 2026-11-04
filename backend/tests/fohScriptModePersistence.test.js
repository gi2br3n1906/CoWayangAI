'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFirestoreFohStore}=require('../lib/fohStore');
const {createTestFohStore}=require('./helpers/fohStore');

test('legacy mode defaults and script mode/index survive test-store recreation and token rotation',async()=>{
 const store=createTestFohStore();
 const outputs={jawa:{language:'jawa',streamKey:'script-jawa'}};
 await store.createOrResume({streamKey:'script-stream',ownerUid:'owner',outputs,tokenHash:'old',now:1});
 const empty={scriptId:null,scriptRevision:null,cursorRevision:0};
 const cursor={scriptId:'script',scriptRevision:'v1',act:1,cueId:'a',offset:0,mode:'manual',revision:1};
 assert.equal(await store.updateState({streamKey:'script-stream',ownerUid:'owner',tokenHash:'old',expectedCursor:empty,scriptCursor:cursor,scriptIndex:{id:'script',revision:'v1',cues:[{id:'a'}]},subtitleMode:'script',now:2}),true);
 const resumed=await store.createOrResume({streamKey:'script-stream',ownerUid:'owner',outputs,tokenHash:'new',now:3});
 assert.equal(resumed.subtitleMode,'script');assert.equal(resumed.scriptCursor.cueId,'a');assert.equal(resumed.scriptIndex.id,'script');
 assert.equal(await store.updateState({streamKey:'script-stream',ownerUid:'owner',tokenHash:'old',expectedCursor:{scriptId:'script',scriptRevision:'v1',cursorRevision:1},subtitleMode:'legacy',now:4}),false);
});
