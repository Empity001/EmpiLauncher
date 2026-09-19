using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using EmpiLauncher.App.Themes;

namespace EmpiLauncher.App.Views;

public sealed record ShotEntry(string Name, string Path, long Size, DateTime Modified);

/// <summary>Full-size viewer. Decodes only the picture on screen, at the size it is drawn, and drops it when closed.</summary>
public partial class ScreenshotViewer : UserControl
{
    private readonly IReadOnlyList<ShotEntry> _shots;
    private int _index;
    private int _generation;

    public event Action? Closed;

    public ScreenshotViewer(IReadOnlyList<ShotEntry> shots, int index)
    {
        InitializeComponent();
        _shots = shots;
        _index = index;
        CloseButton.Click += (_, _) => Close();
        PrevButton.Click += (_, _) => Move(-1);
        NextButton.Click += (_, _) => Move(1);
        OpenFolderButton.Click += (_, _) => Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{_shots[_index].Path}\"") { UseShellExecute = true });
        Loaded += (_, _) => { Focus(); Motion.Animate(this, OpacityProperty, 0, 1, 180); Show(); };
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) { Close(); e.Handled = true; }
            else if (e.Key == Key.Left) { Move(-1); e.Handled = true; }
            else if (e.Key == Key.Right) { Move(1); e.Handled = true; }
        };
    }

    private void Move(int delta)
    {
        _index = (_index + delta + _shots.Count) % _shots.Count;
        Show();
    }

    private async void Show()
    {
        var shot = _shots[_index];
        var generation = ++_generation;
        Caption.Text = shot.Name;
        Meta.Text = $"{_index + 1} de {_shots.Count}   {Fmt.Bytes(shot.Size)}   {shot.Modified:dd/MM/yyyy HH:mm}";
        PrevButton.Visibility = NextButton.Visibility = _shots.Count > 1 ? Visibility.Visible : Visibility.Collapsed;

        var width = (int)Math.Min(2560, Math.Max(800, SystemParameters.PrimaryScreenWidth * VisualTreeHelperDpi()));
        var image = await Task.Run(() => Decode(shot.Path, width));
        if (generation != _generation) return;   // the player already moved on
        Picture.Source = image;
        Motion.Animate(Picture, OpacityProperty, 0.2, 1, 120);   // a picture that took a moment to decode settles in instead of popping in
    }

    private double VisualTreeHelperDpi() => System.Windows.Media.VisualTreeHelper.GetDpi(this).DpiScaleX;

    internal static BitmapSource? Decode(string path, int pixelWidth)
    {
        try
        {
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.UriSource = new Uri(path);
            bitmap.DecodePixelWidth = pixelWidth;
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
            bitmap.EndInit();
            bitmap.Freeze();
            return bitmap;
        }
        catch { return null; }
    }

    private void Close()
    {
        _generation++;
        Picture.Source = null;
        Closed?.Invoke();
    }
}
