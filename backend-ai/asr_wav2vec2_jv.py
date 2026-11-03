"""
Prototype: CPU-friendly streaming ASR for Javanese using Google Gemini API.

Notes:
- This prototype uses yt-dlp + ffmpeg to stream audio from YouTube URL, performs simple VAD
  using webrtcvad/Silero, chunks audio with a sliding window, saves chunks to temporary
  files, and calls the Gemini API to get transcription and translation.
- The script outputs timestamped JSON to NODEJS_WEBHOOK_URL.

Run:
  python asr_wav2vec2_jv.py "https://www.youtube.com/watch?v=EXAMPLE"

"""
import os
import argparse
import subprocess
import sys
import time
import math
import uuid
import io
import wave
from collections import deque
import requests
import json
import threading
import numpy as np

from dotenv import load_dotenv

# --- Global Metrics untuk Monitoring ---
stream_request_count = 0
stream_success_count = 0
last_block_detected = None

def log_stream_attempt(success, error_msg=None):
    global stream_request_count, stream_success_count, last_block_detected
    stream_request_count += 1
    if success:
        stream_success_count += 1
    else:
        if 'Sign in to confirm' in str(error_msg) or 'blocked' in str(error_msg).lower():
            last_block_detected = time.time()
    
    success_rate = (stream_success_count / stream_request_count * 100) if stream_request_count > 0 else 0
    print(f"📊 Stream Metrics: {stream_success_count}/{stream_request_count} sukses ({success_rate:.1f}%)")
    if last_block_detected:
        print(f"🚨 Last block detected: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_block_detected))}")

# --- Gemini API Setup ---


# --- VAD Imports ---
HAVE_SILERO = False
silero_get_speech_ts = None
silero_model = None
try:
    import webrtcvad
    HAVE_WEBRTC = True
except Exception:
    HAVE_WEBRTC = False
    print('(PERINGATAN) webrtcvad not installed or failed to import. Using Silero VAD fallback.')
    # Importing the service must not download/execute a remote torch.hub repo.
    # Operators may explicitly opt in; otherwise use the local energy fallback.
    if os.getenv('COWAYANG_ENABLE_SILERO') == '1':
        try:
            import torch
            silero_model, silero_utils = torch.hub.load('snakers4/silero-vad', 'silero_vad', trust_repo=True)
            silero_get_speech_ts = silero_utils[0]
            HAVE_SILERO = True
            print('(INFO) Silero VAD loaded via torch.hub')
        except Exception as e:
            print(f'(ERROR) Failed to load Silero VAD: {e}. Falling back to basic energy VAD.')


def get_stream_url(yt_url):
    import yt_dlp
    import random
    import time
    
    print(f"📥 Mengambil Stream Audio untuk: {yt_url}")
    
    # Random delay 1-3 detik untuk menghindari deteksi bot
    time.sleep(random.uniform(1, 3))
    
    # Rotate user-agents untuk meniru browser berbeda
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ]
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'user_agent': random.choice(user_agents),
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
    
    # Retry logic dengan exponential backoff
    for attempt in range(3):
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
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
                
                if not entry or 'url' not in entry:
                    print("❌ Entry tidak valid atau tidak ada URL")
                    continue
                
                print("✅ Berhasil mendapatkan stream URL")
                log_stream_attempt(True)
                return entry['url']
                
        except Exception as e:
            msg = str(e)
            print(f"❌ Attempt {attempt+1} gagal: {msg}")
            
            # Check for specific errors
            if 'Sign in to confirm' in msg or 'use --cookies' in msg:
                print('👉 YouTube meminta autentikasi. Pastikan cookies valid atau export ulang.')
            elif 'This video is unavailable' in msg:
                print('👉 Video tidak tersedia (dihapus atau private).')
            
            # Exponential backoff
            if attempt < 2:
                delay = 2 ** attempt
                print(f"⏳ Retry dalam {delay} detik...")
                time.sleep(delay)
    
    print("❌ Semua attempt gagal. Tidak bisa mendapatkan stream URL.")
    log_stream_attempt(False, "All attempts failed")
    return None


