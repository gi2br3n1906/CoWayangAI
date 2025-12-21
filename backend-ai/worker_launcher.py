"""
Worker Launcher - Menjalankan Multiple YOLO Workers
=====================================================
Script ini menjalankan beberapa worker secara paralel untuk handle
multiple users secara bersamaan.

Cara Pakai:
    python worker_launcher.py --workers 5

Ini akan menjalankan 5 worker dengan ID:
- worker-1
- worker-2
- worker-3
- worker-4
- worker-5
"""

import subprocess
import sys
import os
import signal
import time
import argparse
from typing import List, Dict

# Konfigurasi
DEFAULT_WORKERS = 5
PYTHON_SCRIPT = "live_stream_worker.py"

# Global state
processes: Dict[str, subprocess.Popen] = {}
running = True


def start_worker(worker_id: str, server: str, model: str) -> subprocess.Popen:
    """Start a single worker process."""
    cmd = [
        sys.executable,
        PYTHON_SCRIPT,
        "--worker-id", worker_id,
        "--server", server,
        "--model", model
    ]
    
    print(f"🚀 Starting {worker_id}...")
    
    # Start process with separate console on Windows, or in background on Linux
    if sys.platform == "win32":
        process = subprocess.Popen(
            cmd,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT
        )
    
    return process


def stop_all_workers():
    """Stop all running workers."""
    global running
    running = False
    
    print("\n🛑 Stopping all workers...")
    
    for worker_id, process in processes.items():
        if process.poll() is None:  # Still running
            print(f"   Stopping {worker_id}...")
            if sys.platform == "win32":
                process.terminate()
            else:
                process.send_signal(signal.SIGTERM)
    
    # Wait for all to terminate
    for worker_id, process in processes.items():
        try:
            process.wait(timeout=5)
            print(f"   ✅ {worker_id} stopped")
        except subprocess.TimeoutExpired:
            print(f"   ⚠️ {worker_id} force kill")
            process.kill()


def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully."""
    stop_all_workers()
    sys.exit(0)


def monitor_workers(server: str, model: str):
    """Monitor workers and restart if they crash."""
    global running
    
    while running:
        for worker_id, process in list(processes.items()):
            if process.poll() is not None:  # Process exited
                exit_code = process.returncode
                print(f"⚠️ {worker_id} exited with code {exit_code}, restarting...")
                processes[worker_id] = start_worker(worker_id, server, model)
        
        time.sleep(5)  # Check every 5 seconds


def main():
    global processes
    
    parser = argparse.ArgumentParser(description='CoWayang AI Worker Launcher')
    parser.add_argument('--workers', type=int, default=DEFAULT_WORKERS,
                        help=f'Number of workers to start (default: {DEFAULT_WORKERS})')
    parser.add_argument('--server', type=str, default='https://cowayangai.site',
                        help='Server URL')
    parser.add_argument('--model', type=str, default='yolov12.pt',
                        help='Model path')
    
    args = parser.parse_args()
    
    num_workers = args.workers
    server = args.server
    model = args.model
    
    print("\n" + "="*60)
    print("   CoWayang AI - Worker Launcher")
    print("="*60)
    print(f"\n📊 Configuration:")
    print(f"   Workers: {num_workers}")
    print(f"   Server:  {server}")
    print(f"   Model:   {model}")
    print()
    
    # Setup signal handler
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start all workers
    print("🚀 Starting workers...\n")
    
    for i in range(1, num_workers + 1):
        worker_id = f"worker-{i}"
        processes[worker_id] = start_worker(worker_id, server, model)
        time.sleep(1)  # Stagger startup to avoid GPU memory spike
    
    print("\n" + "="*60)
    print(f"  ✅ All {num_workers} workers started!")
    print("  ")
    print("  Workers akan otomatis menerima session dari VPS.")
    print("  Monitor status di: https://cowayangai.site/api/worker-status")
    print("  ")
    print("  Tekan Ctrl+C untuk stop semua workers.")
    print("="*60 + "\n")
    
    # Monitor and restart crashed workers
    try:
        monitor_workers(server, model)
    except KeyboardInterrupt:
        pass
    finally:
        stop_all_workers()
        print("\n👋 All workers stopped.")


if __name__ == '__main__':
    main()
