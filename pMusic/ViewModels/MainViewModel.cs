using System;
using System.Linq;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.DependencyInjection;
using CommunityToolkit.Mvvm.Input;
using KeySharp;
using pMusic.Database;
using pMusic.Interface;
using pMusic.Models;
using pMusic.Services;
using pMusic.Views;

namespace pMusic.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    private readonly Plex _plex;
    private AudioPlayerFactory _audioPlayerFactory;
    [ObservableProperty] private ViewModelBase _currentPage;

    [ObservableProperty] private string _greeting = "Welcome to Avalonia!";
    [ObservableProperty] private bool _isLoading;

    [ObservableProperty] private bool _isLoggedIn = false;

    [ObservableProperty] private bool _isLoggedInTrue = true;
    [ObservableProperty] private bool _isSidecarOpen = false;


    [ObservableProperty] private bool _loaded;
    private MusicDbContext _musicDbContext;

    [ObservableProperty] private Bitmap _thumbnailUrl;
    [ObservableProperty] public bool muted;

    public MainViewModel(Plex plex, MusicPlayer musicPlayer, MusicDbContext musicDbContext, Sidebar sidebar,
        AudioPlayerFactory audioPlayerFactory)
    {
        _plex = plex;
        MusicPlayer = musicPlayer;
        _audioPlayerFactory = audioPlayerFactory;
        _musicDbContext = musicDbContext;
        Sidebar = sidebar;
        muted = MusicPlayer.Muted;
        _loaded = false;

        _ = CheckLoginStatus();
    }

    public MainViewModel() : this(Ioc.Default.GetRequiredService<Plex>(), Ioc.Default.GetRequiredService<MusicPlayer>(),
        Ioc.Default.GetRequiredService<MusicDbContext>(),
        Ioc.Default.GetRequiredService<Sidebar>(), Ioc.Default.GetRequiredService<AudioPlayerFactory>())
    {
    }

    public MusicPlayer MusicPlayer { get; }
    public Sidebar Sidebar { get; }

    [RelayCommand]
    public void ToggleSidecar() => IsSidecarOpen = !IsSidecarOpen;

    public async ValueTask LoadSidebar()
    {
        // Empty Pinned Albums 
        Sidebar.Pinned.Clear();

        // Add new pinned albums
        var pinnedAlbums = _musicDbContext.Albums.Where(a => a.IsPinned).ToList();
        var viewModels = pinnedAlbums.Select(pa => new DisplayAlbumViewModel(pa, _plex)).ToList();
        var pinnedPlaylists = _musicDbContext.Playlists.Where(p => p.IsPinned).ToList();
        var pinnedViewModels = pinnedPlaylists.Select(pp => new DisplayPlaylistViewModel(pp, _plex)).ToList();

        // await Task.WhenAll(viewModels.Select(vm => vm.LoadThumbAsync()));
        await Task.WhenAll(pinnedViewModels.Select(vm => vm.LoadThumbAsync()));

        foreach (var pinnedAlbum in viewModels) Sidebar.Pinned.Add(pinnedAlbum);
        foreach (var pinnedPlaylist in pinnedViewModels) Sidebar.Pinned.Add(pinnedPlaylist);

        Console.WriteLine("Loaded pinned albums");
        _loaded = true;
    }


    public async ValueTask CheckLoginStatus()
    {
        string? authToken = null;

        try
        {
            authToken = Keyring.GetPassword("com.ib", "pmusic", "authToken");
        }
        catch (Exception ex)
        {
            authToken = null;
        }

        // var auth = services.GetRequiredService<IAuthenticationService>();
        // var authenticated = await auth.RefreshAsync();
        if (!string.IsNullOrEmpty(authToken))
        {
            IsLoggedIn = true;
            IsLoggedInTrue = false;
            await GetUserInfo();
        }
        else
        {
            IsLoggedIn = false;
            IsLoggedInTrue = true;
        }
    }

    [RelayCommand]
    public async Task Logout()
    {
        Keyring.SetPassword("com.ib", "pmusic", "cIdentifier", "");
        Keyring.SetPassword("com.ib", "pmusic", "id", "");
        Keyring.SetPassword("com.ib", "pmusic", "code", "");
        Keyring.SetPassword("com.ib", "pmusic", "authToken", "");

        IsLoggedIn = false;
        IsLoggedInTrue = true;

        // OpenNewWindow();
        ToLoginWindow();
    }

    public async ValueTask PlayPause()
    {
        if (MusicPlayer.IsPlaying)
            await _audioPlayerFactory.PauseAudio();
        else
            await _audioPlayerFactory.ResumeAudio();
    }

    public void NextTrack() => MusicPlayer.NextTrack();

    public void PrevTrack() => MusicPlayer.PreviousTrack();

    public void Seek(double value)
    {
        if (!MusicPlayer.IsPlaying) return;
        MusicPlayer.AudioBackend.Seek(value);
    }

    [RelayCommand]
    public void Mute(bool muteState)
    {
        if (MusicPlayer.IsPlaying)
        {
            MusicPlayer.Muted = !muteState;
            MusicPlayer.MutedOpposite = muteState;
        }
    }

    [RelayCommand]
    public void GoToAlbumPage(Album album)
    {
        GoToAlbum(album);
    }

    [RelayCommand]
    public void GoToPlaylistPage(Album album)
    {
        GoToAlbum(album);
    }

    private async Task GetUserInfo()
    {
        ThumbnailUrl = await _plex.GetUserProfilePicture();
        Console.WriteLine($"thumbnail url {ThumbnailUrl}");
    }

    private void OpenNewWindow()
    {
        var mainWindow = ((IClassicDesktopStyleApplicationLifetime)Application.Current.ApplicationLifetime).MainWindow;
        var newWindow = new LoginWindow();
        newWindow.DataContext = new LoginViewModel();

        newWindow.Show(); // Opens the window non-modally
        mainWindow.Close();
    }

    private void ToLoginWindow()
    {
        GoToLoginWindow();
    }
}