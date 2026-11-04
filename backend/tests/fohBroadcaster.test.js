const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackend } = require('../index');
const { io: clientIo } = require('../../frontend/node_modules/socket.io-client');
const { createTestFohStore } = require('./helpers/fohStore');
const { createFohBroadcaster } = require('../lib/fohBroadcaster');

test('null socket subscription emits a validation error without throwing', async () => {
 let connection, subscribe;
 const events = [];
 const io = { on: (_event, handler) => { connection = handler; } };
 const broadcaster = createFohBroadcaster({ io });
 broadcaster.installSocket(io);
 connection({ on: (_event, handler) => { subscribe = handler; }, emit: (...args) => events.push(args) });
 await subscribe(null);
 assert.deepEqual(events, [['foh-error', { message: 'Invalid stream key' }]]);
});

const request = (url, options = {}) => fetch(url, {
 ...options,
 headers: { authorization: 'Bearer fixture-owner-token', ...(options.headers || {}) },
});
async function createSession(base, streamKey) {
 const response = await request(`${base}/api/foh-stream/session`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ streamKey }) });
 assert.equal(response.status, 200, await response.clone().text());
 return response.json();
}

function fakeGoogle(calls) {
 return { GoogleGenAI: class {
  constructor({ apiKey }) { assert.equal(apiKey, 'fixture-key'); }
  models = { generateContent: async request => { calls.push(request); return { text: JSON.stringify({ transcript: 'Sugeng rawuh', indonesia: 'Selamat datang', inggris: 'Welcome' }) }; } };
 } };
}

