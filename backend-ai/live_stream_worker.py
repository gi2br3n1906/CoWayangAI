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
from cap_from_youtube import cap_from_youtube
import threading
import argparse
import sys
import os

# ==================== KONFIGURASI ====================
SERVER_URL = "https://cowayangai.site"
MODEL_PATH = "yolov12.pt"
DEDUP_IOU_THRESHOLD = 0.8

# ==================== GLOBAL STATE ====================
worker_id = None
current_session_id = None
current_video_url = None
current_seek_time = 0
stop_flag = False
is_processing = False
model = None
player_time = 0
lock = threading.Lock()
is_registered = False

# ==================== SOCKET.IO SETUP ====================
sio = socketio.Client(reconnection=True, reconnection_attempts=0, reconnection_delay=1)

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
    sio.emit('register-worker', {'workerId': worker_id})

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
    print(f"⚠️ [{worker_id}] Terputus dari server.")

@sio.on('start-processing')
def on_start_processing(data):
    """Dipanggil ketika VPS assign session ke worker ini."""
    global current_video_url, stop_flag, is_processing, current_seek_time, current_session_id
    
    assigned_worker = data.get('workerId', '')
    session_id = data.get('sessionId', '')
    video_url = data.get('videoUrl', '')
    
    # Only process if assigned to this worker
    if assigned_worker != worker_id:
        return
    
    print(f"\n🎬 [{worker_id}] Menerima session: {session_id}")
    print(f"   URL: {video_url}")
    
    if is_processing:
        print(f"⚠️ [{worker_id}] Sudah ada proses berjalan, stopping dulu...")
        stop_flag = True
        time.sleep(1)
    
    stop_flag = False
    current_session_id = session_id
    current_video_url = video_url
    current_seek_time = 0
    
    # Start processing in a new thread
    thread = threading.Thread(target=process_video, args=(video_url, session_id))
    thread.daemon = True
    thread.start()

@sio.on('stop-processing')
def on_stop_processing(data=None):
    """Dipanggil ketika Frontend/VPS minta stop."""
    global stop_flag, current_session_id
    
    # Check if this stop is for our session
    if data:
        session_id = data.get('sessionId', '')
        if session_id and session_id != current_session_id:
            return  # Not for us
    
    print(f"\n🛑 [{worker_id}] Menerima perintah STOP (session: {current_session_id})")
    stop_flag = True

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
    print(f"\n⏩ [{worker_id}] User SEEK ke: {seek_time:.1f}s")
    current_seek_time = seek_time

@sio.on('player-state')
def on_player_state(data):
    """Handle player state changes (pause/play/ended)."""
    global stop_flag
    
    session_id = data.get('sessionId', '')
    if session_id and session_id != current_session_id:
        return
    
    state = data.get('state', '')
    if state == 'ended':
        print(f"📺 [{worker_id}] Video ended, stopping processing")
        stop_flag = True


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


COLORS_BGR = [
    (97, 111, 255),
    (255, 186, 97),
    (254, 155, 162),
    (112, 204, 255),
    (149, 209, 76),
    (253, 118, 255),
]


