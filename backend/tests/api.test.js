const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

// Import the legacy file safely: no secrets, Python processes, or listening port.
const realLoad = Module._load;
const realListen = http.Server.prototype.listen;
const realInterval = global.setInterval;
const realTimeout = global.setTimeout;
const captured = { spawns: 0, listens: 0, timers: [] };
Module._load = function(name, ...args) {
    if (name === 'dotenv') return { config() {} };
    if (name === 'child_process') return { spawn() { captured.spawns++; return new EventEmitter(); } };
    return realLoad.call(this, name, ...args);
};
http.Server.prototype.listen = function() { captured.listens++; return this; };
global.setInterval = (...args) => { const timer = realInterval(...args); timer.unref(); captured.timers.push(timer); return timer; };
global.setTimeout = (...args) => { const timer = realTimeout(...args); timer.unref(); captured.timers.push(timer); return timer; };
let backendModule;
try { backendModule = require('../index'); }
finally {
    Module._load = realLoad;
    http.Server.prototype.listen = realListen;
    global.setInterval = realInterval;
    global.setTimeout = realTimeout;
    captured.timers.forEach(clearTimeout);
}

test('importing the backend exports an app factory without listening or spawning Python', async () => {
    assert.equal(captured.spawns, 0);
    assert.equal(captured.listens, 0);
    assert.equal(typeof backendModule.createBackend, 'function');
    assert.equal(typeof backendModule.app, 'function');
    assert.ok(backendModule.server instanceof http.Server);
    await backendModule.shutdown();
});

async function fixture(t, handler = () => ({ status: 200, data: { success: true } }), expectedShutdownFailure = false, backendOptions = {}) {
    const requests = [];
    const upstream = http.createServer(async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : {};
        requests.push({ path: req.url, body });
        const reply = await handler(req.url, body);
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.data));
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
    const backend = backendModule.createBackend({ asrServerUrl: upstreamUrl, pythonAiUrl: upstreamUrl, autoSpawn: false, cleanupIntervalMs: 0, ...backendOptions });
    await backend.start(0, '127.0.0.1');
    const base = `http://127.0.0.1:${backend.server.address().port}`;
    t.after(async () => {
        try {
            if (expectedShutdownFailure) await assert.rejects(backend.shutdown());
            else await backend.shutdown();
        } finally { await new Promise(resolve => upstream.close(resolve)); }
    });
    return {
        backend, requests, base,
        async post(path, body = {}) {
            const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
            return { status: response.status, body: await response.json() };
        }
    };
}

test('analyze honors startTime seconds and clock notation instead of ignoring it for startMinute', async t => {
    const api = await fixture(t);
    const reply = await api.post('/api/analyze', { videoUrl: 'https://youtu.be/example0001', startTime: '1:30.5', startMinute: 7 });
    assert.equal(reply.status, 200);
    assert.equal(api.requests.find(request => request.path === '/start-analysis').body.startTime, 90.5);
    assert.equal(api.requests.find(request => request.path === '/start-asr').body.startTime, 90.5);
});

test('ASR startup is awaited and upstream failure is returned rather than false success', async t => {
    const api = await fixture(t, () => ({ status: 503, data: { message: 'ASR unavailable' } }));
    const reply = await api.post('/api/start-asr', { videoUrl: 'https://youtu.be/example0001', startTime: '2:15' });
    assert.equal(reply.status, 502);
    assert.equal(reply.body.status, 'error');
    assert.equal(api.requests.length, 1);
    assert.equal(api.requests[0].body.startTime, 135);
});

test('only the frontend socket owning a session can end it', async t => {
    const { connect } = require('./socketClient');
    const api = await fixture(t);
    const python = await connect(t, api.base);
    python.send('register-worker', { workerId: 'worker-1' });
    assert.equal((await python.next('worker-registered')).success, true);
    const owner = await connect(t, api.base);
    owner.send('start-live-stream', { videoUrl: 'https://youtu.be/example0001', currentTime: 10 });
    const session = await owner.next('session-created');
    await python.next('start-processing');
    const intruder = await connect(t, api.base);
    intruder.send('end-session', { sessionId: session.sessionId });
    const result = await Promise.race([intruder.next('session-ended'), intruder.next('session-error')]);
    assert.equal(result.type, 'forbidden');
    assert.equal(api.backend.sessionManager.getSession(session.sessionId).socketId, owner.id);
});

