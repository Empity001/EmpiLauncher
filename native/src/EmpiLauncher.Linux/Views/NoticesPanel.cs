using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The notices the author published (avisos.json): the general ones and those of the selected modpack. Each is a page of newspaper (an image the
/// engine already cached) with its words and, maybe, a button. Opening the panel marks what was unread as read; "Después" keeps a notice for later
/// and "Cerrar" files it under "ya leídos".
/// </summary>
public sealed class NoticesPanel : Border
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private readonly StackPanel _list = new() { Spacing = 14 };
    private readonly Action _close;

    public NoticesPanel(Action close)
    {
        _close = close;
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 14) };
        var x = Ui.IconBtn(Icons.Close, "Cerrar", close);
        DockPanel.SetDock(x, Dock.Right);
        head.Children.Add(x);
        head.Children.Add(Ui.Display("Avisos", 28));
        Background = Pal.Dialog; BorderBrush = Pal.Hair; BorderThickness = new Thickness(1); CornerRadius = new CornerRadius(22); Padding = new Thickness(26, 22);
        Width = 720; HorizontalAlignment = HorizontalAlignment.Center; VerticalAlignment = VerticalAlignment.Stretch; Margin = new Thickness(28, 64, 28, 28);
        var layout = new DockPanel();
        DockPanel.SetDock(head, Dock.Top);
        layout.Children.Add(head);
        layout.Children.Add(new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = new Border { Padding = new Thickness(0, 0, 12, 0), Child = _list } });
        Child = layout;
    }

    public void Fill(string? modpackId)
    {
        _list.Children.Clear();
        var notices = _l.GeneralNotices.Concat(_l.NoticesOf(modpackId)).DistinctBy(n => n.Id).OrderByDescending(n => n.PublishedAt).ToList();
        if (notices.Count == 0) _list.Children.Add(Ui.Body("No hay avisos por ahora. Todo tranqui ;3", 14.5, Pal.Paper2));
        foreach (var notice in notices)
        {
            _list.Children.Add(Card(notice));
            if (notice.State == "unread") _ = _l.MarkNoticeAsync(notice.Id, "read");
        }
        var archived = _l.Archived.ToList();
        if (archived.Count > 0)
        {
            _list.Children.Add(Ui.Label($"YA LEÍDOS  ·  {archived.Count}"));
            foreach (var a in archived.Take(20))
                _list.Children.Add(new Border { Background = Pal.Tint, CornerRadius = new CornerRadius(14), Padding = new Thickness(14, 10), Child = new StackPanel { Children = { Ui.Body(a.Title, 14, Pal.Paper2), Ui.Caption(a.Summary ?? "") } } });
        }
    }

    private Control Card(NoticeInfo notice)
    {
        var stack = new StackPanel { Spacing = 8 };
        var tag = notice.Severity switch { "danger" or "critical" => Pal.Danger, "warning" or "warn" => Pal.Warn, _ => Pal.Paper2 };
        stack.Children.Add(Ui.Pill((notice.General ? "GENERAL" : "ESTE MODPACK") + "  ·  " + notice.Severity.ToUpperInvariant(), tag));
        stack.Children.Add(Ui.Display(notice.Title, 22));
        if (!string.IsNullOrWhiteSpace(notice.Summary)) stack.Children.Add(Ui.Body(notice.Summary, 14.5, Pal.Paper2));
        if (Ui.Decode(notice.Image, 660) is { } picture)
            stack.Children.Add(new Border { CornerRadius = new CornerRadius(14), ClipToBounds = true, Child = new Image { Source = picture, Stretch = Stretch.Uniform } });
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Margin = new Thickness(0, 4, 0, 0) };
        if (notice.Button is { } b && Uri.TryCreate(b.Url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps)
            buttons.Children.Add(Ui.Btn(b.Label, Ui.Kind.Primary, () => { try { Process.Start(new ProcessStartInfo("xdg-open") { ArgumentList = { uri.ToString() }, UseShellExecute = false }); } catch { } }, new Thickness(18, 9)));
        buttons.Children.Add(Ui.Btn("Después", Ui.Kind.Ghost, async () => { await _l.MarkNoticeAsync(notice.Id, "later"); Fill(_l.HostId); }, new Thickness(16, 9), 12));
        buttons.Children.Add(Ui.Btn("Cerrar aviso", Ui.Kind.Ghost, async () => { await _l.MarkNoticeAsync(notice.Id, "closed"); Fill(_l.HostId); }, new Thickness(16, 9), 12));
        stack.Children.Add(buttons);
        return new Border { Background = Pal.Module, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(18), Padding = new Thickness(20, 16), Child = stack };
    }
}
