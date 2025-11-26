require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios'); // Pastikan ini ada!

const app = express();
const server = http.createServer(app);

// Setup CORS biar frontend dan python bisa masuk
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const io = new Server(server, {
    cors: {
        origin: "*", // Boleh diakses dari mana aja
        methods: ["GET", "POST"]
    }
});

// --- AUTO START PYTHON BACKEND ---
let pythonProcess = null;

const startPythonBackend = () => {
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
let asrServerProcess = null;

const startASRServer = () => {
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
            await axios.post('http://127.0.0.1:8001/stop-asr', {
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
        const response = await axios.post('http://127.0.0.1:8001/start-asr', {
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
    console.log(`[Node] 2. Sedang menghubungi Python (Port 8000)...`);

    try {
        // TEMBAK KE PYTHON
        // Pastikan URL ini benar: http://127.0.0.1:8000/start-analysis
        const pythonResponse = await axios.post('http://127.0.0.1:8000/start-analysis', {
            videoUrl: videoUrl,
            startTime: startTimeInSeconds
        });

        console.log("[Node] ✅ 3. Python Merespon: Sukses!");
        console.log("[Node]    Status Python:", pythonResponse.data);
        
        // Track current video for seek functionality
        currentVideoUrl = videoUrl;
        currentStartTime = startTimeInSeconds.toString();
        
        // AUTO START ASR
        console.log("[Node] 4. Starting ASR automatically...");
        await startASR(videoUrl, startTimeInSeconds.toString());
        
        res.json({ status: 'success', message: 'Perintah dikirim ke AI dan ASR dimulai' });

    } catch (error) {
        console.error("[Node] ❌ 3. GAGAL Menghubungi Python!");
        console.error("[Node]    Error Message:", error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error("[Node]    SEBAB: Server Python (main.py) belum jalan atau beda port!");
        }

        res.status(500).json({ status: 'error', message: 'Gagal connect ke AI' });
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
            await axios.post('http://127.0.0.1:8000/stop-analysis', {}, { timeout: 3000 });
        } catch (stopErr) {
            console.log("[Node] Note: Stop request completed or timed out");
        }

        // Small delay to ensure thread is stopped
        await new Promise(resolve => setTimeout(resolve, 500));

        // Restart from new position
        console.log("[Node] 🚀 Starting AI analysis from seek position...");
        const pythonResponse = await axios.post('http://127.0.0.1:8000/start-analysis', {
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
server.listen(PORT, () => {
    console.log(`🚀 Server Backend Node.js jalan di http://localhost:${PORT}`);
});
