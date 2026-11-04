if (require.main === module && process.env.NODE_ENV !== 'test') require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const defaultHttpClient = require('axios');
const { SessionManager } = require('./sessionManager');
const { createAsrController } = require('./lib/asrController');
const { installAsrRoutes } = require('./lib/apiRoutes');
const { createUpstreamPost, serializeByVideo } = require('./lib/upstream');
const { installSocketHandlers } = require('./lib/socketHandlers');
const { ProcessSupervisor } = require('./lib/processSupervisor');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createFohBroadcaster } = require('./lib/fohBroadcaster');
const { createFirebaseTokenVerifier } = require('./lib/firebaseAuth');

function createBackend(options = {}) {
    const axios = options.httpClient || defaultHttpClient;
    const fohOnly = options.fohOnly ?? process.env.FOH_ONLY_MODE === 'true';
    const allowedOrigins = options.allowedOrigins || (process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
        : process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']);
    const sessionManager = options.sessionManager || new SessionManager({ cleanupIntervalMs: options.cleanupIntervalMs ?? 60000 });
    let shuttingDown = false;

    const app = express();
    const server = http.createServer(app);

    // =============================================================================
    // KONFIGURASI SERVER EKSTERNAL
    // =============================================================================
    // Jika ASR server jalan di komputer lain, set di .env:
    //   ASR_SERVER_URL=http://192.168.1.100:8001
    //   PYTHON_AI_URL=http://192.168.1.100:8000
    // Jika jalan di komputer yang sama (localhost), biarkan default
    const operationMode = options.operationMode || process.env.OPERATION_MODE || 'local';
    if (!['local', 'hybrid'].includes(operationMode)) throw new Error('OPERATION_MODE must be local or hybrid');
    const workerSharedSecret = options.workerSharedSecret ?? process.env.WORKER_SHARED_SECRET ?? '';
    const ASR_SERVER_URL = options.asrServerUrl || process.env.ASR_SERVER_URL || 'http://127.0.0.1:8001';
    const PYTHON_AI_URL = options.pythonAiUrl || process.env.PYTHON_AI_URL || 'http://127.0.0.1:8000';
    const asrPost = serializeByVideo(createUpstreamPost(axios, ASR_SERVER_URL, options.upstreamTimeoutMs ?? 5000));
    const aiPost = createUpstreamPost(axios, PYTHON_AI_URL, options.upstreamTimeoutMs ?? 5000);

    app.use(cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, origin || false);
            return callback(null, false);
        },
        credentials: false,
    }));
    app.use((req, res, next) => {
        if (shuttingDown) return res.status(503).json({ status: 'error', message: 'Backend is shutting down' });
        next();
    });
    app.use('/api/foh-stream/:streamKey/audio', express.raw({ type: ['audio/webm', 'audio/ogg', 'audio/wav'], limit: '8mb' }));
    app.use('/api/foh-stream/:streamKey/script-preview', express.json({ limit: '12mb' }));
    app.use('/api/foh-stream/:streamKey/script-position', express.json({ limit: '2mb' }));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    const io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"],
            credentials: false,
        },
        maxHttpBufferSize: 1e8 // 100 MB buffer size for large frames
    });

    const foh = createFohBroadcaster({
        io,
        googleGenAi: options.googleGenAi,
        authenticate: options.authenticate || options.verifyFirebaseToken || createFirebaseTokenVerifier({ auth: options.firebaseAuth }),
        store: options.fohStore,
        logger: options.logger || console,
    });
    foh.installSocket(io);

    const socketHandlers = fohOnly
        ? { drain: async () => {}, detach: () => {} }
        : installSocketHandlers(io, sessionManager, {
            asrPost,
            operationMode,
            workerSharedSecret,
            logger: options.logger || console
        });

    // Only the CLI (or explicit start()) owns local Python children.
    const pythonDir = options.pythonDir || process.env.PYTHON_BACKEND_DIR || path.resolve(__dirname, '../backend-ai');
    const localPython = path.resolve(__dirname, process.platform === 'win32' ? '../ai/.venv/Scripts/python.exe' : '../ai/.venv/bin/python');
    const defaultPythonExecutable = fs.existsSync(localPython) ? localPython : (process.platform === 'win32' ? 'python' : 'python3');
    const pythonExecutable = options.pythonExecutable || process.env.PYTHON_EXECUTABLE || defaultPythonExecutable;
    const logger = options.logger || console;
    const specs = fohOnly ? [] : [
        { name: 'yolo-worker', script: 'live_stream_worker.py', enabled: process.env.AUTO_START_PYTHON !== 'false', args: ['--worker-id', process.env.WORKER_ID || 'worker-1', '--server', process.env.COWAYANG_SERVER_URL || 'http://127.0.0.1:3000', '--model', process.env.YOLO_MODEL_PATH || path.resolve(__dirname, '../ai/weight.pt')] },
        { name: 'asr', script: 'asr_server.py', enabled: process.env.AUTO_START_ASR !== 'false' }
    ].filter(spec => spec.enabled).map(spec => ({ name: spec.name, command: pythonExecutable, args: [path.join(pythonDir, spec.script), ...(spec.args || [])], options: { cwd: pythonDir, stdio: 'inherit' } }));
    const supervisor = new ProcessSupervisor(specs, { spawn: options.spawn, restartDelayMs: options.restartDelayMs, killTimeoutMs: options.killTimeoutMs, logger });

    const asr = createAsrController(asrPost);
    if (!fohOnly) installAsrRoutes(app, { asr, aiPost });

    // --- ENDPOINT 2: Webhook (Menerima Hasil dari Python) ---
    const validSecret = provided => {
        if (operationMode !== 'hybrid') return true;
        if (!workerSharedSecret || typeof provided !== 'string') return false;
        const a = Buffer.from(provided); const b = Buffer.from(workerSharedSecret);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    };
    if (!fohOnly) app.post('/api/webhook', (req, res) => {
        if (!validSecret(req.get('x-cowayang-secret'))) return res.status(401).json({ status: 'error', message: 'Worker authentication failed' });
        const data = req.body;
        const session = data.sessionId && sessionManager.getSession(data.sessionId);
        if (session?.socketId) io.to(session.socketId).emit('ai-result', data);
        else if (operationMode === 'local' || process.env.STAGE_BROADCAST === 'true') io.emit('ai-result', data);

        res.json({ status: 'ok' });
    });

    foh.installRoutes(app);
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    if (!fohOnly) {
    // --- ENDPOINT 6: Search YouTube Videos ---
    app.get('/api/search-youtube', async (req, res) => {

        const { q } = req.query;

        if (!q) {
            return res.status(400).json({ status: 'error', message: 'Query pencarian kosong' });
        }

        try {
            const apiKey = process.env.YOUTUBE_API_KEY;

            if (!apiKey || apiKey === 'your_youtube_api_key_here') {
                return res.status(500).json({ status: 'error', message: 'YouTube API Key belum dikonfigurasi' });
            }

            const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    type: 'video',
                    maxResults: 6,
                    key: apiKey,
                    q: q
                }
            });

            // Format hasil untuk frontend
            const videos = response.data.items.map(item => ({
                videoId: item.id.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.medium.url,
                channelTitle: item.snippet.channelTitle,
                publishedAt: item.snippet.publishedAt
            }));

            res.json({ status: 'success', videos: videos });

        } catch (error) {

            res.status(500).json({ status: 'error', message: 'Gagal mencari video YouTube' });
        }
    });

    // --- ENDPOINT 8: Worker Status ---
    app.get('/api/worker-status', (req, res) => {
        const status = sessionManager.getStatus();
        res.json({
            success: true,
            ...status,
            message: status.available > 0
                ? `${status.available}/${status.total} slot tersedia`
                : `Server penuh (${status.busy}/${status.total} slot terpakai)`
        });
    });

    // --- ENDPOINT 7: Get YouTube Video Info ---
    app.get('/api/youtube-info', async (req, res) => {
        const { videoId } = req.query;

        if (!videoId) {
            return res.status(400).json({ status: 'error', message: 'videoId diperlukan' });
        }

        try {
            const apiKey = process.env.YOUTUBE_API_KEY;

            if (!apiKey || apiKey === 'your_youtube_api_key_here') {
                return res.status(500).json({ status: 'error', message: 'YouTube API Key belum dikonfigurasi' });
            }

            const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
                params: {
                    part: 'snippet,contentDetails',
                    id: videoId,
                    key: apiKey
                }
            });

            if (response.data.items && response.data.items.length > 0) {
                const video = response.data.items[0];
                const duration = video.contentDetails.duration; // Format ISO 8601 (PT1H2M3S)

                // Parse ISO 8601 duration to readable format
                const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                const hours = parseInt(match[1] || 0);
                const minutes = parseInt(match[2] || 0);
                const seconds = parseInt(match[3] || 0);

                let durationStr = '';
                if (hours > 0) {
                    durationStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                } else {
                    durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }

                res.json({
                    status: 'success',
                    title: video.snippet.title,
                    duration: durationStr,
                    thumbnail: video.snippet.thumbnails.medium.url,
                    channelTitle: video.snippet.channelTitle
                });
            } else {
                res.status(404).json({ status: 'error', message: 'Video tidak ditemukan' });
            }

        } catch (error) {
            res.status(500).json({ status: 'error', message: 'Gagal mengambil info video' });
        }
    });

    // --- ASR Status Endpoint (proxy to ASR server) ---
    app.get('/api/asr-status', async (req, res) => {
        try {
            const response = await axios.get(`${ASR_SERVER_URL}/pool-status`, { timeout: 5000 });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({ status: 'error', message: 'ASR server not reachable' });
        }
    });
    }

    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Audio chunk exceeds the 8 MB limit' });
        logger.error(`[HTTP] ${error.message}`);
        if (error.statusCode === 503) return res.status(503).json({ error: 'Firebase authentication is unavailable' });
        return res.status(error.status || 500).json({ error: error.status === 400 ? 'Invalid request body' : 'Service unavailable' });
    });

    let shutdownPromise = null;
    let starting = null;
    const start = (port = options.port ?? process.env.PORT ?? 3000, host = options.host || process.env.HOST || '0.0.0.0') => {
        if (shuttingDown) return Promise.reject(new Error('Backend has been shut down'));
        if (server.listening) return Promise.resolve(server.address());
        if (starting) return starting;
        starting = new Promise((resolve, reject) => {
            const failed = error => { starting = null; reject(error); };
            server.once('error', failed);
            server.listen(Number(port), host, () => {
                server.removeListener('error', failed);
                const autoSpawn = !fohOnly && (options.autoSpawn ?? !(process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT));
                if (!shuttingDown && autoSpawn) {
                    supervisor.specs = specs.filter(spec => {
                        if (options.spawn || fs.existsSync(spec.args[0])) return true;
                        logger.warn(`[Process] ${path.basename(spec.args[0])} is missing; configure external services or PYTHON_BACKEND_DIR`);
                        return false;
                    });
                    supervisor.start();
                }
                resolve(server.address());
            });
        });
        return starting;
    };
    const shutdown = () => {
        if (shutdownPromise) return shutdownPromise;
        shuttingDown = true;
        supervisor.haltRestarts();
        sessionManager.dispose();
        shutdownPromise = (async () => {
            try {
                await socketHandlers.drain();
                await asr.close();
            } finally {
                try { await supervisor.stop(); }
                finally {
                    await new Promise(resolve => io.close(() => resolve()));
                    socketHandlers.detach();
                }
            }
        })();
        return shutdownPromise;
    };
    return { app, server, io, sessionManager, start, shutdown, supervisor, asr, operationMode };
}

const backend = createBackend({ cleanupIntervalMs: require.main === module ? 60000 : 0 });
module.exports = { createBackend, ...backend };
if (require.main === module) {
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
        backend.shutdown().catch(error => { console.error(error.message); process.exitCode = 1; });
    });
    backend.start().then(address => console.log(`[Node] Listening on ${address.port}`)).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
