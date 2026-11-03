"""
Live Stream Multi-Worker dengan Session Management
====================================================
Script ini menjalankan YOLO workers yang bisa handle multiple users secara paralel.
Setiap worker memiliki ID unik dan hanya akan process video untuk session yang 
di-assign kepadanya.

Cara Kerja:
1. Worker connect ke VPS dan register dengan worker ID
2. VPS assign session ke worker yang available
3. Worker hanya proses video dari session yang di-assign
4. Setelah selesai, worker kembali ke status idle

Jalankan: python live_stream_worker.py --worker-id worker-1
Atau gunakan launcher: python worker_launcher.py --workers 5
"""

import cv2
import socketio
import time
import numpy as np
from ultralytics import YOLO
import yt_dlp
import threading
import argparse
import sys
import os
import math
import shutil
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# ==================== KONFIGURASI ====================
SERVER_URL = os.getenv("COWAYANG_SERVER_URL", "http://127.0.0.1:3000")
MODEL_PATH = os.getenv("YOLO_MODEL_PATH", os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai', 'weight.pt')))
DEDUP_IOU_THRESHOLD = 0.8

# ==================== GLOBAL STATE ====================
worker_id = None
current_session_id = None
current_video_url = None
current_seek_time = 0
processing_stop = threading.Event()
processing_thread = None
asr_thread = None
asr_stop = threading.Event()
command_lock = threading.Lock()
restart_timeout = 2.0
is_processing = False
model = None
player_time = 0
lock = threading.Lock()
is_registered = False
preview_enabled = False  # requirements use OpenCV headless by default
FOH_CAMERA_INDEX = int(os.getenv('FOH_CAMERA_INDEX', '0'))
PREVIEW_PORT = int(os.getenv('FOH_PREVIEW_PORT', '8002'))
CAPTURE_LOCAL = os.getenv('FOH_CAPTURE_ENABLED', 'true' if os.getenv('OPERATION_MODE', 'local') == 'local' else 'false').lower() == 'true'
preview_lock = threading.Lock()
latest_jpeg = None
recent_boxes = {}

def mjpeg_part(frame):
    crlf = bytes((13, 10))
    return b'--frame' + crlf + b'Content-Type: image/jpeg' + crlf + b'Content-Length: ' + str(len(frame)).encode('ascii') + crlf + crlf + frame + crlf

class PreviewHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path != '/video-feed':
            self.send_error(404); return
        self.send_response(200)
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.end_headers()
        last_frame = None
        try:
            while True:
                with preview_lock: frame = latest_jpeg
                if frame and frame is not last_frame:
                    self.wfile.write(mjpeg_part(frame))
                    last_frame = frame
                time.sleep(0.05)
        except (BrokenPipeError, ConnectionResetError):
            pass
    def log_message(self, *_): pass

def start_preview_server():
    global preview_server
    server = ThreadingHTTPServer(('127.0.0.1', PREVIEW_PORT), PreviewHandler)
    preview_server = server
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"FOH MJPEG preview: http://127.0.0.1:{PREVIEW_PORT}/video-feed")

# ==================== SOCKET.IO SETUP ====================
sio = socketio.Client(reconnection=True, reconnection_attempts=5,
                      reconnection_delay=1, reconnection_delay_max=10)
WORKER_SHARED_SECRET = os.getenv('WORKER_SHARED_SECRET', '')

def safe_emit(event, data):
    """Emit dengan error handling."""
    try:
        if sio.connected:
            sio.emit(event, data)
            return True
    except Exception as e:
        print(f"⚠️ [{worker_id}] Emit error: {e}")
    return False

@sio.event
def connect():
    global is_registered
    print(f"✅ [{worker_id}] Terhubung ke Server VPS!")
    
    # Register worker
    print(f"📝 [{worker_id}] Mendaftar sebagai worker...")
    sio.emit('register-worker', {
        'workerId': worker_id,
        'sharedSecret': WORKER_SHARED_SECRET,
        'captureLocal': CAPTURE_LOCAL
    })

@sio.on('worker-registered')
def on_worker_registered(data):
    global is_registered
    if data.get('success'):
        is_registered = True
        print(f"✅ [{worker_id}] Berhasil terdaftar!")
        print(f"⏳ [{worker_id}] Menunggu session dari VPS...\n")
    else:
        print(f"❌ [{worker_id}] Gagal register: {data.get('error')}")

@sio.event
def connect_error(data):
    print(f"❌ [{worker_id}] Gagal terhubung ke server: {data}")

