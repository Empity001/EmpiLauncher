using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;
using EmpiLauncher.Linux.Styles;
using Path = System.IO.Path;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;
using Visual = Avalonia.Visual;
using Brush = Avalonia.Media.IBrush;
using Shape = Avalonia.Controls.Shapes.Shape;
using EmpiLauncher.Ipc;

using System.Net.Http;

namespace EmpiLauncher.Linux.Views;

public sealed class HomeView : UserControl
{

    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private string _railKey = "";
    private string? _avatarFor;
    private readonly DispatcherTimer _status = new() { Interval = TimeSpan.FromSeconds(90) };
    // maintenance ends by itself, a modpack opens on its date: the time is looked at again every half minute (no network: what the engine already has)
    private readonly DispatcherTimer _agenda = new() { Interval = TimeSpan.FromSeconds(30) };

    public event Action? OpenSettings;

    /// <summary>Set by the window when the screen is only being dressed in another style: no entrance then.</summary>
    public bool SkipEntrance { get; init; }


    // ---- the layout (HomeView.xaml), built in code -------------------------------------------------------------------
    private const double PlayWidth = 340;
    private readonly Border RailModule, DockBar, FactsModule, AccessNote, ProgressPanel;
    private readonly Border PlayClipUnused = new();
    private readonly TextBlock RailCount = Ui.Text("", "LabelText", null, 11);
    private readonly StackPanel Rail = new() { Margin = new Thickness(0, 0, 6, 0) };
    private readonly StackPanel Hero = new() { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 12, 24) };
    private readonly WrapPanel Pills = new() { Margin = new Thickness(0, 0, 0, 16), HorizontalAlignment = HorizontalAlignment.Left };
    private readonly Image PackBanner = new() { IsVisible = false, Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Left, MaxHeight = 190, MaxWidth = 440 };
    private readonly TextBlock PackTitle = Ui.Text("", "DisplayText", Pal.TitleInk, 46);
    private readonly TextBlock PackDescription = Ui.Text("", "BodyText", Pal.Paper2);
    private readonly TextBlock AccessNoteText = Ui.Text("", "BodyText", Pal.Paper2);
    private readonly UniformGrid Facts = new() { Columns = 4 };
    private readonly Button RepairButton;
    private readonly Image ProgressCloud = new() { Width = 230, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, -8, -16), Opacity = 0.16, IsHitTestVisible = false, Stretch = Stretch.Uniform, IsVisible = false, RenderTransform = new TranslateTransform() };
    private TranslateTransform ProgressCloudShift => (TranslateTransform)ProgressCloud.RenderTransform!;
    private readonly TextBlock ProgressPercent = Ui.Text("", "DisplayText", null, 20);
    private readonly TextBlock ProgressText = Ui.Text("", "BodyText");
    private readonly ProgressBar ProgressBar = new() { Classes = { "pill" }, Maximum = 100, Margin = new Thickness(0, 12, 0, 0) };
    private readonly TextBlock ProgressDetail = Ui.Text("", "CaptionText");
    private readonly TextBlock AvatarInitial = Ui.Text("", "DisplayText", null, 18);
    private readonly Avalonia.Controls.Shapes.Ellipse AvatarImage = new() { IsVisible = false };
    private readonly TextBlock AccountName = Ui.Text("", "BodyText");
    private readonly TextBlock AccountKind = Ui.Text("", "CaptionText");
    private readonly Button SettingsButton, TrashButton, PlayButton, OfflineButton;
    private readonly Border PlayFill = new() { HorizontalAlignment = HorizontalAlignment.Left, Width = PlayWidth, Background = Pal.Accent, IsVisible = false, RenderTransformOrigin = new RelativePoint(0, 0.5, RelativeUnit.Relative) };
    private readonly ScaleTransform PlayFillScale = new(0, 1);
    private readonly TextBlock PlayLabel = Ui.Text("", "DisplayText", Pal.PlayInk, 20);
    private readonly Grid PlayHost = new() { Width = PlayWidth, Height = 52 };
    private readonly Grid AccessLayer = new() { Width = PlayWidth, Height = 52, IsHitTestVisible = false };

    public HomeView()
    {
        Grid Row(params Control[] c) { var g = new Grid(); foreach (var x in c) g.Children.Add(x); return g; }
        // rail: the modpacks ("versiones")
        var counter = new Border { CornerRadius = Pal.PillRadius, BorderThickness = new Thickness(1), BorderBrush = Pal.Hair, Background = Pal.Tint, Padding = new Thickness(10, 3), Child = RailCount };
        var railHead = new DockPanel { Margin = new Thickness(6, 0, 10, 12) };
        DockPanel.SetDock(counter, Dock.Right);
        var versions = Ui.Text("VERSIONES", "LabelText"); versions.VerticalAlignment = VerticalAlignment.Center;
        railHead.Children.Add(counter); railHead.Children.Add(versions);
        var railScroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Focusable = false, Content = Rail };
        var railBody = new DockPanel();
        DockPanel.SetDock(railHead, Dock.Top);
        railBody.Children.Add(railHead); railBody.Children.Add(railScroll);
        RailModule = Ui.Module(railBody, new Thickness(14, 16, 10, 14));

        // the selected modpack
        PackTitle.HorizontalAlignment = HorizontalAlignment.Left; PackTitle.TextWrapping = TextWrapping.Wrap; PackTitle.TextTrimming = TextTrimming.None; PackTitle.LineHeight = 50;
        RenderOptions.SetBitmapInterpolationMode(PackBanner, BitmapInterpolationMode.HighQuality);
        PackDescription.Margin = new Thickness(0, 12, 0, 0); PackDescription.MaxWidth = 560; PackDescription.HorizontalAlignment = HorizontalAlignment.Left;
        AccessNote = Ui.Module(AccessNoteText, new Thickness(20, 14));
        AccessNote.Margin = new Thickness(0, 14, 0, 0); AccessNote.MaxWidth = 560; AccessNote.HorizontalAlignment = HorizontalAlignment.Left; AccessNote.IsVisible = false;
        FactsModule = Ui.Module(Facts, new Thickness(20, 16));
        FactsModule.Margin = new Thickness(0, 28, 0, 0); FactsModule.MaxWidth = 560; FactsModule.HorizontalAlignment = HorizontalAlignment.Left;
        RepairButton = Ui.Act("Verificar y reparar", () => MainWindow.Instance!.AskRepair(), "GhostButton", 16);
        RepairButton.Margin = new Thickness(0, 10, 0, 0); RepairButton.Padding = new Thickness(16, 7); RepairButton.HorizontalAlignment = HorizontalAlignment.Left; RepairButton.IsVisible = false;
        ToolTip.SetTip(RepairButton, "Reviso todos los archivos del modpack y vuelvo a bajar los que falten o estén dañados");
        ProgressPercent.Margin = new Thickness(12, 0, 0, 0); DockPanel.SetDock(ProgressPercent, Dock.Right);
        ProgressText.VerticalAlignment = VerticalAlignment.Center; ProgressText.TextTrimming = TextTrimming.CharacterEllipsis; ProgressText.TextWrapping = TextWrapping.NoWrap;
        ProgressDetail.Margin = new Thickness(0, 10, 0, 0); ProgressDetail.TextWrapping = TextWrapping.NoWrap;
        ProgressPanel = Ui.Module(Row(ProgressCloud, new StackPanel { Children = { new DockPanel { Children = { ProgressPercent, ProgressText } }, ProgressBar, ProgressDetail } }), new Thickness(20, 16));
        ProgressPanel.Margin = new Thickness(0, 12, 0, 0); ProgressPanel.MaxWidth = 560; ProgressPanel.HorizontalAlignment = HorizontalAlignment.Left; ProgressPanel.IsVisible = false;
        Hero.Children.Add(Pills); Hero.Children.Add(PackBanner); Hero.Children.Add(PackTitle); Hero.Children.Add(PackDescription); Hero.Children.Add(AccessNote);
        Hero.Children.Add(FactsModule); Hero.Children.Add(RepairButton); Hero.Children.Add(ProgressPanel);

        // the dock: account, settings and the main action
        var avatar = new Grid { Width = 40, Height = 40, Margin = new Thickness(4, 0, 12, 0) };
        avatar.Children.Add(new Avalonia.Controls.Shapes.Ellipse { Fill = Pal.Surface3 });
        AvatarInitial.HorizontalAlignment = HorizontalAlignment.Center; AvatarInitial.VerticalAlignment = VerticalAlignment.Center;
        avatar.Children.Add(AvatarInitial); avatar.Children.Add(AvatarImage);
        AccountName.FontWeight = FontWeight.SemiBold; AccountName.TextTrimming = TextTrimming.CharacterEllipsis; AccountName.MaxWidth = 240; AccountName.TextWrapping = TextWrapping.NoWrap;
        AccountKind.TextWrapping = TextWrapping.NoWrap;
        var who = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Children = { avatar, new StackPanel { VerticalAlignment = VerticalAlignment.Center, Children = { AccountName, AccountKind } } } };
        SettingsButton = Ui.IconBtn(Icons.Gear, "Ajustes", () => OpenSettings?.Invoke());
        Avalonia.Automation.AutomationProperties.SetName(SettingsButton, "Ajustes");
        TrashButton = Ui.IconBtn(Icons.Trash, "Quitar este modpack de mi compu", () => _ = TrashAsync(), 38, Pal.Danger);
        TrashButton.Margin = new Thickness(6, 0, 0, 0); TrashButton.IsVisible = false;
        Avalonia.Automation.AutomationProperties.SetName(TrashButton, "Quitar este modpack de mi compu");
        var tools = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 10, 0), Children = { SettingsButton, TrashButton } };

        PlayButton = new Button { Classes = { "pill" }, Padding = new Thickness(0), Height = 52, HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Stretch, ClipToBounds = true };
        Ui.Style(PlayButton, Ui.Kind.Primary);
        PlayButton.Foreground = Look.Primary.Foreground;
        PlayFill.RenderTransform = PlayFillScale;
        PlayLabel.HorizontalAlignment = HorizontalAlignment.Center; PlayLabel.VerticalAlignment = VerticalAlignment.Center;
        PlayButton.Content = Row(PlayFill, PlayLabel);
        PlayHost.Children.Add(PlayButton);
        var playStack = new Grid { Width = PlayWidth, Height = 52, Children = { PlayHost, AccessLayer } };
        var offlineLabel = Ui.Text("Iniciar sin conexión", "LabelText", Pal.Paper2, 12);
        OfflineButton = new Button { Classes = { "card" }, Background = Brushes.Transparent, Content = offlineLabel, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 8, 0, 0), Padding = new Thickness(14, 5), IsVisible = false, CornerRadius = new CornerRadius(14) };
        Avalonia.Automation.AutomationProperties.SetName(OfflineButton, "Iniciar sin conexión");
        var play = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Children = { playStack, OfflineButton } };

        var dockGrid = new Grid { ColumnDefinitions = { new ColumnDefinition(1, GridUnitType.Star), new ColumnDefinition(GridLength.Auto), new ColumnDefinition(GridLength.Auto) } };
        Grid.SetColumn(tools, 1); Grid.SetColumn(play, 2);
        dockGrid.Children.Add(who); dockGrid.Children.Add(tools); dockGrid.Children.Add(play);
        DockBar = new Border { CornerRadius = new CornerRadius(Pal.RadiusDock), Background = Pal.Dock, BorderBrush = Pal.DockEdge, BorderThickness = new Thickness(1), Padding = new Thickness(14, 12), Child = dockGrid };
        Grid.SetRow(DockBar, 1);

        var right = new Grid { RowDefinitions = { new RowDefinition(1, GridUnitType.Star), new RowDefinition(GridLength.Auto) } };
        right.Children.Add(Hero); right.Children.Add(DockBar);
        Grid.SetColumn(right, 2);
        var root = new Grid { Margin = new Thickness(24, 0, 24, 24), ColumnDefinitions = { new ColumnDefinition(300, GridUnitType.Pixel), new ColumnDefinition(20, GridUnitType.Pixel), new ColumnDefinition(1, GridUnitType.Star) } };
        root.Children.Add(RailModule); root.Children.Add(right);
        Content = root;
        // the style's corners for Jugar
        PlayButton.CornerRadius = Look.Primary.Cut == Cut.Pill ? new CornerRadius(Pal.RadiusPlay) : Look.Primary.Radius ?? new CornerRadius(Pal.RadiusPlay);
        PlayHost.ClipToBounds = true;
        InitializeBehaviour();
    }

    private void InitializeBehaviour()
    {
        DressForStyle();
        AttachedToVisualTree += (_, _) =>
        {
            _l.PrefsChanged += SyncBannerAnimation;
            _l.Changed += OnChanged; _l.GameChanged += OnGame; _l.ArtChanged += RefreshBanner; _l.NoticesChanged += OnChanged; _agenda.Start();
            // First, so what Refresh fills in below is already waiting its turn (invisible) and never flashes. While the logo's opening
            // still covers the window the parts wait hidden, and arrive the moment it uncovers them.
            if (SplashLayer.Playing)
            {
                _entrancePending = true;
                foreach (var part in EntranceParts()) part.Opacity = 0;
                SplashLayer.WhenRevealing(Entrance);
            }
            else if (!SkipEntrance) Entrance();
            else _entranceAt = Environment.TickCount64;   // rebuilt in another style: it is simply there, under the crossfade
            Refresh(); RefreshBanner(); _status.Start(); _ = _l.RefreshStatusAsync();
            LivingField.NextAction = PlayButton;   // the main action glows in the modpack's accent
            // dots stay faint behind the title and the facts: behind each of them, not the whole width of the column (the backgrounds use the room left)
            foreach (var part in QuietParts()) LivingField.Quiet.Add(part);
            LivingField.Covers.Add(RailModule); LivingField.Covers.Add(DockBar);
        };
        DetachedFromVisualTree += (_, _) => AccessDirector.Release(PlayHost);
        DetachedFromVisualTree += (_, _) =>
        {
            _bannerPlayer?.Dispose(); _bannerPlayer = null;
            _l.PrefsChanged -= SyncBannerAnimation;
            _l.Changed -= OnChanged; _l.GameChanged -= OnGame; _l.ArtChanged -= RefreshBanner; _l.NoticesChanged -= OnChanged; _status.Stop(); _agenda.Stop(); _glass?.Stop(); PackBanner.Source = null; ProgressCloud.Source = null;
            if (_flyout != null) _flyout.IsOpen = false;
            if (ReferenceEquals(LivingField.NextAction, PlayButton)) LivingField.NextAction = null;
            foreach (var part in QuietParts()) LivingField.Quiet.Remove(part);
            LivingField.Covers.Remove(RailModule); LivingField.Covers.Remove(DockBar);
        };
        // Players online: only asked while the window is in front, once every 90 s. A hidden launcher does not poll the network.
        _status.Tick += (_, _) =>
        {
            var window = TopLevel.GetTopLevel(this) as Window;
            if (window is { IsActive: true, WindowState: not WindowState.Minimized } && !_l.Game.Busy) _ = _l.RefreshStatusAsync();
        };
        _agenda.Tick += (_, _) =>
        {
            var window = TopLevel.GetTopLevel(this) as Window;
            if (window is { IsActive: true, WindowState: not WindowState.Minimized } && !_l.Game.Busy) _ = _l.RefreshNoticesAsync(network: false);
        };
        PlayButton.Click += async (_, _) => await _l.PrimaryActionAsync();
    }

    private void OnChanged() => Refresh();
    private void OnGame() => RefreshGame();

    // ---- arriving and changing ------------------------------------------------------------------------------------

    private long _entranceAt;
    private bool _entrancePending;
    private string? _shownPack;

    private Control[] QuietParts() => [Pills, PackTitle, PackBanner, PackDescription, AccessNote, FactsModule, RepairButton, ProgressPanel];

    private List<Control> EntranceParts() => [RailModule, .. HeroParts(), DockBar];

    /// <summary>The parts of the modpack's presentation, in reading order: what the pack is, its name (or logo), what it says, and its facts.</summary>
    private List<Control> HeroParts() => [Pills, PackBanner.IsVisible ? PackBanner : PackTitle, PackDescription, FactsModule];

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
        Motion.Rise(DockBar, 260, 260, 12);
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

    private FramePlayer? _bannerPlayer;

    /// <summary>The animated banner plays over the still one while it can be seen (see FramePlayer); a modpack without one, or with the switch off, keeps the still.</summary>
    private void SyncBannerAnimation()
    {
        var anim = _l.Art?.BannerAnim;
        if (anim == null || anim.Frames.Count < 2 || !FramePlayer.Wanted || PackBanner.IsVisible == false)
        {
            if (_bannerPlayer != null) { _bannerPlayer.Dispose(); _bannerPlayer = null; if (PackBanner.IsVisible) { _bannerPath = null; RefreshBanner(); } }   // back to the still picture
            return;
        }
        if (_bannerPlayer != null && _bannerPlayer.Matches(anim)) { _bannerPlayer.Evaluate(); return; }
        _bannerPlayer?.Dispose();
        _bannerPlayer = new FramePlayer(PackBanner, anim, Math.Min(anim.Width, 700), () => FramePlayer.Wanted);
        _bannerPlayer.Start();
    }

    /// <summary>The modpack's logo replaces the dotted name when there is one. Decoded at 700 px; the name stays as the accessible label.</summary>
    private async void RefreshBanner()
    {
        var wanted = _l.Art?.Banner;
        if (wanted == _bannerPath && (wanted == null || PackBanner.Source != null)) { SyncBannerAnimation(); return; }
        _bannerPath = wanted;
        _bannerPlayer?.Dispose(); _bannerPlayer = null;
        var generation = ++_bannerGeneration;
        if (wanted == null) { PackBanner.Source = null; PackBanner.IsVisible = false; PackTitle.IsVisible = true; return; }
        var image = await Task.Run(() => Ui.Decode(wanted, 700));
        if (generation != _bannerGeneration || image == null) return;
        PackBanner.Source = image;
        Avalonia.Automation.AutomationProperties.SetName(PackBanner, _l.Host?.Name ?? "Modpack");
        var appearing = PackBanner.IsVisible == false;
        PackBanner.IsVisible = true;
        PackTitle.IsVisible = false;
        if (appearing) Motion.Rise(PackBanner, 0, 240, 6);   // the logo replaces the dotted name: it fades in, the name does not just vanish
        SyncBannerAnimation();
    }

    private bool _punk, _words, _capitals;
    private string? _titleShown;

    /// <summary>
    /// What a style changes in this view beyond its resources: Punk cuts the title out of magazines and prints the description on a black
    /// strip; Words cuts each word of the title out of the page and writes the description in italics.
    /// </summary>
    private void DressForStyle()
    {
        var style = ST.Current;
        _punk = style == "punk"; _words = style == "words"; _capitals = style == "termico";
        if (_words) { PackTitle.LineHeight = double.NaN; PackDescription.FontStyle = FontStyle.Italic; return; }
        if (!_punk) return;
        PackTitle.LineHeight = double.NaN;
        PackDescription.Background = new SolidColorBrush(Color.FromRgb(0x14, 0x12, 0x14));
        PackDescription.Foreground = Brushes.White;
        PackDescription.Padding = new Thickness(9, 4, 9, 5);
    }

    /// <summary>The modpack's name as the title (in Punk a ransom note, in Words paper cut-outs: Views/Styles). Only redone when the name changes.</summary>
    private void SetTitle(string text)
    {
        if (text == _titleShown) return;
        _titleShown = text;
        if (!_punk && !_words) { PackTitle.Text = _capitals ? text.ToUpperInvariant() : text; return; }
        PackTitle.Inlines.Clear();
        foreach (var piece in _punk ? PunkField.Ransom(text) : WordsField.KeptWords(text)) PackTitle.Inlines.Add(piece);
        Avalonia.Automation.AutomationProperties.SetName(PackTitle, text);
    }

    private void Refresh()
    {
        RebuildRail();
        // What the screen is about is the modpack picked in the list (the host); what plays, and what its facts and buttons are about, is the
        // modpack selected, which is one of the host's profiles when it has some.
        var host = _l.Host;
        var pack = _l.Selected;
        SetTitle(host?.Name ?? "Arrancando motores");
        var described = host?.Profiles?.List.FirstOrDefault(p => p.Id == pack?.Id && !p.Self)?.Description;
        var description = host == null || pack == null ? ""
            : !string.IsNullOrWhiteSpace(described) ? described
            : string.IsNullOrWhiteSpace(host.Description) ? $"Minecraft {pack.MinecraftVersion}" : host.Description;
        PackDescription.Text = description;
        if (_punk) PackDescription.IsVisible = !(description.Length == 0);   // an empty black strip would be a stray mark

        // The chip stays where it is while nothing about the profiles changes: taking it out of the row and putting it back (the engine's news
        // arrive all the time) would close a flyout that is open, which hangs from it.
        var chip = pack != null && host?.Profiles is { } profiles ? ProfileChipFor(host, profiles) : null;
        var news = NewsPill();
        var bubble = BubbleIcon();
        for (var i = Pills.Children.Count - 1; i >= 0; i--)
            if (!ReferenceEquals(Pills.Children[i], chip) && !ReferenceEquals(Pills.Children[i], news) && !ReferenceEquals(Pills.Children[i], bubble)) Pills.Children.RemoveAt(i);
        if (pack != null)
        {
            var pills = new List<Control> { Fmt.Pill(pack.MinecraftVersion), Fmt.Pill($"v{pack.Version}") };
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
        var button = new Button { Classes = { "card" }, Background = Brushes.Transparent, Padding = new Thickness(0), Content = pill, Margin = new Thickness(0, 0, 8, 6), IsVisible = false, Cursor = new Cursor(StandardCursorType.Hand) };
        Avalonia.Automation.AutomationProperties.SetName(button, "Novedades de este modpack");
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
        var icon = new NoticeIconButton(NoticeLook.Bubble, "Avisos de este modpack", 30) { Margin = new Thickness(0, -1, 8, 5), IsVisible = false };
        icon.Clicked += () => MainWindow.Instance!.ShowNotices(general: false);
        return _bubbleIcon = icon;
    }

    private void RefreshNoticeBits(Button news, NoticeIconButton bubble)
    {
        var id = _l.Selected?.Id;
        var link = _l.NovedadesFor(id);
        news.IsVisible = link != null;
        var mine = _l.NoticesOf(id).ToList();
        var appearing = mine.Count > 0 && bubble.IsVisible == false;
        bubble.IsVisible = mine.Count > 0;
        bubble.Set(mine.Count(NoticeLook.Unread), NoticeLook.BadgeBrush(mine), mine.Count > 0);
        if (appearing) Motion.Pop(bubble, RelativePoint.Center, 220, 0.8);
    }

    /// <summary>A modpack card and the three brushes it paints itself with (its own, so choosing another modpack can turn them over smoothly).</summary>
    private sealed record RailCard(string Id, Button Card, SolidColorBrush Back, SolidColorBrush NameInk, SolidColorBrush MetaInk);
    private readonly List<RailCard> _cards = [];

    private static Color ColorOf(string key) => key switch { "CardOnColor" => Pal.CardOn, "CardOnInkColor" => Pal.CardOnInk, "CardOnMetaColor" => Pal.CardOnMeta, "CardOffInkColor" => Pal.CardOffInk, _ => Pal.CardOffMeta };

    /// <summary>The chosen card is paper-white with dark text, the others are clear with light text. Animated when another one is chosen.</summary>
    private static void Paint(RailCard card, bool on, bool animate)
    {
        var ms = animate ? 180 : 0;
        // the "off" fill is the paper colour at zero opacity, so it fades in and out through the paper colour and never through a grey
        // the colours are the style's (Themes/Looks): the base style's chosen card is paper with dark ink
        var paper = ColorOf("CardOnColor");
        Motion.Tint(card.Back, on ? paper : Color.FromArgb(0, paper.R, paper.G, paper.B), ms);
        Motion.Tint(card.NameInk, on ? ColorOf("CardOnInkColor") : ColorOf("CardOffInkColor"), ms);
        Motion.Tint(card.MetaInk, on ? ColorOf("CardOnMetaColor") : ColorOf("CardOffMetaColor"), ms);
    }

    private void RebuildRail()
    {
        var everyServer = _l.Distro?.Servers ?? [];
        // a modpack that is another one's profile is shown inside that one, not on its own
        // and the main modpack is always the first one (the engine already sends it first; this keeps it so whatever arrives)
        var mainId = _l.Distro?.MainServer;
        var servers = everyServer.Where(s => s.ProfileOf == null).OrderBy(s => s.Id == mainId ? 0 : 1).ToList();
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
            var name = new TextBlock { Text = server.Name, FontWeight = FontWeight.SemiBold, FontSize = 14, TextTrimming = TextTrimming.CharacterEllipsis, Foreground = nameInk };
            var meta = new TextBlock
            {
                Text = PlayingLabel(server, everyServer),
                FontFamily = Pal.Mono, FontSize = 11.5, TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 3, 0, 0),
                Foreground = metaInk
            };
            var text = new StackPanel { Children = { name, meta } };
            object content = text;
            if (UnreadDot(server.Id) is { } dotBrush)
            {
                // something to read in this modpack: a small dot of the colour of its most serious notice
                var dot = new Avalonia.Controls.Shapes.Ellipse { Width = 8, Height = 8, Fill = dotBrush, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(8, 6, 2, 0) };
                var row = new Grid();
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                row.Children.Add(text); Grid.SetColumn(dot, 1); row.Children.Add(dot);
                content = row;
            }
            var card = new Button
            {
                Classes = { "card" }, Padding = new Thickness(14, 12), CornerRadius = new CornerRadius(Pal.RadiusTile), Margin = new Thickness(0, 0, 0, 6), Tag = server.Id,
                Background = back,
                Content = content
            };
            Avalonia.Automation.AutomationProperties.SetName(card, server.Name);
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

        var label = new TextBlock { Text = current.Name.ToUpperInvariant(), FontFamily = Pal.Mono, Foreground = Pal.Paper2, FontSize = 11 };
        label.Foreground = Ui.Res("AccentBrush");
        var pill = new Border { Background = Pal.Tint, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = Pal.PillRadius, Padding = new Thickness(11, 3, 10, 3) };
        pill.BorderBrush = Ui.Res("AccentBrush");
        pill.Background = Ui.Res("AccentSoftBrush");
        pill.Child = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Children =
            {
                new TextBlock { Text = "PERFIL", FontFamily = Pal.Mono, FontSize = 11, Foreground = Fmt.Res("Paper2Brush"), Margin = new Thickness(0, 0, 8, 0) },
                label,
                new Avalonia.Controls.Shapes.Path { Data = Icons.Chevron, Stroke = Pal.Paper2, StrokeThickness = 1.5, Width = 12, Height = 12, Stretch = Stretch.Uniform, Margin = new Thickness(8, 1, 0, 0), VerticalAlignment = VerticalAlignment.Center }
            }
        };
        var chip = new Button { Classes = { "card" }, Background = Brushes.Transparent, Padding = new Thickness(0), Content = pill, Margin = new Thickness(0, 0, 8, 6) };
        Avalonia.Automation.AutomationProperties.SetName(chip, $"Perfil: {current.Name}");
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

        var items = new List<Control>();
        var list = new StackPanel();
        var heading = new StackPanel { Margin = new Thickness(8, 4, 8, 12) };
        heading.Children.Add(new TextBlock { Text = "PERFIL", FontFamily = Pal.Mono, FontSize = 12, Foreground = Pal.Paper2 });
        heading.Children.Add(new TextBlock { Text = "Cada perfil es una versión aparte, con sus propios mods, mundos y ajustes. Escoge con cuál juegas hoy.", FontFamily = Pal.Mono, FontSize = 11.5, Foreground = Pal.Paper3, Margin = new Thickness(0, 5, 0, 0), TextWrapping = TextWrapping.Wrap });
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
            Width = 372, Padding = new Thickness(10, 10, 10, 6), CornerRadius = new CornerRadius(Pal.RadiusModule), BorderThickness = new Thickness(1),
            Background = Fmt.Res("PanelBrush"), BorderBrush = Fmt.Res("HairStrongBrush"), Child = list, Opacity = 0
        };
        var popup = new Popup { Placement = PlacementMode.Bottom, PlacementTarget = anchor, VerticalOffset = 8, IsLightDismissEnabled = true, Child = panel };
        if (anchor.Parent is Panel owner) owner.Children.Add(popup);
        popup.Closed += (_, _) => { _flyoutClosedAt = Environment.TickCount64; if (popup.Parent is Panel owner2) owner2.Children.Remove(popup); };
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
        if (popup.Child is Control child) Motion.Leave(child, () => popup.IsOpen = false, 120, -4);
        else popup.IsOpen = false;
    }

    /// <summary>One profile in the flyout: paper-white when it is the one in use (like the chosen modpack in the rail), its facts underneath.</summary>
    private Button ProfileItem(ProfileInfo profile, bool selected, bool recommended, Action chosen)
    {
        var back = new SolidColorBrush(); var nameInk = new SolidColorBrush(); var metaInk = new SolidColorBrush();
        var content = new StackPanel();
        content.Children.Add(new TextBlock { Text = profile.Name, FontWeight = FontWeight.SemiBold, FontSize = 14, TextTrimming = TextTrimming.CharacterEllipsis, Foreground = nameInk });
        if (!string.IsNullOrWhiteSpace(profile.Description))
            content.Children.Add(new TextBlock { Text = profile.Description, FontFamily = Pal.Mono, FontSize = 11.5, TextWrapping = TextWrapping.Wrap, Foreground = metaInk, Margin = new Thickness(0, 3, 0, 0) });
        var facts = new List<string> { $"MINECRAFT {profile.MinecraftVersion}", $"V{profile.Version}" };
        if (profile.Ram is { } ram) facts.Add(ram.MinimumMb == ram.MaximumMb ? $"MEMORIA {Gb(ram.MaximumMb)} GB" : $"MEMORIA {Gb(ram.MinimumMb)}–{Gb(ram.MaximumMb)} GB");
        content.Children.Add(new TextBlock { Text = string.Join("  ·  ", facts), FontFamily = Pal.Mono, FontSize = 10.5, Foreground = metaInk, Margin = new Thickness(0, 7, 0, 0) });
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
            var mark = new Avalonia.Controls.Shapes.Path { Data = Icons.Check, Stroke = nameInk, StrokeThickness = 1.8, Width = 14, Height = 14, Stretch = Stretch.Uniform, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(10, 2, 2, 0) };
            Grid.SetColumn(mark, 1);
            row.Children.Add(mark);
        }

        var card = new Button { Classes = { "card" }, Padding = new Thickness(14, 12), CornerRadius = new CornerRadius(Pal.RadiusTile), Margin = new Thickness(0, 0, 0, 6), Background = back, Content = row };
        Avalonia.Automation.AutomationProperties.SetName(card, $"Elegir perfil {profile.Name}");
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
            new TextBlock { Text = label, FontFamily = Pal.Mono, FontSize = 11.5, Foreground = Pal.Paper3, TextWrapping = TextWrapping.NoWrap },
            new TextBlock { Text = value, FontFamily = Pal.BodyFont, FontSize = 14, Foreground = Pal.Paper, Margin = new Thickness(0, 4, 0, 0), TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis }
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
            if (_avatarFor == account.Uuid + head) return;
            _avatarFor = account.Uuid + head;
            if (Ui.Decode(head, 80) is { } bitmap)
            {
                AvatarImage.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill };
                AvatarImage.IsVisible = true;
            }
            return;
        }
        if (account == null || account.Type == "offline") { AvatarImage.IsVisible = false; _avatarFor = null; return; }
        if (_avatarFor == account.Uuid) return;
        _avatarFor = account.Uuid;
        _ = LoadHeadAsync(account.Uuid);
    }

    /// <summary>The classic launcher shows the head from mc-heads too. Decoded at the size it is drawn, never at full size.</summary>
    private async Task LoadHeadAsync(string uuid)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var bytes = await http.GetByteArrayAsync($"https://mc-heads.net/avatar/{uuid}/80");
            using var stream = new MemoryStream(bytes);
            var bitmap = new Bitmap(stream);
            if (_avatarFor != uuid) return;
            AvatarImage.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill };
            AvatarImage.IsVisible = true;
        }
        catch { if (_avatarFor == uuid) AvatarImage.IsVisible = false; }
    }

    private void RefreshGame()
    {
        var game = _l.Game;
        var label = game.Phase switch
        {
            "launching" => $"INICIANDO  {game.Percent}%",
            "updating" when game.Mode == "verify" => $"VERIFICANDO  {game.Percent}%",
            "updating" when game.Mode == "java" => $"INSTALANDO JAVA  {game.Percent}%",
            "updating" => $"ACTUALIZANDO  {game.Percent}%",
            "restoring" => $"RESTAURANDO  {game.Percent}%",
            "stopping" => "DETENIENDO",
            "running" => "DETENER",
            _ when _l.Account == null => "INICIAR SESIÓN",
            _ => (_l.Pack?.Action ?? "play") switch { "update" => "ACTUALIZAR", "restore" => "RESTAURAR", _ => "JUGAR" }
        };
        label = ST.Label(label);   // a style may write it in sentence case ("Jugar")
        PlayLabel.Text = label;
        Avalonia.Automation.AutomationProperties.SetName(PlayButton, label);
        OfflineButton.IsVisible = _l.Account == null && !game.Busy && !game.Running;

        if (game.Busy)
        {
            PlayButton.Background = Fmt.Res("Surface2Brush");
            PlayLabel.Foreground = Fmt.Res("PaperBrush");
            if (PlayFill.IsVisible == false) { Motion.Snap(PlayFillScale, ScaleTransform.ScaleXProperty, 0); PlayFill.IsVisible = true; }
            Motion.Follow(PlayFillScale, ScaleTransform.ScaleXProperty, Math.Clamp(game.Percent, 0, 100) / 100.0);   // the fill slides to each new value
            PlayButton.IsHitTestVisible = false;
        }
        else if (game.Running)
        {
            PlayButton.Background = Fmt.Res("Surface3Brush");
            PlayLabel.Foreground = Fmt.Res("DangerBrush");
            PlayFill.IsVisible = false;
            PlayButton.IsHitTestVisible = true;
        }
        else
        {
            PlayButton.Background = Look.Primary.Background;
            PlayLabel.Foreground = Ui.Res("PlayInkBrush");
            PlayFill.IsVisible = false;
            PlayButton.IsHitTestVisible = true;
        }

        var panelAppears = game.Busy && ProgressPanel.IsVisible == false;
        ProgressPanel.IsVisible = game.Busy;
        if (panelAppears)
        {
            Motion.Snap(ProgressBar, Avalonia.Controls.Primitives.RangeBase.ValueProperty, 0);
            Motion.Rise(ProgressPanel, 0, 220, 8);
            if (Art.Cloud(320) is { } cloud)
            {
                ProgressCloud.Source = cloud;
                ProgressCloud.IsVisible = true;
                Motion.Snap(ProgressCloudShift, TranslateTransform.XProperty, 24);
            }
        }
        else if (!game.Busy && ProgressCloud.Source != null) { ProgressCloud.Source = null; ProgressCloud.IsVisible = false; }   // the picture is let go of with the panel
        if (game.Busy)
        {
            ProgressText.Text = game.Text;
            ProgressPercent.Text = $"{game.Percent}%";
            Motion.Follow(ProgressBar, Avalonia.Controls.Primitives.RangeBase.ValueProperty, game.Percent);
            Motion.Follow(ProgressCloudShift, TranslateTransform.XProperty, 24 - 110 * Math.Clamp(game.Percent, 0, 100) / 100.0, 400);   // the cloud crosses the panel as the work advances: nothing moves on its own
            var parts = new List<string>();
            if (game.Received != null && game.Total != null) parts.Add($"{Fmt.Bytes(game.Received)} / {Fmt.Bytes(game.Total)}");
            if (game.BytesPerSecond is > 0) parts.Add($"{Fmt.Bytes(game.BytesPerSecond)}/s");
            if (game.PendingFiles is > 0) parts.Add($"{game.PendingFiles} archivos pendientes");
            ProgressDetail.Text = string.Join("   ", parts);
            ProgressDetail.IsVisible = parts.Count > 0;
        }

        RepairButton.IsVisible = _l.Pack?.Installed == true && !game.Busy && !game.Running && !_playBlockedByRetirement;
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
    private Control? _stamp;
    private string _stampKey = "";

    /// <summary>Runs when the screen has finished arriving (the logo's opening and the entrance), so a seal or a break is not spent on a screen nobody sees yet.</summary>
    private void WhenSettled(Action action)
    {
        void After()
        {
            var left = 560 - (Environment.TickCount64 - _entranceAt);
            if (left <= 0) { action(); return; }
            var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(left) };
            timer.Tick += (_, _) => { timer.Stop(); action(); };
            timer.Start();
        }
        if (_entrancePending) SplashLayer.WhenRevealing(() => Dispatcher.UIThread.Post(After));
        else After();
    }

    private static Color AccentColor() => Fmt.Res("AccentBrush") is SolidColorBrush accent ? accent.Color : Colors.HotPink;

    /// <summary>"hoy 18:00", "mañana 18:00", or "el 21 sep, 18:00": a moment in the future, in this PC's time zone.</summary>
    private static string Future(string? iso)
    {
        if (!DateTimeOffset.TryParse(iso, out var at)) return "";
        var local = at.ToLocalTime();
        var days = (local.Date - DateTime.Now.Date).Days;
        return days == 0 ? $"hoy a las {local:HH:mm}" : days == 1 ? $"mañana a las {local:HH:mm}" : $"el {Spanish.Format(local, "d MMM").ToLowerInvariant()}, {local:HH:mm}";
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

        // a style with its own way of showing the state (Views/Access) does it there; the seal and the glass below belong to the base style
        var styled = AccessDirector.Handles(ST.Current);
        if (styled) StyledAccess(access, blocked, id);
        else
        {
        AccessDirector.Clear();

        // ---- the seal
        _stamp = null;
        foreach (var old in AccessLayer.Children.OfType<Control>().Where(c => c.Tag as string == "stamp").ToList()) AccessLayer.Children.Remove(old);
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
                PlayHost.IsVisible = false;
                if (NativeSettings.Retired.Add(id)) { NativeSettings.SaveRetired(); var glass = _glass; glass.Opacity = 0; WhenSettled(() => { if (!ReferenceEquals(_glass, glass)) return; glass.Opacity = 1; glass.PlayBreak(); }); }
                else _glass.ShowBroken();
            }
        }
        else if (id != null && (_glass != null && _glassFor == id || NativeSettings.Retired.Contains(id)) && !_regenerating)
        {
            // it is not retired any more: the glass grows back by itself and Play is there again
            if (_glass == null) { _glass = new GlassButton(340, 52, AccentColor()); AccessLayer.Children.Add(_glass); _glass.ShowBroken(); }
            _glassFor = id; _regenerating = true;
            PlayHost.IsVisible = false;
            var glass = _glass;
            NativeSettings.Retired.Remove(id); NativeSettings.SaveRetired();
            WhenSettled(() => glass.PlayRegenerate(() =>
            {
                if (!ReferenceEquals(_glass, glass)) return;
                DropGlass();
                Motion.Pop(PlayHost, RelativePoint.Center, 200, 0.97, fade: false);
            }));
        }
        else if (_glass == null) PlayHost.IsVisible = true;

        }

        // ---- what the author says, and the trash
        TrashButton.IsVisible = access.State == "retired" && installed;
        var note = NoteFor(access, installed);
        var noteAppears = note != null && AccessNote.IsVisible == false;
        AccessNote.IsVisible = note != null;
        if (note != null) AccessNoteText.Text = note;
        if (noteAppears) Motion.Rise(AccessNote, 60, 240, 8);
    }

    /// <summary>The state, the style's own way: its effect the first time (for retired, the first time ever), its last pose after that, its way back when a retired modpack returns.</summary>
    private void StyledAccess(AccessInfo access, bool blocked, string? id)
    {
        DropGlass();
        foreach (var old in AccessLayer.Children.OfType<Control>().Where(c => c.Tag as string == "stamp").ToList()) AccessLayer.Children.Remove(old);
        _stamp = null; _stampKey = "";
        PlayButton.Opacity = 1;
        PlayHost.IsVisible = true;
        var name = _l.Host?.Name ?? _l.Selected?.Name;
        var state = blocked ? access.State switch { "maintenance" => "maint", "upcoming" => "soon", "retired" => "retired", _ => null } : null;
        if (state != null && id != null)
        {
            var first = state == "retired" && NativeSettings.Retired.Add(id);
            if (first) NativeSettings.SaveRetired();
            AccessDirector.Show(PlayHost, access, state, first, id, name, WhenSettled);
        }
        else if (id != null && NativeSettings.Retired.Contains(id))
        {
            NativeSettings.Retired.Remove(id); NativeSettings.SaveRetired();
            AccessDirector.Back(PlayHost, access, id, name, WhenSettled);
        }
        else AccessDirector.Clear();
    }

    private void DropGlass()
    {
        if (_glass == null) return;
        _glass.Stop();
        AccessLayer.Children.Remove(_glass);
        _glass = null; _glassFor = null; _regenerating = false;
        PlayHost.IsVisible = true;
    }

    private static string? NoteFor(AccessInfo access, bool installed)
    {
        var lines = new List<string>();
        switch (access.State)
        {
            case "maintenance":
                lines.Add(!string.IsNullOrWhiteSpace(access.Message) ? access.Message! : "Este modpack está en mantenimiento. Le estoy haciendo sus arreglitos.");
                if (access.Allowed == true) lines.Add("Tú sí tienes permiso para jugarlo mientras tanto, shh." + (access.Until != null ? " Para todos vuelve " + Future(access.Until) + "." : ""));
                break;
            case "upcoming":
                lines.Add(!string.IsNullOrWhiteSpace(access.Message) ? access.Message! : "Este modpack todavía no sale. Ya casi, aguántame tantito.");
                break;
            case "retired":
                lines.Add(!string.IsNullOrWhiteSpace(access.Message) ? access.Message! : "Este modpack se retiró: ya no se puede jugar ni actualizar. Gracias por los buenos ratos.");
                if (installed) lines.Add("Con la papelera lo quitas de tu compu; tus mundos y capturas se quedan si quieres.");
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
        var window = MainWindow.Instance!;
        UninstallPreview preview;
        try { preview = await _l.UninstallPreviewAsync(pack.Id); }
        catch (Exception ex) { window.ShowDialog("No pude preparar el borrado", ex.Message, ("Entendido", null, true)); return; }
        if (!preview.Installed) { window.ShowToast("Este modpack ni está instalado en tu compu."); return; }

        async Task Do(bool personal)
        {
            try { var freed = await _l.UninstallAsync(pack.Id, personal); window.ShowToast($"Listo: te liberé {Fmt.Bytes(freed)}."); }
            catch (Exception ex) { window.ShowDialog("No pude quitar el modpack", ex.Message, ("Entendido", null, true)); }
        }
        var personal = preview.SavesBytes + preview.ScreenshotsBytes;
        if (personal <= 0)
        {
            window.ShowDialog($"Quitar {_l.Host?.Name ?? pack.Name} de tu PC",
                $"Se borran sus archivos del juego ({Fmt.Bytes(preview.GameBytes)}). No tiene mundos ni capturas que guardar, así que no se pierde nada tuyo.",
                ("Cancelar", null, false), ("Quitar del PC", () => _ = Do(false), true));
            return;
        }
        window.ShowDialog($"Quitar {_l.Host?.Name ?? pack.Name} de tu PC",
            $"Se borran sus archivos del juego ({Fmt.Bytes(preview.GameBytes)}). Tus mundos ({Fmt.Bytes(preview.SavesBytes)}) y tus capturas ({Fmt.Bytes(preview.ScreenshotsBytes)}) se pueden quedar: con «Conservar mis mundos» solo se va el juego, y con «Quitar todo» se va también lo tuyo, sin vuelta atrás.",
            ("Cancelar", null, false), ("Quitar todo", () => _ = Do(true), false), ("Conservar mis mundos", () => _ = Do(false), true));
    }
}
