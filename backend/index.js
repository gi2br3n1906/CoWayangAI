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
        
        res.json({ status: 'success', message: 'Perintah dikirim ke AI' });

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

// --- ENDPOINT 2: Webhook (Menerima Hasil dari Python) ---
app.post('/api/webhook', (req, res) => {
    const data = req.body;
    // Log biar kelihatan kalo ada data masuk (opsional, bisa dimatiin biar gak spam)
    // console.log(`[Node] Webhook masuk: ${data.type}`); 
    
    // Broadcast ke Frontend
    io.emit('ai-result', data);
    
    res.json({ status: 'ok' });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server Backend Node.js jalan di http://localhost:${PORT}`);
});