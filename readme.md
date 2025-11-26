# 🎭 Co-Wayang AI

> Platform analisis video wayang kulit real-time menggunakan teknologi AI

![Vue.js](https://img.shields.io/badge/Vue.js-3.5-4FC08D?style=flat&logo=vue.js&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat&logo=node.js&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat&logo=socket.io&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

## 📖 Tentang Project

Co-Wayang AI adalah aplikasi web modern untuk menganalisis video pertunjukan wayang kulit secara real-time. Sistem ini dapat:

- 🎯 Mendeteksi karakter wayang dalam video
- 📝 Mentranskripsikan dialog dan subtitle otomatis
- ⚡ Menampilkan hasil analisis secara real-time
- 🔐 Autentikasi pengguna dengan Firebase
- 🎨 UI/UX modern dengan dark mode theme

**Note:** Backend AI untuk analisis video dikembangkan di repository terpisah. Project ini fokus pada frontend dan backend integration layer.

---

## 🏗️ Struktur Project

```
CoWayangAI_V2/
├── frontend/          # Vue.js 3 + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── views/         # Page views
│   │   ├── stores/        # Pinia state management
│   │   ├── router/        # Vue Router config
│   │   └── firebase.js    # Firebase configuration
│   └── package.json
│
├── backend/           # Node.js + Express + Socket.IO
│   ├── index.js           # Main server file
│   ├── .env               # Environment variables
│   └── package.json
│
└── README.md
```

---

## ✨ Fitur Utama

### Frontend Features
- 🎬 **YouTube Video Player** - Integrasi iframe YouTube dengan auto-scroll
- 👤 **Authentication** - Login dengan Email/Password, Google, dan GitHub
- 📊 **Live Dashboard** - 3-column layout untuk analisis real-time:
  - Character detection list (kiri)
  - Video player (tengah)
  - Live transcription (kanan)
- 🎨 **Modern UI/UX** - Dark theme dengan glassmorphism effects
- 📱 **Responsive Design** - Mobile-friendly layout
- ⚡ **Real-time Updates** - Socket.IO integration

### Backend Features
- 🔌 **WebSocket Server** - Socket.IO untuk komunikasi real-time
- 🌐 **REST API** - Express endpoints untuk analisis
- 🔗 **AI Integration** - Webhook system untuk menerima hasil AI
- 🔒 **CORS Enabled** - Configured untuk frontend integration

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x atau 22.x
- Python 3.8+
- Git
- Firebase account (untuk authentication)

### Quick Installation

CoWayangAI sekarang dilengkapi dengan skrip instalasi otomatis yang akan menghandle semua setup untuk Anda!

#### 1. Clone Repository

```bash
git clone https://github.com/gi2br3n1906/CoWayangAI.git
cd CoWayangAI
```

#### 2. Run Installation Script

```bash
bash install.sh
```

Skrip instalasi akan:
- ✅ Memeriksa dan menginstall dependencies sistem (Node.js, Python, PM2, yt-dlp)
- ✅ Meminta konfigurasi (Firebase credentials, API keys, dll)
- ✅ Membuat file `.env` untuk semua services
- ✅ Menginstall dependencies untuk backend, frontend, dan AI backend
- ✅ Setup Python virtual environment
- ✅ Menjalankan semua backend services dengan PM2
- ✅ Melakukan health check

#### 3. Start Frontend Development Server

```bash
cd frontend
npm run dev
```

Frontend akan berjalan di `http://localhost:5173`

#### 4. (Optional) Refresh YouTube Cookies

Jika Anda mengalami masalah saat mengakses video YouTube, refresh cookies:

```bash
bash backend-ai/refresh-cookies.sh
```

### Manual Installation

Jika Anda lebih suka instalasi manual, lihat [FIREBASE_SETUP.md](FIREBASE_SETUP.md) untuk panduan lengkap.


---

## 🔧 API Documentation

### Backend Endpoints

#### POST `/api/analyze`
Memulai analisis video YouTube.

**Request Body:**
```json
{
  "videoUrl": "https://youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Analysis started",
  "data": { ... }
}
```

#### POST `/api/webhook`
Endpoint untuk menerima hasil analisis dari AI.

**Request Body:**
```json
{
  "type": "character" | "subtitle",
  "data": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Result broadcasted to clients"
}
```

#### GET `/api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-11-17T...",
  "connectedClients": 5
}
```

### Socket.IO Events

#### Client → Server
- `connection` - Client connects to server

#### Server → Client
- `ai-result` - Broadcast hasil analisis
  ```javascript
  {
    type: 'character' | 'subtitle',
    data: { ... },
    timestamp: '2025-11-17T...'
  }
  ```

---

## 🛠️ Managing Services

### PM2 Commands

Setelah instalasi, semua backend services dikelola dengan PM2:

```bash
# View status semua services
pm2 status