# ==================== VIDEO PROCESSING ====================
def process_video(video_url, session_id):
    """Proses video dan kirim koordinat bounding box ke frontend."""
    global stop_flag, is_processing, model, current_seek_time, current_session_id
    
    is_processing = True
    
    print(f"\n📺 [{worker_id}] Membuka YouTube: {video_url}")
    print(f"   Session: {session_id}")
    
    # Try multiple resolutions (fallback)
    resolutions = ['720p', '480p', '360p', '1080p', 'best']
    cap = None
    used_resolution = None
    
    for res in resolutions:
        try:
            print(f"   Mencoba resolusi: {res}...")
            cap = cap_from_youtube(video_url, res)
            if cap and cap.isOpened():
                used_resolution = res
                print(f"   ✅ Berhasil dengan resolusi: {res}")
                break
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

    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    
    print(f"   FPS: {fps:.1f}, Duration: {duration:.1f}s, Frames: {total_frames}")

    # Notify frontend that stream started
    safe_emit('stream-started', {
        'sessionId': session_id,
        'videoUrl': video_url,
        'duration': duration
    })
    print(f"🎬 [{worker_id}] Processing dimulai!\n")

    last_log_time = time.time()
    frame_count = 0
    total_sent = 0
    current_frame = 0
    last_seek_time = 0
    start_real_time = time.time()
    start_video_time = 0
    
    # Window name unique per worker
    window_name = f'CoWayang AI - {worker_id} (Press q to exit)'

    try:
        while not stop_flag:
            # Check for seek request
            if current_seek_time != last_seek_time:
                target_frame = int(current_seek_time * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
                current_frame = target_frame
                last_seek_time = current_seek_time
                start_real_time = time.time()
                start_video_time = current_seek_time
                print(f"   ⏩ [{worker_id}] Seeked to frame {target_frame} ({current_seek_time:.1f}s)")
            
            success, frame = cap.read()
            if not success:
                print(f"⚠️ [{worker_id}] Video selesai atau gagal membaca frame.")
                break
            
            current_frame += 1
            current_time = current_frame / fps
            
            # Real-time sync
            elapsed_real = time.time() - start_real_time
            elapsed_video = current_time - start_video_time
            
            if elapsed_video > elapsed_real:
                wait_time = elapsed_video - elapsed_real
                if wait_time > 0.001:
                    time.sleep(wait_time)

            # AI Detection
            h, w = frame.shape[:2]
            results = model.predict(frame, conf=0.5, imgsz=640, verbose=False)
            boxes = extract_boxes(results[0], model, w, h, DEDUP_IOU_THRESHOLD)

            # Send to specific session
            safe_emit('ai-boxes', {
                'sessionId': session_id,
                'timestamp': current_time,
                'boxes': boxes
            })
            total_sent += 1

            # Local preview
            preview = draw_local_preview(frame, boxes, COLORS_BGR, session_id)
            preview = cv2.resize(preview, (960, 540))
            
            cv2.putText(preview, f"Worker: {worker_id} | Session: {session_id[:20]}...", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(preview, f"Time: {current_time:.1f}s | Boxes: {len(boxes)}", 
                       (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            cv2.imshow(window_name, preview)

            # FPS Counter Log
            frame_count += 1
            if time.time() - last_log_time >= 1:
                print(f"📤 [{worker_id}] FPS: {frame_count} | Time: {current_time:.1f}s | Boxes: {len(boxes)}")
                frame_count = 0
                last_log_time = time.time()

            if cv2.waitKey(1) & 0xFF == ord('q'):
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
        cap.release()
        cv2.destroyWindow(window_name)
        is_processing = False
        current_session_id = None
        print(f"👋 [{worker_id}] Processing selesai. Total koordinat dikirim: {total_sent}")
        print(f"⏳ [{worker_id}] Kembali ke status IDLE, menunggu session baru...\n")


# ==================== MAIN LOGIC ====================
def main():
    global model, worker_id
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='CoWayang AI Worker')
    parser.add_argument('--worker-id', type=str, required=True, 
                        help='Unique worker ID (e.g., worker-1)')
    parser.add_argument('--server', type=str, default=SERVER_URL,
                        help=f'Server URL (default: {SERVER_URL})')
    parser.add_argument('--model', type=str, default=MODEL_PATH,
                        help=f'Model path (default: {MODEL_PATH})')
    parser.add_argument('--no-preview', action='store_true',
                        help='Disable local preview window')
    
    args = parser.parse_args()
    
    worker_id = args.worker_id
    server_url = args.server
    model_path = args.model
    
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
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n🛑 [{worker_id}] Shutting down...")
    finally:
        sio.disconnect()
        cv2.destroyAllWindows()
        print(f"👋 [{worker_id}] Selesai.")


if __name__ == '__main__':
    main()
