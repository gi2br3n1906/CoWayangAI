const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// POST /api/analyze
// Menerima videoUrl dari frontend dan mengirim ke AI API
app.post('/api/analyze', async (req, res) => {
  try {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' });
    }

    console.log('Analyzing video:', videoUrl);

    // URL AI API (gunakan dummy URL dulu)
    const aiApiUrl = process.env.AI_API_URL || 'http://localhost:8000/analyze';
    const webhookUrl = process.env.WEBHOOK_URL || `http://localhost:${PORT}/api/webhook`;

    // Kirim request ke AI API
    const aiResponse = await axios.post(aiApiUrl, {
      videoUrl: videoUrl,
      webhookUrl: webhookUrl
    });

    console.log('AI API response:', aiResponse.data);

    res.json({ 
      success: true, 
      message: 'Analysis started',
      data: aiResponse.data 
    });

  } catch (error) {
    console.error('Error in /api/analyze:', error.message);
    
    // Jika AI API tidak tersedia, tetap return success
    if (error.code === 'ECONNREFUSED') {
      res.json({ 
        success: true, 
        message: 'Analysis request received (AI API not available yet)',
        note: 'Webhook akan menerima hasil ketika AI selesai'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to start analysis',
        details: error.message 
      });
    }
  }
});

// POST /api/webhook
// Menerima hasil analisis dari AI dan broadcast ke frontend
app.post('/api/webhook', (req, res) => {
  try {
    const { type, data } = req.body;

    console.log('Webhook received:', { type, data });

    if (!type || !data) {
      return res.status(400).json({ error: 'type and data are required' });
    }

    // Broadcast hasil ke semua client yang terhubung via Socket.IO
    io.emit('ai-result', {
      type: type,
      data: data,
      timestamp: new Date().toISOString()
    });

    console.log('Broadcasted ai-result to clients');

    res.json({ 
      success: true, 
      message: 'Result broadcasted to clients' 
    });

  } catch (error) {
    console.error('Error in /api/webhook:', error.message);
    res.status(500).json({ 
      error: 'Failed to process webhook',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    connectedClients: io.engine.clientsCount
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO ready for connections`);
});
