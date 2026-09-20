using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views;

/// <summary>What a notice looks like wherever it appears: the icon of its scope and the colour of its gravity.</summary>
internal static class NoticeLook
{
    public const string Megaphone = "";   // general notices
    public const string Bubble = "";      // notices of one modpack

    public static Brush BrushOf(string severity) => severity switch { "critical" => Fmt.Res("DangerBrush"), "important" => Fmt.Res("WarnBrush"), _ => Fmt.Res("PaperBrush") };
    public static int Rank(string severity) => severity switch { "critical" => 2, "important" => 1, _ => 0 };
    /// <summary>Counts as unread until it is read (opened) or closed; "remind me later" keeps it unread.</summary>
    public static bool Unread(NoticeInfo notice) => notice.State is "unread" or "later";

    /// <summary>The colour of the most serious unread notice, or null when nothing is unread.</summary>
    public static Brush? BadgeBrush(IEnumerable<NoticeInfo> notices)
    {
        var worst = notices.Where(Unread).OrderByDescending(n => Rank(n.Severity)).FirstOrDefault();
        return worst == null ? null : BrushOf(worst.Severity);
    }

    public static string When(string? iso)
    {
        if (!DateTimeOffset.TryParse(iso, out var at)) return "";
        var local = at.ToLocalTime();
        var days = (DateTime.Now.Date - local.Date).Days;
        return days == 0 ? $"hoy {local:HH:mm}" : days == 1 ? "ayer" : local.ToString("d MMM", System.Globalization.CultureInfo.GetCultureInfo("es-ES")).ToLowerInvariant();
    }
}

/// <summary>
/// The notices, as a newspaper: the page of the notice that is open, big, and the others in a strip beside it. Every notice can be closed
/// (gone for good) or put off ("recordar más tarde": it comes back the next time the launcher opens). Opening a page marks it read.
/// The pages are pictures the author built in the Publisher and the launcher shows them as they are.
/// </summary>
internal sealed class NoticesPanel : UserControl
{
    private readonly Launcher _l = Launcher.Instance;
    /// <summary>Notices put off in this run: viewing one again in this same run must not count as reading it.</summary>
    private static readonly HashSet<string> LaterThisRun = [];

