using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.DependencyInjection;
using CommunityToolkit.Mvvm.Input;
using KeySharp;
using pMusic.Database;
using pMusic.Models;
using pMusic.Services;

namespace pMusic.ViewModels;

public partial class ArtistViewModel : ViewModelBase
{
    [ObservableProperty] public string _albumArtist = "Playboi Carti";
    [ObservableProperty] public string _albumDuration = "1h 16m";
    [ObservableProperty] public string _albumReleaseDate = "2025";
    private ObservableCollection<DisplayAlbumViewModel> _albums = new();
    [ObservableProperty] public string _albumTitle = "MUSIC";
    [ObservableProperty] public string _albumTrackLength = "30";
    [ObservableProperty] public Artist _Artist;
    [ObservableProperty] public Bitmap _image;
    [ObservableProperty] public string _imageUrl;
    private IMusic _music;
    private MusicDbContext _musicDbContext;
    private MusicPlayer _musicPlayer;
    private Plex _plex;
    private Sidebar _sidebar;
    [ObservableProperty] public string _title = "Title";

    public ArtistViewModel(IMusic music, Plex plex,
        MusicDbContext musicDbContext, Sidebar sidebar)
    {
        _music = music;
        _plex = plex;
        _musicDbContext = musicDbContext;
        _sidebar = sidebar;
    }

    public ArtistViewModel() : this(Ioc.Default.GetRequiredService<IMusic>(), Ioc.Default.GetRequiredService<Plex>(),
        Ioc.Default.GetRequiredService<MusicDbContext>(),
        Ioc.Default.GetRequiredService<Sidebar>())
    {
    }

    public ObservableCollection<DisplayAlbumViewModel> Albums
    {
        get => _albums;
        set
        {
            if (Equals(value, _albums)) return;
            _albums = value;
            OnPropertyChanged();
        }
    }

    [RelayCommand]
    public async Task LoadArtistCover()
    {
        ImageUrl = Artist.Thumb + "?X-Plex-Token=" +
                   Keyring.GetPassword("com.ib", "pmusic", "authToken");
        _image = await _plex.GetBitmapImage(ImageUrl);
    }

    [RelayCommand]
    public async Task LoadArtistAlbums()
    {
        // var total = Stopwatch.StartNew();
        var albums = await _music.GetArtistAlbums(CancellationToken.None, _plex, Artist);

        var viewModels = albums.Select(a => new DisplayAlbumViewModel(a, _plex)).ToList();

        // await Task.WhenAll(viewModels.Select(vm => vm.LoadThumbAsync()));

        await Dispatcher.UIThread.InvokeAsync(() =>
        {
            Albums.Clear();

            foreach (var vm in viewModels)
                Albums.Add(vm);
        });

        Console.WriteLine($"Artist albums loaded: {Albums.Count}");
        // total.Stop();
        // Console.WriteLine($"[Perf]  = {total.ElapsedMilliseconds} ms");
    }

    [RelayCommand]
    public void GoToAlbumPage(Album album)
    {
        GoToAlbum(album);
    }
}