class PCMStreamer:
    """Spawn ffmpeg to output raw PCM s16le 16k mono to stdout and yield frames"""
    def __init__(self, stream_url, sample_rate=16000, start_time=0):
        self.stream_url = stream_url
        self.sample_rate = sample_rate
        self.start_time = start_time  # Start time in seconds
        self.proc = None
        self.frames_consumed = 0
        self.has_seeked = False

    def start(self):
        cmd = [
            'ffmpeg', '-ss', str(self.start_time), '-i', self.stream_url,
            '-vn', '-f', 's16le', '-acodec', 'pcm_s16le',
            '-ar', str(self.sample_rate), '-ac', '1', '-nostdin', '-loglevel', 'error', '-'
        ]
        # stderr inherits the console; an unread stderr PIPE can deadlock ffmpeg.
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
        self.has_seeked = True  # ffmpeg seeks, without recursively discarding hours of PCM

    def read_chunk(self, n_bytes):
        if not self.proc: return None
        
        # Normal reading after seeking
        data = self.proc.stdout.read(n_bytes)
        if not data or len(data) < n_bytes:
            return None
        return data

    def stop(self):
        if self.proc:
            try:
                if self.proc.poll() is None:
                    self.proc.terminate()
                try:
                    self.proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
                    self.proc.wait(timeout=2)
            finally:
                if self.proc.stdout:
                    self.proc.stdout.close()

