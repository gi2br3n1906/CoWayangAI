"""
Live Stream via Socket.IO ke VPS (Overlay Mode)
================================================
Script ini menjalankan YOLO lokal dan mengirim KOORDINAT bounding box
ke server VPS via WebSocket. Frontend akan menampilkan YouTube player
dengan overlay bounding box dari AI.

Keunggulan:
- Bandwidth sangat hemat (kirim koordinat ~100 bytes, bukan gambar ~50KB)
- Audio + Video dari YouTube langsung (sync sempurna)
- User bisa seek/skip bebas

Jalankan di PC lokal kamu yang punya GPU/model YOLO.
"""

import cv2
import socketio
import time
import numpy as np
from ultralytics import YOLO
from cap_from_youtube import cap_from_youtube
import threading

# ==================== KONFIGURASI ====================
# Ganti URL ini dengan alamat VPS kamu
SERVER_URL = "https://cowayangai.site"

# Model YOLO (path ke file .pt kamu)
MODEL_PATH = "yolov12.pt"

# Default YouTube Resolution (sama dengan yang user lihat)
YOUTUBE_RESOLUTION = "720p"

# IOU Threshold untuk deduplikasi kotak
DEDUP_IOU_THRESHOLD = 0.8

# ==================== GLOBAL STATE ====================
current_video_url = None
current_seek_time = 0
stop_flag = False
is_processing = False
model = None
player_time = 0  # Current time from frontend player
lock = threading.Lock()

# ==================== SOCKET.IO SETUP ====================
sio = socketio.Client()

@sio.event
def connect():
    print("✅ Terhubung ke Server VPS via Socket.IO!")
    print("⏳ Menunggu perintah dari Frontend...")
    print("   (User akan input link YouTube di website)\n")

@sio.event
def connect_error(data):
    print(f"❌ Gagal terhubung ke server: {data}")

@sio.event
def disconnect():
    print("⚠️ Terputus dari server.")

@sio.on('start-processing')
def on_start_processing(data):
    """Dipanggil ketika Frontend kirim link YouTube."""
    global current_video_url, stop_flag, is_processing, current_seek_time
    
    video_url = data.get('videoUrl', '')
    print(f"\n🎬 Menerima perintah dari Frontend!")
    print(f"   URL: {video_url}")
    
    if is_processing:
        print("⚠️ Sudah ada proses berjalan, stopping dulu...")
        stop_flag = True
        time.sleep(1)
    
    stop_flag = False
    current_video_url = video_url
    current_seek_time = 0
    
    # Start processing in a new thread
    thread = threading.Thread(target=process_video, args=(video_url,))
    thread.daemon = True
    thread.start()

@sio.on('stop-processing')
def on_stop_processing():
    """Dipanggil ketika Frontend minta stop."""
    global stop_flag
    print("\n🛑 Menerima perintah STOP dari Frontend.")
    stop_flag = True

@sio.on('player-time')
def on_player_time(data):
    """Menerima current time dari YouTube player di frontend."""
    global player_time
    with lock:
        player_time = data.get('time', 0)

@sio.on('player-seek')
def on_player_seek(data):
    """Dipanggil ketika user seek di frontend."""
    global current_seek_time, stop_flag
    seek_time = data.get('time', 0)
    print(f"\n⏩ User SEEK ke: {seek_time:.1f}s")
    current_seek_time = seek_time
    # Akan di-handle di process_video loop


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
        
        # Convert to percentage (untuk overlay di frontend)
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


def draw_local_preview(frame, boxes, colors):
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


# Warna untuk preview lokal (BGR format)
COLORS_BGR = [
    (97, 111, 255),   # Merah muda
    (255, 186, 97),   # Biru muda
    (254, 155, 162),  # Ungu muda
    (112, 204, 255),  # Kuning
    (149, 209, 76),   # Hijau
    (253, 118, 255),  # Magenta
]


