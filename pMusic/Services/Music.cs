using System;
using System.Collections.Immutable;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using pMusic.Models;

namespace pMusic.Services;

public interface IMusic
{
    // ValueTask<ObservableCollection<Artist>> GetArtistsAsync(CancellationToken ct, Plex plex);
    // ValueTask<ObservableCollection<Album>> GetArtistAlbums(CancellationToken ct, Plex plex, int libraryId, string artistKey, string artistTitle);
    ValueTask<IImmutableList<Track>> GetTrackList(CancellationToken ct, Plex plex, string albumGuid);
    ValueTask<IImmutableList<Track>> GetPlaylistTrackList(CancellationToken ct, Plex plex, string guid);
    ValueTask<ImmutableList<Playlist>> GetPlaylists(CancellationToken ct, Plex plex, bool loaded = false);
    ValueTask<IImmutableList<Album>> GetAllAlbums(CancellationToken ct, Plex plex, bool loaded = false);
    ValueTask<IImmutableList<Album>> GetArtistAlbums(CancellationToken ct, Plex plex, Artist artist);
    ValueTask<string> GetServerUri(CancellationToken ct, Plex plex);
}

public class Music : IMusic
{
    public string? ServerUri { get; set; }
    // public async ValueTask<ObservableCollection<Artist>> GetArtistsAsync(CancellationToken ct, Plex plex)
    // {
    //     await Task.Delay(TimeSpan.FromSeconds(1), ct);
    //
    //     var artists = await plex.GetArtists(ServerUri);
    //
    //     return artists;
    // }

    // public async ValueTask<ObservableCollection<Album>> GetArtistAlbums(CancellationToken ct, Plex plex, int libraryId, string artistKey, string artistTitle)
    // {
    //     await Task.Delay(TimeSpan.FromSeconds(1), ct);
    //
    //     var albums = await plex.GetArtistAlbums(ServerUri!, libraryId, artistKey, artistTitle);
    //
    //     var temp = ImmutableArray<Album>.Empty;
    //     return albums;
    // }    
    //
    public async ValueTask<IImmutableList<Track>> GetTrackList(CancellationToken ct, Plex plex, string albumGuid)
    {
        await Task.Delay(TimeSpan.FromSeconds(1), ct);

        var serverUrl = plex.GetServerUri();
        var tracks = await plex.GetTrackList(serverUrl!, albumGuid);

        var i = 0;
        return tracks;
    }

    public async ValueTask<IImmutableList<Track>> GetPlaylistTrackList(CancellationToken ct, Plex plex,
        string guid)
    {
        await Task.Delay(TimeSpan.FromSeconds(1), ct);

        var serverUrl = plex.GetServerUri();
        var tracks = await plex.GetPlaylistTrackList(serverUrl!, guid);

        var i = 0;
        return tracks;
    }

    public async ValueTask<ImmutableList<Playlist>> GetPlaylists(CancellationToken ct, Plex plex, bool loaded = false)
    {
        Stopwatch stopwatch = new Stopwatch();

        // Start the stopwatch
        stopwatch.Start();

        ServerUri = plex.GetServerUri();

        var playlists = await plex.GetPlaylists(ServerUri!, loaded);

        // Stop the stopwatch
        stopwatch.Stop();

        // Get the elapsed time
        TimeSpan elapsed = stopwatch.Elapsed;

        // Display the elapsed time in various units
        Console.WriteLine($"Playlists Execution time: {elapsed.TotalMilliseconds} ms");
        Console.WriteLine($"Playlists Execution time: {elapsed.TotalSeconds} seconds");

        return playlists.ToImmutableList();
    }

    public async ValueTask<IImmutableList<Album>> GetAllAlbums(CancellationToken ct, Plex plex, bool loaded = false)
    {
        Stopwatch stopwatch = new Stopwatch();

        // Start the stopwatch
        stopwatch.Start();

        var serverUri = plex.GetServerUri();
        var albums = await plex.GetAllAlbums(serverUri, loaded);

        ServerUri = serverUri;

        // Stop the stopwatch
        stopwatch.Stop();

        // Get the elapsed time
        TimeSpan elapsed = stopwatch.Elapsed;

        // Display the elapsed time in various units
        Console.WriteLine($"All Albums Execution time: {elapsed.TotalMilliseconds} ms");
        Console.WriteLine($"All Albums Execution time: {elapsed.TotalSeconds} seconds");

        return albums;
    }


    public async ValueTask<IImmutableList<Album>> GetArtistAlbums(CancellationToken ct, Plex plex, Artist artist)
    {
        Stopwatch stopwatch = new Stopwatch();

        // Start the stopwatch
        stopwatch.Start();

        await Task.Delay(TimeSpan.FromSeconds(1), ct);

        var serverUri = plex.GetServerUri();
        var albums = await plex.GetArtistAlbums(serverUri, artist);

        // Stop the stopwatch
        stopwatch.Stop();

        // Get the elapsed time
        TimeSpan elapsed = stopwatch.Elapsed;

        // Display the elapsed time in various units
        Console.WriteLine($"Get Artist Albums Execution time: {elapsed.TotalMilliseconds} ms");
        Console.WriteLine($"Get Artist Albums Execution time: {elapsed.TotalSeconds} seconds");

        return albums;
    }

    public async ValueTask<string> GetServerUri(CancellationToken ct, Plex plex)
    {
        ServerUri = plex.GetServerUri();
        return ServerUri;
    }
}