class DevicePCMStreamer:
    def __init__(self, device, sample_rate=16000):
        self.device = int(device)
        self.sample_rate = sample_rate
        self.stream = None

    def start(self):
        import sounddevice as sd
        self.stream = sd.RawInputStream(samplerate=self.sample_rate, channels=1, dtype='int16', device=self.device, blocksize=int(self.sample_rate * 0.02))
        self.stream.start()

    def read_chunk(self, n_bytes):
        if not self.stream: return None
        return bytes(self.stream.read(n_bytes // 2)[0])

    def stop(self):
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None


def pcm_bytes_to_float_numpy(pcm_bytes):
    # s16le -> float32 [-1,1]
    ints = np.frombuffer(pcm_bytes, dtype=np.int16)
    return (ints.astype(np.float32) / 32768.0)

def cleanup_json_string(text):
    # Gemini often returns JSON wrapped in ```json ... ```
    if text.startswith("```json"):
        text = text[7:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

def pcm_to_wav_bytes(pcm_bytes, sample_rate=16000):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(sample_rate); wav.writeframes(pcm_bytes)
    return buffer.getvalue()

def run_transcription_loop(youtube_url, start_time=0, model_id=None, stop_event=None, session_id=None, target_language='id'):
    stop_event = stop_event if stop_event is not None else threading.Event()
    load_dotenv()
    server_url = os.getenv('COWAYANG_SERVER_URL', 'http://127.0.0.1:3000').rstrip('/')
    NODEJS_WEBHOOK_URL = os.getenv('NODEJS_WEBHOOK_URL', f'{server_url}/api/webhook')
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite')
    
    if not GEMINI_API_KEY:
        print("(FATAL) GEMINI_API_KEY not found in .env file.")
        return

    # --- Initialize Gemini ---
    print(f"(INFO) Initializing Google Gemini ({GEMINI_MODEL})...")
    try:
        from google import genai as genai_client
        from google.genai import types as genai_types
        model = genai_client.Client(api_key=GEMINI_API_KEY)
        use_new_sdk = True
    except ImportError:
        model = None
        use_new_sdk = False
        print("(FATAL) No Google Gemini SDK installed; audio capture will stop without inference.")
    try:
        print("(INFO) Gemini API Ready.")
    except Exception as e:
        print(f"(FATAL) Failed to initialize Gemini: {e}")
        return

    sample_rate = 16000
    frame_duration = 20
    frame_bytes = int(sample_rate * 2 * frame_duration / 1000)
    
    vad = None
    if HAVE_WEBRTC:
        vad = webrtcvad.Vad(2)

    direct_audio = youtube_url.startswith('mic://')
    window_sec = 8.0 if direct_audio else 4.0
    stride_sec = 2.0
    window_frames = int(math.ceil(window_sec * 1000 / frame_duration))
    stride_frames = int(math.ceil(stride_sec * 1000 / frame_duration))

    if direct_audio:
        device = os.getenv('FOH_AUDIO_DEVICE_INDEX') or youtube_url.split('://', 1)[1]
        if not str(device).isdigit():
            print('FOH_AUDIO_DEVICE_INDEX must be a numeric input device index.')
            return
        streamer = DevicePCMStreamer(device, sample_rate=sample_rate)
    else:
        stream_url = get_stream_url(youtube_url)
        if not stream_url:
            print('Failed to get stream url from yt-dlp. Exiting.')
            return
        streamer = PCMStreamer(stream_url, sample_rate=sample_rate, start_time=start_time)
    chunk_buffer = deque()
    chunk_frame_count = 0
    audio_pos_seconds = 0.0
    last_final_text = None
    silence_frames = 0
    speech_frames = 0


    def fmt_ts(ts):
        m = int(ts // 60)
        s = int(ts % 60)
        return f"{m:02d}:{s:02d}"

    try:
        streamer.start()
        while not stop_event.is_set():
            frame_bytes_data = streamer.read_chunk(frame_bytes)
            if frame_bytes_data is None:
                print('Streamer ended or returned no data')
                break

            is_speech = False
            if HAVE_WEBRTC and vad:
                try: is_speech = vad.is_speech(frame_bytes_data, sample_rate)
                except: pass
            elif HAVE_SILERO and silero_model:
                # Silero needs a larger chunk to be reliable, so we check on the whole window later
                is_speech = True # Assume speech for now
            else:
                # Basic energy VAD
                ints = np.frombuffer(frame_bytes_data, dtype=np.int16).astype(np.float32)
                if ints.size > 0:
                    rms = np.sqrt(np.mean((ints / 32768.0) ** 2))
                    is_speech = rms > 0.01

            rms = 1.0 if is_speech else 0.0
            if not HAVE_WEBRTC:
                ints = np.frombuffer(frame_bytes_data, dtype=np.int16).astype(np.float32)
                rms = float(np.sqrt(np.mean((ints / 32768.0) ** 2))) if ints.size else 0.0
                is_speech = rms >= 0.01
            if is_speech or chunk_buffer:
                chunk_buffer.append((frame_bytes_data, is_speech))
            audio_pos_seconds += frame_duration / 1000.0
            if is_speech:
                speech_frames += 1
                silence_frames = 0
            else:
                silence_frames += 1
            silence_limit = int(700 / frame_duration)
            max_speech_frames = int(8000 / frame_duration)
            should_send = bool(chunk_buffer) and speech_frames > 0 and (silence_frames >= silence_limit or speech_frames >= max_speech_frames)
            if should_send:
                window_bytes = b''.join([b for b, s in list(chunk_buffer)])
                speech_bytes = b''.join([b for b, s in list(chunk_buffer) if s])
                audio_f32 = pcm_bytes_to_float_numpy(window_bytes)
                
                voiced_duration = 0
                if HAVE_SILERO and silero_model:
                     try:
                        speech_timestamps = silero_get_speech_ts(audio_f32, silero_model, sampling_rate=sample_rate)
                        voiced_duration = sum((seg['end'] - seg['start']) for seg in speech_timestamps) / sample_rate if speech_timestamps else 0.0
                     except: pass
                else:
                    voiced_frames = sum(1 for _, s in list(chunk_buffer) if s)
                    voiced_duration = voiced_frames * frame_duration / 1000.0

                if voiced_duration < 0.5 or rms < 0.01: # Ignore silence/static noise
                    chunk_buffer.clear(); speech_frames = 0; silence_frames = 0
                    continue

                window_end = audio_pos_seconds + start_time
                window_start = window_end - window_sec
                
                try:
                    # Keep audio in RAM; the legacy SDK accepts raw bytes as an inline part.
                    wav_bytes = pcm_to_wav_bytes(speech_bytes, sample_rate)
                    prompt = """
                    You are an expert in Javanese language and culture.
                    Analyze the attached audio file. It contains spoken Javanese.
                    Your task is to:
                    1. Transcribe the spoken Javanese into written Javanese (Latin script).
                    2. Translate it into standard Indonesian.
                    3. Translate it into English.
                    Return exactly one JSON object with keys transcription, translation, translation_en.
                    """
                    print(f"--> Mengirim chunk {fmt_ts(window_start)}-{fmt_ts(window_end)} ke Gemini...")
                    if use_new_sdk:
                        response = model.models.generate_content(
                            model=GEMINI_MODEL,
                            contents=[prompt, genai_types.Part.from_bytes(data=wav_bytes, mime_type='audio/wav')],
                            config=genai_types.GenerateContentConfig(
                                response_mime_type='application/json',
                                thinking_config=genai_types.ThinkingConfig(thinking_level='low')))
                    else:
                        response = model.generate_content([prompt, {'mime_type': 'audio/wav', 'data': wav_bytes}])
                    # Log the raw response from Gemini for debugging
                    print(f"(DEBUG) Raw Gemini Response: {response.text}")

                    # 4. Parse Response
                    response_text = cleanup_json_string(response.text)
                    result = json.loads(response_text)
                    transcription = result.get('transcription', '').lower().strip()
                    translation = result.get('translation', '').strip()
                    translation_en = result.get('translation_en', '').strip()

                    if transcription and transcription != last_final_text:
                        last_final_text = transcription
                        print(f"-> Gemini Berhasil -> Transkripsi: '{transcription}'")
                        
                        payload = {
                            'type': 'subtitle',
                            'sessionId': session_id,
                            'data': {
                                'timestamp': fmt_ts(max(0.0, window_start)),
                                'start_time': max(0.0, window_start),
                                'end_time': window_end,
                                'text': transcription,
                                'translation': translation,
                                'translation_en': translation_en
                            }
                        }
                        try:
                            requests.post(NODEJS_WEBHOOK_URL, json=payload, headers={'x-cowayang-secret': os.getenv('WORKER_SHARED_SECRET', '')}, timeout=3)
                            print(f"--> Webhook Terkirim: {payload['data']['timestamp']} - '{payload['data']['text']}'")
                        except Exception as e:
                            print(f"  - (ERROR) Webhook Error: {e}")
                    else:
                        print("--> Gemini tidak menghasilkan transkripsi (mungkin audio sepi).")

                except Exception as e:
                    print(f"(ERROR) Gemini API Error: {e}")
                chunk_buffer.clear(); speech_frames = 0; silence_frames = 0
            chunk_frame_count += 1

    finally:
        streamer.stop()
        print('Stopped streamer.')



def parse_time(time_str):
    """Parse time string in format HH:MM:SS or MM:SS or just seconds"""
    if isinstance(time_str, int):
        return time_str
    if isinstance(time_str, str):
        parts = time_str.split(':')
        if len(parts) == 3:  # HH:MM:SS
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:  # MM:SS
            return int(parts[0]) * 60 + int(parts[1])
        else:  # Just seconds
            return int(parts[0])
    return 0

def main():
    parser = argparse.ArgumentParser(description='ASR prototype: Gemini Javanese streaming on CPU')
    parser.add_argument('video_url', help='YouTube URL to analyze')
    parser.add_argument('--start', type=str, default='0', help='Start time (seconds or HH:MM:SS format, e.g., 1:02:21)')
    
    # The --model argument is no longer used by Gemini, but kept for compatibility to avoid errors
    parser.add_argument('--model', default=None, help='(Not used with Gemini backend)')

    args = parser.parse_args()
    start_seconds = parse_time(args.start)
    print(f"🎬 Starting transcription from: {args.start} ({start_seconds} seconds)")
    run_transcription_loop(args.video_url, start_time=start_seconds)


if __name__ == '__main__':
    main()
