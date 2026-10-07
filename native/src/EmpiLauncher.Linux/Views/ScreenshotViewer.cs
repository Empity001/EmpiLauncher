using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

/// <summary>Full-size viewer. Decodes only the picture on screen, at the size it is drawn, and drops it when closed.</summary>
internal sealed class ScreenshotViewer : UserControl
{
    private readonly IReadOnlyList<ShotEntry> _shots;
    private int _index;
    private int _generation;
    private readonly TextBlock _caption, _meta;
    private readonly Image _picture = new() { Stretch = Stretch.Uniform };
    private readonly Button _prev, _next;

    public event Action? Closed;

    public ScreenshotViewer(IReadOnlyList<ShotEntry> shots, int index)
    {
        _shots = shots;
        _index = index;
        Focusable = true;
        Background = new SolidColorBrush(Color.Parse("#E6060607"));
        RenderOptions.SetBitmapInterpolationMode(_picture, BitmapInterpolationMode.HighQuality);

        _caption = Ui.Text("", "BodyText"); _caption.TextTrimming = TextTrimming.CharacterEllipsis; _caption.TextWrapping = TextWrapping.NoWrap;
        _meta = Ui.Text("", "CaptionText"); _meta.TextWrapping = TextWrapping.NoWrap; _meta.Margin = new Thickness(0, 3, 0, 0);
        var close = Ui.Act("Cerrar", Close);
        Avalonia.Automation.AutomationProperties.SetName(close, "Cerrar visor");
        var folder = Ui.Act("Mostrar en la carpeta", () =>
        {
            try { Process.Start(new ProcessStartInfo("xdg-open", $"\"{System.IO.Path.GetDirectoryName(_shots[_index].Path)}\"") { UseShellExecute = false }); } catch (Exception) { }
        });
        folder.Margin = new Thickness(0, 0, 10, 0);
        DockPanel.SetDock(close, Dock.Right); DockPanel.SetDock(folder, Dock.Right);
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 14), Children = { close, folder, new StackPanel { VerticalAlignment = VerticalAlignment.Center, Children = { _caption, _meta } } } };

        _prev = Ui.IconBtn(Icons.Chevron, "Anterior", () => Move(-1), 46, Pal.Paper);
        _prev.Background = new SolidColorBrush(Color.Parse("#B3111215")); _prev.HorizontalAlignment = HorizontalAlignment.Left; _prev.VerticalAlignment = VerticalAlignment.Center;
        ((Avalonia.Controls.Shapes.Path)_prev.Content!).RenderTransform = new RotateTransform(90);
        _next = Ui.IconBtn(Icons.Chevron, "Siguiente", () => Move(1), 46, Pal.Paper);
        _next.Background = new SolidColorBrush(Color.Parse("#B3111215")); _next.HorizontalAlignment = HorizontalAlignment.Right; _next.VerticalAlignment = VerticalAlignment.Center;
        ((Avalonia.Controls.Shapes.Path)_next.Content!).RenderTransform = new RotateTransform(-90);
        var stage = new Grid { Children = { _picture, _prev, _next } };
        Grid.SetRow(stage, 1);
        Content = new Grid { Margin = new Thickness(28), RowDefinitions = { new RowDefinition(GridLength.Auto), new RowDefinition(1, GridUnitType.Star) }, Children = { head, stage } };

        AttachedToVisualTree += (_, _) => { Focus(); Motion.Animate(this, OpacityProperty, 0, 1, 180); Show(); };
        KeyDown += (_, e) =>
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
        _caption.Text = shot.Name;
        _meta.Text = $"{_index + 1} de {_shots.Count}   {Fmt.Bytes(shot.Size)}   {shot.Modified:dd/MM/yyyy HH:mm}";
        _prev.IsVisible = _next.IsVisible = _shots.Count > 1;

        var width = (int)Math.Min(2560, Math.Max(800, (TopLevel.GetTopLevel(this)?.Screens?.Primary?.Bounds.Width ?? 1920)));
        var image = await Task.Run(() => Ui.Decode(shot.Path, width));
        if (generation != _generation) return;   // the player already moved on
        _picture.Source = image;
        Motion.Animate(_picture, OpacityProperty, 0.2, 1, 120);   // a picture that took a moment to decode settles in instead of popping in
    }

    private void Close()
    {
        _generation++;
        _picture.Source = null;
        Closed?.Invoke();
    }
}
