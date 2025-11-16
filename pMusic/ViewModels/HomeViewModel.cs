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
    [ObservableProperty] public static bool isLoaded = false;
    private IMusic _music;
    private ObservableCollection<DisplayPlaylistViewModel> _playlists = new();
    private Plex _plex;

    [ObservableProperty] public ObservableCollection<DisplayAlbumViewModel> albums = new();
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
        Stopwatch stopwatch = new Stopwatch();

        // Start the stopwatch
        stopwatch.Start();

        await _plex.GetServerCapabilitiesAsync();
        var allAlbums = await _music.GetAllAlbums(CancellationToken.None, _plex, isLoaded);
        var playlists = await _music.GetPlaylists(CancellationToken.None, _plex, isLoaded);
        var viewModels = await LoadAlbumsViewModelsAsync(allAlbums);
        await LoadHomepageAlbumsAsync(viewModels);
        await LoadHomepageRecentlyAddedAlbumsAsync(viewModels);
        await LoadPlaylistsAsync(playlists);
        Console.WriteLine("Content loaded");

        IsLoaded = true;

        // Stop the stopwatch
        stopwatch.Stop();

        // Get the elapsed time
        TimeSpan elapsed = stopwatch.Elapsed;

        // Display the elapsed time in various units
        Console.WriteLine($"Homepage Execution time: {elapsed.TotalMilliseconds} ms");
        Console.WriteLine($"Homepage Execution time: {elapsed.TotalSeconds} seconds");
    }

    public Task<List<DisplayAlbumViewModel>> LoadAlbumsViewModelsAsync(IImmutableList<Album> allAlbums)
    {
        var viewModels = allAlbums.Select(a => new DisplayAlbumViewModel(a, _plex)).ToList();

        Task.WaitAll(viewModels.Select(vm => vm.SetImageUrl()));

        return Task.FromResult(viewModels);
    }

    public async Task LoadHomepageAlbumsAsync(List<DisplayAlbumViewModel> viewModels)
    {
        Stopwatch stopwatch = new Stopwatch();

        // Start the stopwatch
        stopwatch.Start();

        Albums.Clear();

        foreach (var vm in viewModels)
            Albums.Add(vm);

        Console.WriteLine($"All Albums loaded: {Albums.Count}");

        // Stop the stopwatch
        stopwatch.Stop();

        // Get the elapsed time
        TimeSpan elapsed = stopwatch.Elapsed;

        // Display the elapsed time in various units
        Console.WriteLine($"All Homepage Albums Execution time: {elapsed.TotalMilliseconds} ms");
        Console.WriteLine($"All Homepage Albums Execution time: {elapsed.TotalSeconds} seconds");
    }

    public async Task LoadHomepageRecentlyAddedAlbumsAsync(List<DisplayAlbumViewModel> viewModels)
    {
        Stopwatch stopwatch = new Stopwatch();

        // Start the stopwatch
        stopwatch.Start();

        var orderedViewModels = viewModels.OrderByDescending(a => a.Album.AddedAt)
            .ToList();


        RecentlyAddedAlbums.Clear();
        TopEight.Clear();

        var count = 0;

        foreach (var vm in orderedViewModels)
        {
            if (count < 8)
            {
                TopEight.Add(vm);
            }

            count++;

            RecentlyAddedAlbums.Add(vm);
        }

        Console.WriteLine($"Recently Added Albums loaded: {Albums.Count}");

        // Stop the stopwatch
        stopwatch.Stop();

        // Get the elapsed time
        TimeSpan elapsed = stopwatch.Elapsed;

        // Display the elapsed time in various units
        Console.WriteLine($"Homepage Reccently Added Albums Execution time: {elapsed.TotalMilliseconds} ms");
        Console.WriteLine($"Homepage Reccently Added Albums Execution time: {elapsed.TotalSeconds} seconds");
    }

    public async Task LoadPlaylistsAsync(ImmutableList<Playlist> playlists)
    {
        Stopwatch stopwatch = new Stopwatch();

        // Start the stopwatch
        stopwatch.Start();

        Playlists.Clear();

        var viewModels = playlists.Select(a => new DisplayPlaylistViewModel(a, _plex))
            .ToList();

        await Task.WhenAll(viewModels.Select(vm => vm.SetImageUrl()));

        // Update on UI thread
        foreach (var playlist in viewModels)
        {
            Playlists.Add(playlist);
        }

        // Stop the stopwatch
        stopwatch.Stop();

        // Get the elapsed time
        TimeSpan elapsed = stopwatch.Elapsed;

        // Display the elapsed time in various units
        Console.WriteLine($"Homepage Playlists Execution time: {elapsed.TotalMilliseconds} ms");
        Console.WriteLine($"Homepage Playlists Execution time: {elapsed.TotalSeconds} seconds");
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