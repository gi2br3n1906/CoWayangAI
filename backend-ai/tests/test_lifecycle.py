"""Runtime regressions with dependency stubs: no models or network access."""
import contextlib
from http.server import ThreadingHTTPServer
import importlib.util
import io
import os
from pathlib import Path
import sys
import threading
import types
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class FakeSocket:
    def __init__(self, **kwargs):
        self.options = kwargs
        self.connected = True
        self.emitted = []

    def event(self, fn):
        return fn

    def on(self, event):
        return lambda fn: fn

    def emit(self, event, data):
        self.emitted.append((event, data))

    def disconnect(self):
        self.connected = False


class FakeCapture:
    def __init__(self, frames=1, opened=True, backend=None):
        if isinstance(frames, int) and frames > 10 and backend is None:
            backend, frames, opened = frames, 1, True
        self.frames = frames
        self.opened = opened
        self.backend = backend
        self.released = False
        self.positions = []

    def isOpened(self):
        return self.opened

    def get(self, prop):
        return {1: 30, 2: 1}.get(prop, 0)

    def set(self, prop, value):
        self.positions.append((prop, value))
        return True

    def read(self):
        if self.frames:
            self.frames -= 1
            return True, types.SimpleNamespace(shape=(100, 200, 3))
        return False, None

    def release(self):
        self.released = True


def load_worker():
    cv2 = types.ModuleType('cv2')
    for name, value in {'CAP_PROP_FPS': 1, 'CAP_PROP_FRAME_COUNT': 2,
                        'CAP_PROP_POS_FRAMES': 3, 'CAP_PROP_POS_MSEC': 4,
                        'CAP_DSHOW': 5, 'CAP_ANY': 6, 'CAP_FFMPEG': 7}.items():
        setattr(cv2, name, value)
    for name in ('imshow', 'waitKey', 'destroyWindow', 'destroyAllWindows', 'resize', 'putText'):
        setattr(cv2, name, Mock(side_effect=RuntimeError('headless GUI called')))
    deps = {'cv2': cv2, 'numpy': types.ModuleType('numpy'),
            'socketio': types.SimpleNamespace(Client=FakeSocket),
            'ultralytics': types.SimpleNamespace(YOLO=Mock()),
            'cap_from_youtube': types.SimpleNamespace(cap_from_youtube=Mock()),
            'yt_dlp': types.SimpleNamespace(YoutubeDL=Mock()),
            'shutil': __import__('shutil')}
    spec = importlib.util.spec_from_file_location('test_worker', ROOT / 'live_stream_worker.py')
    worker = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, deps):
        spec.loader.exec_module(worker)
    worker.worker_id = 'worker-1'
    worker.model = types.SimpleNamespace(predict=Mock(return_value=[object()]))
    worker.extract_boxes = Mock(return_value=[])
    return worker


class FakeApp:
    def __init__(self, **kwargs):
        pass

    def get(self, path):
        return lambda fn: fn

    post = get
    on_event = get


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail


class FakeRequest:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def load_main():
    worker = load_worker()
    deps = {'cv2': worker.cv2, 'requests': types.SimpleNamespace(post=Mock()),
            'yt_dlp': types.SimpleNamespace(YoutubeDL=Mock()),
            'fastapi': types.SimpleNamespace(FastAPI=FakeApp, HTTPException=FakeHTTPException),
            'pydantic': types.SimpleNamespace(BaseModel=FakeRequest),
            'uvicorn': types.SimpleNamespace(run=Mock())}
    spec = importlib.util.spec_from_file_location('test_main', ROOT / 'main.py')
    main = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, deps):
        spec.loader.exec_module(main)
    return main