test('duplicate live-stream starts do not send another start-processing or restart ASR', async t => {
    const { connect } = require('./socketClient');
    const api = await fixture(t);
    const python = await connect(t, api.base);
    python.send('register-worker', { workerId: 'worker-1' });
    await python.next('worker-registered');
    const owner = await connect(t, api.base);
    const payload = { videoUrl: 'https://youtu.be/example0001', currentTime: 12.5 };
    owner.send('start-live-stream', payload);
    const first = await owner.next('session-created');
    const start = await python.next('start-processing');
    assert.equal(start.startTime, 12.5);
    owner.send('start-live-stream', payload);
    const duplicate = await owner.next('session-created');
    assert.equal(duplicate.sessionId, first.sessionId);
    assert.equal(duplicate.shouldStart, false);
    assert.equal(api.backend.sessionManager.getStatus().busy, 1);
});

test('cross-session player controls, legacy stops, and forged worker results are rejected', async t => {
    const { connect } = require('./socketClient');
    const api = await fixture(t);
    const python = await connect(t, api.base);
    python.send('register-worker', { workerId: 'worker-1' });
    await python.next('worker-registered');
    const owner = await connect(t, api.base);
    owner.send('start-live-stream', { videoUrl: 'https://youtu.be/example0001' });
    const session = await owner.next('session-created');
    await python.next('start-processing');
    const intruder = await connect(t, api.base);
    for (const event of ['player-time', 'player-seek', 'player-state', 'stop-live-stream', 'ai-boxes', 'stream-started', 'stream-error']) {
        intruder.send(event, { sessionId: session.sessionId, time: 100, state: 'ended' });
        assert.equal((await intruder.next('session-error')).type, 'forbidden', event);
        assert.ok(api.backend.sessionManager.getSession(session.sessionId), event);
    }
});

test('ASR update, stop, and language restart failures return 502 instead of success or 500', async t => {
    for (const [route, payload, failedPath] of [
        ['/api/update-asr-time', { startTime: '3:10.25' }, '/start-asr'],
        ['/api/stop-asr', {}, '/stop-asr'],
        ['/api/change-language', { targetLanguage: 'en' }, '/start-asr']
    ]) await t.test(route, async t => {
        let fail = false;
        const api = await fixture(t, path => ({ status: fail && path === failedPath ? 503 : 200, data: {} }), route === '/api/stop-asr');
        assert.equal((await api.post('/api/start-asr', { videoUrl: 'https://youtu.be/example0001', startTime: '1:02' })).status, 200);
        fail = true;
        const reply = await api.post(route, payload);
        assert.equal(reply.status, 502);
        assert.equal(reply.body.status, 'error');
    });
});

test('invalid ASR input is rejected before stopping an active video or calling upstream', async t => {
    const api = await fixture(t);
    await api.post('/api/start-asr', { videoUrl: 'https://youtu.be/example0001', startTime: 10 });
    const before = api.requests.length;
    for (const payload of [
        { videoUrl: 'https://youtu.be/other000001', startTime: 'bad' },
        { videoUrl: 'https://youtu.be/other000001', startTime: -1 },
        { videoUrl: 'https://youtu.be/other000001', startTime: '1:70' },
        { videoUrl: 'https://youtu.be/other000001', startTime: '' },
        { videoUrl: 'https://youtu.be/other000001', targetLanguage: 'xx' },
        { videoUrl: { unexpected: true } },
        { videoUrl: 'file:///etc/passwd' }
    ]) assert.equal((await api.post('/api/start-asr', payload)).status, 400, JSON.stringify(payload));
    assert.equal(api.requests.length, before);
    assert.equal((await api.post('/api/update-asr-time', { startTime: '2:10.5' })).status, 200);
    assert.equal(api.requests.at(-1).body.videoUrl, 'https://youtu.be/example0001');
    assert.equal(api.requests.at(-1).body.startTime, 130.5);
});

test('seek refuses to restart AI if stopping the previous analysis fails', async t => {
    const api = await fixture(t, path => ({ status: path === '/stop-analysis' ? 503 : 200, data: {} }));
    await api.post('/api/start-asr', { videoUrl: 'https://youtu.be/example0001' });
    const reply = await api.post('/api/seek-analysis', { startTime: 75.25 });
    assert.equal(reply.status, 502);
    assert.equal(api.requests.some(request => request.path === '/start-analysis'), false);
    assert.equal(api.requests.filter(request => request.path === '/start-asr').length, 1);
});

test('ASR application-level rejection with HTTP 200 is not reported as success', async t => {
    const api = await fixture(t, () => ({ status: 200, data: { success: false, status: 'error', message: 'No ASR capacity' } }));
    const reply = await api.post('/api/start-asr', { videoUrl: 'https://youtu.be/example0001' });
    assert.equal(reply.status, 502);
    assert.equal(api.backend.asr.state.videoUrl, null);
});

