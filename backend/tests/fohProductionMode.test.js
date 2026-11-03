const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackend } = require('../index');

 test('FOH-only mode disables legacy translator APIs and Python child startup', async t => {
    const spawned = [];
    const backend = createBackend({
        fohOnly: true,
        autoSpawn: true,
        spawn: (...args) => { spawned.push(args); throw new Error('FOH-only mode must not spawn Python'); },
        cleanupIntervalMs: 0,
        verifyFirebaseToken: async () => null,
        fohStore: {},
        logger: { log() {}, warn() {}, error() {} },
    });
    t.after(() => backend.shutdown());
    const address = await backend.start(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/analyze`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${base}/api/foh-stream/session`, { method: 'POST' })).status, 401);
    assert.equal(spawned.length, 0);
});

test('configured CORS origin is allowlisted and unknown origin receives no access header', async t => {
    const backend = createBackend({
        autoSpawn: false,
        cleanupIntervalMs: 0,
        allowedOrigins: ['https://cowayangai.site'],
        logger: { log() {}, warn() {}, error() {} },
    });
    t.after(() => backend.shutdown());
    const address = await backend.start(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    const allowed = await fetch(`${base}/health`, { headers: { origin: 'https://cowayangai.site' } });
    const blocked = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://cowayangai.site');
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});
