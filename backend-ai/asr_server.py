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

# Import the transcription logic
from asr_wav2vec2_jv import run_transcription_loop, parse_time

load_dotenv()

app = FastAPI(title="ASR Server", description="ASR service for Javanese transcription")

class StartASRRequest(BaseModel):
    videoUrl: str
    startTime: int = 0

active_threads = {}

@app.get("/")
def health_check():
    return {"status": "ASR Server Running"}

@app.post("/start-asr")
def start_asr(request: StartASRRequest):
    video_url = request.videoUrl
    start_time = request.startTime

    # Check if already running for this URL
    if video_url in active_threads and active_threads[video_url].is_alive():
        raise HTTPException(status_code=400, detail="ASR already running for this video")

    # Start ASR in a new thread
    thread = threading.Thread(target=run_transcription_loop, args=(video_url, start_time))
    thread.daemon = True
    active_threads[video_url] = thread
    thread.start()

    return {"status": "ASR started", "video": video_url}

@app.post("/stop-asr")
def stop_asr(request: StartASRRequest):
    video_url = request.videoUrl

    if video_url in active_threads:
        # Note: Threads are daemon, they will stop when main process stops
        # For immediate stop, we might need to implement proper stopping mechanism
        del active_threads[video_url]
        return {"status": "ASR stopped", "video": video_url}
    else:
        raise HTTPException(status_code=404, detail="No active ASR for this video")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='ASR Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind')
    parser.add_argument('--port', type=int, default=8001, help='Port to bind')

    args = parser.parse_args()

    print(f"Starting ASR Server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)