    private string _scope = "general";   // "general", "archive" (ya leídos) or a modpack id
    private string? _selected;
    private readonly TextBlock _count;
    private readonly StackPanel _tabs = new() { Orientation = Orientation.Horizontal, Margin = new Thickness(22, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
    private readonly Image _page = new() { Stretch = Stretch.Uniform };
    private readonly Border _pageFrame;
    private readonly StackPanel _strip = new();
    private readonly TextBlock _empty;
    private readonly Grid _body = new();
    private readonly Button _link, _later, _close;
    private readonly StackPanel _footer = new();

    public event Action? CloseRequested;

    public NoticesPanel()
    {
        RenderOptions.SetBitmapScalingMode(_page, BitmapScalingMode.HighQuality);
        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        // header: the name, how many are unread, the two scopes, and the way out
        var header = new DockPanel { Margin = new Thickness(0, 0, 0, 14) };
        var exit = new Button { Style = (Style)FindResource("IconButton"), Content = "", Width = 34, Height = 34, FontSize = 12, ToolTip = "Cerrar (Esc)" };
        System.Windows.Automation.AutomationProperties.SetName(exit, "Cerrar los avisos");
        exit.Click += (_, _) => CloseRequested?.Invoke();
        DockPanel.SetDock(exit, Dock.Right);
        header.Children.Add(exit);
        header.Children.Add(Ui.Text("AVISOS", "DisplayText", null, 26));
        _count = Ui.Text("", "CaptionText");
        _count.Margin = new Thickness(14, 0, 0, 0); _count.VerticalAlignment = VerticalAlignment.Center;
        header.Children.Add(_count);
        header.Children.Add(_tabs);
        root.Children.Add(header);

        // body: the page, and the strip of the others
        _body.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        _body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(20) });
        _body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star), MinWidth = 250 });
        _pageFrame = new Border { BorderBrush = Fmt.Res("HairStrongBrush"), BorderThickness = new Thickness(1), Background = new SolidColorBrush(Color.FromRgb(0x0b, 0x0b, 0x0c)), Child = _page, RenderTransformOrigin = new Point(0.5, 0.5) };
        var box = new Viewbox { Stretch = Stretch.Uniform, StretchDirection = StretchDirection.Both, Child = new Grid { Width = 450, Height = 600, Children = { _pageFrame } } };
        Grid.SetColumn(box, 0);
        _body.Children.Add(box);
        var scroller = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Focusable = false, Content = _strip };
        Grid.SetColumn(scroller, 2);
        _body.Children.Add(scroller);
        _empty = Ui.Text("No hay avisos por ahora.", "BodyText", Fmt.Res("Paper2Brush"));
        _empty.HorizontalAlignment = HorizontalAlignment.Left; _empty.Margin = new Thickness(2, 6, 0, 0);
        Grid.SetRow(_body, 1);
        root.Children.Add(_body);

        // footer: the button the author gave the notice (if any), and what the player does with it
        _link = Ui.Button("", OpenLink, "GhostButton", 18);
        _later = Ui.Button("Recordar más tarde", Later);
        _close = Ui.Button("Cerrar aviso", Dismiss, "PaperButton", 20);
        _later.Margin = new Thickness(0, 0, 8, 0);
        var right = new StackPanel { Orientation = Orientation.Horizontal, Children = { _later, _close } };
        var dock = new DockPanel { Margin = new Thickness(0, 14, 0, 0) };
        DockPanel.SetDock(right, Dock.Right);
        dock.Children.Add(right);
        dock.Children.Add(_link);
        _link.HorizontalAlignment = HorizontalAlignment.Left;
        _footer.Children.Add(dock);
        Grid.SetRow(_footer, 2);
        root.Children.Add(_footer);

        Content = new Border { Style = (Style)FindResource("Module"), Background = new SolidColorBrush(Color.FromRgb(0x11, 0x11, 0x14)), Padding = new Thickness(24, 20, 24, 20), Child = root };
        MinWidth = 800; MaxWidth = 940; MaxHeight = 700;   // the window is never narrower than 940: the panel keeps its width whichever tab is open
        Loaded += (_, _) => _l.NoticesChanged += Refresh;
        Unloaded += (_, _) => _l.NoticesChanged -= Refresh;
    }

    // ---- what is shown --------------------------------------------------------------------------------------------------

    private bool InArchive => _scope == "archive";

    private List<NoticeInfo> Visible() => InArchive ? Archived() : (_scope == "general" ? _l.GeneralNotices : _l.NoticesOf(_scope)).ToList();

    /// <summary>The closed ones, dressed as notices so they are listed and shown like any other (the date is the day it was closed).</summary>
    private List<NoticeInfo> Archived() => _l.Archived.Select(a => new NoticeInfo(a.Id, a.Title, a.Severity, a.General, a.Targets, a.Summary, a.Button, a.ClosedAt, null, a.Image, "closed")).ToList();

    /// <summary>Where a closed notice was seen: general, or the modpack it named.</summary>
    private string ScopeName(NoticeInfo notice) =>
        notice.General ? "General" : notice.Targets.Select(t => _l.Distro?.Servers.FirstOrDefault(s => s.Id == t)?.Name).FirstOrDefault(name => name != null) ?? "Modpack";
    private string LocalName() => _l.Distro?.Servers.FirstOrDefault(s => s.Id == _l.SelectedId)?.Name ?? "Modpack";

    /// <summary>Opens on the general notices (the megaphone) or on those of the modpack that is selected (the bubble).</summary>
    public void Open(bool general)
    {
        _scope = general || _l.SelectedId == null ? "general" : _l.SelectedId;
        if (!_l.NoticesOf(_scope).Any() && _scope != "general") _scope = "general";
        _selected = null;
        Refresh();
        var first = Visible().FirstOrDefault(NoticeLook.Unread) ?? Visible().FirstOrDefault();
        if (first != null) Choose(first.Id);
    }

    private void Refresh()
    {
        var general = _l.GeneralNotices.ToList();
        var local = _l.NoticesOf(_l.SelectedId).ToList();
        var archived = _l.Archived.Count();
        if (InArchive && archived == 0) _scope = "general";   // nothing left in "ya leídos": back to the notices
        if (_scope != "general" && !InArchive && _scope != _l.SelectedId) _scope = "general";

        var unread = general.Count(NoticeLook.Unread) + local.Count(NoticeLook.Unread);
        _count.Text = unread == 0 ? "todo leído" : unread == 1 ? "1 sin leer" : $"{unread} sin leer";

        _tabs.Children.Clear();
        void Tab(string scope, string label, int total, int fresh)
        {
            var pill = new RadioButton { Content = fresh > 0 ? $"{label}  ({fresh})" : label, Style = (Style)FindResource("TabPill"), GroupName = "notice-scope", IsChecked = _scope == scope, Tag = scope };
            System.Windows.Automation.AutomationProperties.SetName(pill, Ui.AccessName(label));
            pill.Checked += (_, _) => { if (_scope == scope) return; _scope = scope; _selected = null; Refresh(); var f = Visible().FirstOrDefault(NoticeLook.Unread) ?? Visible().FirstOrDefault(); if (f != null) Choose(f.Id); };
            _tabs.Children.Add(pill);
        }
        Tab("general", "General", general.Count, general.Count(NoticeLook.Unread));
        if (_l.SelectedId != null && local.Count > 0) Tab(_l.SelectedId, LocalName(), local.Count, local.Count(NoticeLook.Unread));
        if (archived > 0) Tab("archive", "Ya leídos", archived, 0);

        var list = Visible();
        if (_selected == null || !list.Any(n => n.Id == _selected)) _selected = list.FirstOrDefault(NoticeLook.Unread)?.Id ?? list.FirstOrDefault()?.Id;

        _strip.Children.Clear();
        if (list.Count == 0)
        {
            _strip.Children.Add(_empty);
            _page.Source = null;
            _pageFrame.Visibility = Visibility.Hidden;
            _footer.Visibility = Visibility.Collapsed;
            return;
        }
        _pageFrame.Visibility = Visibility.Visible;
        _footer.Visibility = Visibility.Visible;
        // a closed notice cannot be put off or closed again: it can be read, and taken out of here
        _later.Visibility = InArchive ? Visibility.Collapsed : Visibility.Visible;
        _close.Content = InArchive ? "Quitar de aquí" : "Cerrar aviso";
        _close.Style = (Style)FindResource(InArchive ? "GhostButton" : "PaperButton");
        foreach (var notice in list) _strip.Children.Add(Item(notice, notice.Id == _selected));
        Show(list.First(n => n.Id == _selected));
    }

    private Button Item(NoticeInfo notice, bool selected)
    {
        var brush = NoticeLook.BrushOf(notice.Severity);
        var ink = selected ? Fmt.Res("BgBrush") : Fmt.Res("PaperBrush");
        var dot = new Ellipse { Width = 10, Height = 10, Stroke = selected && notice.Severity == "info" ? Fmt.Res("BgBrush") : brush, StrokeThickness = 1.5, Margin = new Thickness(0, 5, 11, 0), VerticalAlignment = VerticalAlignment.Top, Fill = NoticeLook.Unread(notice) ? brush : Brushes.Transparent };
        var glyph = new TextBlock { Text = notice.General ? NoticeLook.Megaphone : NoticeLook.Bubble, FontFamily = new FontFamily("Segoe MDL2 Assets"), FontSize = 12, Foreground = selected ? Fmt.Res("PaperInkBrush") : Fmt.Res("Paper3Brush"), Margin = new Thickness(0, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center };
        var title = new TextBlock { Text = notice.Title, Style = (Style)FindResource("BodyText"), FontWeight = FontWeights.SemiBold, FontSize = 14, Foreground = ink, TextWrapping = TextWrapping.Wrap, MaxHeight = 40, TextTrimming = TextTrimming.CharacterEllipsis };
        var meta = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 3, 0, 0), Children = { glyph, new TextBlock { Text = InArchive ? $"{ScopeName(notice)}  cerrado {NoticeLook.When(notice.PublishedAt)}" : $"{(notice.General ? "General" : LocalName())}  {NoticeLook.When(notice.PublishedAt)}", Style = (Style)FindResource("CaptionText"), Foreground = selected ? Fmt.Res("PaperInkBrush") : Fmt.Res("Paper3Brush"), TextWrapping = TextWrapping.NoWrap } } };
        var row = new Grid { Children = { dot } };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var text = new StackPanel { Children = { title, meta } };
        Grid.SetColumn(text, 1);
        row.Children.Add(text);
        var card = new Border { CornerRadius = new CornerRadius(14), Padding = new Thickness(12, 10, 12, 10), Margin = new Thickness(0, 0, 8, 6), Background = selected ? Fmt.Res("PaperBrush") : Brushes.Transparent, Child = row };
        var button = new Button { Style = (Style)FindResource("BareButton"), Content = card, HorizontalContentAlignment = HorizontalAlignment.Stretch };
        System.Windows.Automation.AutomationProperties.SetName(button, Ui.AccessName($"{notice.Title}, {(InArchive ? "cerrado" : NoticeLook.Unread(notice) ? "sin leer" : "leído")}"));
        button.Click += (_, _) => Choose(notice.Id);
        return button;
    }

    /// <summary>The player picked this one: it is shown, and counts as read.</summary>
    private void Choose(string id)
    {
        _selected = id;
        if (InArchive) { Refresh(); return; }   // reading a closed one changes nothing
        var notice = _l.ActiveNotices.FirstOrDefault(n => n.Id == id);
        if (notice == null) return;
        if (notice.State == "unread" || (notice.State == "later" && !LaterThisRun.Contains(id))) _ = _l.MarkNoticeAsync(id, "read");
        Refresh();
    }

    private string? _shown;
    private void Show(NoticeInfo notice)
    {
        var changed = _shown != notice.Id;
        _shown = notice.Id;
        _page.Source = notice.Image != null ? ScreenshotViewer.Decode(notice.Image, 900) : null;
        System.Windows.Automation.AutomationProperties.SetName(_page, Ui.AccessName(notice.Summary is { Length: > 0 } ? $"{notice.Title}. {notice.Summary}" : notice.Title));
        _link.Visibility = notice.Button != null ? Visibility.Visible : Visibility.Collapsed;
        _link.Content = notice.Button != null ? $"{notice.Button.Label}  ↗" : "";
        if (changed) Motion.Rise(_pageFrame, 0, 180, 6);   // the next page arrives; nothing moves when only the marks changed
    }

    // ---- what the player does -------------------------------------------------------------------------------------------

    private void OpenLink()
    {
        var notice = Visible().FirstOrDefault(n => n.Id == _selected);
        if (notice?.Button == null || !Uri.TryCreate(notice.Button.Url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return;
        try { Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true }); } catch (Exception) { _l.RaiseNotice("No se pudo abrir el enlace."); }
    }

    private void Later()
    {
        if (_selected == null) return;
        LaterThisRun.Add(_selected);
        _ = _l.MarkNoticeAsync(_selected, "later");
        _l.RaiseNotice("Volverá a salir la próxima vez que abras el launcher.");
        Advance();
    }

    private void Dismiss()
    {
        if (_selected == null) return;
        if (InArchive) { Forget(); return; }
        _ = _l.MarkNoticeAsync(_selected, "closed");
        Advance();
    }

    /// <summary>In "ya leídos": removes this one for good and shows the next (or goes back to the notices when it was the last).</summary>
    private void Forget()
    {
        var id = _selected;
        if (id == null) return;
        var list = Visible();
        var at = list.FindIndex(n => n.Id == id);
        _selected = list.Where((n, i) => i != at).Select(n => n.Id).FirstOrDefault();
        _ = _l.ForgetNoticeAsync(id);
    }

    /// <summary>After putting one off or closing it: the next one of this scope, or out when there is none.</summary>
    private void Advance()
    {
        var list = Visible();
        var at = list.FindIndex(n => n.Id == _selected);
        var next = list.Where((n, i) => i != at).OrderByDescending(NoticeLook.Unread).ThenBy(n => list.IndexOf(n)).FirstOrDefault();
        if (next == null) { CloseRequested?.Invoke(); return; }
        Choose(next.Id);
    }
}

