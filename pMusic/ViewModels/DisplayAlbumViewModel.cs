using CommunityToolkit.Mvvm.ComponentModel;
using KeySharp;
using pMusic.Models;
using pMusic.Services;

namespace pMusic.ViewModels;

public partial class DisplayAlbumViewModel : PinnedItemViewModelBase
{
    private readonly Plex _plex;
    [ObservableProperty] public Album album;

    [ObservableProperty] public string artist;

    public DisplayAlbumViewModel(Album album, Plex plex)
    {
        _plex = plex;
        Album = album;
        Artist = album.Artist.Title;
        Title = album.Title;
        // Artist = album.Artist.Title;
        ImageUrl = album.Thumb;
    }

    public void SetImageUrl()
    {
        if (string.IsNullOrWhiteSpace(ImageUrl))
            return;

        ImageUrl = ImageUrl + "?X-Plex-Token=" +
                   Keyring.GetPassword("com.ib", "pmusic", "authToken");
    }
}