class AnalysisTests(unittest.TestCase):
    def test_legacy_main_entrypoint_is_deprecated_without_loading_cloud_detector(self):
        main = load_main()
        response = main.health_check()
        self.assertFalse(response['model_loaded'])
        self.assertEqual(response['engine'], 'local-ultralytics-worker')
        self.assertFalse(hasattr(main, 'Roboflow'))

    def test_stream_url_is_extracted_once_inside_live_context(self):
        main = load_main()

        class Extractor:
            calls = 0
            opened = False

            def __enter__(self):
                self.opened = True
                return self

            def __exit__(self, *args):
                self.opened = False

            def extract_info(self, url, download=False):
                self.calls += 1
                if not self.opened:
                    raise RuntimeError('extractor used after closing')
                return {'url': 'fixture-stream'}

        extractor = Extractor()
        main.yt_dlp.YoutubeDL = Mock(return_value=extractor)
        with patch.object(main.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main.get_stream_url('fixture'), 'fixture-stream')
        self.assertEqual(extractor.calls, 1)

    def test_start_handler_does_not_overlap_stubborn_previous_run(self):
        main = load_main()
        previous = Mock()
        previous.is_alive.return_value = True
        main.current_thread = previous
        req = main.VideoRequest(videoUrl='fixture', startTime=0)
        with patch.object(main.threading, 'Thread') as factory:
            with self.assertRaises(FakeHTTPException) as error:
                main.start_analysis(req)
        self.assertEqual(error.exception.status_code, 409)
        self.assertTrue(main.stop_event.is_set())
        self.assertIs(main.current_thread, previous)
        self.assertIsNotNone(previous.join.call_args.kwargs.get('timeout'))
        factory.assert_not_called()

    def test_eof_retries_are_bounded_and_release_capture(self):
        main = load_main()
        cap = FakeCapture(frames=0)
        cap.read = Mock(side_effect=[(False, None)] * 4 + [RuntimeError('unbounded EOF')])
        main.cv2.VideoCapture = Mock(return_value=cap)
        main.global_model = object()
        main.get_stream_url = Mock(return_value='fixture')
        with patch.object(main.time, 'sleep'), patch.object(main.stop_event, 'wait', return_value=False), \
                contextlib.redirect_stdout(io.StringIO()):
            try:
                main.analysis_logic('fixture')
            except RuntimeError:
                pass
        self.assertTrue(cap.released)
        self.assertLessEqual(cap.read.call_count, 3)


def load_asr(webrtc=True):
    google = types.ModuleType('google')
    google.generativeai = types.ModuleType('google.generativeai')
    google.generativeai.configure = Mock()
    google.generativeai.GenerativeModel = Mock()
    google.generativeai.GenerativeModel.return_value.generate_content.return_value = types.SimpleNamespace(text='{}')
    google.generativeai.upload_file = Mock(return_value=types.SimpleNamespace(name='fixture'))
    google.generativeai.delete_file = Mock()
    hub = types.SimpleNamespace(load=Mock(return_value=(object(), [Mock()])))
    deps = {'numpy': types.ModuleType('numpy'), 'soundfile': types.SimpleNamespace(write=Mock()),
            'requests': types.SimpleNamespace(post=Mock()),
            'dotenv': types.SimpleNamespace(load_dotenv=Mock()),
            'google': google, 'google.generativeai': google.generativeai,
            'torch': types.SimpleNamespace(hub=hub),
            'webrtcvad': types.SimpleNamespace(Vad=Mock()) if webrtc else None}
    spec = importlib.util.spec_from_file_location('test_asr', ROOT / 'asr_wav2vec2_jv.py')
    asr = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, deps), contextlib.redirect_stdout(io.StringIO()):
        spec.loader.exec_module(asr)
    return asr, hub