@sio.event
def disconnect():
    global is_registered
    is_registered = False
    processing_stop.set()
    print(f"⚠️ [{worker_id}] Terputus dari server.")

@sio.on('start-processing')
def on_start_processing(data):
    """Dipanggil ketika VPS assign session ke worker ini."""
    global current_video_url, is_processing, current_seek_time, current_session_id
    global processing_stop, processing_thread
    
    assigned_worker = data.get('workerId', '')
    session_id = data.get('sessionId', '')
    video_url = data.get('videoUrl', '')
    
    # Only process if assigned to this worker
    if assigned_worker != worker_id:
        return
    try:
        start_time = float(data.get('startTime', 0))
        if not math.isfinite(start_time) or start_time < 0:
            raise ValueError('startTime must be finite and nonnegative')
    except (TypeError, ValueError) as exc:
        safe_emit('stream-error', {'sessionId': session_id, 'message': str(exc)})
        return
    
    print(f"\n🎬 [{worker_id}] Menerima session: {session_id}")
    print(f"   URL: {video_url}")
    
    # Serialize replacements; never clear a cancellation token an old run owns.
    with command_lock:
        if processing_thread and processing_thread.is_alive():
            processing_stop.set()
            processing_thread.join(timeout=restart_timeout)
            if processing_thread.is_alive():
                safe_emit('stream-error', {'sessionId': session_id,
                          'message': 'Previous video is still stopping; retry shortly'})
                return
        processing_stop = threading.Event()
        current_session_id = session_id
        current_video_url = video_url
        current_seek_time = start_time
        is_processing = True
        processing_thread = threading.Thread(
            target=process_video, args=(video_url, session_id, processing_stop), daemon=True)
        processing_thread.start()

@sio.on('stop-processing')
def on_stop_processing(data=None):
    """Dipanggil ketika Frontend/VPS minta stop."""
    global current_session_id
    
    # Check if this stop is for our session
    if data:
        session_id = data.get('sessionId', '')
        if session_id and session_id != current_session_id:
            return  # Not for us
    
    print(f"\n🛑 [{worker_id}] Menerima perintah STOP (session: {current_session_id})")
    processing_stop.set()

@sio.on('start-asr')
def on_start_asr(data):
    global asr_thread, asr_stop
    from asr_wav2vec2_jv import run_transcription_loop
    if data.get('sessionId') != current_session_id:
        safe_emit('stream-error', {'sessionId': data.get('sessionId'), 'message': 'No matching FOH capture session'})
        return
    if asr_thread and asr_thread.is_alive():
        asr_stop.set()
        asr_thread.join(timeout=1)
    asr_stop = threading.Event()
    asr_thread = threading.Thread(target=run_transcription_loop,
        kwargs={'youtube_url': data.get('videoUrl'), 'start_time': data.get('startTime', 0), 'stop_event': asr_stop,
                'session_id': data.get('sessionId'), 'target_language': data.get('targetLanguage', 'id')}, daemon=True)
    asr_thread.start()

@sio.on('stop-asr')
def on_stop_asr(data):
    if data.get('sessionId') == current_session_id:
        asr_stop.set()

@sio.on('player-time')
def on_player_time(data):
    """Menerima current time dari YouTube player."""
    global player_time
    
    # Only accept if for our session
    session_id = data.get('sessionId', '')
    if session_id and session_id != current_session_id:
        return
    
    with lock:
        player_time = data.get('time', 0)

@sio.on('player-seek')
def on_player_seek(data):
    """Dipanggil ketika user seek di frontend."""
    global current_seek_time
    
    # Only accept if for our session
    session_id = data.get('sessionId', '')
    if session_id and session_id != current_session_id:
        return
    
    seek_time = data.get('time', 0)
    try:
        seek_time = float(seek_time)
        if not math.isfinite(seek_time) or seek_time < 0:
            return
    except (TypeError, ValueError):
        return
    print(f"\n⏩ [{worker_id}] User SEEK ke: {seek_time:.1f}s")
    current_seek_time = seek_time

@sio.on('player-state')
def on_player_state(data):
    """Handle player state changes (pause/play/ended)."""
    
    session_id = data.get('sessionId', '')
    if session_id and session_id != current_session_id:
        return
    
    state = data.get('state', '')
    if state == 'ended':
        print(f"📺 [{worker_id}] Video ended, stopping processing")
        processing_stop.set()


