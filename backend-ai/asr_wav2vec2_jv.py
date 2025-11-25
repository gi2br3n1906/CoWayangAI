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
from collections import deque
import requests
import json
import threading
import numpy as np
import soundfile as sf
from dotenv import load_dotenv

# --- Gemini API Setup ---
import google.generativeai as genai

# --- VAD Imports ---
try:
    import webrtcvad
    HAVE_WEBRTC = True
except Exception:
    HAVE_WEBRTC = False
    print('(PERINGATAN) webrtcvad not installed or failed to import. Using Silero VAD fallback.')
    HAVE_SILERO = False
    silero_get_speech_ts = None
    silero_model = None
    try:
        # Silero VAD is a good fallback that doesn't require C++ build tools
        import torch
        silero_model, silero_utils = torch.hub.load('snakers4/silero-vad', 'silero_vad', trust_repo=True)
        silero_get_speech_ts = silero_utils[0]
        HAVE_SILERO = True
        print('(INFO) Silero VAD loaded via torch.hub')
    except Exception as e:
        HAVE_SILERO = False
        silero_get_speech_ts = None
        print(f'(ERROR) Failed to load Silero VAD: {e}. Falling back to basic energy VAD.')


def get_stream_url(yt_url):
    import yt_dlp
    ydl_opts = {'format': 'bestaudio/best', 'quiet': True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(yt_url, download=False)
            return info['url']
        except Exception as e:
            print(f"Error yt-dlp: {e}")
            return None


class PCMStreamer:
    """Spawn ffmpeg to output raw PCM s16le 16k mono to stdout and yield frames"""
    def __init__(self, stream_url, sample_rate=16000):
        self.stream_url = stream_url
        self.sample_rate = sample_rate
        self.proc = None

    def start(self):
        cmd = [
            'ffmpeg', '-i', self.stream_url,
            '-vn', '-f', 's16le', '-acodec', 'pcm_s16le',
            '-ar', str(self.sample_rate), '-ac', '1', '-nostdin', '-loglevel', 'error', '-'
        ]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def read_chunk(self, n_bytes):
        if not self.proc: return None
        data = self.proc.stdout.read(n_bytes)
        if not data or len(data) < n_bytes: return None
        return data

    def stop(self):
        if self.proc:
            try: self.proc.kill()
            except: pass


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

def run_transcription_loop(youtube_url, start_time=0, model_id=None):
    load_dotenv()
    NODEJS_WEBHOOK_URL = os.getenv('NODEJS_WEBHOOK_URL', 'http://localhost:3000/api/webhook')
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash-latest')
    
    if not GEMINI_API_KEY:
        print("(FATAL) GEMINI_API_KEY not found in .env file.")
        return

    # --- Initialize Gemini ---
    print(f"(INFO) Initializing Google Gemini ({GEMINI_MODEL})...")
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)
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

    window_sec = 4.0
    stride_sec = 2.0
    window_frames = int(math.ceil(window_sec * 1000 / frame_duration))
    stride_frames = int(math.ceil(stride_sec * 1000 / frame_duration))

    stream_url = get_stream_url(youtube_url)
    if not stream_url:
        print('Failed to get stream url from yt-dlp. Exiting.')
        return

    streamer = PCMStreamer(stream_url, sample_rate=sample_rate)
    streamer.start()

    chunk_buffer = deque(maxlen=window_frames)
    chunk_frame_count = 0
    audio_pos_seconds = 0.0
    last_final_text = None
    temp_dir = "temp_audio_chunks"
    os.makedirs(temp_dir, exist_ok=True)

    def fmt_ts(ts):
        m = int(ts // 60)
        s = int(ts % 60)
        return f"{m:02d}:{s:02d}"

    try:
        while True:
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

            chunk_buffer.append((frame_bytes_data, is_speech))
            audio_pos_seconds += frame_duration / 1000.0

            if len(chunk_buffer) >= window_frames and (chunk_frame_count % stride_frames == 0):
                window_bytes = b''.join([b for b, s in list(chunk_buffer)])
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

                if voiced_duration < 0.5: # Min 0.5s of speech in window
                    chunk_frame_count += 1
                    continue

                window_end = audio_pos_seconds
                window_start = window_end - window_sec
                
                uploaded_file = None
                temp_file_path = None

                try:
                    # 1. Save chunk to a temporary WAV file
                    temp_file_name = f"{uuid.uuid4()}.wav"
                    temp_file_path = os.path.join(temp_dir, temp_file_name)
                    sf.write(temp_file_path, audio_f32, sample_rate)

                    # 2. Upload file to Gemini
                    uploaded_file = genai.upload_file(path=temp_file_path, display_name=temp_file_name)
                    
                    # 3. Call Gemini API
                    prompt = """
                    You are an expert in Javanese language and culture.
                    Analyze the attached audio file. It contains spoken Javanese.
                    Your task is to:
                    1. Transcribe the spoken Javanese into written Javanese (using Latin script).
                    2. Translate the Javanese transcription into standard Indonesian.
                    
                    Provide the output as a single, clean JSON object with two keys: "transcription" and "translation". Do not include any other text, greetings, or explanations.
                    
                    Example response:
                    {
                        "transcription": "iki conto transkripsi jowo",
                        "translation": "ini contoh transkripsi jawa"
                    }
                    """
                    print(f"--> Mengirim chunk {fmt_ts(window_start)}-{fmt_ts(window_end)} ke Gemini...")
                    response = model.generate_content([prompt, uploaded_file])
                    
                    # Log the raw response from Gemini for debugging
                    print(f"(DEBUG) Raw Gemini Response: {response.text}")

                    # 4. Parse Response
                    response_text = cleanup_json_string(response.text)
                    result = json.loads(response_text)
                    transcription = result.get('transcription', '').lower().strip()
                    translation = result.get('translation', '').strip()

                    if transcription and transcription != last_final_text:
                        last_final_text = transcription
                        print(f"-> Gemini Berhasil -> Transkripsi: '{transcription}'")
                        
                        payload = {
                            'type': 'subtitle',
                            'data': {
                                'timestamp': fmt_ts(max(0.0, window_start)),
                                'start_time': max(0.0, window_start),
                                'end_time': window_end,
                                'text': transcription,
                                'translation': translation
                            }
                        }
                        try:
                            requests.post(NODEJS_WEBHOOK_URL, json=payload, timeout=0.5)
                            print(f"--> Webhook Terkirim: {payload['data']['timestamp']} - '{payload['data']['text']}'")
                        except Exception as e:
                            print(f"  - (ERROR) Webhook Error: {e}")
                    else:
                        print("--> Gemini tidak menghasilkan transkripsi (mungkin audio sepi).")

                except Exception as e:
                    print(f"(ERROR) Gemini API Error: {e}")
                
                finally:
                    # 5. Cleanup files
                    if uploaded_file:
                        try: genai.delete_file(uploaded_file.name)
                        except: pass # Ignore cleanup errors
                    if temp_file_path and os.path.exists(temp_file_path):
                        try: os.remove(temp_file_path)
                        except: pass

            chunk_frame_count += 1

    finally:
        streamer.stop()
        print('Stopped streamer.')
        # Clean up any leftover temp files
        for f in os.listdir(temp_dir):
            try: os.remove(os.path.join(temp_dir, f))
            except: pass
        try: os.rmdir(temp_dir)
        except: pass


def main():
    parser = argparse.ArgumentParser(description='ASR prototype: Gemini Javanese streaming on CPU')
    parser.add_argument('video_url', help='YouTube URL to analyze')
    parser.add_argument('--start', type=int, default=0, help='Start time in seconds')
    
    # The --model argument is no longer used by Gemini, but kept for compatibility to avoid errors
    parser.add_argument('--model', default=None, help='(Not used with Gemini backend)')

    args = parser.parse_args()
    run_transcription_loop(args.video_url, start_time=args.start)


if __name__ == '__main__':
    main()
