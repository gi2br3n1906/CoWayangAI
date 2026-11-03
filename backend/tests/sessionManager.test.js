const test = require('node:test');
const assert = require('node:assert/strict');

// The legacy module starts an undisposable singleton interval on import.
const originalInterval = global.setInterval;
const legacyTimers = [];
global.setInterval = (...args) => {
    const timer = originalInterval(...args);
    timer.unref();
    legacyTimers.push(timer);
    return timer;
};
const { SessionManager } = require('../sessionManager');
function manager(t, options = {}) {
    const instance = new SessionManager({ cleanupIntervalMs: 0, ...options });
    t.after(() => {
        instance.dispose?.();
        legacyTimers.splice(0).forEach(clearInterval);
    });
    return instance;
}

test('unregistered workers are offline, not assignable capacity', t => {
    const sessions = manager(t);
    assert.equal(sessions.getStatus().available, 0);
    assert.equal(sessions.getStatus().offline, 20);
    assert.equal(sessions.requestSession('frontend', 'https://youtu.be/example').success, false);
    assert.equal(sessions.registerPythonWorker('worker-1', 'python'), true);
    assert.equal(sessions.getStatus().available, 1);
    assert.equal(sessions.requestSession('frontend', 'https://youtu.be/example').workerId, 'worker-1');
    sessions.unregisterPythonWorker('python');
    assert.equal(sessions.getStatus().available, 0);
    assert.equal(sessions.getStatus().offline, 20);
});

test('an expired reconnect releases its reservation before assigning a replacement', t => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const sessions = manager(t);
    sessions.registerPythonWorker('worker-1', 'python');
    const first = sessions.requestSession('first', 'https://youtu.be/example');
    sessions.handleDisconnect('first');
    now += 5 * 60 * 1000;
    const replacement = sessions.requestSession('replacement', 'https://youtu.be/example', first.sessionId);
    assert.equal(replacement.success, true);
    assert.notEqual(replacement.sessionId, first.sessionId);
    assert.equal(sessions.getStatus().pendingReconnect, 0);
    assert.equal(sessions.getStatus().busy, 1);
});

test('duplicate requests reuse the session without a second processing start', t => {
    const sessions = manager(t);
    sessions.registerPythonWorker('worker-1', 'python');
    const first = sessions.requestSession('owner', 'https://youtu.be/example');
    const duplicate = sessions.requestSession('owner', 'https://youtu.be/example');
    assert.equal(first.shouldStart, true);
    assert.equal(duplicate.shouldStart, false);
    assert.equal(duplicate.sessionId, first.sessionId);
    assert.equal(sessions.getStatus().activeSessions, 1);
});

test('session ownership rejects takeover and conflicting video reuse', t => {
    const sessions = manager(t);
    sessions.registerPythonWorker('worker-1', 'python');
    sessions.registerPythonWorker('worker-2', 'python-2');
    const first = sessions.requestSession('owner', 'https://youtu.be/example');
    assert.equal(sessions.requestSession('intruder', 'https://youtu.be/example', first.sessionId).success, false);
    assert.equal(sessions.requestSession('owner', 'https://youtu.be/other').success, false);
    assert.equal(sessions.updateSocketId(first.sessionId, 'intruder'), false);
    assert.equal(sessions.getSession(first.sessionId).socketId, 'owner');
    sessions.handleDisconnect('owner');
    assert.equal(sessions.requestSession('new-owner', 'https://youtu.be/other', first.sessionId).success, false);
    const reconnected = sessions.requestSession('new-owner', 'https://youtu.be/example', first.sessionId);
    assert.equal(reconnected.reconnected, true);
    assert.equal(reconnected.shouldStart, false);
    assert.equal(sessions.getSession(first.sessionId).socketId, 'new-owner');
});

test('reservation expiry emits a stop notification and dispose clears cleanup timers', t => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const sessions = manager(t, { cleanupIntervalMs: 10 });
    assert.equal(typeof sessions.on, 'function');
    const ended = [];
    sessions.on('session-ended', event => ended.push(event));
    sessions.registerPythonWorker('worker-1', 'python');
    const first = sessions.requestSession('owner', 'https://youtu.be/example');
    sessions.handleDisconnect('owner');
    now += 5 * 60 * 1000;
    sessions.cleanupExpiredSessions();
    assert.equal(ended.length, 1);
    assert.equal(ended[0].sessionId, first.sessionId);
    assert.equal(ended[0].pythonSocketId, 'python');
    assert.equal(ended[0].reason, 'reconnect_timeout');
    assert.equal(sessions.getStatus().available, 1);
    sessions.dispose();
    assert.equal(sessions.cleanupTimer, null);
    assert.equal(sessions.requestSession('late', 'https://youtu.be/example').success, false);
});

test('worker registration cannot replace a live socket or claim multiple worker IDs', t => {
    const sessions = manager(t);
    assert.equal(sessions.registerPythonWorker('worker-1', 'python'), true);
    assert.equal(sessions.registerPythonWorker('worker-1', 'intruder'), false);
    assert.equal(sessions.registerPythonWorker('worker-2', 'python'), false);
    assert.equal(sessions.registerPythonWorker('worker-1', 'python'), true);
    const first = sessions.requestSession('owner', 'https://youtu.be/example');
    sessions.handleDisconnect('owner');
    sessions.unregisterPythonWorker('python');
    assert.equal(sessions.pendingReconnect.has(first.sessionId), false);
    assert.equal(sessions.getStatus().offline, 20);
    assert.equal(sessions.registerPythonWorker('worker-1', 'replacement-python'), true);
    assert.equal(sessions.getStatus().available, 1);
});
