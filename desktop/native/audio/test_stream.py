"""Exercise the real BASS wrapper against an authenticated local HTTP fixture."""
import http.server
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import urllib.parse
import wave

if len(sys.argv) != 3:
    raise SystemExit("Usage: test_stream.py <bass-smoke-executable> <library-directory>")

with tempfile.TemporaryDirectory(prefix="rayna-bass-http-") as directory:
    wav_path = os.path.join(directory, "audio.wav")
    with wave.open(wav_path, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(44100)
        output.writeframes(b"\0\0" * 88200)
    with open(wav_path, "rb") as source:
        wav_data = source.read()
    opus_data = (pathlib.Path(__file__).resolve().parent / "fixtures" / "transcoded-320k.opus").read_bytes()
    fixtures = {
        "/audio.wav": (wav_data, "audio/wav"),
        "/music/:/transcode/universal/start": (opus_data, "audio/ogg"),
    }
    requests = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            url = urllib.parse.urlsplit(self.path)
            requests.append(self.path)
            if url.path not in fixtures or urllib.parse.parse_qs(url.query).get("token") != ["fixture"]:
                self.send_error(403)
                return
            data, content_type = fixtures[url.path]
            start = 0
            header = self.headers.get("Range")
            if header:
                try:
                    start = int(header.removeprefix("bytes=").split("-", 1)[0])
                except ValueError:
                    self.send_error(416)
                    return
                if start >= len(data):
                    self.send_error(416)
                    return
            self.send_response(206 if header else 200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data) - start))
            self.send_header("Accept-Ranges", "bytes")
            if header:
                self.send_header("Content-Range", f"bytes {start}-{len(data) - 1}/{len(data)}")
            self.end_headers()
            try:
                self.wfile.write(data[start:])
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *_args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        for path in fixtures:
            url = f"http://127.0.0.1:{server.server_port}{path}?token=fixture"
            command = [os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]), wav_path, url]
            if path == "/audio.wav":
                command.append("seek")
            subprocess.run(command, check=True, timeout=30)
        if not all(any(request.startswith(path + "?") for request in requests) for path in fixtures) or not all("token=fixture" in request for request in requests):
            raise RuntimeError("BASS did not request the authenticated fixture")
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
