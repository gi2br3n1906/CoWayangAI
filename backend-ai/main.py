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

# --- Fungsi download video chunk untuk analisis ---
def download_video_chunk(yt_url, duration=60, start_time=0):
    """
    Download video chunk menggunakan yt-dlp ke file temp.
    Ini lebih reliable untuk YouTube HLS karena yt-dlp handle cookies.
    """
    temp_file = f"/tmp/wayang_chunk_{int(time.time())}.mp4"
    
    # Download section menggunakan yt-dlp
    ydl_opts = {
        'format': '93/92/94/best[height<=480]',  # Prioritas 360p m3u8
        'quiet': True,
        'noplaylist': True,
        'no_warnings': True,
        'cookiefile': os.path.join(os.path.dirname(__file__), 'cookies.txt'),
        'outtmpl': temp_file,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'extractor_args': {
            'youtube': {
                'player_client': ['web_safari', 'tv'],
            }
        },
        # Download hanya section tertentu
        'download_ranges': lambda info, ydl: [{'start_time': start_time, 'end_time': start_time + duration}],
        'force_keyframes_at_cuts': True,
    }
    
    print(f"   📥 Downloading chunk ({start_time}s - {start_time + duration}s)...")
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([yt_url])
        
        # Cek apakah file ada
        if os.path.exists(temp_file):
            print(f"   ✅ Download berhasil: {temp_file}")
            return temp_file
        else:
            print(f"   ❌ File tidak ditemukan setelah download")
            return None
    except Exception as e:
        print(f"   ❌ Download error: {e}")
        return None

# --- Logic Analisis Utama (Mode Chunk Download) ---
def analysis_logic(video_url: str, start_time: int = 0):
    # Cek apakah model sudah siap
    if global_model is None:
        print("❌ Error: Model AI belum siap. Cek koneksi internet saat start server.")
        return

    print(f"🚀 Thread Analisis Dimulai. Skip ke: {start_time} detik")
    
    chunk_duration = 60  # Download 60 detik per chunk
    current_start = start_time
    max_chunks = 100  # Max ~100 menit analisis
    
    for chunk_num in range(max_chunks):
        if stop_event.is_set():
            print("🛑 Analisis dihentikan User.")
            break
        
        # 1. Download chunk
        print(f"\n📦 Chunk {chunk_num + 1}: {current_start}s - {current_start + chunk_duration}s")
        temp_file = download_video_chunk(video_url, chunk_duration, current_start)
        
        if not temp_file:
            print("❌ Gagal download chunk. Mencoba lanjut ke chunk berikutnya...")
            current_start += chunk_duration
            continue
        
        # 2. Buka file dengan OpenCV
        cap = cv2.VideoCapture(temp_file)
        if not cap.isOpened():
            print(f"❌ Gagal buka video file: {temp_file}")
            os.remove(temp_file)
            current_start += chunk_duration
            continue
        
        # 3. Setup loop - OPTIMIZED: Skip frames, hanya baca yang perlu
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        if video_fps == 0 or video_fps > 60: video_fps = 30
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        analysis_interval = 1.5  # Analisis setiap 1.5 detik
        frames_per_analysis = int(video_fps * analysis_interval)  # ~45 frames per analisis
        
        # Hitung jumlah analisis yang akan dilakukan
        num_analyses = int(total_frames / frames_per_analysis) + 1
        print(f"   🎬 {total_frames} frames, analisis {num_analyses}x (setiap {analysis_interval}s)")

        for analysis_num in range(num_analyses):
            if stop_event.is_set():
                break
            
            # Langsung seek ke frame yang dibutuhkan
            target_frame = analysis_num * frames_per_analysis
            if target_frame >= total_frames:
                break
                
            cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
            ret, frame = cap.read()
            
            if not ret:
                break
            
            current_time = target_frame / video_fps
            
            cv2.imwrite("temp.jpg", frame)
            try:
                prediction = global_model.predict("temp.jpg", confidence=40, overlap=30).json()
                detected_characters = []
                
                img_height, img_width = frame.shape[:2]

                if prediction['predictions']:
                    # Encode Gambar
                    scale = 50 
                    w = int(frame.shape[1] * scale / 100)
                    h = int(frame.shape[0] * scale / 100)
                    resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
                    _, buffer = cv2.imencode('.jpg', resized)
                    jpg_as_text = base64.b64encode(buffer).decode('utf-8')

                    for pred in prediction['predictions']:
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

                    timestamp_abs = current_start + current_time
                    print(f"🔥 [{timestamp_abs:.1f}s] DETEKSI: {[c['name'] for c in detected_characters]}")

                    try:
                        requests.post(NODEJS_WEBHOOK_URL, json={
                            "type": "active_scene",
                            "timestamp": f"{timestamp_abs:.1f}s",
                            "image": jpg_as_text,
                            "data": detected_characters
                        }, timeout=0.5)
                    except: pass
                else:
                    try:
                        requests.post(NODEJS_WEBHOOK_URL, json={
                            "type": "active_scene",
                            "timestamp": f"{current_start + current_time:.1f}s",
                            "image": None,
                            "data": [] 
                        }, timeout=0.5)
                    except: pass

            except Exception as e:
                print(f"Error AI: {e}")        # Cleanup chunk
        cap.release()
        if os.path.exists(temp_file): 
            os.remove(temp_file)
        
        # Update untuk chunk berikutnya
        current_start += chunk_duration
        
        # Cek apakah video sudah habis (total_frames < expected)
        if total_frames < (chunk_duration * video_fps * 0.8):
            print("📼 Video selesai (chunk terakhir lebih pendek)")
            break

    if os.path.exists("temp.jpg"): os.remove("temp.jpg")
    print("🏁 Analisis Selesai.")

@app.post("/start-analysis")
def start_analysis(req: VideoRequest):
    global current_thread
    
    # Stop thread lama jika masih jalan
    if current_thread and current_thread.is_alive():
        print("🛑 Stopping existing analysis...")
        stop_event.set()
        current_thread.join(timeout=5)  # Max wait 5 detik
    
    stop_event.clear()
    current_thread = threading.Thread(
        target=analysis_logic, 
        args=(req.videoUrl, req.startTime)
    )
    current_thread.start()
    return {"status": "started", "video": req.videoUrl, "startTime": req.startTime}

@app.post("/stop-analysis")
def stop_analysis():
    global current_thread
    
    if current_thread and current_thread.is_alive():
        print("🛑 Stopping analysis by request...")
        stop_event.set()
        current_thread.join(timeout=5)
        return {"status": "stopped"}
    
    return {"status": "no_active_analysis"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