/// <summary>The megaphone (general) and the speech bubble (one modpack): a round icon with a badge. Dim when there is nothing, lit with a number when there is.</summary>
internal sealed class NoticeIconButton : Grid
{
    private readonly Button _button;
    private readonly Border _badge;
    private readonly TextBlock _count;
    private int _unread = -1;

    public event Action? Clicked;

    public NoticeIconButton(string glyph, string name, double size = 38)
    {
        _button = new Button { Style = (Style)Application.Current.FindResource("IconButton"), Content = glyph, Width = size, Height = size, ToolTip = name };
        System.Windows.Automation.AutomationProperties.SetName(_button, name);
        _button.Click += (_, _) => Clicked?.Invoke();
        _count = new TextBlock { FontFamily = (FontFamily)Application.Current.FindResource("MonoFont"), FontSize = 10.5, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(Color.FromRgb(0x0b, 0x0b, 0x0c)), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4, 0, 4, 0) };
        _badge = new Border { MinWidth = 16, Height = 16, CornerRadius = new CornerRadius(8), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 0, -3, 0), IsHitTestVisible = false, Visibility = Visibility.Collapsed, Child = _count, RenderTransformOrigin = new Point(0.5, 0.5), RenderTransform = new ScaleTransform(1, 1) };
        Children.Add(_button);
        Children.Add(_badge);
    }

    /// <param name="unread">how many are unread</param>
    /// <param name="color">the colour of the most serious unread one (null when none is)</param>
    /// <param name="any">whether there is anything at all: without notices the icon is dim</param>
    public void Set(int unread, Brush? color, bool any)
    {
        _button.Opacity = any ? 1 : 0.4;
        var arrived = _unread >= 0 && unread > _unread;
        _unread = unread;
        _badge.Visibility = unread > 0 ? Visibility.Visible : Visibility.Collapsed;
        if (unread <= 0) return;
        _count.Text = unread > 9 ? "9+" : unread.ToString();
        _badge.Background = color ?? Fmt.Res("PaperBrush");
        if (arrived) Motion.Pop(_badge, new Point(0.5, 0.5), 240, 0.6);   // something new: the badge arrives, it does not just change
    }
}
