const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const { createBackend } = require('../index');

function spawnFixture(t) {
    const children = [];
    const calls = [];
    const spawn = (command, args, options) => {
        calls.push({ command, args, options });
        const child = new EventEmitter();
        child.exitCode = null;
        child.signalCode = null;
        child.kills = [];
        child.kill = signal => {
            child.kills.push(signal);
            child.signalCode = signal;
            child.emit('exit', null, signal);
            child.emit('close', null, signal);
            return true;
        };
        children.push(child);
        return child;
    };
    // Prevent the old implementation from spawning real subprocesses.
    t.mock.method(childProcess, 'spawn', spawn);
    return { children, calls, spawn };
}

test('shutdown kills owned child processes and cannot restart the disposed server', async t => {
    const fake = spawnFixture(t);
    const backend = createBackend({ autoSpawn: true, spawn: fake.spawn, cleanupIntervalMs: 0, logger: { error() {}, warn() {} } });
    await backend.start(0, '127.0.0.1');
    await backend.shutdown();
    assert.equal(fake.children.length, 2);
    assert.equal(fake.children[0].kills.length, 1);
    assert.equal(fake.children[1].kills.length, 1);
    assert.equal(backend.server.listening, false);
    await assert.rejects(backend.start(0, '127.0.0.1'), /shut|disposed/i);
    assert.strictEqual(backend.shutdown(), backend.shutdown());
});

test('shutdown cancels pending restarts before waiting for ASR cleanup', async t => {
    const fake = spawnFixture(t);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const backend = createBackend({
        autoSpawn: true, spawn: fake.spawn, restartDelayMs: 5, cleanupIntervalMs: 0,
        httpClient: { post: () => gate }, logger: { error() {}, warn() {} }
    });
    await backend.start(0, '127.0.0.1');
    backend.sessionManager.registerPythonWorker('worker-1', 'python-socket');
    backend.sessionManager.requestSession('owner', 'https://youtu.be/example');
    fake.children[0].emit('close', 1);
    const shutdown = backend.shutdown();
    try {
        await new Promise(resolve => setTimeout(resolve, 25));
        assert.equal(fake.children.length, 2);
        assert.equal(backend.supervisor.restartTimers.size, 0);
    } finally { release({ data: {} }); await shutdown; }
});

test('shutdown rejects boundedly when child exit cannot be confirmed after forced termination', async () => {
    const { ProcessSupervisor } = require('../lib/processSupervisor');
    const child = new EventEmitter();
    child.kill = signal => { child.signalCode = signal; return true; };
    const supervisor = new ProcessSupervisor([{ name: 'stuck', command: 'unused', args: [], options: {} }], { spawn: () => child, killTimeoutMs: 5, logger: { error() {} } });
    supervisor.start();
    const result = await Promise.race([
        supervisor.stop().then(() => 'resolved', () => 'rejected'),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 100))
    ]);
    assert.equal(result, 'rejected');
});

test('a child termination failure does not leave the HTTP server listening', async t => {
    const backend = createBackend({
        autoSpawn: true, cleanupIntervalMs: 0, killTimeoutMs: 5, logger: { error() {}, warn() {} },
        spawn: () => {
            const child = new EventEmitter();
            child.kill = () => true;
            return child;
        }
    });
    t.after(() => new Promise(resolve => backend.io.close(resolve)));
    await backend.start(0, '127.0.0.1');
    await assert.rejects(backend.shutdown(), /termination/);
    assert.equal(backend.server.listening, false);
});
