using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views;

internal static class Fmt
{
    public static string Bytes(double? value)
    {
        if (value is not { } v || v < 0) return "";
        if (v < 1024) return $"{v:0} B";
        string[] units = ["KB", "MB", "GB", "TB"];
        var amount = v / 1024;
        var i = 0;
        while (amount >= 1024 && i < units.Length - 1) { amount /= 1024; i++; }
        return $"{amount.ToString(amount >= 100 ? "0" : amount >= 10 ? "0.0" : "0.00")} {units[i]}";
    }

    public static Border Pill(string text, Brush? ink = null, Brush? fill = null)
    {
        var pill = new Border { Style = (Style)Application.Current.FindResource("Pill"), Margin = new Thickness(0, 0, 8, 6) };
        if (fill != null) pill.Background = fill;
        pill.Child = new TextBlock { Text = text, Style = (Style)Application.Current.FindResource("LabelText"), FontSize = 11, Foreground = ink ?? (Brush)Application.Current.FindResource("Paper2Brush") };
        return pill;
    }

    public static Brush Res(string key) => (Brush)Application.Current.FindResource(key);

    /// <summary>What kind of account it is, as the account lists show it: "MICROSOFT", "MOJANG" or "SIN CONEXIÓN  ID 123456789012".</summary>
    public static string AccountKind(AccountSummary account) => account.Type switch
    {
        "microsoft" => "MICROSOFT",
        "offline" => "SIN CONEXIÓN" + (account.OfflineId != null ? "  ID " + account.OfflineId : ""),
        _ => "MOJANG"
    } + (account.Type != "offline" && account.Username != null && account.Username != account.DisplayName ? "  " + account.Username : "");
}

public partial class HomeView : UserControl
{

    private readonly Launcher _l = Launcher.Instance;
    private string _railKey = "";
    private string? _avatarFor;
    private readonly System.Windows.Threading.DispatcherTimer _status = new() { Interval = TimeSpan.FromSeconds(90) };
    // maintenance ends by itself, a modpack opens on its date: the time is looked at again every half minute (no network: what the engine already has)
    private readonly System.Windows.Threading.DispatcherTimer _agenda = new() { Interval = TimeSpan.FromSeconds(30) };

    public event Action? OpenSettings;

    public HomeView()
    {
        InitializeComponent();
        Loaded += (_, _) =>
        {
            _l.Changed += OnChanged; _l.GameChanged += OnGame; _l.ArtChanged += RefreshBanner; _l.NoticesChanged += OnChanged; _agenda.Start();
            // First, so what Refresh fills in below is already waiting its turn (invisible) and never flashes. While the logo's opening
            // still covers the window the parts wait hidden, and arrive the moment it uncovers them.
            if (SplashLayer.Playing)
            {
                _entrancePending = true;
                foreach (var part in EntranceParts()) part.Opacity = 0;
                SplashLayer.WhenRevealing(Entrance);
            }
            else Entrance();
            Refresh(); RefreshBanner(); _status.Start(); _ = _l.RefreshStatusAsync();
            LivingField.NextAction = PlayButton;   // the main action glows in the modpack's accent
            LivingField.Quiet.Add(Hero);           // dots stay faint behind the title and the facts
        };
        Unloaded += (_, _) =>
        {
            _l.Changed -= OnChanged; _l.GameChanged -= OnGame; _l.ArtChanged -= RefreshBanner; _l.NoticesChanged -= OnChanged; _status.Stop(); _agenda.Stop(); _glass?.Stop(); PackBanner.Source = null; ProgressCloud.Source = null;
            if (_flyout != null) _flyout.IsOpen = false;
            if (ReferenceEquals(LivingField.NextAction, PlayButton)) LivingField.NextAction = null;
            LivingField.Quiet.Remove(Hero);
        };
        // Players online: only asked while the window is in front, once every 90 s. A hidden launcher does not poll the network.
        _status.Tick += (_, _) =>
        {
            var window = Window.GetWindow(this);
            if (window is { IsActive: true, WindowState: not WindowState.Minimized } && !_l.Game.Busy) _ = _l.RefreshStatusAsync();
        };
        _agenda.Tick += (_, _) =>
        {
            var window = Window.GetWindow(this);
            if (window is { IsActive: true, WindowState: not WindowState.Minimized } && !_l.Game.Busy) _ = _l.RefreshNoticesAsync(network: false);
        };
        TrashButton.Click += async (_, _) => await TrashAsync();
        RepairButton.Click += (_, _) => ((MainWindow)Application.Current.MainWindow).AskRepair();
        SettingsButton.Click += (_, _) => OpenSettings?.Invoke();
        PlayButton.Click += async (_, _) => await _l.PrimaryActionAsync();
        OfflineButton.Click += (_, _) => ((MainWindow)Application.Current.MainWindow).ShowOfflinePrompt();
    }

    private void OnChanged() => Refresh();
    private void OnGame() => RefreshGame();

    // ---- arriving and changing ------------------------------------------------------------------------------------

    private long _entranceAt;
    private bool _entrancePending;
    private string? _shownPack;

    private List<UIElement> EntranceParts() => [RailModule, .. HeroParts(), Dock];

    /// <summary>The parts of the modpack's presentation, in reading order: what the pack is, its name (or logo), what it says, and its facts.</summary>
    private List<UIElement> HeroParts() => [Pills, PackBanner.Visibility == Visibility.Visible ? PackBanner : PackTitle, PackDescription, FactsModule];

