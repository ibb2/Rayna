using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.DependencyInjection;
using pMusic.Models;
using pMusic.Services;

namespace pMusic.ViewModels;

public partial class HomeViewModel : ViewModelBase
{
    private IMusic _music;
    private ObservableCollection<DisplayPlaylistViewModel> _playlists = new();
    private Plex _plex;

    [ObservableProperty] public ObservableCollection<DisplayAlbumViewModel> albums = new();
    [ObservableProperty] private bool isLoaded;
    [ObservableProperty] public ObservableCollection<DisplayAlbumViewModel> recentlyAddedAlbums = new();
    [ObservableProperty] public ObservableCollection<DisplayAlbumViewModel> topEight = new();


    public HomeViewModel(IMusic music, Plex plex)
    {
        _music = music;
        _plex = plex;
    }

    public HomeViewModel()
        : this(
            App.ServiceProvider?.GetRequiredService<IMusic>()
            ?? throw new InvalidOperationException("DI not initialized: IMusic is null"),
            App.ServiceProvider?.GetRequiredService<Plex>()
            ?? throw new InvalidOperationException("DI not initialized: Plex is null"))
    {
        Debug.Assert(_music != null, "IMusic is null");
        Debug.Assert(_plex != null, "Plex is null");
        Console.WriteLine($"HomeViewModel resolved: Plex: {_plex}, Music: {_music}");
    }

    public ObservableCollection<DisplayPlaylistViewModel> Playlists
    {
        get => _playlists;
        set
        {
            if (Equals(value, _playlists)) return;
            _playlists = value;
            OnPropertyChanged();
        }
    }

    public async Task LoadContent()
    {
        var total = Stopwatch.StartNew();

        await _plex.GetServerCapabilitiesAsync();
        var albumsTask = _music.GetAllAlbums(CancellationToken.None, _plex, isLoaded);
        var playlistsTask = _music.GetPlaylists(CancellationToken.None, _plex, isLoaded);

        var swAlbums = Stopwatch.StartNew();
        var allAlbums = await albumsTask.ConfigureAwait(false);
        swAlbums.Stop();
        Console.WriteLine($"[Perf] GetAllAlbums (await) = {swAlbums.ElapsedMilliseconds} ms");

        var swPlaylists = Stopwatch.StartNew();
        var playlists = await playlistsTask.ConfigureAwait(false);
        swPlaylists.Stop();
        Console.WriteLine($"[Perf] GetPlaylists (await) = {swPlaylists.ElapsedMilliseconds} ms");

        var swVm = Stopwatch.StartNew();
        var viewModels = await LoadAlbumsViewModelsAsync(allAlbums).ConfigureAwait(false);
        swVm.Stop();
        Console.WriteLine($"[Perf] LoadAlbumsViewModelsAsync = {swVm.ElapsedMilliseconds} ms");

        var swHomeAlbums = Stopwatch.StartNew();
        await LoadHomepageAlbumsAsync(viewModels).ConfigureAwait(false);
        swHomeAlbums.Stop();
        Console.WriteLine($"[Perf] LoadHomepageAlbumsAsync = {swHomeAlbums.ElapsedMilliseconds} ms");

        var swRecent = Stopwatch.StartNew();
        await LoadHomepageRecentlyAddedAlbumsAsync(viewModels).ConfigureAwait(false);
        swRecent.Stop();
        Console.WriteLine($"[Perf] LoadHomepageRecentlyAddedAlbumsAsync = {swRecent.ElapsedMilliseconds} ms");

        var swPl = Stopwatch.StartNew();
        await LoadPlaylistsAsync(playlists).ConfigureAwait(false);
        swPl.Stop();
        Console.WriteLine($"[Perf] LoadPlaylistsAsync = {swPl.ElapsedMilliseconds} ms");

        total.Stop();
        Console.WriteLine($"[Perf] Homepage total = {total.ElapsedMilliseconds} ms");

        IsLoaded = true;
    }

    public async Task<List<DisplayAlbumViewModel>> LoadAlbumsViewModelsAsync(IImmutableList<Album> allAlbums)
    {
        var viewModels = allAlbums
            .Select(a => new DisplayAlbumViewModel(a, _plex))
            .ToList();

        // Load all images concurrently without blocking the UI thread
        var loadImageTasks = viewModels.Select(vm => vm.SetImageUrl());
        await Task.WhenAll(loadImageTasks).ConfigureAwait(false);

        return viewModels;
    }

    public async Task LoadHomepageAlbumsAsync(List<DisplayAlbumViewModel> viewModels)
    {
        var stopwatch = Stopwatch.StartNew();

        // Replace the collection in one go to minimize change notifications
        Albums = new ObservableCollection<DisplayAlbumViewModel>(viewModels);

        Console.WriteLine($"All Albums loaded: {Albums.Count}");

        stopwatch.Stop();
        Console.WriteLine($"All Homepage Albums Execution time: {stopwatch.Elapsed.TotalMilliseconds} ms");
    }

    public async Task LoadHomepageRecentlyAddedAlbumsAsync(List<DisplayAlbumViewModel> viewModels)
    {
        var stopwatch = Stopwatch.StartNew();

        var orderedViewModels = viewModels
            .OrderByDescending(a => a.Album.AddedAt)
            .ToList();

        RecentlyAddedAlbums =
            new ObservableCollection<DisplayAlbumViewModel>(orderedViewModels);

        TopEight =
            new ObservableCollection<DisplayAlbumViewModel>(orderedViewModels.Take(8));

        Console.WriteLine($"Recently Added Albums loaded: {RecentlyAddedAlbums.Count}");

        stopwatch.Stop();
        Console.WriteLine($"Homepage Recently Added Albums Execution time: {stopwatch.Elapsed.TotalMilliseconds} ms");
    }

    public async Task LoadPlaylistsAsync(ImmutableList<Playlist> playlists)
    {
        var stopwatch = Stopwatch.StartNew();

        var viewModels = playlists
            .Select(a => new DisplayPlaylistViewModel(a, _plex))
            .ToList();

        await Task.WhenAll(viewModels.Select(vm => vm.SetImageUrl()))
            .ConfigureAwait(false);

        Playlists = new ObservableCollection<DisplayPlaylistViewModel>(viewModels);

        stopwatch.Stop();
        Console.WriteLine($"Homepage Playlists Execution time: {stopwatch.Elapsed.TotalMilliseconds} ms");
    }

    [RelayCommand]
    public void GoToAlbumPage(Album album)
    {
        GoToAlbum(album);
    }

    [RelayCommand]
    public void GoToPlaylistPage(Playlist playlist)
    {
        GoToPlaylist(playlist);
    }

    [RelayCommand]
    private void ShowToastWithTitle()
    {
    }
}