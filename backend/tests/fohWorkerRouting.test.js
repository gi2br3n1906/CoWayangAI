const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionManager } = require('../sessionManager');

test('camera sessions require an idle capture-local worker while YouTube can use any idle worker', () => {
 const manager = new SessionManager({ cleanupIntervalMs: 0 });
 manager.registerPythonWorker('worker-1', 'public-worker', false);
 manager.registerPythonWorker('worker-2', 'foh-worker', true);
 const camera = manager.requestSession('browser-camera', 'camera://0');
 assert.equal(camera.success, true);
 assert.equal(camera.workerId, 'worker-2');
 manager.endSession(camera.sessionId);
 const yt = manager.requestSession('browser-web', 'https://youtu.be/example0001');
 assert.equal(yt.success, true);
 assert.equal(yt.workerId, 'worker-1');
 manager.dispose();
});

test('camera session fails when no capture-local worker is registered', () => {
 const manager = new SessionManager({ cleanupIntervalMs: 0 });
 manager.registerPythonWorker('worker-1', 'public-worker', false);
 const result = manager.requestSession('browser-camera', 'camera://0');
 assert.equal(result.success, false);
 assert.equal(manager.getStatus().busy, 0);
 manager.dispose();
});