# ==================== HELPER FUNCTIONS ====================
def _box_iou(box, boxes):
    """Hitung IoU antara satu box dengan array boxes."""
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])

    inter_w = np.maximum(0, x2 - x1)
    inter_h = np.maximum(0, y2 - y1)
    inter_area = inter_w * inter_h

    box_area = (box[2] - box[0]) * (box[3] - box[1])
    boxes_area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])

    union = box_area + boxes_area - inter_area
    return np.divide(inter_area, union, out=np.zeros_like(inter_area), where=union > 0)


def _suppress_overlaps(xyxy, confs, classes, iou_threshold):
    """Suppress overlapping boxes dengan IoU > threshold."""
    if len(xyxy) == 0:
        return []

    if iou_threshold <= 0:
        return list(range(len(xyxy)))

    order = np.argsort(-confs)
    suppressed = np.zeros(len(xyxy), dtype=bool)
    keep = []

    for idx in order:
        if suppressed[idx]:
            continue

        keep.append(idx)
        overlaps = _box_iou(xyxy[idx], xyxy)
        same_class = classes == classes[idx]
        mask = same_class & (overlaps > iou_threshold)
        suppressed |= mask

    return keep


def extract_boxes(result, model, img_width, img_height, dedup_iou):
    """Extract bounding boxes sebagai persentase koordinat."""
    boxes_data = result.boxes
    if boxes_data is None or boxes_data.data is None or len(boxes_data) == 0:
        return []

    xyxy = boxes_data.xyxy.cpu().numpy()
    confs = boxes_data.conf.cpu().numpy()
    classes = boxes_data.cls.cpu().numpy().astype(int)
    keep_indices = _suppress_overlaps(xyxy, confs, classes, dedup_iou)

    names = getattr(result, "names", getattr(model, "names", {}))
    boxes = []

    for idx in keep_indices:
        x1, y1, x2, y2 = xyxy[idx]
        cls_id = classes[idx]
        
        box = {
            'name': names.get(cls_id, str(cls_id)),
            'confidence': int(confs[idx] * 100),
            'left': float(x1 / img_width * 100),
            'top': float(y1 / img_height * 100),
            'width': float((x2 - x1) / img_width * 100),
            'height': float((y2 - y1) / img_height * 100),
        }
        boxes.append(box)

    return boxes


def draw_local_preview(frame, boxes, colors, session_id):
    """Gambar bounding box untuk preview lokal."""
    h, w = frame.shape[:2]
    annotated = frame.copy()
    
    for i, box in enumerate(boxes):
        color = colors[i % len(colors)]
        
        x1 = int(box['left'] / 100 * w)
        y1 = int(box['top'] / 100 * h)
        x2 = x1 + int(box['width'] / 100 * w)
        y2 = y1 + int(box['height'] / 100 * h)
        
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        
        label = f"{box['name']} {box['confidence']}%"
        cv2.putText(annotated, label, (x1, max(20, y1 - 10)), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)
    
    return annotated


def open_youtube_capture(video_url, resolution):
    """Resolve a YouTube format with yt-dlp/EJS, then open it via FFmpeg."""
    runtime_path = shutil.which('node') or shutil.which('node.exe')
    ydl_options = {
        'quiet': True,
        'no_warnings': False,
        'noplaylist': True,
        'format': f'best[protocol^=https][height<={resolution[:-1]}]/best[protocol^=https]' if resolution != 'best' else 'best[protocol^=https]',
        'js_runtimes': {'node': {'path': runtime_path}} if runtime_path else {},
    }
    with yt_dlp.YoutubeDL(ydl_options) as extractor:
        info = extractor.extract_info(video_url, download=False)
    entry = (info.get('entries') or [info])[0]
    stream_url = entry.get('url')
    if not stream_url and entry.get('requested_formats'):
        stream_url = entry['requested_formats'][0].get('url')
    if not stream_url:
        candidates = [fmt for fmt in entry.get('formats', []) if fmt.get('url') and fmt.get('vcodec') != 'none']
        if resolution != 'best':
            height_limit = int(resolution[:-1])
            under_limit = [fmt for fmt in candidates if not fmt.get('height') or fmt['height'] <= height_limit]
            candidates = under_limit or candidates
        candidates.sort(key=lambda fmt: (fmt.get('height') or 0, fmt.get('tbr') or 0), reverse=True)
        stream_url = candidates[0]['url'] if candidates else None
    if not stream_url:
        raise RuntimeError('yt-dlp returned no playable video format')
    return cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)


COLORS_BGR = [
    (97, 111, 255),
    (255, 186, 97),
    (254, 155, 162),
    (112, 204, 255),
    (149, 209, 76),
    (253, 118, 255),
]


