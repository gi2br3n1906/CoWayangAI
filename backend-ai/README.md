# 🤖 Co-Wayang AI - Backend AI

Backend AI Engine untuk deteksi real-time tokoh Wayang Kulit menggunakan Computer Vision dan Machine Learning.

## 📋 Deskripsi

Backend ini bertanggung jawab untuk:
- 🎥 Streaming video dari YouTube menggunakan `yt-dlp`
- 🔍 Deteksi tokoh wayang menggunakan Roboflow Object Detection
- 🖼️ Encoding frame ke Base64 untuk transfer ke frontend
- ⚡ Real-time processing dengan synchronization ke kecepatan video asli
- 🔄 Auto-reconnect jika stream terputus

## 🛠️ Tech Stack

- **Python**: 3.8+
- **FastAPI**: REST API Framework
- **OpenCV**: Video processing
- **yt-dlp**: YouTube stream extraction
- **Roboflow**: AI Object Detection model
- **Uvicorn**: ASGI server

## 📦 Instalasi (setelah clone)

Jika kamu telah meng-clone repo ini, ikuti langkah-langkah berikut untuk menginstal dependensi dan menyiapkan environment pengembangan.

1) Masuk ke folder proyek
```bash
git clone <repository-url>
cd backend-ai
```

2) Buat dan aktifkan virtual environment (Python 3.8+)

- Linux / macOS:
```bash
python3 -m venv venv
source venv/bin/activate
```

- Windows (Command Prompt):
```powershell
python -m venv venv
venv\Scripts\activate
```

- Windows (PowerShell):
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

Catatan: Jika PowerShell menolak menjalankan skrip, jalankan PowerShell sebagai Administrator dan jalankan:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

3) Perbarui `pip` lalu instal dependensi dari `requirements.txt`
```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Jika `requirements.txt` belum ada (mis. kamu bekerja dari branch yang belum menyertakannya), install dependensi utama secara manual:
```bash
pip install -r requirements.txt
```

4) (Opsional) Membuat `requirements.txt` dari environment yang sudah terpasang
```bash
pip freeze > requirements.txt
```

5) Konfigurasi environment variables
Buat file `.env` di root `backend-ai` dan tambahkan variabel yang diperlukan:
```env
YOLO_MODEL_PATH=../ai/weight.pt
NODEJS_WEBHOOK_URL=http://localhost:3000/api/webhook
```

6) Verifikasi instalasi
```bash
# pastikan virtualenv aktif
python -c "import fastapi, uvicorn; print('deps OK')"
```

Jika ada modul yang hilang, ulangi instalasi paket yang diperlukan atau lihat bagian Troubleshooting di bawah.

### 4. Konfigurasi Environment Variables

Buat file `.env` di root folder:
```env
YOLO_MODEL_PATH=../ai/weight.pt
NODEJS_WEBHOOK_URL=http://localhost:3000/api/webhook
```

> **Note**: Jangan commit `.env` ke Git! Sudah ada di `.gitignore`.

## 🚀 Cara Menjalankan

### Development Mode
```bash
# Pastikan virtual environment aktif
source venv/bin/activate  # Linux/Mac
# atau
venv\Scripts\activate     # Windows

