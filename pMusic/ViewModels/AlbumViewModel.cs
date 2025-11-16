using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.DependencyInjection;
using CommunityToolkit.Mvvm.Input;
using KeySharp;
using pMusic.Database;
using pMusic.Interface;
using pMusic.Models;
using pMusic.Services;

namespace pMusic.ViewModels;

public partial class AlbumViewModel : ViewModelBase
{
    private readonly AudioPlayerFactory _audioPlayerFactory;
    [ObservableProperty] public Album? _Album = null;
    [ObservableProperty] public string _albumArtist = "Playboi Carti";
    [ObservableProperty] public string _albumDuration = "1h 16m";
    [ObservableProperty] public string _albumReleaseDate = "2025";
    [ObservableProperty] public string _albumTitle = "MUSIC";
    [ObservableProperty] public string _albumTrackLength = "30";
    [ObservableProperty] public Bitmap? _Image = null;

    private bool _isLoadingTracks;
    private IMusic _music;
    private MusicDbContext _musicDbContext;
    private MusicPlayer _musicPlayer;
    private Plex _plex;
    private Sidebar _sidebar;
    [ObservableProperty] public string _title = "Album";


    public AlbumViewModel(IMusic music, Plex plex,
        MusicDbContext musicDbContext, Sidebar sidebar, AudioPlayerFactory audioPlayerFactory, MusicPlayer musicPlayer)
    {
        _music = music;
        _plex = plex;
        _audioPlayerFactory = audioPlayerFactory;
        _musicPlayer = musicPlayer;
        _musicDbContext = musicDbContext;
        _sidebar = sidebar;
    }

    public AlbumViewModel() : this(Ioc.Default.GetRequiredService<IMusic>(), Ioc.Default.GetRequiredService<Plex>(),
        Ioc.Default.GetRequiredService<MusicDbContext>(),
        Ioc.Default.GetRequiredService<Sidebar>(), Ioc.Default.GetRequiredService<AudioPlayerFactory>(),
        Ioc.Default.GetRequiredService<MusicPlayer>())
    {
    }

    public ObservableCollection<Track?> TrackList { get; set; } = new();

    public async ValueTask GetTracks()
    {
        if (Album?.Guid == null || _isLoadingTracks)
            return;

        _isLoadingTracks = true;
        try
        {
            var tracks = await _music.GetTrackList(CancellationToken.None, _plex, Album.Guid);
            TrackList.Clear();

            foreach (var track in tracks)
            {
                if (!TrackList.Any(t => t?.Guid == track.Guid))
                    TrackList.Add(track);
            }
        }
        finally
        {
            _isLoadingTracks = false;
        }
    }

    [RelayCommand]
    public async Task QueueAlbum()
    {
        if (TrackList.Count == 0) return;
        _musicPlayer.PlayedTracks.Clear();
        _musicPlayer.UpcomingTracks.Clear();
        var serverUri = _plex.GetServerUri();
        _musicPlayer.Album = Album;
        _musicPlayer.Artist = Album.Artist;
        _musicPlayer.ServerUrl = serverUri;
        _musicPlayer.Queue(TrackList.ToList()!);
        _musicPlayer.NextTrack();
    }

    [RelayCommand]
    public async Task Play(Track track)
    {
        var serverUri = _plex.GetServerUri();
        _musicPlayer.ServerUrl = serverUri;
        _musicPlayer.Play(track);
    }

    [RelayCommand]
    public async Task AddToLibrary(Album currentAlbum)
    {
        _sidebar.Pinned.Clear();

        // No need to re-fetch or attach
        currentAlbum.IsPinned = !currentAlbum.IsPinned;

        var count = await _musicDbContext.SaveChangesAsync();
        Console.WriteLine($"count: {count}");
        Console.WriteLine($"currentAlbum ref: {currentAlbum.GetHashCode()}");

        var playlists = _musicDbContext.Playlists.Where(x => x.IsPinned).ToList();
        var pViewModels = playlists.Select(a => new DisplayPlaylistViewModel(a, _plex)).ToList();
        foreach (var p in pViewModels) _sidebar.Pinned.Add(p);
        var albums = _musicDbContext.Albums.Where(x => x.IsPinned).ToList();
        var viewModels = albums.Select(a => new DisplayAlbumViewModel(a, _plex)).ToList();
        // await Task.WhenAll(viewModels.Select(vm => vm.LoadThumbAsync()));
        foreach (var a in viewModels) _sidebar.Pinned.Add(a);
    }


    [RelayCommand]
    public async Task LoadAlbumThumbnail()
    {
        var url = Album.Thumb + "?X-Plex-Token=" +
                  Keyring.GetPassword("com.ib", "pmusic", "authToken");
        Image = await _plex.GetBitmapImage(url);
    }
}