    /// <summary>
    /// The screen arrives once, in reading order (the rail, then the modpack, then the dock, a few tens of milliseconds apart), so the
    /// eye is led from the list to the action instead of finding it all there at once.
    /// </summary>
    private void Entrance()
    {
        _entrancePending = false;
        _entranceAt = Environment.TickCount64;
        Motion.Rise(RailModule, 0, 260, 10);
        Motion.Reveal(HeroParts(), 45, 60, 260, 10);
        Motion.Rise(Dock, 260, 260, 12);
    }

    /// <summary>Another modpack was chosen: its presentation is replaced, so it settles in (quickly: choosing is something done many times) and its name tears once.</summary>
    private void OnPackChanged()
    {
        var previous = _shownPack;
        _shownPack = _l.HostId;   // another profile of the same modpack is not another modpack: only its chip changes
        if (previous == _shownPack || previous == null && (_entrancePending || Environment.TickCount64 - _entranceAt < 800)) return;   // nothing new, or the entrance is still (about to be) playing
        var parts = HeroParts();
        if (previous == null) { Motion.Reveal(parts, 35, 0, 200, 6); return; }
        var title = parts[1];
        parts.Remove(title);
        Motion.Reveal(parts, 35, 0, 200, 6);
        Motion.Tear(title);
    }

    private string? _bannerPath;
    private int _bannerGeneration;

    /// <summary>The modpack's logo replaces the dotted name when there is one. Decoded at 700 px; the name stays as the accessible label.</summary>
    private async void RefreshBanner()
    {
        var wanted = _l.Art?.Banner;
        if (wanted == _bannerPath && (wanted == null || PackBanner.Source != null)) return;
        _bannerPath = wanted;
        var generation = ++_bannerGeneration;
        if (wanted == null) { PackBanner.Source = null; PackBanner.Visibility = Visibility.Collapsed; PackTitle.Visibility = Visibility.Visible; return; }
        var image = await Task.Run(() => ScreenshotViewer.Decode(wanted, 700));
        if (generation != _bannerGeneration || image == null) return;
        PackBanner.Source = image;
        System.Windows.Automation.AutomationProperties.SetName(PackBanner, _l.Host?.Name ?? "Modpack");
        var appearing = PackBanner.Visibility != Visibility.Visible;
        PackBanner.Visibility = Visibility.Visible;
        PackTitle.Visibility = Visibility.Collapsed;
        if (appearing) Motion.Rise(PackBanner, 0, 240, 6);   // the logo replaces the dotted name: it fades in, the name does not just vanish
    }

    private void Refresh()
    {
        RebuildRail();
        // What the screen is about is the modpack picked in the list (the host); what plays, and what its facts and buttons are about, is the
        // modpack selected, which is one of the host's profiles when it has some.
        var host = _l.Host;
        var pack = _l.Selected;
        PackTitle.Text = host?.Name ?? "Conectando con el motor";
        var described = host?.Profiles?.List.FirstOrDefault(p => p.Id == pack?.Id && !p.Self)?.Description;
        PackDescription.Text = host == null || pack == null ? ""
            : !string.IsNullOrWhiteSpace(described) ? described
            : string.IsNullOrWhiteSpace(host.Description) ? $"Minecraft {pack.MinecraftVersion}" : host.Description;

        // The chip stays where it is while nothing about the profiles changes: taking it out of the row and putting it back (the engine's news
        // arrive all the time) would close a flyout that is open, which hangs from it.
        var chip = pack != null && host?.Profiles is { } profiles ? ProfileChipFor(host, profiles) : null;
        var news = NewsPill();
        var bubble = BubbleIcon();
        for (var i = Pills.Children.Count - 1; i >= 0; i--)
            if (!ReferenceEquals(Pills.Children[i], chip) && !ReferenceEquals(Pills.Children[i], news) && !ReferenceEquals(Pills.Children[i], bubble)) Pills.Children.RemoveAt(i);
        if (pack != null)
        {
            var pills = new List<UIElement> { Fmt.Pill(pack.MinecraftVersion), Fmt.Pill($"v{pack.Version}") };
            if (host?.MainServer == true || pack.MainServer) pills.Add(Fmt.Pill("PRINCIPAL", Fmt.Res("AccentInkBrush"), Fmt.Res("AccentBrush")));
            if (pack.Whitelist) pills.Add(Fmt.Pill("WHITELIST", Fmt.Res("WarnBrush")));
            for (var i = 0; i < pills.Count; i++) Pills.Children.Insert(i, pills[i]);
            if (chip != null && !Pills.Children.Contains(chip)) Pills.Children.Add(chip);
        }
        if (!Pills.Children.Contains(news)) Pills.Children.Add(news);
        if (!Pills.Children.Contains(bubble)) Pills.Children.Add(bubble);
        RefreshNoticeBits(news, bubble);

        RefreshFacts();
        RefreshAccount();
        RefreshGame();   // it ends by looking at what stands in the way of playing (maintenance, date, retired): RefreshAccess
        OnPackChanged();
    }

    // ---- avisos of this modpack ------------------------------------------------------------------------------------------

    private Button? _newsPill;
    private NoticeIconButton? _bubbleIcon;

