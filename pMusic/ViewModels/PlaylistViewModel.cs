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

public partial class PlaylistViewModel : ViewModelBase
{
    private AudioPlayerFactory _audioPlayerFactory;

    [ObservableProperty] public Bitmap? _Image = null;
    private IMusic _music;
    private MusicDbContext _musicDbContext;
    private MusicPlayer _musicPlayer;
    private Plex _plex;
    private Sidebar _sidebar;
    [ObservableProperty] public Playlist playlist;

    public PlaylistViewModel(IMusic music, Plex plex,
        MusicDbContext musicDbContext, Sidebar sidebar, AudioPlayerFactory audioPlayerFactory, MusicPlayer musicPlayer)
    {
        _music = music;
        _plex = plex;
        _audioPlayerFactory = audioPlayerFactory;
        _musicPlayer = musicPlayer;
        _musicDbContext = musicDbContext;
        _sidebar = sidebar;
    }

    public PlaylistViewModel() : this(Ioc.Default.GetRequiredService<IMusic>(), Ioc.Default.GetRequiredService<Plex>(),
        Ioc.Default.GetRequiredService<MusicDbContext>(),
        Ioc.Default.GetRequiredService<Sidebar>(), Ioc.Default.GetRequiredService<AudioPlayerFactory>(),
        Ioc.Default.GetRequiredService<MusicPlayer>())
    {
    }

    public ObservableCollection<Track?> TrackList { get; set; } = new();

    public async ValueTask GetTracks()
    {
        if (Playlist?.Guid == null) return;

        var tracks =
            await _music.GetPlaylistTrackList(CancellationToken.None, _plex, Playlist.Guid);

        foreach (var track in tracks) TrackList.Add(track);
    }

    [RelayCommand]
    public async Task QueuePlaylist()
    {
        if (TrackList.Count == 0) return;
        _musicPlayer.PlayedTracks.Clear();
        _musicPlayer.UpcomingTracks.Clear();
        var serverUri = _plex.GetServerUri();
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
    public async Task AddToLibrary(Playlist playlist)
    {
        _sidebar.Pinned.Clear();

        // No need to re-fetch or attach
        playlist.IsPinned = !playlist.IsPinned;

        var count = await _musicDbContext.SaveChangesAsync();
        Console.WriteLine($"count: {count}");
        Console.WriteLine($"currentAlbum ref: {playlist.GetHashCode()}");

        var albums = _musicDbContext.Albums.Where(x => x.IsPinned).ToList();
        var aViewModels = albums.Select(a => new DisplayAlbumViewModel(a, _plex)).ToList();
        foreach (var a in aViewModels) _sidebar.Pinned.Add(a);
        var playlists = _musicDbContext.Playlists.Where(x => x.IsPinned).ToList();
        var viewModels = playlists.Select(a => new DisplayPlaylistViewModel(a, _plex)).ToList();
        await Task.WhenAll(viewModels.Select(vm => vm.LoadThumbAsync()));
        foreach (var p in viewModels) _sidebar.Pinned.Add(p);
    }

    [RelayCommand]
    public async Task LoadPlaylistComposite()
    {
        var url = Playlist.Composite + "?X-Plex-Token=" +
                  Keyring.GetPassword("com.ib", "pmusic", "authToken");
        Image = await _plex.GetBitmapImage(url);
    }
}