class ASRTests(unittest.TestCase):
    def test_pcm_stop_reaps_process_and_closes_stdout(self):
        asr, _ = load_asr()
        streamer = asr.PCMStreamer('fixture')
        process = Mock()
        process.poll.return_value = None
        process.wait.side_effect = [asr.subprocess.TimeoutExpired('fixture', 2), 0]
        streamer.proc = process
        streamer.stop()
        process.terminate.assert_called_once_with()
        process.kill.assert_called_once_with()
        self.assertEqual(process.wait.call_count, 2)
        process.stdout.close.assert_called_once_with()

    def test_pcm_uses_ffmpeg_seek_without_an_unread_stderr_pipe(self):
        asr, _ = load_asr()
        with patch.object(asr.subprocess, 'Popen') as spawn, contextlib.redirect_stdout(io.StringIO()):
            streamer = asr.PCMStreamer('fixture', start_time=40000)
            streamer.start()
            spawn.return_value.stdout.read.return_value = b'fixture'
            self.assertEqual(streamer.read_chunk(7), b'fixture')
        command = spawn.call_args.args[0]
        self.assertIn('-ss', command)
        self.assertEqual(command[command.index('-ss') + 1], '40000')
        self.assertNotEqual(spawn.call_args.kwargs.get('stderr'), asr.subprocess.PIPE)
        spawn.return_value.stdout.read.assert_called_once_with(7)

    def test_webrtc_transcription_window_does_not_reference_undefined_silero(self):
        asr, _ = load_asr()
        streamer = Mock()
        streamer.read_chunk.side_effect = [b'\x00' * 640] * 201 + [None]
        asr.PCMStreamer = Mock(return_value=streamer)
        asr.get_stream_url = Mock(return_value='fixture')
        asr.pcm_bytes_to_float_numpy = Mock(return_value=object())
        output = io.StringIO()
        fake_os = types.SimpleNamespace(getenv=os.getenv, path=os.path, makedirs=Mock(),
                                        listdir=Mock(return_value=[]), rmdir=Mock())
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'fixture-test-key'}), \
                patch.object(asr, 'os', fake_os), contextlib.redirect_stdout(output):
            asr.run_transcription_loop('fixture')
        streamer.stop.assert_called_once_with()
        self.assertFalse(asr.HAVE_SILERO)
        self.assertNotIn('(ERROR)', output.getvalue())

    def test_missing_webrtc_does_not_download_models_at_import(self):
        with patch.dict(os.environ, {'COWAYANG_ENABLE_SILERO': '0'}):
            asr, hub = load_asr(webrtc=False)
        hub.load.assert_not_called()
        self.assertFalse(asr.HAVE_SILERO)


def load_asr_server(run):
    deps = {'dotenv': types.SimpleNamespace(load_dotenv=Mock()),
            'fastapi': types.SimpleNamespace(FastAPI=FakeApp, HTTPException=FakeHTTPException),
            'pydantic': types.SimpleNamespace(BaseModel=FakeRequest),
            'uvicorn': types.SimpleNamespace(run=Mock()),
            'asr_wav2vec2_jv': types.SimpleNamespace(run_transcription_loop=run, parse_time=Mock())}
    spec = importlib.util.spec_from_file_location('test_asr_server', ROOT / 'asr_server.py')
    server = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, deps):
        spec.loader.exec_module(server)
    return server


class ASRServerTests(unittest.TestCase):
    def test_stop_route_actually_cancels_transcription_thread(self):
        entered, unblock = threading.Event(), threading.Event()

        def run(url, start, stop_event=None):
            entered.set()
            if stop_event is not None:
                stop_event.wait(2)
            else:
                unblock.wait(2)

        server = load_asr_server(run)
        request = server.StartASRRequest(videoUrl='fixture', startTime=0)
        server.start_asr(request)
        thread = server.active_threads['fixture']
        try:
            self.assertTrue(entered.wait(1))
            result = server.stop_asr(request)
            self.assertEqual(result['status'], 'ASR stopped')
            self.assertFalse(thread.is_alive())
            self.assertNotIn('fixture', server.active_threads)
        finally:
            unblock.set()
            thread.join(2)


def load_launcher():
    spec = importlib.util.spec_from_file_location('test_launcher', ROOT / 'worker_launcher.py')
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    return launcher


class LauncherTests(unittest.TestCase):
    def test_linux_worker_does_not_pipe_unconsumed_output(self):
        launcher = load_launcher()
        with patch.object(launcher.sys, 'platform', 'linux'), patch.object(launcher.subprocess, 'Popen') as spawn:
            with contextlib.redirect_stdout(io.StringIO()):
                launcher.start_worker('worker-1', 'fixture-server', 'fixture-model')
        kwargs = spawn.call_args.kwargs
        self.assertNotEqual(kwargs.get('stdout'), launcher.subprocess.PIPE)
        command = spawn.call_args.args[0]
        self.assertTrue(Path(command[1]).is_absolute())
        self.assertIn('--no-preview', command)