async function setup(t, googleGenAi = null, store = createTestFohStore()) {
 const calls = [];
 const backend = createBackend({ autoSpawn: false, cleanupIntervalMs: 0, workerSharedSecret: 'unused', googleGenAi: googleGenAi || fakeGoogle(calls), verifyFirebaseToken: async token => token === 'fixture-owner-token' ? { uid: 'owner-a' } : null, fohStore: store, logger: { log(){}, warn(){}, error(){} } });
 const previous = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL };
 process.env.GEMINI_API_KEY = 'fixture-key'; process.env.GEMINI_MODEL = 'fixture-model';
 t.after(async () => { await backend.shutdown(); for (const [key, value] of Object.entries({ GEMINI_API_KEY: previous.key, GEMINI_MODEL: previous.model })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
 const address = await backend.start(0, '127.0.0.1');
 return { backend, calls, base: `http://127.0.0.1:${address.port}` };
}

test('audio selects each allowed model per request and retains the configured fallback', async t => {
 const { base, calls } = await setup(t);
 const session = await createSession(base, 'model-selection');
 for (const model of ['gemini-3.8-flash', 'gemini-3.5-flash-lite', undefined]) {
  const headers = { 'content-type':'audio/webm', 'x-foh-token':session.uploadToken };
  if (model !== undefined) headers['x-foh-model'] = model;
  const response = await request(`${base}/api/foh-stream/model-selection/audio`, { method:'POST', headers, body:Buffer.alloc(256) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).model, model ?? 'fixture-model');
  assert.equal(calls.at(-1).model, model ?? 'fixture-model');
 }
 const latest = await (await fetch(`${base}/api/foh-stream/model-selection/latest`)).json();
 assert.deepEqual(Object.keys(latest).sort(), ['indonesia', 'inggris', 'jawa', 'streamKey', 'updatedAt', 'history', 'serverNow'].sort());
 assert.equal(process.env.GEMINI_MODEL, 'fixture-model');
});

test('rolling history keeps repeated chunks in order and isolates language aliases', async t => {
 const { base } = await setup(t);
 const session = await createSession(base, 'history-test');
 const upload = () => request(`${base}/api/foh-stream/history-test/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':'0.1'}, body:Buffer.alloc(256) });
 for (let i = 0; i < 4; i++) assert.equal((await upload()).status, 200);
 const latest = await (await fetch(`${base}/api/foh-stream/history-test/latest`)).json();
 assert.equal(latest.history.length, 3);
 assert.equal(new Set(latest.history.map(item => item.id)).size, 3);
 assert.deepEqual(latest.history.map(item => item.jawa), Array(3).fill('Sugeng rawuh'));
 assert.ok(latest.history.every(item => item.updatedAt <= latest.serverNow));
 for (const language of ['jawa','indonesia','inggris']) {
  const alias = await (await fetch(`${base}/api/foh-stream/${session.outputs[language].streamKey}/latest`)).json();
  assert.deepEqual(alias.history.map(item => Object.keys(item).sort()), Array(3).fill(['id','updatedAt',language].sort()));
  assert.deepEqual(alias.history.map(item => item.id), latest.history.map(item => item.id));
  assert.ok(!JSON.stringify(alias).includes(session.uploadToken));
 }
});

test('history preserves chronological chunk order and an empty transcription clears it', async t => {
 let n = 0;
 const google = { GoogleGenAI: class { models = { generateContent:async () => { n++; return {text:JSON.stringify({transcript:n <= 4 ? `chunk-${n}` : '', indonesia:n <= 4 ? `indo-${n}` : '', inggris:''})}; } }; } };
 const { base } = await setup(t, google);
 const session = await createSession(base, 'history-order');
 const send = () => request(`${base}/api/foh-stream/history-order/audio`, {method:'POST',headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':'0.1'},body:Buffer.alloc(256)});
 for (let i=1; i<=4; i++) {
  await send();
  const current = await (await fetch(`${base}/api/foh-stream/history-order/latest`)).json();
  assert.deepEqual(current.history.map(item => item.jawa), Array.from({length:Math.min(i,3)}, (_, k) => `chunk-${Math.max(1,i-2)+k}`));
 }
 await send();
 assert.deepEqual((await (await fetch(`${base}/api/foh-stream/history-order/latest`)).json()).history, []);
});

test('snapshots expire at twelve seconds and clock rollback never reverses timestamps', async t => {
 let time = 100000;
 const store = createTestFohStore();
 const express = require('express');
 const app = express();
 app.use(express.json()); app.use(express.raw({ type:'audio/*' }));
 const io = { to: () => ({ emit() {} }) };
 const broadcaster = createFohBroadcaster({ io, now:() => time, store, googleGenAi:fakeGoogle([]), env:{ GEMINI_API_KEY:'fixture-key' }, authenticate:async () => ({uid:'owner-a'}), logger:{log(){},error(){}} });
 broadcaster.installRoutes(app);
 const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
 t.after(() => new Promise(resolve => server.close(resolve)));
 const base = `http://127.0.0.1:${server.address().port}`;
 const session = await createSession(base, 'history-clock');
 const upload = async () => (await request(`${base}/api/foh-stream/history-clock/audio`, {method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':'0.1'}, body:Buffer.alloc(256)})).json();
 const first = await upload(); const second = await upload();
 assert.equal(first.updatedAt, second.updatedAt);
 let snapshot = await (await fetch(`${base}/api/foh-stream/history-clock/latest`)).json();
 assert.equal(new Set(snapshot.history.map(item => item.id)).size, 2);
 time = 99900; const third = await upload(); assert.equal(third.updatedAt, first.updatedAt);
 time = 112000; snapshot = await (await fetch(`${base}/api/foh-stream/history-clock/latest`)).json();
 assert.equal(snapshot.history.length, 3);
 time++; snapshot = await (await fetch(`${base}/api/foh-stream/history-clock/latest`)).json();
 assert.deepEqual(snapshot.history, []);
 const restartedApp = express();
 createFohBroadcaster({ io, now:() => time, store }).installRoutes(restartedApp);
 const restarted = await new Promise(resolve => { const instance = restartedApp.listen(0, '127.0.0.1', () => resolve(instance)); });
 try {
  const stale = await (await fetch(`http://127.0.0.1:${restarted.address().port}/api/foh-stream/history-clock-indo/latest`)).json();
  assert.deepEqual(stale.history, []);
 } finally { await new Promise(resolve => restarted.close(resolve)); }
});

test('late socket and SSE subscribers receive history and clear events', async t => {
 const { base } = await setup(t);
 const session = await createSession(base, 'history-live');
 const url = `${base}/api/foh-stream/history-live/audio`;
 const send = rms => request(url, {method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':rms}, body:Buffer.alloc(256)});
 await send('0.1'); await send('0.1');
 const client = clientIo(base, { transports:['websocket'] });
 t.after(() => client.disconnect());
 await new Promise((resolve,reject) => {client.once('connect',resolve); client.once('connect_error',reject);});
 const nextSocket = () => new Promise((resolve,reject) => { const timer = setTimeout(() => reject(new Error('socket timeout')), 2000); client.once('foh-subtitle', value => {clearTimeout(timer); resolve(value);}); });
 let pending = nextSocket(); client.emit('foh-subscribe', {streamKey:session.outputs.indonesia.streamKey});
 const socketSnapshot = await pending;
 assert.equal(socketSnapshot.history.length, 2);
 assert.deepEqual(Object.keys(socketSnapshot.history[0]).sort(), ['id','indonesia','updatedAt']);
 client.disconnect(); client.connect();
 await new Promise((resolve,reject) => {client.once('connect',resolve); client.once('connect_error',reject);});
 pending = nextSocket(); client.emit('foh-subscribe', {streamKey:session.outputs.indonesia.streamKey});
 assert.deepEqual((await pending).history, socketSnapshot.history);
 const response = await fetch(`${base}/api/foh-stream/${session.outputs.indonesia.streamKey}/sse`);
 const reader = response.body.getReader();
 try {
  const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).match(/data: (.+)/)[1]);
  assert.deepEqual(first.history, socketSnapshot.history);
  pending = nextSocket(); await send('0.0001');
  assert.deepEqual((await pending).history, []);
  const clear = JSON.parse(new TextDecoder().decode((await reader.read()).value).match(/data: (.+)/)[1]);
  assert.deepEqual(clear.history, []);
  await send('0.1');
  assert.equal((await request(`${base}/api/foh-stream/history-live/session`, {method:'DELETE',headers:{'x-foh-token':session.uploadToken}})).status, 200);
  assert.deepEqual((await (await fetch(`${base}/api/foh-stream/history-live/latest`)).json()).history, []);
 } finally { await reader.cancel(); }
});

test('restart recovers only the latest fresh persisted subtitle', async t => {
 const store = createTestFohStore();
 const first = await setup(t, null, store);
 const session = await createSession(first.base, 'history-restart');
 for (let i=0; i<2; i++) await request(`${first.base}/api/foh-stream/history-restart/audio`, {method:'POST',headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':'0.1'},body:Buffer.alloc(256)});
 const original = await (await fetch(`${first.base}/api/foh-stream/history-restart/latest`)).json();
 assert.equal(original.history.length, 2);
 const second = await setup(t, null, store);
 const recovered = await (await fetch(`${second.base}/api/foh-stream/history-restart-indo/latest`)).json();
 assert.equal(recovered.history.length, 1);
 assert.equal(recovered.history[0].indonesia, 'Selamat datang');
 assert.deepEqual(Object.keys((await store.getOwnedStream('history-restart','owner-a')).subtitle).sort(), ['indonesia','inggris','jawa','updatedAt']);
});

test('invalid explicit models are rejected before provider access while authorization remains required', async t => {
 const { base, calls } = await setup(t);
 const session = await createSession(base, 'model-invalid');
 const url = `${base}/api/foh-stream/model-invalid/audio`;
 for (const model of ['', 'fixture-model', 'gemini-3.8-flash, gemini-3.5-flash-lite', 'GEMINI-3.8-FLASH']) {
  const response = await request(url, { method:'POST', headers:{ 'content-type':'audio/webm', 'x-foh-token':session.uploadToken, 'x-foh-model':model }, body:Buffer.alloc(256) });
  assert.equal(response.status, 400, `model ${JSON.stringify(model)}`);
 }
 const unauthenticated = await fetch(url, { method:'POST', headers:{ 'content-type':'audio/webm', 'x-foh-token':session.uploadToken, 'x-foh-model':'invalid' }, body:Buffer.alloc(256) });
 assert.equal(unauthenticated.status, 401);
 const wrongToken = await request(url, { method:'POST', headers:{ 'content-type':'audio/webm', 'x-foh-token':'wrong', 'x-foh-model':'invalid' }, body:Buffer.alloc(256) });
 assert.equal(wrongToken.status, 401);
 assert.equal(calls.length, 0);
});

test('direct transcribe preserves configured environment fallback', async () => {
 const calls = [];
 const broadcaster = createFohBroadcaster({ io:{}, googleGenAi:fakeGoogle(calls), env:{ GEMINI_API_KEY:'fixture-key', GEMINI_MODEL:'benchmark-model' } });
 const result = await broadcaster.transcribe({ bytes:Buffer.alloc(256), mimeType:'audio/webm', context:'' });
 assert.equal(calls[0].model, 'benchmark-model');
 assert.equal(result.jawa, 'Sugeng rawuh');
});

test('timed-out provider responses cannot publish and do not block subsequent chunks', async t => {
 let finishFirst, call = 0;
 const google = { GoogleGenAI: class { models = { generateContent: () => ++call === 1
  ? new Promise(resolve => { finishFirst = resolve; })
  : Promise.resolve({ text: JSON.stringify({ transcript:'new', indonesia:'baru', inggris:'new' }) }) }; } };
 const express = require('express');
 const app = express(); app.use(express.json()); app.use(express.raw({ type:'audio/*' }));
 const broadcaster = createFohBroadcaster({ io:{ to:() => ({emit(){}}) }, googleGenAi:google, env:{ GEMINI_API_KEY:'fixture-key' }, store:createTestFohStore(), authenticate:async () => ({uid:'owner-a'}), logger:{log(){},error(){}}, providerTimeoutMs:30 });
 broadcaster.installRoutes(app);
 const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
 t.after(() => new Promise(resolve => server.close(resolve)));
 const base = `http://127.0.0.1:${server.address().port}`;
 const session = await createSession(base, 'timeout-test');
 const send = () => request(`${base}/api/foh-stream/timeout-test/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':'0.1'}, body:Buffer.alloc(256) });
 assert.equal((await send()).status, 504);
 assert.equal((await send()).status, 200);
 finishFirst({ text: JSON.stringify({ transcript:'old', indonesia:'lama', inggris:'old' }) });
 await new Promise(resolve => setTimeout(resolve, 20));
 const latest = await (await fetch(`${base}/api/foh-stream/timeout-test/latest`)).json();
 assert.equal(latest.jawa, 'new');
 assert.deepEqual(latest.history.map(item => item.jawa), ['new']);
});

test('verified account creates a private upload token and valid public stream links', async t => {
 const { base } = await setup(t);
 const denied = await fetch(`${base}/api/foh-stream/session`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ streamKey:'tmii-nov4' }) });
 assert.equal(denied.status, 401);
 const created = await request(`${base}/api/foh-stream/session`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ streamKey:'tmii-nov4' }) });
 assert.equal(created.status, 200);
 const data = await created.json(); assert.equal(data.streamKey, 'tmii-nov4'); assert.ok(data.uploadToken); assert.equal(data.outputPath, '/foh-output/tmii-nov4');
});

test('audio chunks are authenticated, transcribed in memory, cached and published to the matching room', async t => {
 const { base, calls, backend } = await setup(t);
 const created = await (await request(`${base}/api/foh-stream/session`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ pin:'123456', streamKey:'tmii-test' }) })).json();
 const client = clientIo(base, { transports:['websocket'] });
 await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject)});
 client.emit('foh-subscribe',{streamKey:'tmii-test'});
 const subtitleEvent = new Promise((resolve, reject)=>{ const timer=setTimeout(()=>reject(new Error('foh-subtitle timeout')),3000); client.once('foh-subtitle',data=>{clearTimeout(timer);resolve(data)}); });
 const audio = Buffer.concat([Buffer.from('webm'),Buffer.alloc(200)]);
 try {
  const response = await request(`${base}/api/foh-stream/tmii-test/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':created.uploadToken,'x-foh-context':'Lakon Rama'}, body:audio });
  assert.equal(response.status,200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(body.updatedAt > 0);
  assert.deepEqual(body.subtitle, { jawa:'Sugeng rawuh', indonesia:'Selamat datang', inggris:'Welcome' });
  assert.equal(body.silent, undefined);
  const subtitle = await subtitleEvent;
  assert.deepEqual([subtitle.jawa,subtitle.indonesia,subtitle.inggris],['Sugeng rawuh','Selamat datang','Welcome']);
  assert.equal(calls[0].model,'fixture-model'); assert.equal(calls[0].config.thinkingConfig.thinkingLevel,'low');
  assert.deepEqual(Object.keys(calls[0].config.responseSchema.properties).sort(),['indonesia','inggris','transcript']);
  assert.equal(calls[0].contents[0].parts[0].inlineData.data,audio.toString('base64'));
  const latest = await (await request(`${base}/api/foh-stream/tmii-test/latest`)).json(); assert.equal(latest.indonesia,'Selamat datang');
 } finally { client.disconnect(); }
});

test('audio endpoint rejects missing token, unsupported MIME and oversized chunks', async t => {
 const { base } = await setup(t);
 const created = await (await request(`${base}/api/foh-stream/session`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({pin:'123456',streamKey:'tmii-limit'}) })).json();
 const payload = Buffer.alloc(200);
 const noToken = await request(`${base}/api/foh-stream/tmii-limit/audio`,{method:'POST',headers:{'content-type':'audio/webm'},body:payload}); assert.equal(noToken.status,401);
 const wrongType = await request(`${base}/api/foh-stream/tmii-limit/audio`,{method:'POST',headers:{'content-type':'application/octet-stream','x-foh-token':created.uploadToken},body:payload}); assert.equal(wrongType.status,415);
 const tooLarge = await request(`${base}/api/foh-stream/tmii-limit/audio`,{method:'POST',headers:{'content-type':'audio/webm','x-foh-token':created.uploadToken},body:Buffer.alloc(8*1024*1024+1)}); assert.equal(tooLarge.status,413);
});

test('SSE endpoint sends event-stream and invalid key is rejected', async t => {
 const { base } = await setup(t);
 const invalid = await request(`${base}/api/foh-stream/INVALID/latest`); assert.equal(invalid.status,400);
 const controller = new AbortController();
 const response = await request(`${base}/api/foh-stream/tmii-sse/sse`,{signal:controller.signal});
 assert.match(response.headers.get('content-type'),/^text\/event-stream(?:;|$)/);
 const reader = response.body.getReader(); await reader.cancel();
});

test('SSE connected before session creation follows the eventual language alias', async t => {
 const { base } = await setup(t);
 const controller = new AbortController();
 t.after(() => controller.abort());
 const response = await request(`${base}/api/foh-stream/early-stream-indo/sse`, { signal: controller.signal });
 const reader = response.body.getReader();
 try {
 const session = await createSession(base, 'early-stream');
 const upload = await request(`${base}/api/foh-stream/early-stream/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken}, body:Buffer.alloc(256) });
 assert.equal(upload.status, 200);
 const latest = await (await request(`${base}/api/foh-stream/early-stream-indo/latest`)).json();
 assert.deepEqual([latest.jawa, latest.indonesia, latest.inggris], ['', 'Selamat datang', '']);
 let timer;
 const result = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SSE subtitle timeout')), 1000); })]).finally(() => clearTimeout(timer));
 const event = JSON.parse(new TextDecoder().decode(result.value).match(/data: (.+)/)[1]);
 assert.deepEqual([event.streamKey, event.jawa, event.indonesia, event.inggris], ['early-stream-indo', '', 'Selamat datang', '']);
 assert.equal(event.history.length, 1);
 assert.deepEqual(Object.keys(event.history[0]).sort(), ['id','indonesia','updatedAt']);
 } finally { await reader.cancel(); }
});

test('audio endpoint allows one in-flight Gemini request per stream', async t => {
 const calls=[];
 const google={GoogleGenAI:class{models={generateContent:request=>new Promise(resolve=>calls.push({request,resolve}))}}};
 const { base } = await setup(t, google);
 const session=await createSession(base,'tmii-busy');
 const send=model=>request(`${base}/api/foh-stream/tmii-busy/audio`,{method:'POST',headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-model':model},body:Buffer.alloc(256)});
 const first=send('gemini-3.8-flash');
 await Promise.race([new Promise(resolve=>{const poll=()=>calls.length?resolve():setTimeout(poll,5);poll();}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('first Gemini call did not start')),3000))]);
 const second=send('gemini-3.5-flash-lite');
 await new Promise(resolve=>setTimeout(resolve,50));assert.equal(calls.length,1);
 calls[0].resolve({text:JSON.stringify({transcript:'pertama',indonesia:'first',inggris:'first'})});const firstResponse=await first; assert.equal(firstResponse.status,200);
 await Promise.race([new Promise(resolve=>{const poll=()=>calls.length>=2?resolve():setTimeout(poll,5);poll();}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('second Gemini call did not start')),3000))]);
 calls[1].resolve({text:JSON.stringify({transcript:'kedua',indonesia:'second',inggris:'second'})});const secondResponse=await second; assert.equal(secondResponse.status,200);
 const firstBody=await firstResponse.json(); const secondBody=await secondResponse.json();
 assert.deepEqual(firstBody.subtitle, { jawa:'pertama', indonesia:'first', inggris:'first' });
 assert.deepEqual(secondBody.subtitle, { jawa:'kedua', indonesia:'second', inggris:'second' });
 assert.deepEqual(calls.map(call=>call.request.model), ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
 assert.deepEqual([firstBody.model,secondBody.model], ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
});

test('silent browser audio is acknowledged without calling Gemini', async t => {
 const { base, calls } = await setup(t);
 const session = await (await request(`${base}/api/foh-stream/session`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({pin:'123456',streamKey:'tmii-silent'}) })).json();
 const response = await request(`${base}/api/foh-stream/tmii-silent/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':'0.0001','x-foh-model':'gemini-3.8-flash'}, body:Buffer.alloc(256) });
 const body = await response.json();
 assert.equal(response.status,200); assert.equal(body.silent,true); assert.equal(calls.length,0);
 assert.equal(body.model, 'gemini-3.8-flash');
 assert.deepEqual(body.subtitle, { jawa:'', indonesia:'', inggris:'' });
 const latest = await (await request(`${base}/api/foh-stream/tmii-silent/latest`)).json();
 assert.deepEqual([latest.jawa,latest.indonesia,latest.inggris],['','','']);
});
test('audio response waits for persistence and storage failure returns no subtitle', async t => {
 const store = createTestFohStore();
 const persist = store.updateSubtitle.bind(store);
 let release, started;
 const entered = new Promise(resolve => { started = resolve; });
 store.updateSubtitle = async (...args) => { started(); await new Promise(resolve => { release = resolve; }); await persist(...args); };
 const { base } = await setup(t, null, store);
 const session = await createSession(base, 'persist-audio');
 let settled = false;
 const upload = request(`${base}/api/foh-stream/persist-audio/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken}, body:Buffer.alloc(256) }).then(response => { settled = true; return response; });
 await entered;
 try {
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(settled, false);
 } finally { release(); }
 const response = await upload;
 assert.equal(response.status, 200);
 const body = await response.json();
 const record = await store.getOwnedStream('persist-audio', 'owner-a');
 assert.deepEqual(record.subtitle, { ...body.subtitle, updatedAt: body.updatedAt });
 store.updateSubtitle = async () => { throw new Error('storage failure'); };
 for (const rms of ['0.1', '0.0001']) {
  const failed = await request(`${base}/api/foh-stream/persist-audio/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':rms}, body:Buffer.alloc(256) });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error:'FOH storage unavailable' });
  const snapshot = await (await fetch(`${base}/api/foh-stream/persist-audio/latest`)).json();
  assert.equal(snapshot.jawa, body.subtitle.jawa);
  assert.equal(snapshot.history.length, 1);
 }
});

test('Gemini failure returns an error without a subtitle', async t => {
 const google = { GoogleGenAI: class { models = { generateContent: async () => { throw new Error('provider failed'); } } } };
 const { base } = await setup(t, google);
 const session = await createSession(base, 'provider-error');
 const response = await request(`${base}/api/foh-stream/provider-error/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken}, body:Buffer.alloc(256) });
 assert.equal(response.status, 502);
 assert.deepEqual(await response.json(), { error:'Gemini transcription failed' });
});

test('ending a session revokes its upload token and clears cached subtitles', async t => {
 const {base}=await setup(t);
 const session=await(await request(`${base}/api/foh-stream/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:'123456',streamKey:'tmii-end'})})).json();
 const ended=await request(`${base}/api/foh-stream/tmii-end/session`,{method:'DELETE',headers:{'x-foh-token':session.uploadToken}});
 assert.equal(ended.status,200);
 const upload=await request(`${base}/api/foh-stream/tmii-end/audio`,{method:'POST',headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken},body:Buffer.alloc(256)});
 assert.equal(upload.status,401);
 const latest=await(await request(`${base}/api/foh-stream/tmii-end/latest`)).json();assert.equal(latest.jawa,'');assert.ok(latest.updatedAt>0);
});

test('ending a populated session publishes cleared subtitles to alias SSE listeners', async t => {
 const { base } = await setup(t);
 const session = await createSession(base, 'ending-live');
 const upload = await request(`${base}/api/foh-stream/ending-live/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken}, body:Buffer.alloc(256) });
 assert.equal(upload.status, 200);
 const response = await request(`${base}/api/foh-stream/ending-live-indo/sse`);
 const reader = response.body.getReader();
 try {
  const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).match(/data: (.+)/)[1]);
  assert.equal(first.indonesia, 'Selamat datang');
  assert.equal((await request(`${base}/api/foh-stream/ending-live/session`, { method:'DELETE', headers:{'x-foh-token':session.uploadToken} })).status, 200);
  const latest = await (await request(`${base}/api/foh-stream/ending-live/latest`)).json();
  assert.deepEqual([latest.jawa, latest.indonesia, latest.inggris], ['', '', '']);
  let timer;
  const result = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('clear event timeout')), 1000); })]).finally(() => clearTimeout(timer));
  const cleared = JSON.parse(new TextDecoder().decode(result.value).match(/data: (.+)/)[1]);
  assert.deepEqual([cleared.streamKey, cleared.jawa, cleared.indonesia, cleared.inggris], ['ending-live-indo', '', '', '']);
 } finally { await reader.cancel(); }
});

test('one input session exposes isolated public output keys for each language', async t => {
 const { base, calls } = await setup(t);
 const session = await (await request(`${base}/api/foh-stream/session`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({pin:'123456',streamKey:'tmii-languages'}) })).json();
 assert.deepEqual(Object.keys(session.outputs).sort(), ['indonesia','inggris','jawa']);
 assert.match(session.outputs.jawa.streamKey, /^tmii-languages-jawa$/);
 assert.match(session.outputs.indonesia.streamKey, /^tmii-languages-indo$/);
 assert.match(session.outputs.inggris.streamKey, /^tmii-languages-inggris$/);
 const audio = Buffer.concat([Buffer.from('webm'),Buffer.alloc(200)]);
 const upload = await request(`${base}/api/foh-stream/tmii-languages/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken}, body:audio });
 assert.equal(upload.status, 200);
 assert.equal(calls.length, 1);
 for (const [language, field] of [['jawa','jawa'],['indonesia','indonesia'],['inggris','inggris']]) {
  const latest = await (await request(`${base}/api/foh-stream/${session.outputs[language].streamKey}/latest`)).json();
  assert.equal(latest.streamKey, session.outputs[language].streamKey);
  assert.equal(latest[field], language === 'jawa' ? 'Sugeng rawuh' : language === 'indonesia' ? 'Selamat datang' : 'Welcome');
  for (const other of ['jawa','indonesia','inggris'].filter(item => item !== language)) assert.equal(latest[other], '');
 }
 const aliasUpload = await request(`${base}/api/foh-stream/${session.outputs.jawa.streamKey}/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken}, body:audio });
 assert.equal(aliasUpload.status, 401);
});

test('the owner can resume an ended stream without changing its public output URLs', async t => {
 const { base } = await setup(t);
 const created = await createSession(base, 'tmii-ended');
 const ended = await request(`${base}/api/foh-stream/tmii-ended/session`, { method:'DELETE', headers:{'x-foh-token':created.uploadToken} });
 assert.equal(ended.status, 200);
 const resumed = await request(`${base}/api/foh-stream/tmii-ended/resume`, { method:'POST' });
 assert.equal(resumed.status, 200);
 const data = await resumed.json();
 assert.equal(data.status, 'active');
 assert.equal(data.outputs.jawa.outputPath, created.outputs.jawa.outputPath);
 const upload = await request(`${base}/api/foh-stream/tmii-ended/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':data.uploadToken}, body:Buffer.alloc(256) });
 assert.equal(upload.status, 200);
});

test('ending during an in-flight upload leaves the final subtitle empty', async t => {
 const calls = [];
 const google = { GoogleGenAI: class { models = { generateContent: () => new Promise(resolve => calls.push(resolve)) } } };
 const { base } = await setup(t, google);
 const created = await createSession(base, 'ending-race');
 const uploading = request(`${base}/api/foh-stream/ending-race/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':created.uploadToken}, body:Buffer.alloc(256) });
 await Promise.race([new Promise(resolve => { const poll = () => calls.length ? resolve() : setTimeout(poll, 5); poll(); }), new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini did not start')), 3000))]);
 const ending = request(`${base}/api/foh-stream/ending-race/session`, { method:'DELETE', headers:{'x-foh-token':created.uploadToken} });
 calls[0]({ text: JSON.stringify({ transcript:'late', indonesia:'late', inggris:'late' }) });
 assert.equal((await uploading).status, 200);
 assert.equal((await ending).status, 200);
 const latest = await (await request(`${base}/api/foh-stream/ending-race/latest`)).json();
 assert.deepEqual([latest.jawa, latest.indonesia, latest.inggris], ['', '', '']);
});

test('token rotation during an in-flight Gemini call prevents stale subtitle publication', async t => {
 const calls = [];
 const google = { GoogleGenAI: class { models = { generateContent: request => new Promise(resolve => calls.push({ request, resolve })) } } };
 const { base } = await setup(t, google);
 const created = await createSession(base, 'tmii-rotation');
 const uploading = request(`${base}/api/foh-stream/tmii-rotation/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':created.uploadToken}, body:Buffer.alloc(256) });
 await Promise.race([
  new Promise(resolve => { const poll = () => calls.length ? resolve() : setTimeout(poll, 5); poll(); }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini call did not start')), 3000)),
 ]);
 const resumed = await request(`${base}/api/foh-stream/tmii-rotation/resume`, { method:'POST' });
 assert.equal(resumed.status, 200);
 calls[0].resolve({ text: JSON.stringify({ transcript:'stale', indonesia:'stale', inggris:'stale' }) });
 assert.equal((await uploading).status, 401);
 const latest = await (await request(`${base}/api/foh-stream/tmii-rotation/latest`)).json();
 assert.equal(latest.jawa, '');
});
