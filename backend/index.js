require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios'); // Pastikan ini ada!

const app = express();
const server = http.createServer(app);

// =============================================================================
// KONFIGURASI SERVER EKSTERNAL
// =============================================================================
// Jika ASR server jalan di komputer lain, set di .env:
//   ASR_SERVER_URL=http://192.168.1.100:8001
//   PYTHON_AI_URL=http://192.168.1.100:8000
// Jika jalan di komputer yang sama (localhost), biarkan default
const ASR_SERVER_URL = process.env.ASR_SERVER_URL || 'http://127.0.0.1:8001';
const PYTHON_AI_URL = process.env.PYTHON_AI_URL || 'http://127.0.0.1:8000';

console.log(`[Config] ASR Server: ${ASR_SERVER_URL}`);
console.log(`[Config] Python AI: ${PYTHON_AI_URL}`);

// Setup CORS biar frontend dan python bisa masuk
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const io = new Server(server, {
    cors: {
        origin: "*", // Boleh diakses dari mana aja
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8 // 100 MB buffer size for large frames
});

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Relay AI bounding boxes from Python to Frontend
    socket.on('ai-boxes', (data) => {
        // Broadcast to all clients (Frontend)
        socket.broadcast.volatile.emit('ai-boxes', data);
    });

    // Frontend request to start live stream with YouTube URL
    socket.on('start-live-stream', (data) => {
        console.log(`[Socket] 🎬 Frontend request live stream:`, data);
        console.log(`[Socket] 📤 Broadcasting start-processing to ${io.engine.clientsCount - 1} other clients`);
        // Broadcast to Python client to start processing
        io.emit('start-processing', data); // Use io.emit to send to ALL including sender
    });

    // Frontend request to stop live stream
    socket.on('stop-live-stream', () => {
        console.log(`[Socket] 🛑 Frontend request stop live stream`);
        socket.broadcast.emit('stop-processing');
    });

    // Frontend sends current playback time to Python for sync
    socket.on('player-time', (data) => {
        socket.broadcast.emit('player-time', data);
    });

    // Frontend sends seek event to Python AND ASR
    socket.on('player-seek', async (data) => {
        console.log(`[Socket] ⏩ Player seek to:`, data);
        socket.broadcast.emit('player-seek', data);
        
        // Also seek ASR if running
        if (currentVideoUrl) {
            console.log(`[Socket] 🎙️ Syncing ASR to seek position: ${data.time}s`);
            try {
                await axios.post(`${ASR_SERVER_URL}/seek-asr`, {
                    videoUrl: currentVideoUrl,
                    seekTime: Math.floor(data.time)
                }, { timeout: 3000 });
            } catch (error) {
                console.log(`[Socket] ⚠️ ASR seek failed: ${error.message}`);
            }
        }
    });

    // Frontend sends player state (play/pause/stop)
    socket.on('player-state', async (data) => {
        console.log(`[Socket] 🎮 Player state:`, data);
        
        if (data.state === 'paused' || data.state === 'stopped' || data.state === 'ended') {
            // Pause ASR when video paused/stopped
            if (currentVideoUrl) {
                console.log(`[Socket] ⏸️ Pausing ASR due to player ${data.state}`);
                try {
                    await axios.post(`${ASR_SERVER_URL}/pause-asr`, {
                        videoUrl: currentVideoUrl
                    }, { timeout: 3000 });
                } catch (error) {
                    console.log(`[Socket] ⚠️ ASR pause failed: ${error.message}`);
                }
            }
        } else if (data.state === 'playing') {
            // Resume ASR when video playing
            if (currentVideoUrl) {
                console.log(`[Socket] ▶️ Resuming ASR for playback`);
                try {
                    await axios.post(`${ASR_SERVER_URL}/resume-asr`, {
                        videoUrl: currentVideoUrl,
                        currentTime: Math.floor(data.time || 0)
                    }, { timeout: 3000 });
                } catch (error) {
                    console.log(`[Socket] ⚠️ ASR resume failed: ${error.message}`);
                }
            }
        }
    });

    // Python notifies that stream has started
    socket.on('stream-started', (data) => {
        console.log(`[Socket] ✅ Python started streaming:`, data);
        socket.broadcast.emit('stream-started', data);
    });

    // Python notifies error
    socket.on('stream-error', (data) => {
        console.log(`[Socket] ❌ Python stream error:`, data);
        socket.broadcast.emit('stream-error', data);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

// --- AUTO START PYTHON BACKEND ---
// Set AUTO_START_PYTHON=false di .env jika Python jalan di komputer lain
let pythonProcess = null;

const startPythonBackend = () => {
    if (process.env.AUTO_START_PYTHON === 'false') {
        console.log("[Node] ⏭️ Skipping Python Backend (running externally)");
        return;
    }
    console.log("[Node] 🚀 Starting Python Backend AI...");
    const { spawn } = require('child_process');
    pythonProcess = spawn('python', ['g:\\KERJAAN\\cowayang\\CoWayangAI\\backend-ai\\main.py'], {
        stdio: 'inherit',
        cwd: 'g:\\KERJAAN\\cowayang\\CoWayangAI\\backend-ai'
    });

    pythonProcess.on('exit', (code) => {
        console.log(`[Node] Python Backend exited with code: ${code}`);
        // Auto restart jika keluar
        setTimeout(startPythonBackend, 5000);
    });

    pythonProcess.on('error', (error) => {
        console.error(`[Node] Error starting Python Backend: ${error}`);
    });
};

// --- AUTO START ASR SERVER ---
// Set AUTO_START_ASR=false di .env jika ASR jalan di komputer lain
let asrServerProcess = null;

const startASRServer = () => {
    if (process.env.AUTO_START_ASR === 'false') {
        console.log("[Node] ⏭️ Skipping ASR Server (running externally)");
        return;
    }
    console.log("[Node] 🎙️ Starting ASR Server...");
    const { spawn } = require('child_process');
    asrServerProcess = spawn('python', ['g:\\KERJAAN\\cowayang\\CoWayangAI\\backend-ai\\asr_server.py'], {
        stdio: 'inherit',
        cwd: 'g:\\KERJAAN\\cowayang\\CoWayangAI\\backend-ai'
    });

    asrServerProcess.on('exit', (code) => {
        console.log(`[Node] ASR Server exited with code: ${code}`);
        // Auto restart jika keluar
        setTimeout(startASRServer, 5000);
    });

    asrServerProcess.on('error', (error) => {
        console.error(`[Node] Error starting ASR Server: ${error}`);
    });
};

// Start Python backend saat server start
startPythonBackend();
startASRServer();

// --- ASR PROCESS MANAGEMENT ---
let currentVideoUrl = null;
let currentStartTime = '0';

const stopASR = async () => {
    if (currentVideoUrl) {
        console.log("[Node] 🛑 Stopping ASR for current video...");
        try {
            await axios.post(`${ASR_SERVER_URL}/stop-asr`, {
                videoUrl: currentVideoUrl,
                startTime: parseInt(currentStartTime)
            });
        } catch (error) {
            console.error("[Node] Error stopping ASR:", error.message);
        }
        currentVideoUrl = null;
        currentStartTime = '0';
    }
};

const startASR = async (videoUrl, startTime) => {
    // Always stop existing ASR first
    await stopASR();
    
    console.log(`[Node] 🎙️ Starting ASR for: ${videoUrl} at ${startTime}`);
    try {
        const response = await axios.post(`${ASR_SERVER_URL}/start-asr`, {
            videoUrl: videoUrl,
            startTime: parseInt(startTime)
        });
        console.log("[Node] ASR Server Response:", response.data);
        currentVideoUrl = videoUrl;
        currentStartTime = startTime;
    } catch (error) {
        console.error("[Node] Error starting ASR:", error.message);
    }
};

// --- ENDPOINT 1: Menerima Perintah dari Frontend ---
app.post('/api/analyze', async (req, res) => {
    console.log("\n========================================");
    console.log("[Node] 1. Menerima Request dari Frontend...");
    
    const { videoUrl, startMinute } = req.body;
    
    // Validasi input
    if (!videoUrl) {
        console.error("[Node] ❌ Error: URL Video kosong!");
        return res.status(400).json({ status: 'error', message: 'URL Kosong' });
    }

    // Konversi menit ke detik
    const startTimeInSeconds = (parseInt(startMinute) || 0) * 60;

    console.log(`[Node]    URL: ${videoUrl}`);
    console.log(`[Node]    Start: ${startMinute} menit (${startTimeInSeconds} detik)`);
    
    // Track current video for seek functionality
    currentVideoUrl = videoUrl;
    currentStartTime = startTimeInSeconds.toString();

    // Try Python AI (optional - won't block ASR if fails)
    let pythonSuccess = false;
    try {
        console.log(`[Node] 2. Mencoba menghubungi Python AI (Port 8000)...`);
        const pythonResponse = await axios.post(`${PYTHON_AI_URL}/start-analysis`, {
            videoUrl: videoUrl,
            startTime: startTimeInSeconds
        }, { timeout: 5000 }); // 5 second timeout

        console.log("[Node] ✅ 3. Python Merespon: Sukses!");
        console.log("[Node]    Status Python:", pythonResponse.data);
        pythonSuccess = true;
    } catch (error) {
        console.log("[Node] ⚠️ Python AI tidak tersedia, lanjut dengan ASR saja...");
    }

    // AUTO START ASR (always try, regardless of Python status)
    try {
        console.log("[Node] 4. Starting ASR...");
        await startASR(videoUrl, startTimeInSeconds.toString());
        
        const message = pythonSuccess 
            ? 'AI dan ASR dimulai' 
            : 'ASR dimulai (AI tidak tersedia)';
        res.json({ status: 'success', message: message });

    } catch (error) {
        console.error("[Node] ❌ GAGAL Start ASR!");
        console.error("[Node]    Error Message:", error.message);
        res.status(500).json({ status: 'error', message: 'Gagal start ASR' });
    }
    console.log("========================================\n");
});

// --- ENDPOINT 2: Start ASR Transcription ---
app.post('/api/start-asr', async (req, res) => {
    console.log("\n========================================");
    console.log("[Node] 1. Menerima Request ASR dari Frontend...");
    
    const { videoUrl, startTime } = req.body;
    
    // Validasi input
    if (!videoUrl) {
        console.error("[Node] ❌ Error: URL Video kosong!");
        return res.status(400).json({ status: 'error', message: 'URL Kosong' });
    }

    try {
        startASR(videoUrl, startTime || '0');
        res.json({ status: 'success', message: 'ASR transcription started' });
    } catch (error) {
        console.error("[Node] ❌ Error starting ASR:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menjalankan ASR' });
    }
    console.log("========================================\n");
});

// --- ENDPOINT 3: Update ASR Start Time ---
app.post('/api/update-asr-time', async (req, res) => {
    console.log("\n========================================");
    console.log("[Node] 1. Update ASR Start Time...");
    
    const { startTime } = req.body;
    
    if (!currentVideoUrl) {
        return res.status(400).json({ status: 'error', message: 'Tidak ada video aktif' });
    }

    try {
        startASR(currentVideoUrl, startTime || '0');
        res.json({ status: 'success', message: 'ASR time updated' });
    } catch (error) {
        console.error("[Node] ❌ Error updating ASR time:", error);
        res.status(500).json({ status: 'error', message: 'Gagal update ASR time' });
    }
    console.log("========================================\n");
});

// --- ENDPOINT 4: Stop ASR ---
app.post('/api/stop-asr', async (req, res) => {
    console.log("\n========================================");
    console.log("[Node] Stopping ASR process...");
    
    try {
        stopASR();
        res.json({ status: 'success', message: 'ASR stopped' });
    } catch (error) {
        console.error("[Node] ❌ Error stopping ASR:", error);
        res.status(500).json({ status: 'error', message: 'Gagal stop ASR' });
    }
    console.log("========================================\n");
});

// --- ENDPOINT 5: Seek AI Analysis ---
app.post('/api/seek-analysis', async (req, res) => {
    console.log("\n========================================");
    console.log("[Node] 📍 Seek AI Analysis Request...");
    
    const { startTime } = req.body;
    
    if (!currentVideoUrl) {
        return res.status(400).json({ status: 'error', message: 'Tidak ada video aktif' });
    }

    console.log(`[Node]    Seeking to: ${startTime} seconds`);
    console.log(`[Node]    Video: ${currentVideoUrl}`);

    try {
        // Stop current analysis first
        console.log("[Node] 🛑 Stopping current AI analysis...");
        try {
            await axios.post(`${PYTHON_AI_URL}/stop-analysis`, {}, { timeout: 3000 });
        } catch (stopErr) {
            console.log("[Node] Note: Stop request completed or timed out");
        }

        // Small delay to ensure thread is stopped
        await new Promise(resolve => setTimeout(resolve, 500));

        // Restart from new position
        console.log("[Node] 🚀 Starting AI analysis from seek position...");
        const pythonResponse = await axios.post(`${PYTHON_AI_URL}/start-analysis`, {
            videoUrl: currentVideoUrl,
            startTime: parseInt(startTime) || 0
        });

        console.log("[Node] ✅ AI Analysis restarted from seek position:", pythonResponse.data);
        
        // Also update ASR
        const hours = Math.floor(startTime / 3600);
        const minutes = Math.floor((startTime % 3600) / 60);
        const seconds = Math.floor(startTime % 60);
        const timeStr = hours > 0 ? 
            `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` :
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        await startASR(currentVideoUrl, timeStr);
        
        res.json({ status: 'success', message: 'AI seek successful', startTime: startTime });
    } catch (error) {
        console.error("[Node] ❌ Error seeking AI:", error.message);
        res.status(500).json({ status: 'error', message: 'Gagal seek AI' });
    }
    console.log("========================================\n");
});

// --- ENDPOINT 2: Webhook (Menerima Hasil dari Python) ---
app.post('/api/webhook', (req, res) => {
    const data = req.body;
    console.log(`[Node] Webhook masuk: ${data.type}`, data);
    
    // Broadcast ke Frontend
    io.emit('ai-result', data);
    
    res.json({ status: 'ok' });
});

// --- ENDPOINT 6: Search YouTube Videos ---
app.get('/api/search-youtube', async (req, res) => {
    console.log("\n========================================");
    console.log("[Node] 🔎 YouTube Search Request...");
    
    const { q } = req.query;
    
    if (!q) {
        console.error("[Node] ❌ Error: Query pencarian kosong!");
        return res.status(400).json({ status: 'error', message: 'Query pencarian kosong' });
    }

    console.log(`[Node]    Query: ${q}`);

    try {
        const apiKey = process.env.YOUTUBE_API_KEY;
        
        if (!apiKey || apiKey === 'your_youtube_api_key_here') {
            console.error("[Node] ❌ Error: YOUTUBE_API_KEY tidak dikonfigurasi!");
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

        console.log(`[Node] ✅ Ditemukan ${videos.length} video`);
        res.json({ status: 'success', videos: videos });

    } catch (error) {
        console.error("[Node] ❌ Error searching YouTube:", error.message);
        
        if (error.response) {
            console.error("[Node]    Status:", error.response.status);
            console.error("[Node]    Data:", error.response.data);
        }
        
        res.status(500).json({ status: 'error', message: 'Gagal mencari video YouTube' });
    }
    console.log("========================================\n");
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Backend Node.js jalan di http://0.0.0.0:${PORT}`);
});

// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
        console.error("[Node] Error fetching YouTube info:", error.message);
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