class WorkerTests(unittest.TestCase):
    def test_youtube_capture_selects_available_format_with_node_runtime_and_ffmpeg(self):
        worker = load_worker()
        formats = [
            {'height': 360, 'vcodec': 'avc1', 'url': 'https://cdn.test/360.mp4'},
            {'height': 720, 'vcodec': 'vp9', 'url': 'https://cdn.test/720.webm'},
        ]

        class Extractor:
            def __init__(self, options): self.options = options
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def extract_info(self, *_args, **_kwargs): return {'formats': formats}

        worker.yt_dlp.YoutubeDL = Extractor
        worker.shutil.which = Mock(return_value='C:/Program Files/nodejs/node.exe')
        cap = FakeCapture()
        worker.cv2.VideoCapture = Mock(return_value=cap)
        opened = worker.open_youtube_capture('https://youtube.com/watch?v=fixture', '720p')
        self.assertIs(opened, cap)
        worker.cv2.VideoCapture.assert_called_once_with('https://cdn.test/720.webm', worker.cv2.CAP_FFMPEG)

    def test_preview_teardown_error_does_not_leave_worker_busy(self):
        worker = load_worker()
        worker.preview_enabled = True
        cap = FakeCapture(frames=0)
        worker.open_youtube_capture = Mock(return_value=cap)
        worker.current_session_id = 'first'
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                worker.process_video('fixture', 'first')
            except RuntimeError:
                pass
        self.assertTrue(cap.released)
        self.assertFalse(worker.is_processing)
        self.assertIsNone(worker.current_session_id)

    def test_socket_reconnect_attempts_are_bounded(self):
        worker = load_worker()
        self.assertGreater(worker.sio.options['reconnection_attempts'], 0)
        self.assertLessEqual(worker.sio.options['reconnection_attempts'], 10)

    def test_main_waits_for_socket_and_cancels_on_exit(self):
        worker = load_worker()
        worker.sio.connect = Mock()
        worker.sio.wait = Mock()
        with patch.object(sys, 'argv', ['worker', '--worker-id', 'worker-1', '--no-preview']), \
                patch.object(worker.time, 'sleep', side_effect=KeyboardInterrupt), \
                contextlib.redirect_stdout(io.StringIO()):
            worker.main()
        worker.sio.wait.assert_called_once_with()
        self.assertTrue(worker.processing_stop.is_set())
        self.assertFalse(worker.preview_enabled)
        self.assertFalse(worker.sio.connected)

    def test_metadata_failure_cleans_capture_and_state(self):
        worker = load_worker()
        cap = FakeCapture()
        cap.get = Mock(side_effect=ValueError('bad metadata'))
        worker.open_youtube_capture = Mock(return_value=cap)
        worker.current_session_id = 'first'
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            try:
                worker.process_video('fixture', 'first')
            except ValueError:
                pass
        self.assertTrue(cap.released)
        self.assertFalse(worker.is_processing)
        self.assertIsNone(worker.current_session_id)
        self.assertIn('stream-error', [event for event, _ in worker.sio.emitted])

    def test_failed_resolution_capture_is_released(self):
        worker = load_worker()
        failed, cap = FakeCapture(opened=False), FakeCapture(frames=0)
        worker.open_youtube_capture = Mock(side_effect=[failed, cap])
        with contextlib.redirect_stdout(io.StringIO()):
            worker.process_video('fixture', 'first')
        self.assertTrue(failed.released)
        self.assertTrue(cap.released)

    def test_start_handler_seeks_to_requested_start_time(self):
        worker = load_worker()
        cap = FakeCapture()
        worker.open_youtube_capture = Mock(return_value=cap)
        with contextlib.redirect_stdout(io.StringIO()):
            worker.on_start_processing({'workerId': worker.worker_id, 'sessionId': 'first',
                                        'videoUrl': 'fixture', 'startTime': 12.5})
            worker.processing_thread.join(2)
        self.assertFalse(worker.processing_thread.is_alive())
        self.assertEqual(cap.positions, [(worker.cv2.CAP_PROP_POS_FRAMES, 375)])
        boxes = [payload for event, payload in worker.sio.emitted if event == 'ai-boxes']
        self.assertAlmostEqual(boxes[0]['timestamp'], 376 / 30)

    def test_restart_refuses_overlap_and_keeps_old_cancellation_set(self):
        worker = load_worker()
        entered = threading.Event()
        unblock = threading.Event()
        cap = FakeCapture(frames=0)

        def blocked_read():
            entered.set()
            unblock.wait(5)
            return False, None

        cap.read = blocked_read
        worker.open_youtube_capture = Mock(return_value=cap)
        worker.restart_timeout = 0.01
        first = {'workerId': worker.worker_id, 'sessionId': 'first', 'videoUrl': 'fixture'}
        second = dict(first, sessionId='second')
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                worker.on_start_processing(first)
                self.assertTrue(entered.wait(1))
                worker.on_start_processing(second)
                self.assertEqual(worker.current_session_id, 'first')
                self.assertEqual(worker.open_youtube_capture.call_count, 1)
                worker.on_stop_processing({'sessionId': 'unrelated'})
                self.assertTrue(worker.processing_stop.is_set())
            finally:
                unblock.set()
                thread = getattr(worker, 'processing_thread', None)
                if thread:
                    thread.join(2)
        self.assertTrue(cap.released)
        self.assertFalse(worker.is_processing)

    def test_no_preview_never_calls_gui(self):
        worker = load_worker()
        cap = FakeCapture()
        worker.preview_enabled = False
        worker.open_youtube_capture = Mock(return_value=cap)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            worker.process_video('fixture', 'session-1')
        self.assertEqual([event for event, _ in worker.sio.emitted], ['stream-started', 'ai-boxes'])
        self.assertTrue(cap.released)
        self.assertFalse(worker.is_processing)
        self.assertIsNone(worker.current_session_id)
        for name in ('imshow', 'waitKey', 'destroyWindow', 'destroyAllWindows', 'resize', 'putText'):
            getattr(worker.cv2, name).assert_not_called()

    def test_mjpeg_part_uses_crlf_multipart_framing(self):
        worker = load_worker()
        payload = worker.mjpeg_part(b'jpeg-frame')
        self.assertTrue(payload.startswith(b'--frame\r\nContent-Type: image/jpeg\r\n'))
        self.assertIn(b'Content-Length: 10\r\n\r\n', payload)
        self.assertTrue(payload.endswith(b'jpeg-frame\r\n'))

    def test_mjpeg_endpoint_serves_header_and_one_cached_frame(self):
        worker = load_worker()
        worker.latest_jpeg = b'jpeg-frame'
        server = ThreadingHTTPServer(('127.0.0.1', 0), worker.PreviewHandler)
        server.timeout = 0.1
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            import urllib.request
            response = urllib.request.urlopen(f'http://127.0.0.1:{server.server_port}/video-feed', timeout=2)
            self.assertIn('multipart/x-mixed-replace; boundary=frame', response.headers['Content-Type'])
            expected = worker.mjpeg_part(b'jpeg-frame')
            self.assertEqual(response.read(len(expected)), expected)
            response.close()
        finally:
            server.shutdown(); server.server_close(); thread.join(2)

    def test_local_camera_uses_windows_capture_backend_and_mjpeg_only(self):
        worker = load_worker()
        worker.cv2.VideoCapture = Mock(return_value=FakeCapture())
        worker.cv2.CAP_PROP_FPS = 1
        worker.cv2.CAP_PROP_FRAME_COUNT = 2
        worker.cv2.CAP_DSHOW = 7
        worker.cv2.CAP_PROP_JPEG_QUALITY = 8
        worker.cv2.IMWRITE_JPEG_QUALITY = 9
        worker.cv2.imencode = Mock(return_value=(True, types.SimpleNamespace(tobytes=lambda: b'jpeg-frame')))
        worker.np.zeros = Mock(return_value=types.SimpleNamespace(shape=(100, 200, 3)))
        with patch.object(worker.os, 'name', 'nt'), patch.dict(os.environ, {'FOH_CAPTURE_ENABLED': 'true'}), \
                patch.object(worker.time, 'monotonic', side_effect=[100.0, 100.01, 100.02, 100.03, 100.04]), \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            worker.process_video('camera://0', 'camera-session')
        self.assertEqual(worker.cv2.VideoCapture.call_args.args, (0, worker.cv2.CAP_DSHOW))
        self.assertIsNotNone(worker.latest_jpeg)
        self.assertEqual([event for event, _ in worker.sio.emitted if event == 'ai-boxes'], ['ai-boxes'])

    def test_failed_youtube_open_emits_error_without_opening_stream_url_as_camera(self):
        worker = load_worker()
        worker.open_youtube_capture = Mock(side_effect=RuntimeError('YouTube extractor failed'))
        worker.cv2.VideoCapture = Mock()
        worker.process_video('https://youtube.com/watch?v=fixture', 'session-fail')
        worker.cv2.VideoCapture.assert_not_called()
        self.assertIn(('stream-error', {
            'sessionId': 'session-fail',
            'message': 'Gagal membuka video - tidak ada resolusi yang tersedia'
        }), worker.sio.emitted)
        self.assertFalse(worker.is_processing)
        self.assertIsNone(worker.current_session_id)
if __name__ == '__main__':
    unittest.main()
