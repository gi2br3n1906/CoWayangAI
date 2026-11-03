"""
ASR Server for Javanese using Google Gemini API.

This server runs continuously and accepts POST requests to start ASR on YouTube videos.
"""

import os
import threading
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import argparse
import os

# Import the transcription logic
from asr_wav2vec2_jv import run_transcription_loop, parse_time

load_dotenv()

app = FastAPI(title="ASR Server", description="ASR service for Javanese transcription")

class StartASRRequest(BaseModel):
    videoUrl: str
    startTime: int = 0
    sessionId: str | None = None
    targetLanguage: str = 'id'

active_threads = {}
active_stops = {}
active_lock = threading.Lock()


def _run_asr(video_url, start_time, session_id, target_language, cancellation):
    try:
        try:
            run_transcription_loop(video_url, start_time, stop_event=cancellation, session_id=session_id, target_language=target_language)
        except TypeError as error:
            if 'unexpected keyword argument' not in str(error):
                raise
            run_transcription_loop(video_url, start_time, stop_event=cancellation)
    finally:
        with active_lock:
            if active_threads.get(video_url) is threading.current_thread():
                active_threads.pop(video_url, None)
                active_stops.pop(video_url, None)

@app.get("/")
def health_check():
    return {"status": "ASR Server Running"}

@app.post("/start-asr")
def start_asr(request: StartASRRequest):
    video_url = request.videoUrl
    start_time = request.startTime

    with active_lock:
        if video_url in active_threads and active_threads[video_url].is_alive():
            raise HTTPException(status_code=400, detail="ASR already running for this video")
        cancellation = threading.Event()
        thread = threading.Thread(target=_run_asr,
                                  args=(video_url, start_time, request.sessionId, request.targetLanguage, cancellation), daemon=True)
        active_threads[video_url] = thread
        active_stops[video_url] = cancellation
        thread.start()

    return {"status": "ASR started", "video": video_url}

@app.post("/stop-asr")
def stop_asr(request: StartASRRequest):
    video_url = request.videoUrl

    with active_lock:
        thread = active_threads.get(video_url)
        if thread is None:
            raise HTTPException(status_code=404, detail="No active ASR for this video")
        active_stops[video_url].set()
    # Do not hold the registry lock while the thread's finally removes itself.
    thread.join(timeout=2)
    if thread.is_alive():
        return {"status": "ASR stopping", "video": video_url}
    return {"status": "ASR stopped", "video": video_url}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='ASR Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind')
    parser.add_argument('--port', type=int, default=8001, help='Port to bind')

    args = parser.parse_args()

    print(f"Starting ASR Server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)