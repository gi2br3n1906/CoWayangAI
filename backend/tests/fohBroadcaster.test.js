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

async function setup(t, googleGenAi = null) {
 const calls = [];
 const backend = createBackend({ autoSpawn: false, cleanupIntervalMs: 0, workerSharedSecret: 'unused', googleGenAi: googleGenAi || fakeGoogle(calls), verifyFirebaseToken: async token => token === 'fixture-owner-token' ? { uid: 'owner-a' } : null, fohStore: createTestFohStore(), logger: { log(){}, warn(){}, error(){} } });
 const previous = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL };
 process.env.GEMINI_API_KEY = 'fixture-key'; process.env.GEMINI_MODEL = 'fixture-model';
 t.after(async () => { await backend.shutdown(); for (const [key, value] of Object.entries({ GEMINI_API_KEY: previous.key, GEMINI_MODEL: previous.model })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
 const address = await backend.start(0, '127.0.0.1');
 return { backend, calls, base: `http://127.0.0.1:${address.port}` };
}

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
 } finally { await reader.cancel(); }
});

test('audio endpoint allows one in-flight Gemini request per stream', async t => {
 const calls=[];
 const google={GoogleGenAI:class{models={generateContent:request=>new Promise(resolve=>calls.push({request,resolve}))}}};
 const { base } = await setup(t, google);
 const session=await createSession(base,'tmii-busy');
 const send=()=>request(`${base}/api/foh-stream/tmii-busy/audio`,{method:'POST',headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken},body:Buffer.alloc(256)});
 const first=send();
 await Promise.race([new Promise(resolve=>{const poll=()=>calls.length?resolve():setTimeout(poll,5);poll();}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('first Gemini call did not start')),3000))]);
 const second=send();
 await new Promise(resolve=>setTimeout(resolve,50));assert.equal(calls.length,1);
 calls[0].resolve({text:JSON.stringify({transcript:'pertama',indonesia:'first',inggris:'first'})});assert.equal((await first).status,200);
 await Promise.race([new Promise(resolve=>{const poll=()=>calls.length>=2?resolve():setTimeout(poll,5);poll();}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('second Gemini call did not start')),3000))]);
 calls[1].resolve({text:JSON.stringify({transcript:'kedua',indonesia:'second',inggris:'second'})});assert.equal((await second).status,200);
});

test('silent browser audio is acknowledged without calling Gemini', async t => {
 const { base, calls } = await setup(t);
 const session = await (await request(`${base}/api/foh-stream/session`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({pin:'123456',streamKey:'tmii-silent'}) })).json();
 const response = await request(`${base}/api/foh-stream/tmii-silent/audio`, { method:'POST', headers:{'content-type':'audio/webm','x-foh-token':session.uploadToken,'x-foh-rms':'0.0001'}, body:Buffer.alloc(256) });
 const body = await response.json();
 assert.equal(response.status,200); assert.equal(body.silent,true); assert.equal(calls.length,0);
 const latest = await (await request(`${base}/api/foh-stream/tmii-silent/latest`)).json();
 assert.deepEqual([latest.jawa,latest.indonesia,latest.inggris],['','','']);
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
