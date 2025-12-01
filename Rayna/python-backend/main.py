from datetime import datetime
from typing import Annotated, Union, cast

from fastapi import FastAPI
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.params import Depends, Form
from fastapi.security import OAuth2PasswordBearer
from plexapi.server import PlexServer
from pydantic import BaseModel

app = FastAPI()
app.plex = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

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


class Init(BaseModel):
    serverUrl: str


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}


@app.post("/init")
def initialize(request: Init, token: Annotated[str, Depends(oauth2_scheme)]):
    print("Initializing…")
    print(request.serverUrl)
    app.state.plex = cast(PlexServer, PlexServer(request.serverUrl, token))
    return {"token": token}


def get_plex() -> PlexServer:
    plex = getattr(app.state, "plex", None)
    if plex is None:
        raise HTTPException(status_code=400, detail="Plex is not initialized yet.")
    return plex


@app.get("/music/albums/all")
def read_all_albums(plex: Annotated[PlexServer, Depends(get_plex)]):
    sections = plex.library.sections()
    musicSection = next((x for x in sections if x.type == "artist"), None)
    if musicSection is None:
        raise HTTPException(status_code=404, detail="No Music section(s) not found.")

    albums = musicSection.albums()

    return [
        {
            "id": a.key,
            "title": a.title,
            "year": a.year,
            "artist": a.parentTitle,
            "ratingKey": a.ratingKey,
            "thumb": plex.url(a.thumb, includeToken=True),
        }
        for a in albums
    ]


@app.get("/music/albums/recently-played")
def read_recently_played_albums(plex: Annotated[PlexServer, Depends(get_plex)]):
    sections = plex.library.sections()
    musicSection = next((x for x in sections if x.type == "artist"), None)
    if musicSection is None:
        raise HTTPException(status_code=404, detail="No Music section(s) not found.")

    albums = musicSection.searchAlbums(sort="lastViewedAt:desc")

    return [
        {
            "id": a.key,
            "title": a.title,
            "year": a.year,
            "artist": a.parentTitle,
            "ratingKey": a.ratingKey,
            "thumb": plex.url(a.thumb, includeToken=True),
        }
        for a in albums
    ]


@app.get("/music/albums/recently-added")
def read_recently_added_albums(plex: Annotated[PlexServer, Depends(get_plex)]):
    sections = plex.library.sections()
    musicSection = next((x for x in sections if x.type == "artist"), None)
    if musicSection is None:
        raise HTTPException(status_code=404, detail="No Music section(s) not found.")

    albums = musicSection.recentlyAddedAlbums()

    return [
        {
            "id": a.key,
            "title": a.title,
            "year": a.year,
            "artist": a.parentTitle,
            "ratingKey": a.ratingKey,
            "thumb": plex.url(a.thumb, includeToken=True),
        }
        for a in albums
    ]


@app.get("/music/album/{rating_key}")
def read_album(rating_key: int, plex: Annotated[PlexServer, Depends(get_plex)]):
    print(rating_key)
    album = plex.fetchItem(rating_key)
    tracks = album.tracks()
    print("Tracks title", tracks[0].originalTitle)
    return {
        "id": album.key,
        "title": album.title,
        "year": album.year,
        "artist": album.parentTitle,
        "artistKey": album.parentKey,
        "ratingKey": album.ratingKey,
        "leafCount": album.leafCount,
        "thumb": plex.url(album.thumb, includeToken=True),
        "tracks": [
            {
                # "index": index + 1,
                "number": t.trackNumber,
                "title": t.title,
                "duration": t.duration,
            }
            for t in tracks
        ],
    }


@app.get("/music/playlists/all")
def read_playlists(plex: Annotated[PlexServer, Depends(get_plex)]):
    sections = plex.library.sections()
    musicSection = next((x for x in sections if x.type == "artist"), None)
    if musicSection is None:
        raise HTTPException(status_code=404, detail="No Music section(s) not found.")

    music_playlists = [p for p in plex.playlists() if p.playlistType == "audio"]

    return [
        {
            "id": p.key,
            "title": p.title,
            "addedAt": p.addedAt,
            "ratingKey": p.ratingKey,
            "composite": plex.url(p.composite, includeToken=True)
            if p.composite is not None
            else "",
            "smart": p.smart,
            "icon": p.icon,
            "duration": p.duration,
        }
        for p in music_playlists
    ]


@app.get("/music/library/top-eight")
def read_top_eight(plex: Annotated[PlexServer, Depends(get_plex)]):
    # Get music section
    sections = plex.library.sections()
    musicSection = next((x for x in sections if x.type == "artist"), None)
    if musicSection is None:
        raise HTTPException(status_code=404, detail="No Music section found.")

    # Get recently viewed albums
    albums = musicSection.searchAlbums(sort="lastViewedAt:desc", limit=20)

    # Get all playlists (filter for audio if needed)
    all_playlists = plex.playlists()
    music_playlists = [p for p in all_playlists if p.playlistType == "audio"]

    # Convert albums to common format
    album_items = [
        {
            "id": a.key,
            "title": a.title,
            "year": a.year,
            "artist": a.parentTitle,
            "ratingKey": a.ratingKey,
            "thumb": plex.url(a.thumb, includeToken=True),
            "type": "album",
            "lastViewedAt": a.lastViewedAt
            or a.addedAt,  # Fallback to addedAt if never viewed
        }
        for a in albums
    ]

    # Convert playlists to common format
    playlist_items = [
        {
            "id": p.key,
            "title": p.title,
            "year": p.addedAt.year if hasattr(p.addedAt, "year") else None,
            "artist": f"{len(p.items())} tracks",  # Or leave empty
            "ratingKey": p.ratingKey,
            "thumb": plex.url(p.composite, includeToken=True) if p.composite else None,
            "type": "playlist",
            "lastViewedAt": p.addedAt,  # Fallback to addedAt
        }
        for p in music_playlists
    ]

    # Combine and sort by lastViewedAt (most recent first)
    combined = album_items + playlist_items
    combined.sort(
        key=lambda x: x["lastViewedAt"] if x["lastViewedAt"] else datetime.min,
        reverse=True,
    )

    # Return top 8
    return combined[:8]