# ==================== VIDEO PROCESSING ====================
def process_video(video_url):
    """Proses video dan kirim koordinat bounding box ke frontend."""
    global stop_flag, is_processing, model, current_seek_time
    
    is_processing = True
    
    print(f"\n📺 Membuka YouTube: {video_url}")
    
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
        print(f"❌ Gagal membuka video dengan semua resolusi!")
        sio.emit('stream-error', {'message': 'Gagal membuka video - tidak ada resolusi yang tersedia'})
        is_processing = False
        return

    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    
    print(f"   FPS: {fps:.1f}, Duration: {duration:.1f}s, Frames: {total_frames}")

    # Notify frontend that stream started
    sio.emit('stream-started', {'videoUrl': video_url, 'duration': duration})
    print("🎬 Processing dimulai!\n")

    last_log_time = time.time()
    frame_count = 0
    total_sent = 0
    current_frame = 0
    last_seek_time = 0
    start_real_time = time.time()  # Waktu mulai real
    start_video_time = 0  # Waktu video saat mulai

    try:
        while not stop_flag:
            # Check for seek request
            if current_seek_time != last_seek_time:
                target_frame = int(current_seek_time * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
                current_frame = target_frame
                last_seek_time = current_seek_time
                start_real_time = time.time()  # Reset waktu real
                start_video_time = current_seek_time  # Reset waktu video
                print(f"   ⏩ Seeked to frame {target_frame} ({current_seek_time:.1f}s)")
            
            success, frame = cap.read()
            if not success:
                print("⚠️ Video selesai atau gagal membaca frame.")
                break
            
            current_frame += 1
            current_time = current_frame / fps
            
            # === SINKRONISASI DENGAN REAL-TIME ===
            # Hitung berapa lama seharusnya sudah berjalan
            elapsed_real = time.time() - start_real_time
            elapsed_video = current_time - start_video_time
            
            # Kalau video lebih cepat dari real-time, tunggu
            if elapsed_video > elapsed_real:
                wait_time = elapsed_video - elapsed_real
                if wait_time > 0.001:  # Minimal 1ms
                    time.sleep(wait_time)

            # --- AI DETECTION dengan YOLO ---
            h, w = frame.shape[:2]
            results = model.predict(frame, conf=0.5, imgsz=640, verbose=False)
            
            # Extract boxes as percentage coordinates
            boxes = extract_boxes(results[0], model, w, h, DEDUP_IOU_THRESHOLD)

            # --- KIRIM KOORDINAT KE SERVER ---
            sio.emit('ai-boxes', {
                'timestamp': current_time,
                'boxes': boxes
            })
            total_sent += 1

            # --- LOCAL PREVIEW ---
            preview = draw_local_preview(frame, boxes, COLORS_BGR)
            preview = cv2.resize(preview, (960, 540))
            
            # Add timestamp overlay
            cv2.putText(preview, f"Time: {current_time:.1f}s | Boxes: {len(boxes)}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            cv2.imshow('CoWayang AI - Overlay Mode (Press q to exit)', preview)

            # FPS Counter Log (every 1 second)
            frame_count += 1
            if time.time() - last_log_time >= 1:
                print(f"📤 FPS: {frame_count} | Time: {current_time:.1f}s | Boxes: {len(boxes)} | Sent: {total_sent}")
                frame_count = 0
                last_log_time = time.time()

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("\n🛑 Stop diminta user lokal.")
                break

    except Exception as e:
        print(f"❌ Error saat processing: {e}")
        import traceback
        traceback.print_exc()
        sio.emit('stream-error', {'message': str(e)})
    finally:
        cap.release()
        cv2.destroyAllWindows()
        is_processing = False
        print(f"👋 Processing selesai. Total koordinat dikirim: {total_sent}")


# ==================== MAIN LOGIC ====================
def main():
    global model
    
    print("\n" + "="*60)
    print("   CoWayang AI - Live Stream Overlay Mode")
    print("="*60 + "\n")
    
    # 1. Load Model YOLO
    print(f"🔄 Memuat Model YOLO dari: {MODEL_PATH}")
    try:
        model = YOLO(MODEL_PATH)
        print("✅ Model YOLO Siap!\n")
    except Exception as e:
        print(f"❌ Gagal load model: {e}")
        return

    # 2. Connect ke Server VPS
    print(f"🔌 Menghubungkan ke {SERVER_URL}...")
    try:
        sio.connect(SERVER_URL, transports=['websocket'])
    except Exception as e:
        print(f"❌ Error koneksi: {e}")
        print("   Pastikan server Node.js jalan dan URL benar.")
        return

    # 3. Keep alive - menunggu perintah dari Frontend
    print("\n" + "="*60)
    print("  🟢 SIAP MENERIMA PERINTAH DARI FRONTEND")
    print("  ")
    print("  Cara pakai:")
    print("  1. Buka website CoWayang")
    print("  2. Klik tab 'Live Stream'")
    print("  3. Paste link YouTube")
    print("  4. Klik 'Mulai Live'")
    print("  ")
    print("  AI akan mengirim koordinat bounding box ke website.")
    print("  Website akan menampilkan YouTube + overlay box.")
    print("  ")
    print("  Tekan Ctrl+C untuk keluar.")
    print("="*60 + "\n")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
    finally:
        sio.disconnect()
        cv2.destroyAllWindows()
        print("👋 Selesai.")


if __name__ == '__main__':
    main()