# ==================== VIDEO PROCESSING ====================
def process_video(video_url, session_id, stop_event=None):
    """Proses video dan kirim koordinat bounding box ke frontend."""
    global is_processing, model, current_seek_time, current_session_id, latest_jpeg
    stop_event = stop_event if stop_event is not None else threading.Event()
    
    is_processing = True
    
    print(f"\n📺 [{worker_id}] Membuka YouTube: {video_url}")
    print(f"   Session: {session_id}")
    
    camera_input = video_url.startswith('camera://')
    # FOH capture is worker-owned; hybrid mode sends inference only, never frames.
    if camera_input:
        device = int(video_url.split('://', 1)[1] or FOH_CAMERA_INDEX)
        cap_backend = cv2.CAP_DSHOW if os.name == 'nt' else cv2.CAP_ANY
        cap = cv2.VideoCapture(device, cap_backend)
        if not cap.isOpened():
            safe_emit('stream-error', {'sessionId': session_id, 'message': f'FOH camera {device} unavailable'})
            is_processing = False; current_session_id = None; return
        resolutions = []
    else:
        resolutions = ['720p', '480p', '360p', '1080p', 'best']
    cap = cap if camera_input else None
    used_resolution = None
    
    if not camera_input:
        for res in resolutions:
            try:
                print(f"   Mencoba resolusi: {res}...")
                candidate = open_youtube_capture(video_url, res)
                if candidate and candidate.isOpened():
                    cap = candidate
                    used_resolution = res
                    print(f"   ✅ Berhasil dengan resolusi: {res}")
                    break
                if candidate is not None:
                    candidate.release()
            except Exception as e:
                print(f"   ⚠️ Resolusi {res} tidak tersedia: {e}")
                continue
    
    if cap is None or not cap.isOpened():
        print(f"❌ [{worker_id}] Gagal membuka video!")
        safe_emit('stream-error', {
            'sessionId': session_id,
            'message': 'Gagal membuka video - tidak ada resolusi yang tersedia'
        })
        is_processing = False
        current_session_id = None
        return

    total_sent = 0
    window_name = f'CoWayang AI - {worker_id} (Press q to exit)'
    try:
        # Setup belongs inside cleanup protection, not just the read loop.
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        if not math.isfinite(fps) or fps <= 0:
            fps = 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if not camera_input else 0
        duration = total_frames / fps
        safe_emit('stream-started', {
            'sessionId': session_id, 'videoUrl': video_url, 'duration': duration})
        last_log_time = time.monotonic()
        frame_count = 0
        current_frame = 0
        last_seek_time = 0
        start_real_time = time.monotonic()
        foh_started_at = start_real_time
        start_video_time = 0
        if camera_input:
            with lock:
                recent_boxes.clear()
        while not stop_event.is_set():
            # Check for seek request
            if not camera_input and current_seek_time != last_seek_time:
                target_frame = int(current_seek_time * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
                current_frame = target_frame
                last_seek_time = current_seek_time
                start_real_time = time.monotonic()
                start_video_time = current_seek_time
                print(f"   ⏩ [{worker_id}] Seeked to frame {target_frame} ({current_seek_time:.1f}s)")
            
            success, frame = cap.read()
            if not success:
                print(f"⚠️ [{worker_id}] Video selesai atau gagal membaca frame.")
                break
            
            current_frame += 1
            current_time = time.monotonic() - foh_started_at if camera_input else current_frame / fps
            
            # Real-time sync
            elapsed_real = time.monotonic() - start_real_time
            elapsed_video = current_time - start_video_time
            
            if not camera_input and elapsed_video > elapsed_real:
                wait_time = elapsed_video - elapsed_real
                if wait_time > 0.001:
                    if stop_event.wait(wait_time):
                        break

            # AI Detection
            h, w = frame.shape[:2]
            results = model.predict(frame, conf=0.5, imgsz=640, verbose=False)
            if stop_event.is_set():
                break
            boxes = extract_boxes(results[0], model, w, h, DEDUP_IOU_THRESHOLD)
            if camera_input and CAPTURE_LOCAL:
                now = time.monotonic()
                active_names = {item['name'] for item in boxes}
                with lock:
                    for name in active_names: recent_boxes[name] = (now, next(item for item in boxes if item['name'] == name))
                    recent_boxes.update({name: value for name, value in list(recent_boxes.items()) if now - value[0] <= 0.35})
                    boxes = [value[1] for value in recent_boxes.values()]
                ok, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
                if ok:
                    with preview_lock: latest_jpeg = encoded.tobytes()

            # Send to specific session
            safe_emit('ai-boxes', {
                'sessionId': session_id,
                'timestamp': current_time,
                'boxes': boxes
            })
            total_sent += 1

            # Local GUI preview is for YouTube only; FOH camera uses MJPEG.
            if preview_enabled and not camera_input:
                preview = draw_local_preview(frame, boxes, COLORS_BGR, session_id)
                preview = cv2.resize(preview, (960, 540))
                cv2.putText(preview, f"Worker: {worker_id} | Session: {session_id[:20]}...",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                cv2.putText(preview, f"Time: {current_time:.1f}s | Boxes: {len(boxes)}",
                            (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                cv2.imshow(window_name, preview)

            # FPS Counter Log
            frame_count += 1
            if time.monotonic() - last_log_time >= 1:
                print(f"📤 [{worker_id}] FPS: {frame_count} | Time: {current_time:.1f}s | Boxes: {len(boxes)}")
                frame_count = 0
                last_log_time = time.monotonic()

            if preview_enabled and cv2.waitKey(1) & 0xFF == ord('q'):
                print(f"\n🛑 [{worker_id}] Stop diminta user lokal.")
                break

    except Exception as e:
        print(f"❌ [{worker_id}] Error saat processing: {e}")
        import traceback
        traceback.print_exc()
        safe_emit('stream-error', {
            'sessionId': session_id,
            'message': str(e)
        })
    finally:
        try:
            cap.release()
            if preview_enabled:
                cv2.destroyWindow(window_name)
        except Exception as exc:
            print(f"⚠️ [{worker_id}] Cleanup error: {exc}")
        finally:
            is_processing = False
            current_session_id = None
        print(f"👋 [{worker_id}] Processing selesai. Total koordinat dikirim: {total_sent}")
        print(f"⏳ [{worker_id}] Kembali ke status IDLE, menunggu session baru...\n")


# ==================== MAIN LOGIC ====================
def main():
    global model, worker_id, preview_enabled
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='CoWayang AI Worker')
    parser.add_argument('--worker-id', type=str, required=True, 
                        help='Unique worker ID (e.g., worker-1)')
    parser.add_argument('--server', type=str, default=os.getenv('COWAYANG_SERVER_URL', SERVER_URL),
                        help=f'Server URL (default: {SERVER_URL})')
    parser.add_argument('--model', type=str, default=os.getenv('YOLO_MODEL_PATH', MODEL_PATH),
                        help=f'Model path (default: {MODEL_PATH})')
    parser.add_argument('--no-preview', action='store_true',
                        help='Disable local preview window')
    parser.add_argument('--preview', action='store_true',
                        help='Enable local preview (requires GUI-enabled OpenCV)')
    
    args = parser.parse_args()
    
    worker_id = args.worker_id
    server_url = args.server
    model_path = args.model
    preview_enabled = args.preview and not args.no_preview
    if CAPTURE_LOCAL:
        start_preview_server()
    
    print("\n" + "="*60)
    print(f"   CoWayang AI - Worker: {worker_id}")
    print("="*60 + "\n")
    
    # Load Model YOLO
    print(f"🔄 [{worker_id}] Memuat Model YOLO dari: {model_path}")
    try:
        model = YOLO(model_path)
        print(f"✅ [{worker_id}] Model YOLO Siap!\n")
    except Exception as e:
        print(f"❌ [{worker_id}] Gagal load model: {e}")
        return

    # Connect to Server
    print(f"🔌 [{worker_id}] Menghubungkan ke {server_url}...")
    try:
        sio.connect(server_url, transports=['websocket'])
    except Exception as e:
        print(f"❌ [{worker_id}] Error koneksi: {e}")
        return

    # Keep alive
    print("\n" + "="*60)
    print(f"  🟢 WORKER {worker_id} SIAP")
    print("  ")
    print("  Worker akan otomatis menerima session dari VPS")
    print("  ketika ada user yang memulai Live Stream.")
    print("  ")
    print("  Tekan Ctrl+C untuk keluar.")
    print("="*60 + "\n")
    
    try:
        # Returns when disconnected and the finite reconnect budget is exhausted.
        sio.wait()
    except KeyboardInterrupt:
        print(f"\n🛑 [{worker_id}] Shutting down...")
    finally:
        processing_stop.set()
        if processing_thread and processing_thread.is_alive():
            processing_thread.join(timeout=restart_timeout)
        sio.disconnect()
        if preview_enabled:
            cv2.destroyAllWindows()
        print(f"👋 [{worker_id}] Selesai.")


if __name__ == '__main__':
    main()
