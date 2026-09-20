using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;

namespace EmpiLauncher.App.Views;

/// <summary>
/// Shown instead of the launcher when this version is older than the minimum the author published: nothing plays until it is updated.
/// It says why in one sentence and offers the way out (update now), the news link when there is one, and to leave.
/// </summary>
internal sealed class BlockedView : UserControl
{
    private readonly Launcher _l = Launcher.Instance;
    private readonly Button _update;
    private readonly TextBlock _message;

    public BlockedView(Action update, Action exit)
    {
        var stage = new StackPanel { Margin = new Thickness(12, 0, 12, 24), MaxWidth = 640 };
        var pills = new WrapPanel { Margin = new Thickness(0, 0, 0, 16) };
        pills.Children.Add(Fmt.Pill("VERSIÓN BLOQUEADA", Fmt.Res("WarnBrush")));
        stage.Children.Add(pills);
        var title = Ui.Text("ACTUALIZA PARA JUGAR", "DisplayText", null, 46);
        title.TextWrapping = TextWrapping.Wrap; title.TextTrimming = TextTrimming.None;
        stage.Children.Add(title);
        _message = Ui.Text("", "BodyText", Fmt.Res("Paper2Brush"));
        _message.Margin = new Thickness(0, 14, 0, 0);
        stage.Children.Add(_message);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 26, 0, 0) };
        _update = Ui.Button("Actualizar ahora", update, "PrimaryButton", 24);
        buttons.Children.Add(_update);
        var news = Ui.Button("Novedades  ↗", OpenNews, "GhostButton", 20);
        news.Margin = new Thickness(10, 0, 0, 0);
        news.Visibility = _l.Notices?.Launcher.Novedades != null ? Visibility.Visible : Visibility.Collapsed;
        buttons.Children.Add(news);
        var leave = Ui.Button("Salir", exit, "GhostButton", 20);
        leave.Margin = new Thickness(10, 0, 0, 0);
        buttons.Children.Add(leave);
        stage.Children.Add(buttons);

        Content = new Grid { Margin = new Thickness(24, 0, 24, 24), Children = { new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Left, Content = stage, Focusable = false } } };
        Loaded += (_, _) =>
        {
            _l.NoticesChanged += Refresh; _l.Changed += Refresh;
            Refresh();
            Motion.Reveal([pills, title, _message, buttons], 45, 0, 260, 10);
            Motion.Tear(title);
        };
        Unloaded += (_, _) => { _l.NoticesChanged -= Refresh; _l.Changed -= Refresh; };
    }

    private void Refresh()
    {
        _message.Text = _l.Notices?.Launcher.Message ?? "Esta versión del launcher ya no se puede usar.";
        // the update the engine knows about (or is still asking for); without one there is only the download page
        _update.Content = _l.Update != null ? $"Actualizar a la {_l.Update.Version}" : "Actualizar ahora";
    }

    private void OpenNews()
    {
        if (_l.Notices?.Launcher.Novedades is { } url && Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps)
            try { Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true }); } catch (Exception) { }
    }
}
