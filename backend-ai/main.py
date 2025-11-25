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

@app.get("/")
def health_check():
    model_status = global_model is not None
    return {
        "status": "AI Engine Running",
        "model_loaded": model_status,
        "version": "1.0.0"
    }

current_thread = None
stop_event = threading.Event() 

# Variabel Global untuk Model (Biar Standby Terus)
global_model = None

# --- MODEL LOADING SAAT SERVER STARTUP ---
@app.on_event("startup")
async def startup_event():
    global global_model
    print("\n🔄 SEDANG MENYIAPKAN OTAK AI (ROBOFLOW)... Mohon Tunggu...")
    try:
        rf = Roboflow(api_key=ROBOFLOW_API_KEY)
        project = rf.workspace().project(PROJECT_ID)
        global_model = project.version(VERSION).model
        print("✅ ROBOFLOW SIAP! Model sudah diload ke memori.\n")
    except Exception as e:
        print(f"❌ GAGAL LOAD ROBOFLOW: {e}")
        print("   Pastikan internet konek saat menyalakan server!\n")

# --- Model Request ---
class VideoRequest(BaseModel):
    videoUrl: str
    startTime: int = 0

# --- Fungsi ambil URL Stream (Mode Stabil 360p) ---
def get_stream_url(yt_url):
    print(f"📥 Mengambil Stream untuk: {yt_url}")
    ydl_opts = {
        'format': '18/best[ext=mp4]', 
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
    # Cek apakah model sudah siap
    if global_model is None:
        print("❌ Error: Model AI belum siap. Cek koneksi internet saat start server.")
        return

    print(f"🚀 Thread Analisis Dimulai. Skip ke: {start_time} detik")
    
    # 1. Get Stream (Ini butuh 2-3 detik wajar karena request ke YouTube)
    stream_url = get_stream_url(video_url)
    if not stream_url:
        print("❌ Stream URL kosong/gagal.")
        return

    cap = cv2.VideoCapture(stream_url)

    # 2. Seeking (Lompat)
    if start_time > 0:
        print(f"⏩ Melompat ke detik {start_time}...")
        cap.set(cv2.CAP_PROP_POS_MSEC, start_time * 1000)
        ret, _ = cap.read() # Pancing buffer

    # 3. Setup Sync & Loop
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    if video_fps == 0 or video_fps > 60: video_fps = 30
    target_frame_time = 1.0 / video_fps
    
    last_analysis_time = 0
    analysis_interval = 1.5 
    last_detected_char = None
    last_sent_time = 0

    while True:
        loop_start_time = time.time()

        if stop_event.is_set():
            print("🛑 Analisis dihentikan User.")
            break

        ret, frame = cap.read()
        
        # Auto Reconnect
        if not ret:
            print("⚠️ Stream terputus/buffering...")
            time.sleep(1)
            if not cap.isOpened(): break
            continue

        current_time = time.time()

        if current_time - last_analysis_time > analysis_interval:
            last_analysis_time = current_time
            
            cv2.imwrite("temp.jpg", frame)
            try:
                # --- PREDIKSI AI (Langsung pakai global_model, gak perlu connect lagi) ---
                prediction = global_model.predict("temp.jpg", confidence=40, overlap=30).json()
                detected_characters = []
                
                img_height, img_width, _ = frame.shape

                if prediction['predictions']:
                    # Encode Gambar
                    scale = 50 
                    w = int(frame.shape[1] * scale / 100)
                    h = int(frame.shape[0] * scale / 100)
                    resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
                    _, buffer = cv2.imencode('.jpg', resized)
                    jpg_as_text = base64.b64encode(buffer).decode('utf-8')

                    for pred in prediction['predictions']:
                        # Hitung Persen Box
                        x_center = pred['x']
                        y_center = pred['y']
                        box_width = pred['width']
                        box_height = pred['height']
                        
                        left_pct = (x_center - (box_width / 2)) / img_width * 100
                        top_pct = (y_center - (box_height / 2)) / img_height * 100
                        width_pct = box_width / img_width * 100
                        height_pct = box_height / img_height * 100

                        char_data = {
                            "name": pred['class'].capitalize(),
                            "confidence": round(pred['confidence'] * 100),
                            "box": { 
                                "left": left_pct, "top": top_pct, 
                                "width": width_pct, "height": height_pct 
                            }
                        }
                        detected_characters.append(char_data)

                    print(f"🔥 DETEKSI: {[c['name'] for c in detected_characters]}")

                    try:
                        requests.post(NODEJS_WEBHOOK_URL, json={
                            "type": "active_scene",
                            "timestamp": "Live",
                            "image": jpg_as_text,
                            "data": detected_characters
                        }, timeout=0.5)
                    except: pass
                else:
                    try:
                        requests.post(NODEJS_WEBHOOK_URL, json={
                            "type": "active_scene",
                            "timestamp": "Live",
                            "image": None,
                            "data": [] 
                        }, timeout=0.5)
                    except: pass

            except Exception as e:
                print(f"Error AI: {e}")

        # Pacing FPS
        processing_time = time.time() - loop_start_time
        time_to_wait = target_frame_time - processing_time
        if time_to_wait > 0:
            time.sleep(time_to_wait)

    cap.release()
    if os.path.exists("temp.jpg"): os.remove("temp.jpg")
    print("🏁 Selesai.")

@app.post("/start-analysis")
def start_analysis(req: VideoRequest):
    global current_thread
    if current_thread and current_thread.is_alive():
        stop_event.set()
        current_thread.join()
    
    stop_event.clear()
    current_thread = threading.Thread(
        target=analysis_logic, 
        args=(req.videoUrl, req.startTime)
    )
    current_thread.start()
    return {"status": "started", "video": req.videoUrl}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
