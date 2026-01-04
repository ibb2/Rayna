import threading
import time
import io
import requests
import sounddevice as sd
import soundfile as sf
import numpy as np
from collections import deque
from typing import Any, Dict, List, Optional
from plexapi.server import PlexServer


class AudioPlayer:
    def __init__(self):
        # --- Playback Logic State ---
        self.plex: Optional[PlexServer] = None
        self.queue: deque = deque()
        self.current_track: Optional[Dict[str, Any]] = None
        self.is_playing: bool = False
        
        # --- Audio Engine State ---
        self.current_data: Optional[np.ndarray] = None
        self.current_samplerate: int = 44100
        self.position_frames: int = 0  # Current frame position
        self.position_lock: threading.Lock = threading.Lock()
        self.volume: float = 1.0

        # --- Threading/Control State ---
        self.stop_event: threading.Event = threading.Event()
        self.playback_thread: Optional[threading.Thread] = None
        self.stream: Optional[sd.OutputStream] = None

    def set_plex(self, plex: PlexServer):
        self.plex = plex

    # --- Public API (Commands) ---

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
        self.playback_thread = threading.Thread(target=self._play_thread, daemon=True)
        self.playback_thread.start()

    def play_prev(self):
        # For now, just restart current track
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
                self.play_next() # Fallback to starting next if something is weird

    def stop(self):
        self.is_playing = False
        self.current_track = None
        self.stop_playback_thread()
        self.queue.clear()

    def seek(self, position_seconds: int):
        if self.current_data is None:
            return
            
        with self.position_lock:
            # Convert seconds to frames
            new_pos = int(position_seconds * self.current_samplerate)
            # Clamp to valid range
            new_pos = max(0, min(new_pos, len(self.current_data)))
            self.position_frames = new_pos

    def get_status(self):
        # Convert frame position back to seconds for the UI
        pos_seconds = self.position_frames / self.current_samplerate if self.current_samplerate else 0
        duration_seconds = len(self.current_data) / self.current_samplerate if self.current_data is not None else 0
        
        return {
            "is_playing": self.is_playing,
            "current_track": self.current_track,
            "queue_len": len(self.queue),
            "position": pos_seconds,
            "duration": duration_seconds,
        }

    # --- Internal Engine Methods ---

    def stop_playback_thread(self):
        self.stop_event.set()
        if self.playback_thread and self.playback_thread.is_alive():
            if threading.current_thread() != self.playback_thread:
                self.playback_thread.join()
        
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except:
                pass
            self.stream = None

    def _load_track(self, rating_key: str):
        """Fetches track URL and loads data into memory."""
        if not self.plex:
            raise ValueError("Plex not initialized")

        track = self.plex.fetchItem(rating_key)
        url = track.getStreamURL()
        
        response = requests.get(url, stream=True)
        data_io = io.BytesIO(response.content)
        
        data_array, samplerate = sf.read(data_io)
        return data_array, samplerate

    def _audio_callback(self, outdata, frames, time, status):
        """The low-level audio delivery callback."""
        if status:
            print(f"Audio status warning: {status}")

        if self.stop_event.is_set():
            raise sd.CallbackStop()

        if not self.is_playing:
            outdata.fill(0)
            return

        chunk_size = len(outdata)
        
        with self.position_lock:
            remaining = len(self.current_data) - self.position_frames

            if remaining <= 0:
                raise sd.CallbackStop()

            if remaining < chunk_size:
                # End of track
                outdata[:remaining] = self.current_data[self.position_frames :]
                outdata[remaining:] = 0
                self.position_frames += remaining
                raise sd.CallbackStop()
            else:
                # Normal chunk
                outdata[:] = self.current_data[
                    self.position_frames : self.position_frames + chunk_size
                ] * self.volume
                self.position_frames += chunk_size

    def _play_thread(self):
        """High-level playback orchestration thread."""
        if not self.current_track:
            return

        try:
            # 1. Load the audio data
            data, samplerate = self._load_track(self.current_track["ratingKey"])
            
            # 2. Update engine state
            self.current_data = data
            self.current_samplerate = samplerate
            with self.position_lock:
                self.position_frames = 0

            # 3. Create and start the output stream
            channels = data.shape[1] if len(data.shape) > 1 else 1
            
            with sd.OutputStream(
                samplerate=samplerate,
                channels=channels,
                callback=self._audio_callback,
            ) as stream:
                self.stream = stream
                
                # 4. Wait for playback to finish or stop event
                while not self.stop_event.is_set():
                    # If the stream is inactive AND we are supposed to be playing,
                    # it means the callback raised CallbackStop (end of track).
                    # If we are paused (is_playing=False), the stream will also be 
                    # inactive, but we should stay in the loop to wait for resume.
                    if not self.stream.active and self.is_playing:
                        break
                    time.sleep(0.1)

            # 5. Handle transitions
            if not self.stop_event.is_set():
                # Track finished naturally, play next
                self.play_next()

        except Exception as e:
            print(f"Error in playback thread: {e}")
            self.is_playing = False
            self.current_track = None
            if self.stream:
                try:
                    self.stream.stop()
                    self.stream.close()
                except:
                    pass
                self.stream = None