    /// <summary>"NOVEDADES ↗": the link the author gave this modpack (or the general one), in the row of what the modpack is.</summary>
    private Button NewsPill()
    {
        if (_newsPill != null) return _newsPill;
        var pill = Fmt.Pill("NOVEDADES  ↗", Fmt.Res("PaperBrush"));
        pill.Margin = new Thickness(0);
        var button = new Button { Style = (Style)FindResource("BareButton"), Content = pill, Margin = new Thickness(0, 0, 8, 6), Visibility = Visibility.Collapsed, Cursor = System.Windows.Input.Cursors.Hand };
        System.Windows.Automation.AutomationProperties.SetName(button, "Novedades de este modpack");
        button.Click += (_, _) =>
        {
            if (_l.NovedadesFor(_l.Selected?.Id) is { } url && Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps)
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri.ToString()) { UseShellExecute = true }); } catch (Exception) { }
        };
        return _newsPill = button;
    }

    /// <summary>The speech bubble: this modpack's notices. Only there when the modpack has some; the badge counts the unread ones.</summary>
    private NoticeIconButton BubbleIcon()
    {
        if (_bubbleIcon != null) return _bubbleIcon;
        var icon = new NoticeIconButton(NoticeLook.Bubble, "Avisos de este modpack", 30) { Margin = new Thickness(0, -1, 8, 5), Visibility = Visibility.Collapsed };
        icon.Clicked += () => ((MainWindow)Application.Current.MainWindow).ShowNotices(general: false);
        return _bubbleIcon = icon;
    }

    private void RefreshNoticeBits(Button news, NoticeIconButton bubble)
    {
        var id = _l.Selected?.Id;
        var link = _l.NovedadesFor(id);
        news.Visibility = link != null ? Visibility.Visible : Visibility.Collapsed;
        var mine = _l.NoticesOf(id).ToList();
        var appearing = mine.Count > 0 && bubble.Visibility != Visibility.Visible;
        bubble.Visibility = mine.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        bubble.Set(mine.Count(NoticeLook.Unread), NoticeLook.BadgeBrush(mine), mine.Count > 0);
        if (appearing) Motion.Pop(bubble, new Point(0.5, 0.5), 220, 0.8);
    }

    /// <summary>A modpack card and the three brushes it paints itself with (its own, so choosing another modpack can turn them over smoothly).</summary>
    private sealed record RailCard(string Id, Button Card, SolidColorBrush Back, SolidColorBrush NameInk, SolidColorBrush MetaInk);
    private readonly List<RailCard> _cards = [];

    private static Color ColorOf(string key) => (Color)Application.Current.FindResource(key);

    /// <summary>The chosen card is paper-white with dark text, the others are clear with light text. Animated when another one is chosen.</summary>
    private static void Paint(RailCard card, bool on, bool animate)
    {
        var ms = animate ? 180 : 0;
        // the "off" fill is the paper colour at zero opacity, so it fades in and out through the paper colour and never through a grey
        Motion.Tint(card.Back, on ? ColorOf("PaperColor") : Color.FromArgb(0, 0xF1, 0xEF, 0xE8), ms);
        Motion.Tint(card.NameInk, on ? ColorOf("BgColor") : ColorOf("PaperColor"), ms);
        Motion.Tint(card.MetaInk, on ? ColorOf("PaperInkColor") : ColorOf("Paper3Color"), ms);
    }

    private void RebuildRail()
    {
        var everyServer = _l.Distro?.Servers ?? [];
        // a modpack that is another one's profile is shown inside that one, not on its own
        var servers = everyServer.Where(s => s.ProfileOf == null).ToList();
        var key = string.Join("|", servers.Select(s => $"{s.Id}:{s.Name}:{PlayingLabel(s, everyServer)}:{UnreadDot(s.Id) != null}"));
        if (key == _railKey)
        {
            // the same cards with another one chosen: nothing is rebuilt, the paper fill moves over
            foreach (var card in _cards) Paint(card, card.Id == _l.HostId, animate: true);
            return;
        }
        _railKey = key;

        RailCount.Text = servers.Count.ToString();
        Rail.Children.Clear();
        _cards.Clear();
        foreach (var server in servers)
        {
            var back = new SolidColorBrush(); var nameInk = new SolidColorBrush(); var metaInk = new SolidColorBrush();
            var name = new TextBlock { Text = server.Name, FontWeight = FontWeights.SemiBold, FontSize = 14, TextTrimming = TextTrimming.CharacterEllipsis, Foreground = nameInk };
            var meta = new TextBlock
            {
                Text = PlayingLabel(server, everyServer),
                Style = (Style)FindResource("CaptionText"), TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 3, 0, 0),
                Foreground = metaInk
            };
            var text = new StackPanel { Children = { name, meta } };
            object content = text;
            if (UnreadDot(server.Id) is { } dotBrush)
            {
                // something to read in this modpack: a small dot of the colour of its most serious notice
                var dot = new System.Windows.Shapes.Ellipse { Width = 8, Height = 8, Fill = dotBrush, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(8, 6, 2, 0) };
                var row = new Grid();
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                row.Children.Add(text); Grid.SetColumn(dot, 1); row.Children.Add(dot);
                content = row;
            }
            var card = new Button
            {
                Style = (Style)FindResource("PackCard"), Margin = new Thickness(0, 0, 0, 6), Tag = server.Id,
                Background = back,
                Content = content
            };
            System.Windows.Automation.AutomationProperties.SetName(card, server.Name);
            card.Click += async (_, _) => await _l.SelectAsync(server.Id);
            Rail.Children.Add(card);
            var entry = new RailCard(server.Id, card, back, nameInk, metaInk);
            _cards.Add(entry);
            Paint(entry, server.Id == _l.HostId, animate: false);
        }
    }

    /// <summary>"1.21.11  v1.2.1  ·  Lite": the version of what plays when this modpack is picked, and the profile it is when it has some.</summary>
    private string PlayingLabel(Modpack server, List<Modpack> everyServer)
    {
        var playingId = _l.PlayingIn(server.Id);
        var playing = everyServer.FirstOrDefault(s => s.Id == playingId) ?? server;
        var profile = server.Profiles?.List.FirstOrDefault(p => p.Id == playingId);
        var access = _l.Access(playingId);
        var stop = access.State switch { "retired" => "  ·  RETIRADO", "upcoming" => "  ·  PRÓXIMAMENTE", "maintenance" when access.Allowed != true => "  ·  MANTENIMIENTO", _ => "" };
        return $"{playing.MinecraftVersion}  v{playing.Version}" + (profile != null ? $"  ·  {profile.Name}" : "") + stop;
    }

    /// <summary>The colour of the most serious unread notice of a modpack (or of what plays in it), or null.</summary>
    private Brush? UnreadDot(string serverId) => NoticeLook.BadgeBrush(_l.NoticesOf(serverId).Concat(_l.NoticesOf(_l.PlayingIn(serverId))).DistinctBy(n => n.Id));

    // ---- profiles -------------------------------------------------------------------------------------------------

    /// <summary>The profile that plays when this modpack is picked in the list.</summary>
    private ProfileInfo? CurrentProfile(Modpack host) => host.Profiles?.List.FirstOrDefault(p => p.Id == _l.PlayingIn(host.Id)) ?? host.Profiles?.List.FirstOrDefault(p => p.Self);

    private Button? _chip;
    private string _chipKey = "";
    private string? _shownProfile;

    /// <summary>
    /// "PERFIL  LITE  v": one small chip in the row of what the modpack is, so profiles take no room of their own. The same chip is kept
    /// while nothing about the profiles changes (the engine's news arrive often), or an open flyout would lose the thing it hangs from.
    /// </summary>
    private Button ProfileChipFor(Modpack pack, ProfilesInfo profiles)
    {
        var current = CurrentProfile(pack)!;
        var key = $"{pack.Id}|{current.Id}|{string.Join(",", profiles.List.Select(p => p.Name))}";
        if (_chip != null && key == _chipKey) return _chip;

        var label = new TextBlock { Text = current.Name.ToUpperInvariant(), Style = (Style)FindResource("LabelText"), FontSize = 11 };
        label.SetResourceReference(TextBlock.ForegroundProperty, "AccentBrush");
        var pill = new Border { Style = (Style)FindResource("Pill"), Padding = new Thickness(11, 3, 10, 3) };
        pill.SetResourceReference(Border.BorderBrushProperty, "AccentBrush");
        pill.SetResourceReference(Border.BackgroundProperty, "AccentSoftBrush");
        pill.Child = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Children =
            {
                new TextBlock { Text = "PERFIL", Style = (Style)FindResource("LabelText"), FontSize = 11, Foreground = Fmt.Res("Paper2Brush"), Margin = new Thickness(0, 0, 8, 0) },
                label,
                new TextBlock { Text = "", FontFamily = new FontFamily("Segoe MDL2 Assets"), FontSize = 8, Foreground = Fmt.Res("Paper2Brush"), Margin = new Thickness(8, 1, 0, 0), VerticalAlignment = VerticalAlignment.Center }
            }
        };
        var chip = new Button { Style = (Style)FindResource("BareButton"), Content = pill, Margin = new Thickness(0, 0, 8, 6) };
        System.Windows.Automation.AutomationProperties.SetName(chip, $"Perfil: {current.Name}");
        chip.Click += (_, _) => ToggleProfiles(chip, pack, profiles);

        // another profile than the one shown a moment ago: the name tears once, like a modpack's does when another is chosen
        var shown = _shownProfile;
        _shownProfile = key;
        if (shown != null && shown.StartsWith(pack.Id + "|") && shown != key) Motion.WhenLoaded(chip, () => Motion.Tear(label));

        _chip = chip; _chipKey = key;
        return chip;
    }

    private Popup? _flyout;
    private long _flyoutClosedAt;

    private void ToggleProfiles(Button anchor, Modpack pack, ProfilesInfo profiles)
    {
        // the click that closes an open flyout is the click on its own chip: it must not open it again
        if (_flyout is { IsOpen: true }) { CloseFlyout(); return; }
        if (Environment.TickCount64 - _flyoutClosedAt < 220) return;

        var items = new List<UIElement>();
        var list = new StackPanel();
        var heading = new StackPanel { Margin = new Thickness(8, 4, 8, 12) };
        heading.Children.Add(new TextBlock { Text = "PERFIL", Style = (Style)FindResource("LabelText") });
        heading.Children.Add(new TextBlock { Text = "Cada perfil es una versión aparte, con sus propios mods, mundos y ajustes.", Style = (Style)FindResource("CaptionText"), Margin = new Thickness(0, 5, 0, 0), TextWrapping = TextWrapping.Wrap });
        list.Children.Add(heading); items.Add(heading);
        var playing = _l.PlayingIn(pack.Id);
        foreach (var profile in profiles.List)
        {
            var item = ProfileItem(profile, profile.Id == playing, profile.Id == profiles.Recommended, () =>
            {
                CloseFlyout();
                if (profile.Id != playing) _ = _l.ChooseProfileAsync(profile.Id);
            });
            list.Children.Add(item); items.Add(item);
        }

        var panel = new Border
        {
            Width = 372, Padding = new Thickness(10, 10, 10, 6), CornerRadius = (CornerRadius)FindResource("RadiusModule"), BorderThickness = new Thickness(1),
            Background = new SolidColorBrush(Color.FromArgb(0xF5, 0x0E, 0x0F, 0x11)), BorderBrush = Fmt.Res("HairStrongBrush"), Child = list, Opacity = 0
        };
        var popup = new Popup { AllowsTransparency = true, StaysOpen = false, PopupAnimation = PopupAnimation.None, Placement = PlacementMode.Bottom, PlacementTarget = anchor, VerticalOffset = 8, Child = panel };
        popup.Closed += (_, _) => _flyoutClosedAt = Environment.TickCount64;
        _flyout = popup;
        popup.IsOpen = true;

        // it unfolds from the chip: the panel grows from its top-left corner while its rows follow one after the other
        Motion.WhenLoaded(panel, () =>
        {
            Motion.Pop(panel, new Point(0.08, 0), 210, 0.94);
            Motion.Reveal(items, 32, 50, 200, 6);
        });
    }

    private void CloseFlyout()
    {
        if (_flyout is not { IsOpen: true } popup) return;
        if (popup.Child is UIElement child) Motion.Leave(child, () => popup.IsOpen = false, 120, -4);
        else popup.IsOpen = false;
    }

    /// <summary>One profile in the flyout: paper-white when it is the one in use (like the chosen modpack in the rail), its facts underneath.</summary>
    private Button ProfileItem(ProfileInfo profile, bool selected, bool recommended, Action chosen)
    {
        var back = new SolidColorBrush(); var nameInk = new SolidColorBrush(); var metaInk = new SolidColorBrush();
        var content = new StackPanel();
        content.Children.Add(new TextBlock { Text = profile.Name, FontWeight = FontWeights.SemiBold, FontSize = 14, TextTrimming = TextTrimming.CharacterEllipsis, Foreground = nameInk });
        if (!string.IsNullOrWhiteSpace(profile.Description))
            content.Children.Add(new TextBlock { Text = profile.Description, Style = (Style)FindResource("CaptionText"), TextWrapping = TextWrapping.Wrap, Foreground = metaInk, Margin = new Thickness(0, 3, 0, 0) });
        var facts = new List<string> { $"MINECRAFT {profile.MinecraftVersion}", $"V{profile.Version}" };
        if (profile.Ram is { } ram) facts.Add(ram.MinimumMb == ram.MaximumMb ? $"MEMORIA {Gb(ram.MaximumMb)} GB" : $"MEMORIA {Gb(ram.MinimumMb)}–{Gb(ram.MaximumMb)} GB");
        content.Children.Add(new TextBlock { Text = string.Join("  ·  ", facts), Style = (Style)FindResource("LabelText"), FontSize = 10.5, Foreground = metaInk, Margin = new Thickness(0, 7, 0, 0) });
        if (recommended)
        {
            var tag = Fmt.Pill("RECOMENDADO PARA TU PC", Fmt.Res("AccentInkBrush"), Fmt.Res("AccentBrush"));
            tag.Margin = new Thickness(0, 8, 0, 2); tag.HorizontalAlignment = HorizontalAlignment.Left;
            content.Children.Add(tag);
        }

        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.Children.Add(content);
        if (selected)
        {
            var mark = new TextBlock { Text = "", FontFamily = new FontFamily("Segoe MDL2 Assets"), FontSize = 13, Foreground = nameInk, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(10, 2, 2, 0) };
            Grid.SetColumn(mark, 1);
            row.Children.Add(mark);
        }

        var card = new Button { Style = (Style)FindResource("PackCard"), Margin = new Thickness(0, 0, 0, 6), Background = back, Content = row };
        System.Windows.Automation.AutomationProperties.SetName(card, $"Elegir perfil {profile.Name}");
        card.Click += (_, _) => chosen();
        Paint(new RailCard(profile.Id, card, back, nameInk, metaInk), selected, animate: false);
        return card;
    }

    private static string Gb(int megabytes) => (megabytes / 1024.0).ToString(megabytes % 1024 == 0 ? "0" : "0.#", System.Globalization.CultureInfo.InvariantCulture);

    private void RefreshFacts()
    {
        Facts.Children.Clear();
        var pack = _l.Pack;
        string state = pack == null ? "Comprobando" : pack.Action switch
        {
            "restore" => "Modificado",
            "update" => pack.Installed ? "Hay actualización" : "Sin instalar",
            _ => pack.Installed ? "Al día" : "Sin instalar"
        };
        Facts.Children.Add(Fact("ESTADO", state));
        Facts.Children.Add(Fact("INSTALADO", pack?.InstalledVersion is { } v ? $"v{v}" : "Ninguna"));
        Facts.Children.Add(Fact("DISPONIBLE", pack != null ? $"v{pack.RemoteVersion}" : "..."));
        var status = _l.Status;
        Facts.Children.Add(Fact("JUGADORES", status == null ? "..." : status.Online && status.Players != null ? $"{status.Players.Online}/{status.Players.Max}" : "Sin conexión"));
    }

    private StackPanel Fact(string label, string value) => new()
    {
        Margin = new Thickness(0, 0, 12, 0),
        Children =
        {
            new TextBlock { Text = label, Style = (Style)FindResource("CaptionText"), TextWrapping = TextWrapping.NoWrap },
            new TextBlock { Text = value, Style = (Style)FindResource("BodyText"), Margin = new Thickness(0, 4, 0, 0), TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis }
        }
    };

    private void RefreshAccount()
    {
        var account = _l.Account;
        AccountName.Text = account?.DisplayName ?? "Sin cuenta";
        AccountKind.Text = account == null ? "SIN SESIÓN" : account.Type switch { "microsoft" => "MICROSOFT", "offline" => "SIN CONEXIÓN", _ => "MOJANG" };
        AvatarInitial.Text = string.IsNullOrEmpty(account?.DisplayName) ? "?" : account.DisplayName[..1].ToUpperInvariant();

        // No account, or no skin to fetch: the initial is the whole avatar (an offline player has no head to show).
        // An offline player has no head at Mojang: with a skin chosen the launcher draws it itself (from the file the engine made), without it the initial stands in.
        if (account is { Type: "offline", Skin.Head: { Length: > 0 } head } && System.IO.File.Exists(head))
        {
            _avatarFor = account.Uuid + head;
            var bitmap = new BitmapImage();
            bitmap.BeginInit(); bitmap.UriSource = new Uri(head); bitmap.CacheOption = BitmapCacheOption.OnLoad; bitmap.DecodePixelWidth = 80; bitmap.EndInit(); bitmap.Freeze();
            AvatarImage.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill };
            RenderOptions.SetBitmapScalingMode(AvatarImage, BitmapScalingMode.NearestNeighbor);
            AvatarImage.Visibility = Visibility.Visible;
            return;
        }
        if (account == null || account.Type == "offline") { AvatarImage.Visibility = Visibility.Collapsed; _avatarFor = null; return; }
        if (_avatarFor == account.Uuid) return;
        _avatarFor = account.Uuid;
        try
        {
            // The classic launcher shows the head from mc-heads too. Decoded at the size it is drawn, never at full size.
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.UriSource = new Uri($"https://mc-heads.net/avatar/{account.Uuid}/80");
            bitmap.DecodePixelWidth = 80;
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.EndInit();
            void Show() { AvatarImage.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill }; AvatarImage.Visibility = Visibility.Visible; }
            if (bitmap.IsDownloading) { bitmap.DownloadCompleted += (_, _) => Show(); bitmap.DownloadFailed += (_, _) => AvatarImage.Visibility = Visibility.Collapsed; }
            else Show();
        }
        catch { AvatarImage.Visibility = Visibility.Collapsed; }
    }

    private void RefreshGame()
    {
        var game = _l.Game;
        var label = game.Phase switch
        {
            "launching" => $"INICIANDO  {game.Percent}%",
            "updating" when game.Mode == "verify" => $"VERIFICANDO  {game.Percent}%",
            "updating" => $"ACTUALIZANDO  {game.Percent}%",
            "restoring" => $"RESTAURANDO  {game.Percent}%",
            "stopping" => "DETENIENDO",
            "running" => "DETENER",
            _ when _l.Account == null => "INICIAR SESIÓN",
            _ => (_l.Pack?.Action ?? "play") switch { "update" => "ACTUALIZAR", "restore" => "RESTAURAR", _ => "JUGAR" }
        };
        PlayLabel.Text = label;
        System.Windows.Automation.AutomationProperties.SetName(PlayButton, label);
        OfflineButton.Visibility = _l.Account == null && !game.Busy && !game.Running ? Visibility.Visible : Visibility.Collapsed;

        if (game.Busy)
        {
            PlayButton.Background = Fmt.Res("Surface2Brush");
            PlayLabel.Foreground = Fmt.Res("PaperBrush");
            if (PlayFill.Visibility != Visibility.Visible) { Motion.Snap(PlayFillScale, ScaleTransform.ScaleXProperty, 0); PlayFill.Visibility = Visibility.Visible; }
            Motion.Follow(PlayFillScale, ScaleTransform.ScaleXProperty, Math.Clamp(game.Percent, 0, 100) / 100.0);   // the fill slides to each new value
            PlayButton.IsHitTestVisible = false;
        }
        else if (game.Running)
        {
            PlayButton.Background = Fmt.Res("Surface3Brush");
            PlayLabel.Foreground = Fmt.Res("DangerBrush");
            PlayFill.Visibility = Visibility.Collapsed;
            PlayButton.IsHitTestVisible = true;
        }
        else
        {
            PlayButton.ClearValue(BackgroundProperty);
            PlayLabel.SetResourceReference(TextBlock.ForegroundProperty, "AccentInkBrush");
            PlayFill.Visibility = Visibility.Collapsed;
            PlayButton.IsHitTestVisible = true;
        }

        var panelAppears = game.Busy && ProgressPanel.Visibility != Visibility.Visible;
        ProgressPanel.Visibility = game.Busy ? Visibility.Visible : Visibility.Collapsed;
        if (panelAppears)
        {
            Motion.Snap(ProgressBar, System.Windows.Controls.Primitives.RangeBase.ValueProperty, 0);
            Motion.Rise(ProgressPanel, 0, 220, 8);
            if (Art.Cloud(320) is { } cloud)
            {
                ProgressCloud.Source = cloud;
                ProgressCloud.Visibility = Visibility.Visible;
                Motion.Snap(ProgressCloudShift, TranslateTransform.XProperty, 24);
            }
        }
        else if (!game.Busy && ProgressCloud.Source != null) { ProgressCloud.Source = null; ProgressCloud.Visibility = Visibility.Collapsed; }   // the picture is let go of with the panel
        if (game.Busy)
        {
            ProgressText.Text = game.Text;
            ProgressPercent.Text = $"{game.Percent}%";
            Motion.Follow(ProgressBar, System.Windows.Controls.Primitives.RangeBase.ValueProperty, game.Percent);
            Motion.Follow(ProgressCloudShift, TranslateTransform.XProperty, 24 - 110 * Math.Clamp(game.Percent, 0, 100) / 100.0, 400);   // the cloud crosses the panel as the work advances: nothing moves on its own
            var parts = new List<string>();
            if (game.Received != null && game.Total != null) parts.Add($"{Fmt.Bytes(game.Received)} / {Fmt.Bytes(game.Total)}");
            if (game.BytesPerSecond is > 0) parts.Add($"{Fmt.Bytes(game.BytesPerSecond)}/s");
            if (game.PendingFiles is > 0) parts.Add($"{game.PendingFiles} archivos pendientes");
            ProgressDetail.Text = string.Join("   ", parts);
            ProgressDetail.Visibility = parts.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        RepairButton.Visibility = _l.Pack?.Installed == true && !game.Busy && !game.Running && !_playBlockedByRetirement ? Visibility.Visible : Visibility.Collapsed;
        RefreshAccess();
        if (_playBlocked) PlayButton.IsHitTestVisible = false;
    }

    // ---- what stands in the way of playing --------------------------------------------------------------------------------
    //
    // Maintenance and "not out yet" are a seal stamped over Play; a retired modpack is Play as broken glass. The seal drops when it appears
    // (once for that modpack and state), the glass breaks the first time this launcher sees the modpack retired, and when it stops being
    // retired the glass grows back by itself. Nothing here runs while the game is being downloaded or played: what is running is not stopped.

    private static readonly AccessInfo AllClear = new("ok", null, null, null, null, null);
    private string _accessKey = "";
    private bool _playBlockedByRetirement => _l.Access(_l.Selected?.Id).State == "retired";   // a retired modpack cannot be repaired: it cannot be played either
    private bool _playBlocked;
    private GlassButton? _glass;
    private string? _glassFor;
    private bool _regenerating;
    private FrameworkElement? _stamp;
    private string _stampKey = "";

    /// <summary>Runs when the screen has finished arriving (the logo's opening and the entrance), so a seal or a break is not spent on a screen nobody sees yet.</summary>
    private void WhenSettled(Action action)
    {
        void After()
        {
            var left = 560 - (Environment.TickCount64 - _entranceAt);
            if (left <= 0) { action(); return; }
            var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(left) };
            timer.Tick += (_, _) => { timer.Stop(); action(); };
            timer.Start();
        }
        if (_entrancePending) SplashLayer.WhenRevealing(() => Dispatcher.BeginInvoke(After));
        else After();
    }

    private static Color AccentColor() => Fmt.Res("AccentBrush") is SolidColorBrush accent ? accent.Color : Colors.HotPink;

    /// <summary>"hoy 18:00", "mañana 18:00", or "el 21 sep, 18:00": a moment in the future, in this PC's time zone.</summary>
    private static string Future(string? iso)
    {
        if (!DateTimeOffset.TryParse(iso, out var at)) return "";
        var local = at.ToLocalTime();
        var days = (local.Date - DateTime.Now.Date).Days;
        return days == 0 ? $"hoy a las {local:HH:mm}" : days == 1 ? $"mañana a las {local:HH:mm}" : $"el {local.ToString("d MMM", System.Globalization.CultureInfo.GetCultureInfo("es-ES")).ToLowerInvariant()}, {local:HH:mm}";
    }

    private void RefreshAccess()
    {
        var id = _l.Selected?.Id;
        var idle = !_l.Game.Busy && !_l.Game.Running;
        var raw = idle ? _l.Access(id) : AllClear;
        var access = raw.State is "maintenance" or "upcoming" or "retired" ? raw : AllClear;
        var installed = _l.Pack?.Installed == true;
        var blocked = Launcher.BlocksPlaying(access);
        var key = $"{id}|{access.State}|{access.Allowed}|{access.Message}|{access.Until}|{access.From}|{installed}";
        _playBlocked = blocked;
        if (key == _accessKey && !(access.State == "retired" && _glass == null)) return;
        _accessKey = key;

        // a glass that belongs to another modpack goes away (it will grow back when that one is chosen again and is no longer retired)
        if (_glass != null && _glassFor != id) DropGlass();

        // ---- the seal
        _stamp = null;
        foreach (var old in AccessLayer.Children.OfType<FrameworkElement>().Where(c => c.Tag as string == "stamp").ToList()) AccessLayer.Children.Remove(old);
        var showSeal = blocked && access.State is "maintenance" or "upcoming";
        PlayButton.Opacity = blocked ? 0.32 : 1;
        if (showSeal)
        {
            var maintenance = access.State == "maintenance";
            var sub = maintenance ? (access.Until != null ? "Vuelve " + Future(access.Until) : null) : (access.From != null ? "Disponible " + Future(access.From) : null);
            var ink = Stamp.Pick(maintenance ? Stamp.Amber : Stamp.Cream, AccentColor());
            var (frame, _) = Stamp.Make(maintenance ? "MANTENIMIENTO" : "PRÓXIMAMENTE", sub, ink);
            // in a canvas, which does not squeeze it to the button's height: with a second line the seal is taller than the button, and reaches past it
            var holder = new Canvas { Width = 340, Height = 52, Tag = "stamp", IsHitTestVisible = false };
            frame.SizeChanged += (_, e) => { Canvas.SetLeft(frame, (340 - e.NewSize.Width) / 2); Canvas.SetTop(frame, (52 - e.NewSize.Height) / 2); };
            holder.Children.Add(frame);
            AccessLayer.Children.Add(holder);
            _stamp = frame;
            var stampKey = $"{id}|{access.State}";
            if (stampKey != _stampKey)
            {
                frame.Opacity = 0;   // it drops when the screen is there to see it
                WhenSettled(() => Stamp.Slam(frame, () => Stamp.Squash(PlayHost)));
            }
            _stampKey = stampKey;
        }
        else _stampKey = "";

        // ---- the glass
        if (access.State == "retired" && id != null)
        {
            if (_glass == null || _regenerating)
            {
                if (_glass == null) { _glass = new GlassButton(340, 52, AccentColor()); AccessLayer.Children.Add(_glass); }
                _glassFor = id; _regenerating = false;
                PlayHost.Visibility = Visibility.Hidden;
                if (NativeSettings.Retired.Add(id)) { NativeSettings.SaveRetired(); var glass = _glass; glass.Opacity = 0; WhenSettled(() => { if (!ReferenceEquals(_glass, glass)) return; glass.Opacity = 1; glass.PlayBreak(); }); }
                else _glass.ShowBroken();
            }
        }
        else if (id != null && (_glass != null && _glassFor == id || NativeSettings.Retired.Contains(id)) && !_regenerating)
        {
            // it is not retired any more: the glass grows back by itself and Play is there again
            if (_glass == null) { _glass = new GlassButton(340, 52, AccentColor()); AccessLayer.Children.Add(_glass); _glass.ShowBroken(); }
            _glassFor = id; _regenerating = true;
            PlayHost.Visibility = Visibility.Hidden;
            var glass = _glass;
            NativeSettings.Retired.Remove(id); NativeSettings.SaveRetired();
            WhenSettled(() => glass.PlayRegenerate(() =>
            {
                if (!ReferenceEquals(_glass, glass)) return;
                DropGlass();
                Motion.Pop(PlayHost, new Point(0.5, 0.5), 200, 0.97, fade: false);
            }));
        }
        else if (_glass == null) PlayHost.Visibility = Visibility.Visible;

        // ---- what the author says, and the trash
        TrashButton.Visibility = access.State == "retired" && installed ? Visibility.Visible : Visibility.Collapsed;
        var note = NoteFor(access, installed);
        var noteAppears = note != null && AccessNote.Visibility != Visibility.Visible;
        AccessNote.Visibility = note != null ? Visibility.Visible : Visibility.Collapsed;
        if (note != null) AccessNoteText.Text = note;
        if (noteAppears) Motion.Rise(AccessNote, 60, 240, 8);
    }

    private void DropGlass()
    {
        if (_glass == null) return;
        _glass.Stop();
        AccessLayer.Children.Remove(_glass);
        _glass = null; _glassFor = null; _regenerating = false;
        PlayHost.Visibility = Visibility.Visible;
    }

    private static string? NoteFor(AccessInfo access, bool installed)
    {
        var lines = new List<string>();
        switch (access.State)
        {
            case "maintenance":
                lines.Add(!string.IsNullOrWhiteSpace(access.Message) ? access.Message! : "Este modpack está en mantenimiento.");
                if (access.Allowed == true) lines.Add("Tu cuenta tiene permiso para jugarlo mientras tanto." + (access.Until != null ? " Vuelve para todos " + Future(access.Until) + "." : ""));
                break;
            case "upcoming":
                lines.Add(!string.IsNullOrWhiteSpace(access.Message) ? access.Message! : "Este modpack todavía no está disponible.");
                break;
            case "retired":
                lines.Add(!string.IsNullOrWhiteSpace(access.Message) ? access.Message! : "Este modpack se retiró: ya no se puede jugar ni actualizar.");
                if (installed) lines.Add("Con la papelera lo quitas de tu PC; tus mundos y capturas se quedan si quieres.");
                break;
            default:
                return null;
        }
        return string.Join("\n", lines);
    }

    /// <summary>The trash of a retired modpack: it says what would be freed and what stays (worlds and screenshots are the player's).</summary>
    private async Task TrashAsync()
    {
        var pack = _l.Selected;
        if (pack == null) return;
        var window = (MainWindow)Application.Current.MainWindow;
        UninstallPreview preview;
        try { preview = await _l.UninstallPreviewAsync(pack.Id); }
        catch (Exception ex) { window.ShowDialog("No se pudo preparar el borrado", ex.Message, ("Entendido", null, true)); return; }
        if (!preview.Installed) { window.ShowToast("Este modpack no está instalado en tu PC."); return; }

        async Task Do(bool personal)
        {
            try { var freed = await _l.UninstallAsync(pack.Id, personal); window.ShowToast($"Listo: se liberaron {Fmt.Bytes(freed)}."); }
            catch (Exception ex) { window.ShowDialog("No se pudo quitar el modpack", ex.Message, ("Entendido", null, true)); }
        }
        var personal = preview.SavesBytes + preview.ScreenshotsBytes;
        if (personal <= 0)
        {
            window.ShowDialog($"Quitar {_l.Host?.Name ?? pack.Name} de tu PC",
                $"Se borran sus archivos del juego ({Fmt.Bytes(preview.GameBytes)}). No hay mundos ni capturas que conservar.",
                ("Cancelar", null, false), ("Quitar del PC", () => _ = Do(false), true));
            return;
        }
        window.ShowDialog($"Quitar {_l.Host?.Name ?? pack.Name} de tu PC",
            $"Se borran sus archivos del juego ({Fmt.Bytes(preview.GameBytes)}). Tus mundos ({Fmt.Bytes(preview.SavesBytes)}) y tus capturas ({Fmt.Bytes(preview.ScreenshotsBytes)}) pueden quedarse: con «Conservar mis mundos» solo se quita el juego, y con «Quitar todo» se borra también lo tuyo.",
            ("Cancelar", null, false), ("Quitar todo", () => _ = Do(true), false), ("Conservar mis mundos", () => _ = Do(false), true));
    }
}
