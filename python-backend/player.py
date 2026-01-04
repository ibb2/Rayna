import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional

import numpy as np
import requests
import sounddevice as sd
import soundfile as sf
from plexapi.server import PlexServer


class AudioPlayer:
    def __init__(self):
        self.queue: deque = deque()
        self.current_track: Optional[Dict[str, Any]] = None
        self.is_playing: bool = False
        self.stop_event: threading.Event = threading.Event()
        self.playback_thread: Optional[threading.Thread] = None
        self.volume: float = 1.0
        self.plex: Optional[PlexServer] = None
        self.stream: Optional[sd.OutputStream] = None
        self.current_data: Optional[np.ndarray] = None
        self.current_samplerate: int = 44100
        self.position: int = 0  # Current frame position
        self.position_lock: threading.Lock = threading.Lock()

    def set_plex(self, plex: PlexServer):
        self.plex = plex

    def add_to_queue(self, tracks: List[Dict[str, Any]]):
        self.queue.extend(tracks)
        if not self.is_playing and not self.current_track:
            self.play_next()

    def play_next(self):
        if not self.queue:
            self.stop()
            return

        self.stop_playback_thread()
        self.current_track = self.queue.popleft()
        self.is_playing = True
        self.stop_event.clear()
        self.playback_thread = threading.Thread(target=self._play_thread)
        self.playback_thread.start()

    def play_prev(self):
        # For now, just restart current track if playing, or go to prev if we had history (not implemented yet)
        # Simple implementation: restart current track
        if self.current_track:
            self.seek(0)

    def pause(self):
        self.is_playing = False
        if self.stream:
            self.stream.stop()

    def resume(self):
        if self.current_track and not self.is_playing:
            self.is_playing = True
            if self.stream:
                self.stream.start()
            elif not self.playback_thread or not self.playback_thread.is_alive():
                self.playback_thread = threading.Thread(target=self._play_thread)
                self.playback_thread.start()

    def stop(self):
        self.is_playing = False
        self.current_track = None
        self.stop_playback_thread()
        self.queue.clear()

    def stop_playback_thread(self):
        self.stop_event.set()
        if self.playback_thread and self.playback_thread.is_alive():
            if threading.current_thread() != self.playback_thread:
                self.playback_thread.join()
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

    def seek(self, position_seconds: int):
        if not self.current_data is not None:
            return
            
        with self.position_lock:
            # Convert seconds to frames
            new_position = int(position_seconds * self.current_samplerate)
            # Clamp to valid range
            new_position = max(0, min(new_position, len(self.current_data)))
            self.position = new_position

    def _play_thread(self):
        if not self.current_track or not self.plex:
            return

        try:
            # Get streaming URL
            # For Plex, we might need to use the transcode url or direct file url if accessible.
            # Using plex.url() with includeToken=True should work for direct access if allowed.

            # We need to fetch the actual track object to get the stream URL if we only have dict
            rating_key = self.current_track.get("ratingKey")
            track = self.plex.fetchItem(rating_key)
            url = track.getStreamURL()

            # Stream the audio
            # Using requests to get the stream and soundfile to read it is tricky for seeking/streaming

            response = requests.get(url, stream=True)

            # soundfile requires a seekable file for some formats, so we might need to buffer it
            # For MVP, let's try reading into a BytesIO or temp file if needed.
            # However, soundfile can open a file descriptor or sometimes a file-like object.
            # Let's try reading the whole file into memory for now (simplest for small tracks)
            # Optimization: Chunked streaming would be better.

            import io

            content = response.content
            data = io.BytesIO(content)

            data_array, samplerate = sf.read(data)
            self.current_data = data_array
            self.current_samplerate = samplerate
            duration = len(self.current_data) / self.current_samplerate
            
            # Reset position for new track
            with self.position_lock:
                self.position = 0

            def callback(outdata, frames, time, status):
                if status:
                    print(status)

                if self.stop_event.is_set():
                    raise sd.CallbackStop()

                if not self.is_playing:
                    outdata.fill(0)
                    return

                chunk_size = len(outdata)
                
                with self.position_lock:
                    remaining = len(self.current_data) - self.position

                    if remaining <= 0:
                        raise sd.CallbackStop()

                    if remaining < chunk_size:
                        outdata[:remaining] = self.current_data[self.position :]
                        outdata[remaining:] = 0
                        self.position += remaining
                        raise sd.CallbackStop()
                    else:
                        outdata[:] = self.current_data[
                            self.position : self.position + chunk_size
                        ]
                        self.position += chunk_size

            with sd.OutputStream(
                samplerate=samplerate,
                channels=data_array.shape[1] if len(data_array.shape) > 1 else 1,
                callback=callback,
            ):
                while (
                    self.position < len(self.current_data)
                    and not self.stop_event.is_set()
                ):
                    if not self.is_playing:
                        sd.sleep(100)  # Wait while paused
                        continue
                    sd.sleep(100)

            if not self.stop_event.is_set() and self.position >= len(self.current_data):
                # Track finished
                self.play_next()

        except Exception as e:
            print(f"Error playing track: {e}")
            self.is_playing = False
            self.current_track = None
            # Do not call self.stop() here as it joins the current thread
            if self.stream:
                try:
                    self.stream.stop()
                    self.stream.close()
                except:
                    pass
                self.stream = None

    def get_status(self):
        return {
            "is_playing": self.is_playing,
            "current_track": self.current_track,
            "queue_len": len(self.queue),
            "position": self.position / self.current_samplerate
            if self.current_samplerate
            else 0,
            "duration": len(self.current_data) / self.current_samplerate
            if self.current_data is not None
            else 0,
        }
