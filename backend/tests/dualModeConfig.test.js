const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createBackend } = require('../index');

async function request(base, path, options = {}) {
 const response = await fetch(base + path, options)
 return { status: response.status, body: await response.json() }
}
async function start(options = {}) {
 const backend = createBackend({ autoSpawn: false, cleanupIntervalMs: 0, ...options })
 await backend.start(0, '127.0.0.1')
 const base = `http://127.0.0.1:${backend.server.address().port}`
 return { backend, base }
}

test('local mode uses the repository backend-ai directory and accepts unsigned webhook broadcast', async t => {
 const previous = process.env.OPERATION_MODE
 delete process.env.OPERATION_MODE
 const { backend, base } = await start()
 t.after(() => { if (previous === undefined) delete process.env.OPERATION_MODE; else process.env.OPERATION_MODE = previous; return backend.shutdown() })
 assert.match(backend.supervisor.specs[0].args[0], /backend-ai[\\/]live_stream_worker\.py$/)
 assert.ok(backend.supervisor.specs[0].args.includes(require('node:path').resolve(__dirname, '../../ai/weight.pt')))
 const expectedPython = require('node:fs').existsSync(require('node:path').resolve(__dirname, '../../ai/.venv/Scripts/python.exe'))
  ? require('node:path').resolve(__dirname, '../../ai/.venv/Scripts/python.exe')
  : (process.platform === 'win32' ? 'python' : 'python3')
 assert.equal(backend.supervisor.specs[0].command, expectedPython)
 const result = await request(base, '/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'subtitle', data: { text: 'uji' } }) })
 assert.equal(result.status, 200)
})

test('hybrid mode requires the shared secret for webhook and worker registration', async t => {
 const previousMode = process.env.OPERATION_MODE, previousSecret = process.env.WORKER_SHARED_SECRET
 process.env.OPERATION_MODE = 'hybrid'; process.env.WORKER_SHARED_SECRET = 'fixture-secret'
 const { backend, base } = await start()
 t.after(() => { if (previousMode === undefined) delete process.env.OPERATION_MODE; else process.env.OPERATION_MODE = previousMode; if (previousSecret === undefined) delete process.env.WORKER_SHARED_SECRET; else process.env.WORKER_SHARED_SECRET = previousSecret; return backend.shutdown() })
 const rejected = await request(base, '/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'subtitle', sessionId: 'sess_missing', data: { text: 'uji' } }) })
 assert.equal(rejected.status, 401)
 const accepted = await request(base, '/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cowayang-secret': 'fixture-secret' }, body: JSON.stringify({ type: 'subtitle', sessionId: 'sess_missing', data: { text: 'uji' } }) })
 assert.equal(accepted.status, 200)
 assert.equal(backend.io._nsps.get('/').sockets.size, 0)
})