# Jalankan server
python main.py
```

Server akan berjalan di: **http://localhost:8000**

### Production Mode
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## 📡 API Endpoints

### 1. Start Analysis
**POST** `/start-analysis`

Request Body:
```json
{
  "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "startTime": 30
}
```

Response:
```json
{
  "status": "started",
  "video": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

### 2. Health Check
**GET** `/`

Response:
```json
{
  "status": "AI Engine Running",
  "model_loaded": true
}
```

## 🧪 Testing

### Test Manual dengan cURL
```bash
# Health check
curl http://localhost:8000/

# Start analysis
curl -X POST http://localhost:8000/start-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://www.youtube.com/watch?v=EXAMPLE",
    "startTime": 0
  }'
```

### Test dengan Python
```python
import requests

response = requests.post(
    "http://localhost:8000/start-analysis",
    json={
        "videoUrl": "https://www.youtube.com/watch?v=EXAMPLE",
        "startTime": 0
    }
)
print(response.json())
```

## 📁 Struktur File

```
backend-ai/
├── main.py           # Entry point aplikasi
├── temp.jpg          # Temporary file (generated, gitignored)
├── .env              # Environment variables (gitignored)
├── .gitignore        # Git ignore rules
├── venv/             # Virtual environment (gitignored)
└── README.md         # Dokumentasi ini
```

## ⚙️ Konfigurasi

### Model Roboflow
```python
PROJECT_ID = "cowayangai-luylg"
VERSION = 2
```

Model ini sudah di-training dengan dataset wayang kulit custom.

### Performance Tuning
- **Analysis Interval**: 1.5 detik (bisa diubah di `analysis_interval`)
- **Video FPS**: Auto-detect (fallback 30 FPS)
- **Frame Resize**: 50% dari original (untuk efisiensi bandwidth)
- **Confidence Threshold**: 40%

## 🐛 Troubleshooting

### Error: Module not found
```bash
# Pastikan virtual environment aktif
pip list  # Cek installed packages
pip install -r requirements.txt  # Re-install
```

### Error: Roboflow API Key invalid
```bash
# Cek file .env
cat .env

# Pastikan API key benar
# Pastikan YOLO_MODEL_PATH menunjuk ke model lokal yang tersedia.
```

### Error: Stream URL empty/failed
```bash
# Update yt-dlp ke versi terbaru
pip install --upgrade yt-dlp

# Test manual
yt-dlp -f 18 "https://www.youtube.com/watch?v=VIDEO_ID"
```

### Error: Out of Memory
```bash
# Kurangi frame resize scale di main.py:
scale = 30  # Dari 50 ke 30
```

### Server tidak mau stop (Ctrl+C tidak jalan)
```bash
# Linux/Mac
pkill -f "python main.py"

# Windows
taskkill /F /IM python.exe
```

## 🔐 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `YOLO_MODEL_PATH` | Path model Ultralytics lokal (`.pt`/`.engine`) | `../ai/weight.pt` | ✅ |
| `NODEJS_WEBHOOK_URL` | URL webhook ke Node.js backend | `http://localhost:3000/api/webhook` | ✅ |
| `GEMINI_API_KEY` | API key untuk ASR inline audio | - | untuk subtitle |
| `FOH_CAMERA_INDEX` | Index kamera/capture card lokal | `0` | untuk FOH |
| `FOH_AUDIO_DEVICE_INDEX` | Index input mixer lokal | - | untuk FOH audio |

## 📊 Performance Metrics

### Resource Usage (per user)
- **CPU**: 50-70%
- **RAM**: 1.5-2 GB (model loaded)
- **Bandwidth**: 0.5-1 Mbps (YouTube stream)
- **Latency**: 1.5-2s per detection

### Recommendations
- **Min RAM**: 2 GB
- **Min CPU**: 2 cores
- **Optimal**: 4 GB RAM, 4 cores untuk 2-3 concurrent users

## 🔄 Auto-Reconnect Logic

Jika stream YouTube terputus, sistem otomatis:
1. Mendeteksi disconnection
2. Mengambil URL stream baru
3. Menyambung dari timestamp terakhir
4. Melanjutkan analisis

## 📝 Notes

- Model Roboflow di-load saat **server startup** (bukan per-request) untuk performa optimal
- Temporary file `temp.jpg` otomatis di-cleanup setelah inference
- Thread analysis bisa di-stop dengan endpoint atau restart server
- Satu server hanya bisa handle **1 analisis aktif** (by design, bisa di-extend untuk multi-user)

## 🤝 Integrasi dengan Backend API (Node.js)

Backend ini mengirim data ke Node.js via webhook:
```python
requests.post(NODEJS_WEBHOOK_URL, json={
    "type": "active_scene",
    "timestamp": "Live",
    "image": base64_string,
    "data": [
        {
            "name": "Arjuna",
            "confidence": 94,
            "box": {...}
        }
    ]
})
```

## 🐳 Docker (Optional)

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["python", "main.py"]
```

Build & Run:
```bash
docker build -t cowayang-ai-backend .
docker run -p 8000:8000 --env-file .env cowayang-ai-backend
```

## 📄 License

[Your License Here]

## 👨‍💻 Author

[Your Name]

## 🔗 Links

- Frontend Repository: [Link]
- Backend API Repository: [Link]
- Roboflow Model: [Link]
- Documentation: [Link]

---

**Status**: ✅ Production Ready  
**Last Updated**: November 2024