test('shutdown waits for an in-flight HTTP ASR startup and stops the selected video', async t => {
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const api = await fixture(t, async path => {
        if (path === '/start-asr') { entered(); await gate; }
        return { status: 200, data: {} };
    });
    const request = api.post('/api/start-asr', { videoUrl: 'https://youtu.be/example0001' });
    await started;
    const closing = api.backend.shutdown();
    release();
    await request;
    await closing;
    assert.deepEqual(api.requests.map(request => request.path), ['/start-asr', '/stop-asr']);
    assert.equal(api.backend.asr.state.videoUrl, null);
});

test('live-stream shutdown cannot stop ASR before an in-flight start finishes', async t => {
    const { connect } = require('./socketClient');
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const completed = [];
    const api = await fixture(t, async path => {
        if (path === '/start-asr') { entered(); await gate; }
        completed.push(path);
        return { status: 200, data: {} };
    });
    const python = await connect(t, api.base);
    python.send('register-worker', { workerId: 'worker-1' });
    await python.next('worker-registered');
    const owner = await connect(t, api.base);
    owner.send('start-live-stream', { videoUrl: 'https://youtu.be/example0001' });
    await started;
    const closing = api.backend.shutdown();
    await new Promise(resolve => setTimeout(resolve, 25));
    release();
    await closing;
    assert.deepEqual(completed, ['/start-asr', '/stop-asr']);
});

test('HTTP commands are rejected with 503 once shutdown begins', async t => {
    let entered;
    const stopping = new Promise(resolve => { entered = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const api = await fixture(t, async path => {
        if (path === '/stop-asr') { entered(); await gate; }
        return { status: 200, data: {} };
    });
    api.backend.sessionManager.registerPythonWorker('worker-1', 'python');
    api.backend.sessionManager.requestSession('owner', 'https://youtu.be/example0001');
    const closing = api.backend.shutdown();
    await stopping;
    try {
        const reply = await api.post('/api/change-language', { targetLanguage: 'en' });
        assert.equal(reply.status, 503);
        assert.equal(api.backend.asr.state.targetLanguage, 'id');
    } finally { release(); await closing; }
});

test('HTTP and socket starts reject untrusted video sources before upstream work or reservation', async t => {
 const { connect } = require('./socketClient');
 const api = await fixture(t);
 const python = await connect(t, api.base);
 await python.request('register-worker', { workerId: 'worker-1' });
 const client = await connect(t, api.base);
 for (const videoUrl of ['http://127.0.0.1/private', 'https://youtube.com.attacker.test/watch?v=example0001', 'https://youtube.com@attacker.test/watch?v=example0001', 'https://youtu.be:444/example0001', 'https://youtu.be/bad']) {
  assert.equal((await api.post('/api/analyze', { videoUrl })).status, 400);
  assert.equal((await api.post('/api/start-asr', { videoUrl })).status, 400);
  assert.equal((await client.request('start-live-stream', { videoUrl })).success, false);
 }
 assert.equal(api.requests.length, 0);
 assert.equal(api.backend.sessionManager.getStatus().activeSessions, 0);
});

test('hybrid camera sessions route only to capture-local workers', async t => {
 const { connect } = require('./socketClient');
 const api = await fixture(t, undefined, false, { operationMode: 'hybrid', workerSharedSecret: 'fixture-secret' });
 const invalid = await connect(t, api.base);
 const invalidRegistration = await invalid.request('register-worker', { workerId: 'worker-3', sharedSecret: 'wrong-secret', captureLocal: true });
 assert.equal(invalidRegistration.success, false);
 assert.equal(api.backend.sessionManager.workers.get('worker-3').status, 'offline');
 const remote = await connect(t, api.base);
 await remote.request('register-worker', { workerId: 'worker-1', sharedSecret: 'fixture-secret', captureLocal: false });
 const local = await connect(t, api.base);
 await local.request('register-worker', { workerId: 'worker-2', sharedSecret: 'fixture-secret', captureLocal: true });
 const owner = await connect(t, api.base);
 owner.send('start-live-stream', { videoUrl: 'camera://0' });
 const session = await owner.next('session-created');
 assert.equal(session.workerId, 'worker-2');
 assert.equal((await local.next('start-processing')).videoUrl, 'camera://0');
 assert.equal((await local.next('start-asr')).videoUrl, 'camera://0');
 assert.equal(api.requests.length, 0, 'camera audio processing must remain on the local worker');
});

test('removed FOH URL scheme is rejected before a worker session is allocated', async t => {
 const { connect } = require('./socketClient');
 const api = await fixture(t);
 const worker = await connect(t, api.base);
 assert.equal((await worker.request('register-worker', { workerId: 'worker-2', captureLocal: true })).success, true);
 const owner = await connect(t, api.base);
 owner.send('start-live-stream', { videoUrl: 'foh://0' });
 const result = await owner.next('session-error');
 assert.equal(result.type, 'invalid_input');
 assert.equal(api.backend.sessionManager.getStatus().busy, 0);
});
