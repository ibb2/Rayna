"""Exercise resume, ignored ranges, failures and cancellation against a local server."""
import http.server
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

if len(sys.argv) != 2:
    raise SystemExit("Usage: test_transfer.py <transfer-smoke-executable>")

executable = str(pathlib.Path(sys.argv[1]).resolve())
data = bytes(range(256)) * 4096
requests = []
interrupted = False


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global interrupted
        url = urllib.parse.urlsplit(self.path)
        requests.append((url.path, self.headers.get("Range")))
        if urllib.parse.parse_qs(url.query).get("token") != ["fixture"]:
            self.send_error(403)
            return
        if url.path == "/error":
            self.send_error(503)
            return
        start = 0
        range_header = self.headers.get("Range")
        if range_header and url.path != "/ignore":
            start = int(range_header.removeprefix("bytes=").split("-", 1)[0])
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{len(data) - 1}/{len(data)}")
        else:
            self.send_response(200)
        self.send_header("Content-Length", str(len(data) - start))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        try:
            if url.path == "/interrupt" and not interrupted:
                interrupted = True
                self.wfile.write(data[start:start + 16384])
                self.wfile.flush()
                self.connection.shutdown(socket.SHUT_RDWR)
                self.close_connection = True
            elif url.path == "/slow":
                for offset in range(start, len(data), 4096):
                    self.wfile.write(data[offset:offset + 4096])
                    self.wfile.flush()
                    time.sleep(0.02)
            else:
                self.wfile.write(data[start:])
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
worker = threading.Thread(target=server.serve_forever, daemon=True)
worker.start()
try:
    with tempfile.TemporaryDirectory(prefix="rayna-transfer-") as temp:
        root = pathlib.Path(temp) / "music"
        root.mkdir()
        for name in ("resume", "ignore", "error", "slow", "interrupt"):
            output = subprocess.check_output([executable, "paths", str(root), "../server", name, "../../song", ".flac"], text=True).splitlines()
            final, partial = map(pathlib.Path, output)
            if root not in final.parents or final.parent.name != "server-___server":
                raise RuntimeError("Unsafe generated download path")
            partial.parent.mkdir(parents=True, exist_ok=True)
            if name != "slow":
                partial.write_bytes(data[:4096])
            sentinel = pathlib.Path(str(partial) + ".restart")
            if name == "ignore":
                sentinel.write_bytes(b"preserve unrelated file")
            url = f"http://127.0.0.1:{server.server_port}/{name}?token=fixture"
            command = [executable, name, url, str(root), str(partial), str(final)]
            if name == "slow":
                command.append("cancel")
            result = subprocess.run(command, text=True, capture_output=True, timeout=20)
            if name == "interrupt":
                if result.returncode == 0 or final.exists() or not partial.exists() or not data.startswith(partial.read_bytes()):
                    raise RuntimeError("Interrupted transfer did not preserve its valid partial bytes")
                result = subprocess.run(command, text=True, capture_output=True, timeout=20)
                if result.returncode != 0 or partial.exists() or final.read_bytes() != data:
                    raise RuntimeError("Interrupted transfer did not resume successfully")
            elif name == "error":
                if result.returncode == 0 or final.exists() or partial.read_bytes() != data[:4096]:
                    raise RuntimeError("A failed transfer changed the original partial file")
            elif name == "slow":
                if result.returncode != 0 or final.exists() or (partial.exists() and partial.stat().st_size >= len(data)):
                    raise RuntimeError("Cancellation did not retain a resumable partial file")
            elif result.returncode != 0 or partial.exists() or final.read_bytes() != data:
                raise RuntimeError(f"{name} transfer failed: {result.stderr}")
            if name == "ignore" and sentinel.read_bytes() != b"preserve unrelated file":
                raise RuntimeError("The transfer changed an unrelated restart file")
        if ("/resume", "bytes=4096-") not in requests or ("/ignore", "bytes=4096-") not in requests or ("/ignore", None) not in requests:
            raise RuntimeError("The adapter did not handle a resumed or ignored range")
        outside = pathlib.Path(temp) / "outside"
        result = subprocess.run([executable, "outside", f"http://127.0.0.1:{server.server_port}/resume?token=fixture", str(root), str(outside) + ".partial", str(outside)], capture_output=True)
        if result.returncode == 0 or outside.exists():
            raise RuntimeError("An outside destination was not rejected")
        existing = root / "server-existing" / "existing.flac"
        existing.parent.mkdir()
        existing.write_bytes(b"keep existing media")
        result = subprocess.run([executable, "existing", f"http://127.0.0.1:{server.server_port}/resume?token=fixture", str(root), str(existing) + ".partial", str(existing)], capture_output=True)
        if result.returncode == 0 or existing.read_bytes() != b"keep existing media":
            raise RuntimeError("An existing destination was replaced")
        if os.name != "nt":
            closed = root / "server-existing" / "closed-stdio.flac"
            command = ["/bin/bash", "-c", 'exec 0<&- 1>&- 2>&-; exec "$@"', "rayna", executable, "closed", f"http://127.0.0.1:{server.server_port}/resume?token=fixture", str(root), str(closed) + ".partial", str(closed)]
            result = subprocess.run(command, timeout=20)
            if result.returncode != 0 or closed.read_bytes() != data:
                raise RuntimeError("A transfer failed when standard streams were closed")
        limited = root / "server-existing" / "limited.image"
        result = subprocess.run([executable, "limited", f"http://127.0.0.1:{server.server_port}/resume?token=fixture", str(root), str(limited) + ".partial", str(limited), "limit", "1024"], capture_output=True)
        if result.returncode == 0 or limited.exists():
            raise RuntimeError("An oversized transfer was published")
        outside.write_bytes(b"do not remove")
        result = subprocess.run([executable, "remove", str(root), str(outside)], capture_output=True)
        if result.returncode == 0 or outside.read_bytes() != b"do not remove":
            raise RuntimeError("Removal did not protect files outside the download directory")
        subprocess.run([executable, "remove", str(root), str(existing)], check=True)
        if existing.exists():
            raise RuntimeError("A managed file was not removed")
        source = root / "server-move" / "song.flac"
        source.parent.mkdir()
        source.write_bytes(data)
        destination_root = pathlib.Path(temp) / "new-music"
        prepared = subprocess.check_output([executable, "prepare", str(destination_root)], text=True).strip()
        destination = pathlib.Path(subprocess.check_output([executable, "rebase", str(root), prepared, str(source)], text=True).strip())
        subprocess.run([executable, "copy", str(root), prepared, str(source), str(destination)], check=True, capture_output=True)
        if source.read_bytes() != data or destination.read_bytes() != data:
            raise RuntimeError("Moving a download did not preserve both copies before commit")
        destination.write_bytes(b"keep destination")
        result = subprocess.run([executable, "copy", str(root), prepared, str(source), str(destination)], capture_output=True)
        if result.returncode == 0 or source.read_bytes() != data or destination.read_bytes() != b"keep destination":
            raise RuntimeError("A storage move changed an existing destination")
        if subprocess.check_output([executable, "clean", str(root), prepared, str(source), str(destination)], text=True).strip() != "0" or not source.exists():
            raise RuntimeError("A changed destination caused original media to be removed")
        destination.write_bytes(data)
        if subprocess.check_output([executable, "clean", str(root), prepared, str(source), str(destination)], text=True).strip() != "1" or source.exists():
            raise RuntimeError("An unchanged copied file was not cleaned up")
        if subprocess.check_output([executable, "rebase", str(root), prepared, str(outside)], text=True).strip():
            raise RuntimeError("A storage move included a file outside its original directory")
        print("Resumable, ignored-range, failure and cancellation transfer tests passed")
finally:
    server.shutdown()
    server.server_close()
    worker.join()
