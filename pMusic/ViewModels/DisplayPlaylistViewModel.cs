using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using KeySharp;
using pMusic.Models;
using pMusic.Services;

namespace pMusic.ViewModels;

public partial class DisplayPlaylistViewModel : PinnedItemViewModelBase
{
    private readonly Plex _plex;

    [ObservableProperty] private Bitmap? composite;

    [ObservableProperty] public Playlist playlist;

    public DisplayPlaylistViewModel(Playlist playlist, Plex plex)
    {
        _plex = plex;
        Playlist = playlist;
        Title = playlist.Title;
        Duration = playlist.Duration;
        ImageUrl = playlist.Composite;
    }


    public Task SetImageUrl()
    {
        if (string.IsNullOrWhiteSpace(ImageUrl))
            return Task.CompletedTask;

        ImageUrl = ImageUrl + "?X-Plex-Token=" +
                   Keyring.GetPassword("com.ib", "pmusic", "authToken");
        return Task.CompletedTask;
    }
}