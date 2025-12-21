import cv2
import time
import requests
import json
import yt_dlp
from roboflow import Roboflow
import random
import shutil
import os
import threading
import base64
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
from collections import Counter

# --- KONFIGURASI ---
ROBOFLOW_API_KEY = "nxnWGYVSmEqBIjegHsVj"
PROJECT_ID = "cowayangai-luylg"
VERSION = 2
NODEJS_WEBHOOK_URL = "http://localhost:3000/api/webhook"

# --- METRICS GLOBAL ---
stream_metrics = Counter()
stream_metrics['total_attempts'] = 0
stream_metrics['success_count'] = 0
stream_metrics['auth_failures'] = 0
stream_metrics['unavailable_videos'] = 0
stream_metrics['other_errors'] = 0

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

@app.get("/metrics")
def get_metrics():
    total = stream_metrics['total_attempts']
    success = stream_metrics['success_count']
    success_rate = (success / total * 100) if total > 0 else 0
    
    return {
        "stream_metrics": dict(stream_metrics),
        "success_rate_percent": round(success_rate, 2),
        "total_attempts": total,
        "successful_streams": success
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

    # Check for a JavaScript runtime (node) — yt-dlp often needs it for
    # parsing YouTube player responses. If node is missing, server logs will
    # show 'No supported JavaScript runtime' errors in yt-dlp. Print a helpful
    # guidance message so the operator knows what to install.
    node_path = shutil.which("node")
    if not node_path:
        print("⚠️ Node.js not found in PATH. For reliable YouTube extraction install node and yt-dlp[ejs]:\n    sudo apt install -y nodejs npm\n    python -m pip install -U 'yt-dlp[default]'\n  Or install yt-dlp-ejs plugin if you manage yt-dlp separately.")

# --- Model Request ---
class VideoRequest(BaseModel):
    videoUrl: str
    startTime: int = 0

# --- Fungsi ambil URL Stream (Mode Stabil 360p) ---
def get_stream_url(yt_url):
    import random
    import time
    
    print(f"📥 Mengambil Stream untuk: {yt_url}")
    
    # Track metrics
    stream_metrics['total_attempts'] += 1
    
    # Random delay 1-3 detik untuk menghindari deteksi bot
    time.sleep(random.uniform(1, 3))
    
    # Rotate user-agents untuk meniru browser berbeda
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ]
    
    # Try extraction with several youtube "player_client" fallbacks.
    # YouTube changes often — some environments need a JS runtime (node) and
    # yt-dlp-ejs. If you see "No supported JavaScript runtime" in logs, install
    # nodejs and yt-dlp[ejs] (recommended) or allow yt-dlp to use its default
    # extractor settings.
    ydl_opts = {
        'format': random.choice(['18', '22']) + '/best[ext=mp4]',
        'quiet': True,
        'noplaylist': True,
        'user_agent': random.choice(user_agents),
        # We'll attempt multiple extractor args strategies below when errors
        # indicate parsing / player response failures.
        'http_headers': {
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.youtube.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
    }
    
    # Load cookies if available
    cookiefile = os.environ.get('YT_COOKIES_PATH')
    if cookiefile and os.path.exists(cookiefile):
        ydl_opts['cookiefile'] = cookiefile
        print("🍪 Menggunakan cookies untuk autentikasi YouTube")
    
    # Use proxy if available
    proxy = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
    if proxy:
        ydl_opts['proxy'] = proxy
        print(f"🌐 Menggunakan proxy: {proxy}")
    
    # Additional options for bot detection avoidance
    ydl_opts.update({
        'sleep_interval': 1,
        'max_sleep_interval': 3,
        'sleep_interval_requests': 1,
    })
    
    # Try a few approaches to work around playback/player parsing changes.
    extractor_clients = ["web", "android", "default"]

    # Retry logic dengan exponential backoff; for each attempt we will also
    # iterate extractor_clients to try different player_client values. This
    # addresses cases such as "Failed to parse JSON" or missing JS runtime.
    for attempt in range(3):
        try:
            # On each attempt try different extractor_args (player_client)
            # until we run out of fallback clients.
            tried_clients = []
            for client in extractor_clients:
                tried_clients.append(client)
                opts = dict(ydl_opts)
                opts['extractor_args'] = {'youtube': {'player_client': client}}

                try:
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        info = ydl.extract_info(yt_url, download=False)
                except Exception as inner_exc:
                    # If extractor complains about JS runtime or JSON parsing,
                    # log and continue trying the next client.
                    msg_inner = str(inner_exc)
                    if 'No supported JavaScript runtime' in msg_inner:
                        print('⚠️ yt-dlp: no JS runtime detected. Install nodejs and the yt-dlp-ejs plugin to improve YouTube parsing.')
                    if 'Failed to parse JSON' in msg_inner or 'Failed to extract any player response' in msg_inner:
                        print(f'⚠️ yt-dlp parse/player error while testing client {client}: {msg_inner}')
                    # Reraise only if it's a terminal non-extract error.
                    info = None
                else:
                    # if extract_info succeeded, we have info
                    pass

                # If we didn't get valid info, try next client
                if not info:
                    # If this was the last client in the list, break to outer
                    # exception block so backoff/delay logic runs.
                    if client == extractor_clients[-1]:
                        raise RuntimeError(f'yt-dlp failed for clients {tried_clients}')
                    else:
                        # try the next client
                        continue
                info = ydl.extract_info(yt_url, download=False)
                if not info:
                    print("❌ yt-dlp tidak mengembalikan info apapun (None)")
                    continue
                
                # Handle playlists
                if info.get('entries'):
                    if not info['entries'] or not info['entries'][0]:
                        print("❌ yt-dlp mengembalikan entries kosong")
                        continue
                    entry = info['entries'][0]
                else:
                    entry = info
                
                if not entry:
                    print("❌ Entry dari yt-dlp adalah None")
                    continue
                
                # 1. Langsung gunakan key 'url' jika ada
                if entry.get('url'):
                    print("✅ Berhasil mendapatkan stream URL")
                    stream_metrics['success_count'] += 1
                    return entry.get('url')
                
                # 2. Periksa formats
                formats = entry.get('formats') or entry.get('requested_formats')
                if formats and isinstance(formats, list):
                    candidates = [f for f in formats if f.get('ext') == 'mp4']
                    if not candidates:
                        candidates = formats
                    
                    best = None
                    for f in candidates:
                        height = f.get('height') or 0
                        if height and height <= 360:
                            best = f
                            break
                    
                    if not best and candidates:
                        best = candidates[0]
                    
                    if best and best.get('url'):
                        print("✅ Berhasil mendapatkan stream URL")
                        stream_metrics['success_count'] += 1
                        return best.get('url')
                
                print('❌ yt-dlp tidak menemukan URL stream di info/entry.')
                continue
                
        except Exception as e:
            msg = str(e)
            print(f"❌ Attempt {attempt+1} gagal: {msg}")
            
            # Check for specific errors
            if 'Sign in to confirm' in msg or 'use --cookies' in msg:
                print('👉 YouTube meminta autentikasi. Pastikan cookies valid atau export ulang.')
                stream_metrics['auth_failures'] += 1
            elif 'This video is unavailable' in msg:
                print('👉 Video tidak tersedia (dihapus atau private).')
                stream_metrics['unavailable_videos'] += 1
            else:
                stream_metrics['other_errors'] += 1
            
            # Exponential backoff
            if attempt < 2:
                delay = 2 ** attempt
                print(f"⏳ Retry dalam {delay} detik...")
                time.sleep(delay)
    
    print("❌ Semua attempt gagal. Tidak bisa mendapatkan stream URL.")
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
