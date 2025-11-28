from typing import Union

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from plexapi.server import PlexServer

app = FastAPI()
app.plex = None

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}

@app.get('/init')
def initialize(baseUrl: str, token: str):
    plex = PlexServer(baseUrl, token)
    app.plex = plex
    return {"status": "success"}


@app.get("/music/albums/all")
def read_all_albums():
    albums = app.plex.library.section("Music").albums()
    return {"albums": albums}

@app.get("/music/albums/recently-played")
def read_recently_played_albums():
    recently_played_albums = app.plex.library.section("Music").searchAlbums(sort="dateplayed:desc")
    return {"albums": recently_played_albums}

@app.get('/music/albums/recently-added')
def read_recently_added_albums():
    recently_added_albums = app.plex.library.section('Music').recentlyAddedAlbums()
    return {"albums", recently_added_albums}

@app.get("/music/playlists/all")
def read_playlists():
    playlist = app.plex.library.section("Music").stations()
    return {"playlists", playlist}