const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackend } = require('../index');
const { createTestFohStore } = require('./helpers/fohStore');

async function setup(t, verifyFirebaseToken) {
    const backend = createBackend({
        autoSpawn: false,
        cleanupIntervalMs: 0,
        verifyFirebaseToken,
        fohStore: createTestFohStore(),
        logger: { log() {}, warn() {}, error() {} },
    });
    t.after(() => backend.shutdown());
    const address = await backend.start(0, '127.0.0.1');
    return `http://127.0.0.1:${address.port}`;
}

test('FOH session creation requires a verified Firebase bearer token', async t => {
    const base = await setup(t, async token => token === 'valid-user-token' ? { uid: 'owner-a' } : null);
    const response = await fetch(`${base}/api/foh-stream/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ streamKey: 'tmii-auth' }),
    });
    assert.equal(response.status, 401);
});

test('FOH reports authentication service failures as unavailable', async t => {
    const base = await setup(t, async () => { throw new Error('credentials unavailable'); });
    const response = await fetch(`${base}/api/foh-stream/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer valid-user-token' },
        body: JSON.stringify({ streamKey: 'tmii-auth' }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Firebase authentication is unavailable' });
});

test('FOH stream owner comes from verified token, never request body', async t => {
    const base = await setup(t, async token => {
        if (token === 'valid-user-token') return { uid: 'owner-a' };
        if (token === 'other-user-token') return { uid: 'owner-b' };
        return null;
    });
    const response = await fetch(`${base}/api/foh-stream/session`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify({ streamKey: 'tmii-auth', ownerUid: 'attacker' }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json();
    assert.equal(data.streamKey, 'tmii-auth');
    assert.ok(data.uploadToken);
    const foreign = await fetch(`${base}/api/foh-stream/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer other-user-token' },
        body: JSON.stringify({ streamKey: 'tmii-auth', ownerUid: 'owner-a' }),
    });
    assert.equal(foreign.status, 409);
});
