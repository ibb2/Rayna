using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Interactivity;
using pMusic.ViewModels;

namespace pMusic.Views;

public partial class HomeView : UserControl
{
    public HomeView()
    {
        InitializeComponent();
        // _ = LoadContentAsync();
    }

    public async Task LoadContentAsync()
    {
        // Your data loading logic here
        var vm = (HomeViewModel)DataContext!;
        var isLoaded = vm.IsLoaded;
        Console.WriteLine($"Is loaded: {isLoaded}");
        if (!isLoaded) _ = vm.LoadContent();
        Console.WriteLine($"check Is loaded: {isLoaded}");
    }

    protected override void OnLoaded(RoutedEventArgs e)
    {
        var vm = (HomeViewModel)DataContext!;
        // var isLoaded = vm.IsLoaded;
        // Console.WriteLine($"Is loaded: {isLoaded}");
        // if (!isLoaded)
        _ = vm.LoadContent();
        // Console.WriteLine($"check Is loaded: {isLoaded}");
    }
}