# View logs
pm2 logs                      # Semua logs
pm2 logs nodejs-api           # Node.js backend logs
pm2 logs cowayang-ai-backend  # AI backend logs
pm2 logs cowayang-ai-asr      # ASR server logs

# Restart services
pm2 restart all               # Restart semua
pm2 restart nodejs-api        # Restart specific service

# Stop services
pm2 stop all                  # Stop semua
pm2 stop nodejs-api           # Stop specific service

# Clean restart (recommended)
bash restart-all.sh           # Restart dengan cleanup temp files
```

### Troubleshooting

#### YouTube Video Download Gagal

Jika Anda mendapat error saat download video YouTube:

1. **Refresh YouTube cookies:**
   ```bash
   bash backend-ai/refresh-cookies.sh
   ```

2. **Pastikan yt-dlp up-to-date:**
   ```bash
   pip3 install --upgrade yt-dlp
   ```

#### Service Tidak Start

1. **Cek logs untuk error:**
   ```bash
   pm2 logs
   ```

2. **Restart services:**
   ```bash
   bash restart-all.sh
   ```

3. **Cek apakah port sudah digunakan:**
   ```bash
   # Cek port 3000 (Node.js backend)
   lsof -i :3000
   
   # Cek port 8000 (AI backend)
   lsof -i :8000
   
   # Cek port 8001 (ASR server)
   lsof -i :8001
   ```

#### Frontend Tidak Bisa Connect ke Backend

1. **Pastikan semua backend services running:**
   ```bash
   pm2 status
   ```

2. **Cek health endpoints:**
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:8000/
   curl http://localhost:8001/
   ```

3. **Periksa CORS settings di backend**

#### Model AI Tidak Load

Jika AI backend tidak bisa load model Roboflow:

1. **Cek koneksi internet** (model di-download saat startup)
2. **Cek API key di `.env`:**
   ```bash
   cat backend-ai/.env | grep ROBOFLOW_API_KEY
   ```
3. **Restart AI backend:**
   ```bash
   pm2 restart cowayang-ai-backend
   ```

---

## 🎨 Design System

### Color Palette

```css
--wayang-dark: #0f172a     /* Background utama */
--wayang-card: #1e293b     /* Card background */
--wayang-primary: #6366f1  /* Primary button/accent */
--wayang-gold: #f59e0b     /* Gold accent (budaya) */
```

### Typography

- **Font Family**: Poppins, Inter (Google Fonts)
- **Heading**: Bold, gradient text effects
- **Body**: Regular, high contrast untuk readability

---

## 📦 Tech Stack

### Frontend
- **Framework**: Vue.js 3 (Composition API)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 3
- **State Management**: Pinia
- **Routing**: Vue Router 4
- **Authentication**: Firebase Auth
- **Database**: Firestore
- **Real-time**: Socket.IO Client
- **HTTP Client**: Axios (via Socket.IO)

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **WebSocket**: Socket.IO
- **HTTP Client**: Axios
- **Environment**: dotenv

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the ISC License.

---

## 👨‍💻 Author

**Gibran**
- GitHub: [@gi2br3n1906](https://github.com/gi2br3n1906)

---

## 🙏 Acknowledgments

- Inspirasi dari seni dan budaya wayang kulit Indonesia
- Tim AI untuk backend analisis video
- Community Vue.js dan Node.js

---

## 📧 Contact

Untuk pertanyaan atau saran, silakan buka issue di repository ini.

---

<div align="center">
  <strong>Made with ❤️ for Indonesian Culture</strong>
  <br>
  <sub>© 2025 Co-Wayang AI. All rights reserved.</sub>
</div>
