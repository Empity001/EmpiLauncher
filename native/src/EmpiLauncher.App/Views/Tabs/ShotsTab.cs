using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using EmpiLauncher.App.Services;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views.Tabs;

/// <summary>
/// The player's screenshots. Thumbnails are decoded at the size they are drawn, a page at a time and two at once,
/// and released when the tab is left: a folder with hundreds of pictures never sits in memory.
/// </summary>
internal sealed class ShotsTab : SettingsTab
{
    private const int PageSize = 24, ThumbWidth = 320;
    private static readonly HashSet<string> Extensions = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp" };

    private readonly Launcher _l = Launcher.Instance;
    private readonly SemaphoreSlim _decoders = new(2);
    private List<ShotEntry> _shots = [];
    private WrapPanel? _grid;
    private Button? _more;
    private int _shown;
    private int _generation;

    public override string Id => "shots";
    public override string Title => "Capturas";

    public override async Task LoadAsync()
    {
        Release();
        Root.Children.Clear();
        var generation = ++_generation;
        var dir = (await _l.Client.CallAsync<DirResult>("screenshots.dir")).Dir;
        _shots = await Task.Run(() => Scan(dir));
        if (generation != _generation) return;

        var card = Ui.Section("Capturas", out var body, Directory.Exists(dir) ? $"{_shots.Count} capturas de {_l.Selected?.Name}. Pulsa una para verla grande." : "Todavía no hay capturas de este modpack. Se guardan al pulsar F2 dentro del juego.");
        var open = Ui.Button("Abrir carpeta", () => { Directory.CreateDirectory(dir); Process.Start(new ProcessStartInfo("explorer.exe", $"\"{dir}\"") { UseShellExecute = true }); });
        open.HorizontalAlignment = HorizontalAlignment.Left;
        body.Children.Add(open);
        Root.Children.Add(card);

        if (_shots.Count == 0) return;
        _grid = new WrapPanel { Margin = new Thickness(-4, 0, -4, 0) };
        Root.Children.Add(_grid);
        _more = Ui.Button("Cargar más", () => AddPage(generation), "GhostButton");
        _more.HorizontalAlignment = HorizontalAlignment.Left;
        _more.Margin = new Thickness(4, 10, 0, 20);
        Root.Children.Add(_more);
        _shown = 0;
        AddPage(generation);
    }

    private static List<ShotEntry> Scan(string dir)
    {
        if (!Directory.Exists(dir)) return [];
        return new DirectoryInfo(dir).EnumerateFiles()
            .Where(f => Extensions.Contains(f.Extension))
            .OrderByDescending(f => f.LastWriteTimeUtc).ThenBy(f => f.Name)
            .Select(f => new ShotEntry(f.Name, f.FullName, f.Length, f.LastWriteTime)).ToList();
    }

    private void AddPage(int generation)
    {
        if (_grid == null) return;
        var end = Math.Min(_shown + PageSize, _shots.Count);
        for (var i = _shown; i < end; i++) _grid.Children.Add(Tile(i, generation));
        _shown = end;
        if (_more != null) _more.Visibility = _shown < _shots.Count ? Visibility.Visible : Visibility.Collapsed;
    }

    private Button Tile(int index, int generation)
    {
        var shot = _shots[index];
        var picture = new Image { Stretch = Stretch.UniformToFill };
        var label = new TextBlock { Text = shot.Modified.ToString("dd/MM/yyyy HH:mm"), Style = (Style)Application.Current.FindResource("CaptionText"), Foreground = Ui.Res("PaperBrush"), TextWrapping = TextWrapping.NoWrap };
        var content = new Grid { Width = 220, Height = 138 };
        content.Children.Add(new Border { Background = Ui.Res("Surface2Brush") });
        content.Children.Add(picture);
        content.Children.Add(new Border { VerticalAlignment = VerticalAlignment.Bottom, Background = new SolidColorBrush(Color.FromArgb(0xB3, 6, 6, 7)), Padding = new Thickness(10, 5, 10, 5), Child = label });
        content.Clip = new RectangleGeometry(new Rect(0, 0, 220, 138), 14, 14);

        var tile = new Button { Content = content, Margin = new Thickness(4), Style = (Style)Application.Current.FindResource("BareButton") };
        System.Windows.Automation.AutomationProperties.SetName(tile, $"Captura {shot.Name}");
        tile.Click += (_, _) => Open(index);
        _ = LoadThumbAsync(picture, shot, generation);
        return tile;
    }

    private async Task LoadThumbAsync(Image target, ShotEntry shot, int generation)
    {
        await _decoders.WaitAsync();
        try
        {
            if (generation != _generation) return;
            var image = await Task.Run(() => ScreenshotViewer.Decode(shot.Path, ThumbWidth));
            if (generation == _generation) target.Source = image;
        }
        finally { _decoders.Release(); }
    }

    private void Open(int index)
    {
        var window = (MainWindow)Application.Current.MainWindow;
        window.ShowViewer(new ScreenshotViewer(_shots, index));
    }

    public override void Release()
    {
        _generation++;
        if (_grid != null) foreach (Button tile in _grid.Children) if (tile.Content is Grid g) foreach (var child in g.Children) if (child is Image image) image.Source = null;
        _grid?.Children.Clear();
        _shots = [];
        _shown = 0;
    }
}
