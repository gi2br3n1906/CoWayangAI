'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBackend}=require('../index');
test('script-position JSON body has a lower limit than legacy API routes',async t=>{
 const backend=createBackend({fohOnly:true,autoSpawn:false,cleanupIntervalMs:0,verifyFirebaseToken:async()=>({uid:'owner'}),logger:{log(){},warn(){},error(){}}});
 const address=await backend.start(0,'127.0.0.1');t.after(()=>backend.shutdown());
 const response=await fetch(`http://127.0.0.1:${address.port}/api/foh-stream/test-key/script-position`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test'},body:JSON.stringify({filler:'x'.repeat(2*1024*1024+1)})});
 assert.equal(response.status,413);
});
