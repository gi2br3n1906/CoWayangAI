import cv2
import time
import requests
import json
import yt_dlp
from roboflow import Roboflow
import random
import os
import threading
import base64
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

# --- KONFIGURASI ---
ROBOFLOW_API_KEY = "nxnWGYVSmEqBIjegHsVj"
PROJECT_ID = "cowayangai-luylg"
VERSION = 2
NODEJS_WEBHOOK_URL = "http://localhost:3000/api/webhook"

# --- Init App & Global Vars ---
app = FastAPI()
current_thread = None
stop_event = threading.Event() 

# --- Model Request ---
class VideoRequest(BaseModel):
    videoUrl: str
    startTime: int = 0

# --- Fungsi ambil URL Stream (Mode Stabil 360p) ---
def get_stream_url(yt_url):
    print(f"📥 Mengambil Stream untuk: {yt_url}")
    ydl_opts = {
        'format': '18/best[ext=mp4]',  # Paksa 360p biar stabil
        'quiet': True,
        'noplaylist': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(yt_url, download=False)
            return info['url']
        except Exception as e:
            print(f"❌ Error yt-dlp: {e}")
            return None

# --- Logic Analisis Utama ---
def analysis_logic(video_url: str, start_time: int = 0):
    print(f"🚀 Thread Analisis Dimulai. Skip ke: {start_time} detik")
    
    # 1. Connect Roboflow
    try:
        rf = Roboflow(api_key=ROBOFLOW_API_KEY)
        project = rf.workspace().project(PROJECT_ID)
        model = project.version(VERSION).model
    except Exception as e:
        print(f"❌ Gagal connect Roboflow: {e}")
        return

    # 2. Get Stream
    stream_url = get_stream_url(video_url)
    if not stream_url:
        print("❌ Stream URL kosong/gagal.")
        return

    cap = cv2.VideoCapture(stream_url)

    # 3. Seeking (Lompat Durasi)
    if start_time > 0:
        print(f"⏩ Melompat ke detik {start_time}...")
        cap.set(cv2.CAP_PROP_POS_MSEC, start_time * 1000)
        ret, _ = cap.read() # Pancing buffer
        if not ret: print("⚠️ Warning: Gagal melompat (Stream mungkin belum siap)")

    # 4. Loop Analisis
    last_analysis_time = 0
    analysis_interval = 2.0 # Cek tiap 2 detik
    
    # Variabel Anti-Spam
    last_detected_char = None
    last_sent_time = 0

    while cap.isOpened():
        # Cek tombol stop
        if stop_event.is_set():
            print("🛑 Analisis dihentikan oleh User.")
            break

        ret, frame = cap.read()
        if not ret: break

        current_time = time.time()

        if current_time - last_analysis_time > analysis_interval:
            last_analysis_time = current_time
            
            # Simpan frame sementara
            cv2.imwrite("temp.jpg", frame)

            try:
                # --- PREDIKSI AI ---
                prediction = model.predict("temp.jpg", confidence=40, overlap=30).json()
                
                if prediction['predictions']:
                    top = prediction['predictions'][0]
                    char_name = top['class'].capitalize()
                    conf = round(top['confidence'] * 100)

                    # --- LOGIKA ANTI SPAM ---
                    # Kalau karakter sama dan belum 10 detik berlalu -> Skip
                    if char_name == last_detected_char and (current_time - last_sent_time < 10):
                        print(f"   (Skip spam: {char_name})")
                        continue 

                    print(f"🔥 DETEKSI BARU: {char_name} ({conf}%)")
                    last_detected_char = char_name
                    last_sent_time = current_time

                    # --- ENCODE GAMBAR KE BASE64 (Buat Thumbnail) ---
                    # Resize dulu biar enteng (lebar 300px cukup)
                    scale = 50 
                    w = int(frame.shape[1] * scale / 100)
                    h = int(frame.shape[0] * scale / 100)
                    resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
                    _, buffer = cv2.imencode('.jpg', resized)
                    jpg_as_text = base64.b64encode(buffer).decode('utf-8')

                    # Kirim ke Node.js
                    try:
                        requests.post(NODEJS_WEBHOOK_URL, json={
                            "type": "character",
                            "data": { 
                                "name": char_name, 
                                "confidence": conf, 
                                "timestamp": "Live",
                                "image": jpg_as_text # <-- Kirim gambar
                            }
                        }, timeout=2)
                    except: pass

                # --- SIMULASI SUBTITLE (Opsional) ---
                dummy_subs = ["Wahai ksatria...", "Dunia berguncang...", "Kebenaran menang..."]
                if random.random() > 0.85:
                    sub = random.choice(dummy_subs)
                    try:
                        requests.post(NODEJS_WEBHOOK_URL, json={
                            "type": "subtitle",
                            "data": { "text": sub, "timestamp": "Live" }
                        }, timeout=1)
                    except: pass

            except Exception as e:
                print(f"Error Loop: {e}")

    cap.release()
    if os.path.exists("temp.jpg"): os.remove("temp.jpg")
    print("🏁 Thread Analisis Selesai.")

# --- ENDPOINT API ---
@app.post("/start-analysis")
def start_analysis(req: VideoRequest):
    global current_thread

    # Matikan thread lama
    if current_thread and current_thread.is_alive():
        print("⚠️ Restarting thread...")
        stop_event.set()
        current_thread.join()
    
    stop_event.clear()

    # Mulai thread baru
    current_thread = threading.Thread(
        target=analysis_logic, 
        args=(req.videoUrl, req.startTime)
    )
    current_thread.start()

    return {"status": "started", "video": req.videoUrl}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)