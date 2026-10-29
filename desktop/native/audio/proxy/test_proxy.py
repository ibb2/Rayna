"""Exercise the real loopback stream proxy against an authenticated fixture."""
import http.server
import http.client
import io
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

if len(sys.argv) not in (2, 4):
    raise SystemExit("Usage: test_proxy.py <proxy-smoke> [bass-smoke <library-directory>]")

audio = bytes(range(256)) * 1024
wav_buffer = io.BytesIO()
with wave.open(wav_buffer, "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(44100)
    wav.writeframes(b"\0\0" * 88200)
wav_data = wav_buffer.getvalue()
requests = []


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_HEAD(self):
        self.respond(False)

    def do_GET(self):
        self.respond(True)

    def respond(self, body):
        url = urllib.parse.urlsplit(self.path)
        requests.append((url.path, self.headers.get("Range"), self.command))
        if urllib.parse.parse_qs(url.query).get("token") != ["fixture-secret"]:
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if url.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/audio.flac?token=fixture-secret")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if url.path == "/broken":
            self.send_response(200)
            self.send_header("Content-Type", "audio/flac")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            if body:
                self.wfile.write(b"4\r\nabc")
                self.wfile.flush()
                self.connection.shutdown(socket.SHUT_RDWR)
                self.close_connection = True
            return
        if url.path == "/chunked":
            self.send_response(200)
            self.send_header("Content-Type", "audio/flac")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            if body:
                try:
                    for chunk in (audio[:1024], audio[1024:2048]):
                        self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
                    self.wfile.write(b"0\r\n\r\n")
                except (BrokenPipeError, ConnectionResetError):
                    pass
            return
        data = wav_data if url.path == "/audio.wav" else audio
        start, end = 0, len(data) - 1
        byte_range = self.headers.get("Range")
        if byte_range:
            first, last = byte_range.removeprefix("bytes=").split("-", 1)
            start = int(first) if first else 0
            end = int(last) if last else end
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", "audio/wav" if url.path == "/audio.wav" else "audio/flac")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        if body:
            try:
                self.wfile.write(data[start:end + 1])
            except (BrokenPipeError, ConnectionResetError):
                pass

    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
worker = threading.Thread(target=server.serve_forever, daemon=True)
worker.start()
process = None
try:
    base = f"http://127.0.0.1:{server.server_port}"
    targets = [f"{base}/audio.flac?token=fixture-secret", f"{base}/redirect?token=fixture-secret", f"{base}/audio.flac?token=invalid", f"{base}/chunked?token=fixture-secret", f"{base}/audio.wav?token=fixture-secret", f"{base}/broken?token=fixture-secret"]
    process = subprocess.Popen([str(pathlib.Path(sys.argv[1]).resolve()), *targets], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    urls = [process.stdout.readline().strip() for _ in targets]
    if not all(url.startswith("http://127.0.0.1:") and "fixture-secret" not in url for url in urls):
        raise RuntimeError("The proxy did not return opaque loopback URLs")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(urllib.request.Request(urls[0], headers={"Range": "bytes=2-4"})) as response:
        if response.status != 206 or response.headers.get("Content-Range") != f"bytes 2-4/{len(audio)}" or response.read() != audio[2:5]:
            raise RuntimeError("The proxy did not forward the upstream byte range")
    with opener.open(urllib.request.Request(urls[0], method="HEAD")) as response:
        if response.status != 200 or response.headers.get("Content-Length") != str(len(audio)) or response.read():
            raise RuntimeError("The proxy did not preserve HEAD metadata")
    with opener.open(urls[1]) as response:
        if response.status != 200 or response.read() != audio:
            raise RuntimeError("The proxy did not follow an upstream redirect")
    with opener.open(urls[3]) as response:
        if response.read() != audio[:2048]:
            raise RuntimeError("The proxy did not stream a chunked upstream response")
    try:
        with opener.open(urls[5]) as response:
            response.read()
        raise RuntimeError("A truncated upstream stream appeared complete")
    except http.client.IncompleteRead:
        pass
    try:
        opener.open(urls[2])
        raise RuntimeError("The proxy did not return the upstream authentication error")
    except urllib.error.HTTPError as error:
        if error.code != 403:
            raise
    invalid = urllib.parse.urljoin(urls[0], "/00000000000000000000000000000000.flac")
    try:
        opener.open(invalid)
        raise RuntimeError("An unregistered proxy target was accessible")
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    if ("/audio.flac", "bytes=2-4", "GET") not in requests:
        raise RuntimeError("The upstream did not receive the requested range")
    address = urllib.parse.urlsplit(urls[0])
    disconnected = socket.create_connection((address.hostname, address.port), timeout=5)
    disconnected.sendall(f"GET {address.path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n".encode())
    disconnected.recv(1024)
    disconnected.close()
    time.sleep(0.1)
    with opener.open(urls[0]) as response:
        if response.read() != audio:
            raise RuntimeError("A disconnected client stopped the proxy")
    if len(sys.argv) == 4:
        with tempfile.TemporaryDirectory(prefix="rayna-proxy-audio-") as directory:
            wav_path = pathlib.Path(directory) / "audio.wav"
            wav_path.write_bytes(wav_data)
            subprocess.run([str(pathlib.Path(sys.argv[2]).resolve()), str(pathlib.Path(sys.argv[3]).resolve()), str(wav_path), urls[4], "seek"], check=True, timeout=30)
    if os.name != "nt":
        closed = subprocess.Popen([str(pathlib.Path(sys.argv[1]).resolve()), targets[0], "--close-stdio"], stdout=subprocess.PIPE, text=True)
        closed_url = closed.stdout.readline().strip()
        time.sleep(0.1)
        with opener.open(closed_url) as response:
            if response.read() != audio:
                raise RuntimeError("The proxy failed when standard streams were closed")
        if closed.wait(timeout=10) != 0:
            raise RuntimeError("The proxy with closed standard streams did not stop")
    print("Authenticated loopback proxy, range, HEAD and redirect tests passed")
finally:
    if process:
        try:
            process.communicate("stop\n", timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            raise RuntimeError("The stream proxy did not stop")
    server.shutdown()
    server.server_close()
    worker.join()
