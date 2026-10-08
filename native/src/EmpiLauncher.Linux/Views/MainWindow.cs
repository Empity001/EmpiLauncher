using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;
using EmpiLauncher.Linux.Styles;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The window: the style's background, the picture of the selected modpack, one screen at a time (sign-in, home, settings, blocked) and, over
/// them, the notices, the failure report, toasts and dialogs. It owns the engine's lifetime: it starts it when it opens and the engine follows it out.
/// The same window as the Windows launcher (MainWindow.xaml + .xaml.cs), built in code.
/// </summary>
public sealed class MainWindow : Window
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private readonly DispatcherTimer _idle = new() { Interval = TimeSpan.FromSeconds(4) };
    private readonly DispatcherTimer _toastTimer = new() { Interval = TimeSpan.FromSeconds(7) };
    private readonly DispatcherTimer _noticeTimer = new() { Interval = TimeSpan.FromMinutes(5) };
    private NoticeIconButton _mega = null!;
    private bool _popupShown;
    private DispatcherTimer? _popupTimer;
    private readonly Queue<Action> _dialogQueue = new();
    private bool _dialogOpen;
    private SettingsView? _settings;
    public static MainWindow? Instance { get; private set; }

    // the layers of MainWindow.xaml
    private readonly Grid Root = new() { RowDefinitions = new RowDefinitions("52,*") };
    private readonly StackPanel TitleLeft = new() { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
    private TextBlock ChannelLabel = null!;
    private readonly Button UpdateButton;
    private readonly ContentControl MegaHost = new() { Margin = new Thickness(0, 0, 12, 0), IsVisible = false, VerticalAlignment = VerticalAlignment.Center, IsTabStop = false };
    private readonly Button BackgroundOnlyButton;
    private readonly Border WindowButtons;
    private readonly Button MaxButton;
    private readonly Image Backdrop = new() { Stretch = Stretch.UniformToFill, IsVisible = false, IsHitTestVisible = false };
    private readonly Border BackdropScrim = new() { IsVisible = false, IsHitTestVisible = false };
    internal readonly StyleHost Field = new() { IsHitTestVisible = false };
    private readonly ContentControl ViewHost = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Stretch };
    private readonly Image StyleSnapshot = new() { IsVisible = false, IsHitTestVisible = false, Stretch = Stretch.None, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };
    private readonly AccessStage AccessFx = new() { IsHitTestVisible = false };
    private readonly Grid ViewerLayer = new();
    private readonly Border NoticePopup = new() { IsVisible = false, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 0, 24, 0), Padding = new Thickness(18, 9), Cursor = new Cursor(StandardCursorType.Hand) };
    private readonly StackPanel NoticePopupBody = new() { Orientation = Orientation.Horizontal };
    private readonly Grid NoticesLayer = new() { IsVisible = false, Background = Pal.Scrim };
    private NoticesPanel NoticesPanelView = null!;
    private readonly Grid ReportLayer = new() { IsVisible = false, Background = Pal.Scrim };
    private ReportPanel ReportPanelView = null!;
    private readonly Border Toast = new() { IsVisible = false, VerticalAlignment = VerticalAlignment.Bottom, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 110), MaxWidth = 620, Padding = new Thickness(18, 12) };
    private readonly TextBlock ToastText = Ui.Text("", "BodyText");
    private readonly Grid DialogLayer = new() { IsVisible = false, Background = Pal.Scrim };
    private readonly Border DialogPanel = new() { Width = 480, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center, Padding = new Thickness(28, 24) };
    private readonly Image DialogCloud = new() { IsVisible = false, Width = 250, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, -14, -10), Opacity = 0.3, IsHitTestVisible = false, Stretch = Stretch.Uniform, RenderTransform = new TranslateTransform() };
    private readonly TextBlock DialogTitle = Ui.Text("", "DisplayText", null, 24);
    private readonly TextBlock DialogMessage = Ui.Text("", "BodyText", Pal.Paper2);
    private readonly TextBox DialogInput = new() { Classes = { "input" }, IsVisible = false, Margin = new Thickness(0, 18, 0, 0), MaxLength = 16 };
    private readonly TextBlock DialogHint = Ui.Text("", "CaptionText");
    private Button DialogLink = null!;
    private readonly Image DialogImage = new() { IsVisible = false, Width = 90, Height = 180, Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(4, 14, 0, 0) };
    private readonly WrapPanel DialogButtons = new() { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 24, 0, 0) };
    private readonly Grid SplashHost = new() { ZIndex = 100, IsHitTestVisible = false };
    private TranslateTransform DialogCloudShift => (TranslateTransform)DialogCloud.RenderTransform!;

    public MainWindow()
    {
        Instance = this;
        Title = "Empi Launcher";
        Width = 1120; Height = 700; MinWidth = 940; MinHeight = 620;
        Background = Pal.Well;
        Foreground = Pal.Paper;
        FontSize = 14;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        WindowDecorations = WindowDecorations.None;
        try { Icon = new WindowIcon(Avalonia.Platform.AssetLoader.Open(new Uri("avares://EmpiLauncher/Assets/icon.png"))); } catch { }

        // ---- title bar (above the modpack picture and the dot field, which span both rows) ----
        var title = new Grid { Margin = new Thickness(0), ZIndex = 10, Background = Pal.Clear };
        TitleLeft.Margin = new Thickness(24, 0, 0, 0);
        UpdateButton = Ui.Act("", () => ShowUpdateDialog(), "PrimaryButton", 12);
        UpdateButton.Margin = new Thickness(12, 0, 0, 0); UpdateButton.Padding = new Thickness(12, 4); UpdateButton.IsVisible = false;
        Avalonia.Automation.AutomationProperties.SetName(UpdateButton, "Actualización disponible");
        title.Children.Add(TitleLeft);

        BackgroundOnlyButton = new Button();
        MaxButton = new Button();
        foreach (var b in new[] { BackgroundOnlyButton, MaxButton }) b.Click += (_, _) => (b.Tag as Button)?.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        WindowButtons = new Border { VerticalAlignment = VerticalAlignment.Center };
        BuildChrome();
        title.Children.Add(new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 10, 0), Children = { MegaHost, BackgroundOnlyButton, WindowButtons } });
        title.PointerPressed += OnBarPressed;
        title.DoubleTapped += (_, e) => { if (e.Source is not Button && !(e.Source is Avalonia.Visual v && v.FindAncestorOfType<Button>() != null)) ToggleMaximize(); };
        Root.Children.Add(title);

        // ---- the selected modpack's picture, then its scrim ----
        RenderOptions.SetBitmapInterpolationMode(Backdrop, BitmapInterpolationMode.LowQuality);
        BackdropScrim.Background = Pal.Backdrop;
        Grid.SetRowSpan(Backdrop, 2); Grid.SetRowSpan(BackdropScrim, 2); Grid.SetRowSpan(Field, 2);
        Root.Children.Add(Backdrop);
        Root.Children.Add(BackdropScrim);
        Root.Children.Add(Field);

        Grid.SetRow(ViewHost, 1);
        Root.Children.Add(ViewHost);
        Grid.SetRow(StyleSnapshot, 1);
        Root.Children.Add(StyleSnapshot);
        Grid.SetRowSpan(AccessFx, 2);
        Root.Children.Add(AccessFx);
        Grid.SetRowSpan(ViewerLayer, 2);
        Root.Children.Add(ViewerLayer);

        // on opening: what is waiting to be read, in a few seconds, and gone
        StyleModule(NoticePopup, Pal.Panel);
        NoticePopup.Child = NoticePopupBody;
        Avalonia.Automation.AutomationProperties.SetName(NoticePopup, "Tienes avisos sin leer. Pulsa para abrirlos");
        Grid.SetRow(NoticePopup, 1);
        Root.Children.Add(NoticePopup);

        // the notices, as a newspaper
        NoticesPanelView = NewNoticesPanel();
        NoticesLayer.Children.Add(NoticesPanelView);
        Grid.SetRowSpan(NoticesLayer, 2);
        Root.Children.Add(NoticesLayer);

        // the failure report: read it, copy it, save it, or send it to support
        ReportPanelView = NewReportPanel();
        ReportLayer.Children.Add(ReportPanelView);
        Grid.SetRowSpan(ReportLayer, 2);
        Root.Children.Add(ReportLayer);

        // toast: short messages that do not need an answer
        StyleModule(Toast, Pal.Panel);
        var toastClose = Ui.IconBtn(Icons.Close, "Cerrar aviso", HideToast, 30);
        toastClose.Margin = new Thickness(12, 0, 0, 0);
        Avalonia.Automation.AutomationProperties.SetName(toastClose, "Cerrar aviso");
        DockPanel.SetDock(toastClose, Dock.Right);
        ToastText.VerticalAlignment = VerticalAlignment.Center;
        Toast.Child = new DockPanel { Children = { toastClose, ToastText } };
        Grid.SetRow(Toast, 1);
        Root.Children.Add(Toast);

        // dialog: a question or a failure that needs an answer
        StyleModule(DialogPanel, Pal.Dialog);
        DialogTitle.TextWrapping = TextWrapping.Wrap; DialogTitle.TextTrimming = TextTrimming.None;
        DialogMessage.Margin = new Thickness(0, 12, 0, 0);
        Avalonia.Automation.AutomationProperties.SetName(DialogInput, "Nombre para jugar sin conexión");
        DialogInput.CornerRadius = new CornerRadius(Pal.RadiusInput); DialogInput.FontFamily = Pal.Mono;
        DialogHint.IsVisible = false; DialogHint.Margin = new Thickness(4, 8, 0, 0);
        DialogLink = Ui.Act("", () => { }, "GhostButton", 14);
        DialogLink.IsVisible = false; DialogLink.HorizontalAlignment = HorizontalAlignment.Left; DialogLink.Margin = new Thickness(0, 12, 0, 0);
        RenderOptions.SetBitmapInterpolationMode(DialogImage, BitmapInterpolationMode.None);
        var dialogStack = new StackPanel { Children = { DialogTitle, DialogMessage, DialogInput, DialogHint, DialogLink, DialogImage, DialogButtons } };
        DialogPanel.Child = new Grid { Children = { DialogCloud, dialogStack } };
        DialogLayer.Children.Add(DialogPanel);
        Grid.SetRowSpan(DialogLayer, 2);
        Root.Children.Add(DialogLayer);

        // the logo's opening and closing (SplashLayer): above everything, and gone the moment it is done
        Grid.SetRowSpan(SplashHost, 2);
        Root.Children.Add(SplashHost);

        // the debug panel (Ajustes > Launcher > Depuración): under the window's buttons, over everything, never in the way of the pointer
        _debug = new DebugOverlay(() => _backgroundOnly) { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 48, 12, 0), ZIndex = 100 };
        Grid.SetRow(_debug, 1);
        Root.Children.Add(_debug);
        AddResizeGrips();
        Content = Root;

        // ---- behaviour ----
        _toastTimer.Tick += (_, _) => HideToast();
        PropertyChanged += (_, e) => { if (e.Property == WindowStateProperty) OnStateChanged(); };

        // A launcher spends most of its life waiting: after a quiet moment, hand back what start-up touched.
        _idle.Tick += (_, _) => { _idle.Stop(); TrimMemory(); };
        AddHandler(PointerMovedEvent, (_, _) => { _idle.Stop(); _idle.Start(); _zenMovedAt = Environment.TickCount64; if (_backgroundOnly) ShowChrome(true); }, RoutingStrategies.Tunnel);
        Deactivated += (_, _) => { _idle.Interval = TimeSpan.FromSeconds(2); _idle.Stop(); _idle.Start(); };
        Activated += (_, _) => _idle.Interval = TimeSpan.FromSeconds(4);

        _l.Failure += failure => ShowDialog(failure.Title, failure.Message, ("Entendido", null, true));
        _l.Notice += ShowToast;
        _l.GameChanged += OnGameChanged;
        _l.ArtChanged += UpdateBackdrop;
        _l.PrefsChanged += SyncBackdropAnimation;
        _l.Changed += OnUpdateChanged;
        _l.Changed += OnAccountsChanged;
        _l.NoticesChanged += OnNoticesChanged;
        _l.GameCrashed += OnGameCrashed;
        _mega = new NoticeIconButton(NoticeLook.Megaphone, "Avisos generales");
        _mega.Clicked += () => ShowNotices(general: true);
        MegaHost.Content = _mega;
        NoticePopup.PointerReleased += (_, _) => { HideNoticePopup(); ShowNotices(general: _l.GeneralNotices.Any(NoticeLook.Unread) || !_l.NoticesOf(_l.SelectedId).Any(NoticeLook.Unread)); };
        _l.GameDone += OnGameDone;
        NoticesLayer.PointerPressed += (_, e) => { if (ReferenceEquals(e.Source, NoticesLayer)) HideNotices(); };
        AddHandler(KeyDownEvent, (_, e) =>
        {
            if (e.Key != Key.Escape) return;
            if (ReportLayer.IsVisible) { HideReport(); e.Handled = true; }
            else if (NoticesLayer.IsVisible) { HideNotices(); e.Handled = true; }
            else if (_backgroundOnly) { SetBackgroundOnly(false); e.Handled = true; }
        }, RoutingStrategies.Tunnel);
        // "ver solo el fondo": the eye toggles it; the pointer resting (5 s) or leaving the window takes even the buttons away, moving brings them back
        _zenWatch.Tick += (_, _) => WatchPointer();
        PointerExited += (_, _) => { if (_backgroundOnly) ShowChrome(false); };
        // while the window is in front, EmpiPacks is asked for news every five minutes (a few KB, and nothing when it is hidden)
        _noticeTimer.Tick += async (_, _) => { if (IsActive && WindowState != WindowState.Minimized && _l.Connected && !_l.Game.Busy) await _l.RefreshNoticesAsync(); };
        _l.AuthWindow += (open, text) =>
        {
            if (open) ShowWaiting("Esperando a Microsoft", text, () => _ = _l.CancelAuthAsync());
            else HideWaiting();
        };
        _l.EngineLost += message => ShowDialog("El launcher se quedó sin motor", message + " Vuelve a abrirlo y seguimos.", ("Cerrar", Close, true));
        _l.JavaNeeded += need => ShowDialog(
            "Falta una versión de Java",
            $"Para abrir Minecraft hace falta Java {need.SuggestedMajor} de 64 bits. ¿Te lo instalo yo?",
            ("Ahora no", () => _ = _l.DismissJavaAsync(), false),
            ("Instalar Java", () => _ = _l.InstallJavaAsync(), true));

        Opened += async (_, _) =>
        {
            // The logo opens over the window while the engine starts (SplashLayer decides whether it plays at all); the field sends its pink ring from the lit dot as it uncovers the launcher.
            if (SplashLayer.Wanted) _ = SplashLayer.OpenAsync(SplashHost, point => Field.Burst(point, true));
            // development only: EMPI_SHOT_EARLY=<ms>,<path> paints the window that long after it opened (to see the opening)
            if (Environment.GetEnvironmentVariable("EMPI_SHOT_EARLY") is { Length: > 0 } early && early.Split(',') is [var ms, var file])
                _ = Task.Run(async () => { await Task.Delay(int.Parse(ms)); Dispatcher.UIThread.Post(() => Shot(file)); });
            await StartAsync();
        };
        Closing += OnClosing;
        Closed += (_, _) => _closed = true;
    }

    /// <summary>The name, the channel and the window's buttons, as the style in use dresses them (Explorer's are Windows XP's).</summary>
    private void BuildChrome()
    {
        // the buttons the window keeps (maximise, the eye) are put into a new row each time: let go of the old row first
        if (WindowButtons.Child is Panel oldRow) oldRow.Children.Clear();
        TitleLeft.Children.Clear();
        var name = Ui.Text("EMPI", "DisplayText", Pal.ChromeInk, 19); name.FontWeight = FontWeight.ExtraBold;
        TitleLeft.Children.Add(name);
        ChannelLabel = Ui.Text("LINUX", "LabelText", null, 10.5);
        var channel = new Border { Margin = new Thickness(14, 0, 0, 0), Child = ChannelLabel };
        Look.DressPill(channel);
        channel.Padding = new Thickness(9, 2);
        TitleLeft.Children.Add(channel);
        Look.Dress(UpdateButton, Look.Primary); UpdateButton.FontSize = 11; UpdateButton.Padding = new Thickness(12, 4);
        if (UpdateButton.Content is TextBlock t) { t.FontFamily = Look.Primary.Font; t.FontSize = 11; t.FontWeight = Look.Primary.Weight; t.FontStyle = Look.Primary.Style; }
        TitleLeft.Children.Add(UpdateButton);

        Button Glyph(Geometry glyph, string tip, Action click, bool close = false, double box = 38)
        {
            Button b;
            if (Look.XpCaption)
            {
                b = new Button { Classes = { "xp-caption" }, Background = close ? XpRed : XpBlue };
                b.Content = new Avalonia.Controls.Shapes.Path { Data = glyph, Stroke = Brushes.White, StrokeThickness = 1.8, StrokeLineCap = PenLineCap.Round, StrokeJoin = PenLineJoin.Round, Stretch = Stretch.None, Width = 16, Height = 16 };
                b.Click += (_, _) => click();
                ToolTip.SetTip(b, tip);
            }
            else { b = Ui.IconBtn(glyph, tip, click, box); if (box == 38) b.Height = 28; }
            Avalonia.Automation.AutomationProperties.SetName(b, tip);
            return b;
        }
        var eye = Glyph(Icons.Eye, _backgroundOnly ? "Mostrar la interfaz" : "Ver solo el fondo", () => SetBackgroundOnly(!_backgroundOnly), box: 34);
        if (!Look.XpCaption) eye.Height = 34;
        eye.Margin = new Thickness(0, 0, 8, 0);
        CopyButton(eye, BackgroundOnlyButton);
        var max = Glyph(WindowState == WindowState.Maximized ? Icons.Restore : Icons.Maximize, "Maximizar", ToggleMaximize);
        CopyButton(max, MaxButton);
        var caption = new StackPanel { Orientation = Orientation.Horizontal, Children = { Glyph(Icons.Minimize, "Minimizar", () => WindowState = WindowState.Minimized), MaxButton, Glyph(Icons.Close, "Cerrar", Close, close: true) } };
        WindowButtons.Background = Pal.ChromeBox; WindowButtons.BorderBrush = Pal.ChromeBoxEdge; WindowButtons.BorderThickness = new Thickness(1);
        WindowButtons.CornerRadius = new CornerRadius(Pal.RadiusChromeBox); WindowButtons.Padding = new Thickness(3, 2);
        WindowButtons.Child = caption;
    }

    private static readonly IBrush XpBlue = Vertical("#7aa6fb", "#3b77f0", "#2661dc", "#1c52cd");
    private static readonly IBrush XpRed = Vertical("#eaa08a", "#dc6b4e", "#cf4a2c", "#bd3a1e");
    private static IBrush Vertical(string a, string b, string c, string d)
    {
        var g = new LinearGradientBrush { StartPoint = Rp.Rel(0, 0), EndPoint = Rp.Rel(0, 1) };
        g.GradientStops.Add(new GradientStop(Color.Parse(a), 0)); g.GradientStops.Add(new GradientStop(Color.Parse(b), 0.45)); g.GradientStops.Add(new GradientStop(Color.Parse(c), 0.55)); g.GradientStops.Add(new GradientStop(Color.Parse(d), 1));
        return g;
    }

    /// <summary>Puts <paramref name="from"/>'s look into the button the rest of the window keeps a name for; its clicks go to <paramref name="from"/>.</summary>
    private static void CopyButton(Button from, Button into)
    {
        into.Classes.Clear();
        foreach (var c in from.Classes) into.Classes.Add(c);
        var content = from.Content; from.Content = null; into.Content = content;
        into.Background = from.Background; into.Foreground = from.Foreground; into.BorderBrush = from.BorderBrush; into.BorderThickness = from.BorderThickness;
        into.Width = from.Width; into.Height = from.Height; into.Padding = from.Padding; into.CornerRadius = from.CornerRadius; into.Margin = from.Margin;
        into.Tag = from;
        if (into.Cursor == null) into.Cursor = new Cursor(StandardCursorType.Hand);
        ToolTip.SetTip(into, ToolTip.GetTip(from));
        Avalonia.Automation.AutomationProperties.SetName(into, Avalonia.Automation.AutomationProperties.GetName(from));
    }

    private static void StyleModule(Border border, IBrush fill)
    {
        border.Background = fill; border.BorderBrush = Pal.Hair; border.BorderThickness = new Thickness(1); border.CornerRadius = new CornerRadius(Pal.RadiusModule);
    }

    private NoticesPanel NewNoticesPanel()
    {
        var panel = new NoticesPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Stretch, Margin = new Thickness(28, 64, 28, 28) };
        panel.CloseRequested += HideNotices;
        return panel;
    }

    private ReportPanel NewReportPanel()
    {
        var panel = new ReportPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Stretch, Margin = new Thickness(28, 64, 28, 28) };
        panel.CloseRequested += HideReport;
        return panel;
    }

    private bool _closed, _goodbyeStarted;

    // ---- window chrome -----------------------------------------------------------------------------------------------

    private void OnBarPressed(object? sender, PointerPressedEventArgs e)
    {
        if (e.Source is Avalonia.Visual v && v.FindAncestorOfType<Button>() != null) return;
        if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed) BeginMoveDrag(e);
    }

    private void ToggleMaximize() => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;

    private void AddResizeGrips()
    {
        void Grip(WindowEdge edge, HorizontalAlignment h, VerticalAlignment v, double w, double ht, StandardCursorType cursor)
        {
            var grip = new Border { Background = Pal.Clear, Width = w, Height = ht, HorizontalAlignment = h, VerticalAlignment = v, ZIndex = 150, Cursor = new Cursor(cursor) };
            grip.PointerPressed += (_, e) => { if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed) BeginResizeDrag(edge, e); };
            Grid.SetRowSpan(grip, 2);
            Root.Children.Add(grip);
        }
        const double t = 5, c = 12;
        Grip(WindowEdge.West, HorizontalAlignment.Left, VerticalAlignment.Stretch, t, double.NaN, StandardCursorType.SizeWestEast);
        Grip(WindowEdge.East, HorizontalAlignment.Right, VerticalAlignment.Stretch, t, double.NaN, StandardCursorType.SizeWestEast);
        Grip(WindowEdge.North, HorizontalAlignment.Stretch, VerticalAlignment.Top, double.NaN, t, StandardCursorType.SizeNorthSouth);
        Grip(WindowEdge.South, HorizontalAlignment.Stretch, VerticalAlignment.Bottom, double.NaN, t, StandardCursorType.SizeNorthSouth);
        Grip(WindowEdge.NorthWest, HorizontalAlignment.Left, VerticalAlignment.Top, c, c, StandardCursorType.TopLeftCorner);
        Grip(WindowEdge.NorthEast, HorizontalAlignment.Right, VerticalAlignment.Top, c, c, StandardCursorType.TopRightCorner);
        Grip(WindowEdge.SouthWest, HorizontalAlignment.Left, VerticalAlignment.Bottom, c, c, StandardCursorType.BottomLeftCorner);
        Grip(WindowEdge.SouthEast, HorizontalAlignment.Right, VerticalAlignment.Bottom, c, c, StandardCursorType.BottomRightCorner);
    }

    // ---- start-up ----------------------------------------------------------------------------------------------------

    private async Task StartAsync()
    {
        ShowHome();
        try
        {
            await _l.StartAsync();
            _idle.Start();
            _noticeTimer.Start();
        }
        catch (Exception ex)
        {
            App.Log("engine start", ex);
            ShowDialog("No arrancó el motor", ex.Message, ("Cerrar", Close, true));
            return;
        }
        // development only: EMPI_AUTO_OFFLINE=<name> signs in as that offline player, EMPI_SCREEN=settings:<tab> opens Ajustes (see CheckForShotAsync)
        if (Environment.GetEnvironmentVariable("EMPI_AUTO_OFFLINE") is { Length: > 0 } auto && _l.Account == null) await _l.UseOfflineAsync(auto);
        ShowHome();
        _ = DevPlayAsync();
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") == "maximize") { await Task.Delay(1500); ToggleMaximize(); await Task.Delay(800); ToggleMaximize(); }
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") == "notices") { await Task.Delay(3000); ShowNotices(general: true); }
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") == "report") { await Task.Delay(1500); ShowReport(); }
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") == "skin") { await Task.Delay(1500); ShowSkinPrompt(); }
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") is { } screen && screen.StartsWith("settings"))
            ShowSettings(screen.Contains(':') ? screen[(screen.IndexOf(':') + 1)..] : "account");
        _ = ValidateSessionAsync();
        _ = CheckForShotAsync();
        _ = CheckUpdatesLoopAsync();
        // development only: EMPI_AUTO_UPDATE=1 takes the offered update without asking (to try the self-update against EMPI_UPDATE_URL)
        if (Environment.GetEnvironmentVariable("EMPI_AUTO_UPDATE") == "1") { await _l.CheckUpdateAsync(); if (_l.Update != null) await InstallUpdateAsync(_l.Update); }
    }

    /// <summary>
    /// The first check is the moment the engine is up: it is one small file from GitHub, so the "NUEVA VERSIÓN" pill is there as soon as the launcher opens
    /// (it waits for the logo to uncover the window, see OnUpdateChanged) and nobody has to go looking in Ajustes. Then every six hours while it is open.
    /// When GitHub cannot be reached (no network yet at start-up) it asks again after 15 s, 1 min and 5 min instead of waiting six hours.
    /// </summary>
    private async Task CheckUpdatesLoopAsync()
    {
        int[] retries = [15, 60, 300];
        var failed = 0;
        while (_l.Connected && !_closed)
        {
            if (await _l.CheckUpdateAsync()) { failed = 0; await Task.Delay(TimeSpan.FromHours(6)); }
            else await Task.Delay(failed < retries.Length ? TimeSpan.FromSeconds(retries[failed++]) : TimeSpan.FromHours(6));
        }
    }

    private void OnUpdateChanged()
    {
        var update = _l.Update;
        var appearing = update != null && !UpdateButton.IsVisible;
        // the answer can arrive while the logo still covers the window: the pill waits for it to lift, so its arrival is seen
        if (appearing && SplashLayer.Playing) { SplashLayer.WhenRevealing(OnUpdateChanged); return; }
        UpdateButton.IsVisible = update != null;
        if (update != null) UpdateButton.Content = new TextBlock { Text = $"NUEVA VERSIÓN {update.Version}", FontFamily = Pal.Mono, FontSize = 11 };
        if (appearing)
        {
            Motion.Pop(UpdateButton, new RelativePoint(0, 0.5, RelativeUnit.Relative), 240, 0.9);   // news: it arrives, it does not just appear
            ShowUpdateDialog();   // and it is announced right away, not just left as a pill someone has to notice
        }
    }

    /// <summary>The question "install the new version now?" (also reachable from the About tab).</summary>
    public void ShowUpdateDialog()
    {
        var update = _l.Update;
        if (update == null) return;
        if (_l.Game.Running || _l.Game.Busy)
        {
            ShowDialog($"Empi Launcher {update.Version}", "Hay versión nueva del launcher. Se instala en cuanto cierres Minecraft y no haya nada descargándose.", ("Entendido", null, true));
            return;
        }
        var size = update.Size is > 0 ? $" (unos {Math.Max(1, update.Size.Value / 1048576)} MB)" : "";
        ShowDialog($"Empi Launcher {update.Version}",
            $"¡Salió versión nueva! Tú tienes la {update.Current}. Se baja{size}, la reviso y se instala solita: el launcher se cierra un momentito y se vuelve a abrir. Tus cuentas, mods y ajustes se quedan igualitos.",
            ("Más tarde", null, false),
            ("Actualizar ahora", () => _ = InstallUpdateAsync(update), true));
    }

    /// <summary>Downloads the new version while a dialog shows the progress; the launcher closes once the update is being put in place.</summary>
    private async Task InstallUpdateAsync(UpdateInfo update)
    {
        void Progress(long got, long total)
        {
            SetWaitingText(total > 0
                ? $"Descargando la versión {update.Version}: {got * 100 / total} %  ({got / 1048576} de {total / 1048576} MB)"
                : $"Descargando la versión {update.Version}: {got / 1048576} MB");
            if (total > 0) SetWaitingProgress((double)got / total);
        }
        _l.UpdateProgress += Progress;
        ShowWaiting("Actualizando Empi Launcher", $"Descargando la versión {update.Version}…", () => _ = _l.CancelUpdateAsync());
        try
        {
            if (await _l.InstallUpdateAsync())
            {
                SetWaitingText("Instalando… en unos segundos el launcher se abre solito.");
                await Task.Delay(400);
                _exiting = true;
                Close();
            }
        }
        catch (EngineException ex) when (ex.Code == "cancelled") { HideWaiting(); }
        catch (Exception ex)
        {
            HideWaiting();
            ShowDialog("No se pudo actualizar", ex.Message + " Si quieres, baja el paquete desde la página de la versión y listo.",
                ("Cerrar", null, false),
                ("Abrir la descarga", () => { if (update.Page != null) OpenUrl(update.Page); }, true));
        }
        finally { _l.UpdateProgress -= Progress; }
    }

    internal static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo("xdg-open", url) { UseShellExecute = false }); } catch (Exception) { }
    }

    /// <summary>Renews the saved Microsoft session in the background; if it cannot be renewed the player is asked to sign in again.</summary>
    private async Task ValidateSessionAsync()
    {
        var removed = await _l.ValidateSessionAsync();
        if (removed != null)
            ShowDialog("Se venció tu sesión", $"No pude renovar la sesión de {removed}. Vuelve a iniciar sesión y a jugar.",
                ("Más tarde", null, false), ("Iniciar sesión", () => _ = _l.LoginAsync(), true));
    }

    /// <summary>Development only: EMPI_AUTO_PLAY=1 picks EMPI_SELECT (a modpack id), lets Java install by itself and presses Jugar; the game session is printed to stderr.</summary>
    private async Task DevPlayAsync()
    {
        if (Environment.GetEnvironmentVariable("EMPI_AUTO_PLAY") != "1") return;
        var last = "";
        _l.GameChanged += () => { var line = $"[game] {_l.Game.Phase} {_l.Game.Mode} {_l.Game.Percent}% {_l.Game.Text}"; if (line != last) { last = line; Console.Error.WriteLine(line); } };
        _l.Failure += f => Console.Error.WriteLine($"[failure] {f.Code}: {f.Title} - {f.Message}");
        _l.Notice += n => Console.Error.WriteLine($"[notice] {n}");
        if (Environment.GetEnvironmentVariable("EMPI_SELECT") is { Length: > 0 } id) await _l.SelectAsync(id);
        await _l.SetAutoJavaAsync(true);
        await _l.PrimaryActionAsync();
    }

    /// <summary>Development only: EMPI_SHOT=/path.png paints the window to a file a few seconds after it opens (EMPI_SHOT_DELAY ms; EMPI_SHOT_EXIT=1 closes it after).</summary>
    private async Task CheckForShotAsync()
    {
        var path = Environment.GetEnvironmentVariable("EMPI_SHOT");
        if (string.IsNullOrEmpty(path)) return;
        var delay = int.TryParse(Environment.GetEnvironmentVariable("EMPI_SHOT_DELAY"), out var ms) ? ms : 5000;
        await Task.Delay(delay);
        if (int.TryParse(Environment.GetEnvironmentVariable("EMPI_SHOT_EVERY"), out var every) && every > 0)
        {
            // a series: path-1.png, path-2.png... until EMPI_SHOT_COUNT
            var count = int.TryParse(Environment.GetEnvironmentVariable("EMPI_SHOT_COUNT"), out var n) ? n : 5;
            for (var i = 1; i <= count; i++) { Shot(System.IO.Path.ChangeExtension(path, null) + $"-{i}.png"); if (i < count) await Task.Delay(every); }
            if (Environment.GetEnvironmentVariable("EMPI_SHOT_EXIT") == "1") { _exiting = true; Close(); }
            return;
        }
        Shot(path);
        if (Environment.GetEnvironmentVariable("EMPI_SHOT_EXIT") == "1") { _exiting = true; Close(); }
    }

    public void Shot(string path)
    {
        var size = new PixelSize((int)Bounds.Width, (int)Bounds.Height);
        using var bitmap = new RenderTargetBitmap(size, new Vector(96, 96));
        bitmap.Render(this);
        bitmap.Save(path);
    }

    // ---- views ----------------------------------------------------------------------------------------------------

    private void ShowHome() => ShowHome(quiet: false);

    private void ShowHome(bool quiet)
    {
        if (_l.Notices?.Launcher.Blocked == true) { ShowBlocked(); return; }   // a launcher below the minimum plays nothing until it is updated
        if (_l.SignedOut) { ShowLogin(); return; }   // nobody plays until an account is chosen: "Listo" from Ajustes lands here too
        ReleaseSettings();
        var home = new HomeView { SkipEntrance = quiet };
        home.OpenSettings += () => ShowSettings();
        ViewHost.Content = home;
        UpdateBackdrop();
        ScheduleTrim();
    }

    /// <summary>The home or the sign-in screen, whichever the account decides (what the rest of the window calls "main").</summary>
    public void ShowMain() => ShowHome();

    private void ShowLogin()
    {
        ReleaseSettings();
        var login = new LoginView();
        login.OpenSettings += () => ShowSettings();
        ViewHost.Content = login;
        UpdateBackdrop();
        ScheduleTrim();
    }

    private bool? _signedOut;

    /// <summary>
    /// Who is signed in decides the screen. Going from someone to nobody (Cerrar sesión, a session that could not be renewed, the first start
    /// with no account) takes the player to the sign-in screen from wherever they are; entering an account there takes them to the home
    /// screen. Only the change is acted on: the engine's news arrive all the time, and Ajustes opened from the sign-in screen must stay open.
    /// </summary>
    private void OnAccountsChanged()
    {
        if (ViewHost.Content is BlockedView) return;
        if (_l.Config == null) return;
        var signedOut = _l.SignedOut;
        if (_signedOut == signedOut) return;
        _signedOut = signedOut;
        if (signedOut) { if (ViewHost.Content is not LoginView) ShowLogin(); }
        else if (ViewHost.Content is LoginView) ShowHome();
    }

    public void ShowSettings(string tab = "account", double? restoreOffset = null)
    {
        ReleaseSettings();
        var view = restoreOffset is { } offset ? new SettingsView(tab, offset) : new SettingsView(tab);
        view.Done += ShowHome;
        view.TabLoaded += ScheduleTrim;
        _settings = view;
        ViewHost.Content = view;
        UpdateBackdrop();
    }

    // ---- avisos --------------------------------------------------------------------------------------------------------------

    private void ShowBlocked()
    {
        ReleaseSettings();
        ViewHost.Content = new BlockedView(update: () => _ = UpdateFromBlockedAsync(), exit: Close);
        UpdateBackdrop();
        UpdateMega();
    }

    private async Task UpdateFromBlockedAsync()
    {
        if (_l.Update == null) await _l.CheckUpdateAsync();
        if (_l.Update != null) ShowUpdateDialog();
        else ShowDialog("No pude buscar actualizaciones", "Revisa tu internet y vuelve a intentarlo. También puedes bajar el paquete desde la página de versiones del launcher.", ("Entendido", null, true));
    }

    /// <summary>What avisos.json says changed: the icons, the screen (a launcher below the minimum), and, once, what is waiting to be read.</summary>
    private void OnNoticesChanged()
    {
        var blocked = _l.Notices?.Launcher.Blocked == true;
        if (blocked && ViewHost.Content is not BlockedView) { HideNotices(); ShowBlocked(); }
        else if (!blocked && ViewHost.Content is BlockedView) ShowHome();
        UpdateMega();
        if (!_popupShown && _l.Notices != null && !blocked)
        {
            _popupShown = true;
            SplashLayer.WhenRevealing(ShowNoticePopup);   // the logo's opening covers the window first
        }
    }

    private void UpdateMega()
    {
        MegaHost.IsVisible = _l.Notices != null && ViewHost.Content is not BlockedView && !(_backgroundOnly && !_chromeShown);
        var general = _l.GeneralNotices.ToList();
        _mega.Set(general.Count(NoticeLook.Unread), NoticeLook.BadgeBrush(general), general.Count > 0);
    }

    /// <summary>On opening: a small pill with what is unread (the general ones and the selected modpack's), by gravity, for five seconds.</summary>
    private void ShowNoticePopup()
    {
        var general = _l.GeneralNotices.Where(NoticeLook.Unread).ToList();
        var local = _l.NoticesOf(_l.SelectedId).Where(NoticeLook.Unread).ToList();
        if (general.Count + local.Count == 0 || ViewHost.Content is BlockedView || NoticesLayer.IsVisible) return;

        NoticePopupBody.Children.Clear();
        void Group(string glyph, List<NoticeInfo> list)
        {
            if (list.Count == 0) return;
            if (NoticePopupBody.Children.Count > 0) NoticePopupBody.Children.Add(new Border { Width = 1, Margin = new Thickness(6, 2, 18, 2), Background = Pal.HairStrong });
            NoticePopupBody.Children.Add(new Avalonia.Controls.Shapes.Path { Data = NoticeLook.GlyphOf(glyph), Stroke = Pal.Paper, StrokeThickness = 1.5, Width = 16, Height = 16, Stretch = Stretch.Uniform, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 10, 0) });
            foreach (var severity in new[] { "critical", "important", "info" })
            {
                var count = list.Count(n => n.Severity == severity);
                if (count == 0) continue;
                NoticePopupBody.Children.Add(new Avalonia.Controls.Shapes.Ellipse { Width = 9, Height = 9, Fill = NoticeLook.BrushOf(severity), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 5, 0) });
                NoticePopupBody.Children.Add(new TextBlock { Text = count.ToString(), FontFamily = Pal.Mono, FontSize = 12.5, Foreground = Pal.Paper, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) });
            }
        }
        Group(NoticeLook.Megaphone, general);
        Group(NoticeLook.Bubble, local);
        NoticePopup.IsVisible = true;
        Motion.Rise(NoticePopup, 0, 240, -10);   // it drops in from above, where the title bar is

        _popupTimer?.Stop();
        _popupTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _popupTimer.Tick += (_, _) => HideNoticePopup();
        _popupTimer.Start();
    }

    private void HideNoticePopup()
    {
        _popupTimer?.Stop();
        if (!NoticePopup.IsVisible) return;
        Motion.Leave(NoticePopup, () => NoticePopup.IsVisible = false, 160, -8);
    }

    /// <summary>Opens the newspaper on the general notices (the megaphone) or on those of the selected modpack (the speech bubble).</summary>
    public void ShowNotices(bool general)
    {
        HideNoticePopup();
        if (ViewHost.Content is BlockedView) return;
        NoticesPanelView.Open(general);
        NoticesLayer.IsVisible = true;
        // a panel that is not anchored to a button grows from its own centre, and the veil behind it fades in
        Motion.Animate(NoticesLayer, OpacityProperty, 0, 1, 160);
        Motion.Pop(NoticesPanelView, RelativePoint.Center, 220, 0.96, fade: false);
    }

    private void HideNotices()
    {
        if (!NoticesLayer.IsVisible) return;
        Motion.Leave(NoticesLayer, () => NoticesLayer.IsVisible = false, 140);
    }

    // ---- when the game closes with an error: the failure report ------------------------------------------------------------

    private void OnGameCrashed(GameExit exit) => ShowDialog(
        "Minecraft se cerró con un error",
        $"El juego se cerró de golpe (código {exit.Code}). Puedes ver un informe con lo necesario para entender qué pasó, guardarlo o mandármelo a soporte para que lo revise (solo si tú quieres). Si crees que le falta algún archivo al modpack, también puedo verificarlo y repararlo.",
        ("Ahora no", null, false), ("Verificar y reparar", () => AskRepair(), false), ("Ver informe", () => ShowReport(), true));

    /// <summary>The report in front of the player, to copy, save as a .txt or send to support. Nothing is sent until they press that button.</summary>
    public void ShowReport()
    {
        HideNoticePopup();
        if (ViewHost.Content is BlockedView) return;
        _ = ReportPanelView.OpenAsync();
        ReportLayer.IsVisible = true;
        Motion.Animate(ReportLayer, OpacityProperty, 0, 1, 160);
        Motion.Pop(ReportPanelView, RelativePoint.Center, 220, 0.96, fade: false);
    }

    private void HideReport()
    {
        if (!ReportLayer.IsVisible) return;
        Motion.Leave(ReportLayer, () => ReportLayer.IsVisible = false, 140);
    }

    /// <summary>"Verificar y reparar": what it does, in a sentence, before it does it (it can take a while and download).</summary>
    public void AskRepair()
    {
        if (_l.Game.Busy || _l.Game.Running) { ShowToast("Espérame tantito, estoy terminando otra cosa."); return; }
        var name = _l.Host?.Name ?? _l.Selected?.Name ?? "este modpack";
        ShowDialog($"Verificar y reparar {name}",
            "Reviso cada archivo del modpack y solo vuelvo a bajar los que falten o estén dañados. Tus mundos, capturas y ajustes ni los toco. Puede tardar unos minutos y necesita internet.",
            ("Cancelar", null, false), ("Verificar y reparar", () => _ = _l.RepairAsync(), true));
    }

    private void OnGameDone(GameDone done) => ShowToast(done.Repaired is > 0
        ? $"Listo: reparé {done.Repaired} archivo(s) del modpack."
        : "Todo en orden: el modpack está completito y sano.");

    // ---- the modpack's picture behind the home screen -------------------------------------------------------------

    private string? _backdropPath;
    private FramePlayer? _backdropPlayer;

    /// <summary>An animated background plays behind the home screen while it can be seen; otherwise its still picture stays.</summary>
    private void SyncBackdropAnimation()
    {
        var anim = ViewHost.Content is HomeView ? _l.Art?.BackgroundAnim : null;
        if (anim == null || anim.Frames.Count < 2 || !FramePlayer.Wanted || !Backdrop.IsVisible)
        {
            if (_backdropPlayer != null) { _backdropPlayer.Dispose(); _backdropPlayer = null; _backdropPath = null; UpdateBackdrop(); }   // back to the still one
            return;
        }
        if (_backdropPlayer != null && _backdropPlayer.Matches(anim)) { _backdropPlayer.Evaluate(); return; }
        _backdropPlayer?.Dispose();
        _backdropPlayer = new FramePlayer(Backdrop, anim, Math.Min(anim.Width, 960), () => FramePlayer.Wanted);
        _backdropPlayer.Start();
    }
    private int _backdropGeneration;

    /// <summary>Shows the selected modpack's background on the home screen only, decoded at 1280 px, and lets it go everywhere else.</summary>
    private async void UpdateBackdrop()
    {
        var wanted = ViewHost.Content is HomeView ? _l.Art?.Background : null;
        if (wanted == _backdropPath && (wanted == null || Backdrop.Source != null)) { SyncBackdropAnimation(); return; }
        _backdropPath = wanted;
        _backdropPlayer?.Dispose(); _backdropPlayer = null;
        var generation = ++_backdropGeneration;
        if (wanted == null)
        {
            Backdrop.Source = null;
            Backdrop.IsVisible = BackdropScrim.IsVisible = false;
            return;
        }
        var image = await Task.Run(() => Ui.Decode(wanted, 1280));
        if (generation != _backdropGeneration) return;
        Backdrop.Source = image;
        Backdrop.IsVisible = BackdropScrim.IsVisible = image != null && !_backgroundOnly;
        if (image != null) Motion.Animate(Backdrop, OpacityProperty, 0, 1, 280);   // the picture arrives when it has been decoded: it fades in instead of popping in
        SyncBackdropAnimation();
    }

    /// <summary>Whatever the player just did touched memory: give it back after a quiet moment (mouse moves postpone it).</summary>
    private void ScheduleTrim() { _idle.Stop(); _idle.Start(); }

    private void ReleaseSettings()
    {
        // The gallery holds decoded pictures: let go of them the moment the tab is left.
        _settings?.Release();
        _settings = null;
    }

    // ---- full-screen viewer ---------------------------------------------------------------------------------------

    internal void ShowViewer(ScreenshotViewer viewer)
    {
        viewer.Closed += () => ViewerLayer.Children.Clear();
        ViewerLayer.Children.Clear();
        ViewerLayer.Children.Add(viewer);
    }

    // ---- toast and dialog -----------------------------------------------------------------------------------------

    private bool _toastLeaving;

    /// <summary>
    /// A toast rises into place from below (220 ms) and goes back down (160 ms). One that is already up only changes its text and
    /// restarts its timer: nothing replays, so messages that come one after another do not make it flicker.
    /// </summary>
    public void ShowToast(string text)
    {
        ToastText.Text = text;
        var appearing = !Toast.IsVisible || _toastLeaving;
        _toastLeaving = false;
        Toast.IsVisible = true;
        if (appearing) Motion.Rise(Toast, 0, 220, 12);
        _toastTimer.Stop();
        _toastTimer.Start();
    }

    private void HideToast()
    {
        _toastTimer.Stop();
        if (!Toast.IsVisible || _toastLeaving) return;
        _toastLeaving = true;
        Motion.Leave(Toast, () => { if (!_toastLeaving) return; _toastLeaving = false; Toast.IsVisible = false; }, 160, 8);
    }

    /// <summary>Buttons are (label, action, primary). The dialog closes when any of them is pressed; dialogs queue up if several arrive.</summary>
    public void ShowDialog(string title, string message, params (string Label, Action? Action, bool Primary)[] buttons)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowDialog(title, message, buttons)); return; }
        if (_backgroundOnly) SetBackgroundOnly(false);   // something needs an answer: the interface comes back for it
        _dialogOpen = true;
        DialogTitle.Text = title;
        DialogMessage.Text = message;
        DialogPanel.Width = buttons.Length >= 3 ? 620 : 480;   // three answers side by side need more room than two
        DialogButtons.Children.Clear();
        foreach (var (label, action, primary) in buttons)
        {
            var button = Ui.Btn(label, primary ? Ui.Kind.Primary : Ui.Kind.Ghost, null, new Thickness(18, 11));
            button.Margin = new Thickness(10, 0, 0, 0);
            button.Click += (_, _) => { CloseDialog(); action?.Invoke(); };
            DialogButtons.Children.Add(button);
        }
        DialogLayer.IsHitTestVisible = true;
        DialogLayer.IsVisible = true;
        // a modal is not attached to anything, so it grows from its own centre: the backdrop fades in (160 ms) while the panel settles from 96 % (220 ms)
        Motion.Animate(DialogLayer, OpacityProperty, 0, 1, 160);
        Motion.Pop(DialogPanel, RelativePoint.Center, 220, 0.96, fade: false);
        if (DialogButtons.Children.Count > 0) ((Button)DialogButtons.Children[^1]).Focus();
    }

    private bool _waiting;

    /// <summary>A dialog that stays until the work behind it ends (HideWaiting) or the player cancels.</summary>
    public void ShowWaiting(string title, string message, Action cancel)
    {
        ShowDialog(title, message, ("Cancelar", cancel, false));
        _waiting = _dialogOpen;
        if (_waiting && Art.Cloud(360) is { } cloud)
        {
            // work is going on: a halftone cloud sits behind the text (the Publisher's activity drawer does the same) and drifts as it advances
            DialogCloud.Source = cloud;
            DialogCloud.IsVisible = true;
            Motion.Snap(DialogCloudShift, TranslateTransform.XProperty, 20);
        }
    }

    /// <summary>How far the work in the waiting dialog has got (0 to 1): the cloud drifts across, in steps that follow the download, so there is nothing moving on its own.</summary>
    public void SetWaitingProgress(double fraction)
    {
        if (_waiting && _dialogOpen) Motion.Follow(DialogCloudShift, TranslateTransform.XProperty, 20 - 80 * Math.Clamp(fraction, 0, 1), 400);
    }

    /// <summary>Changes the message of the waiting dialog while it is up (download progress).</summary>
    public void SetWaitingText(string message)
    {
        if (_waiting && _dialogOpen) DialogMessage.Text = message;
    }

    public void HideWaiting()
    {
        if (_waiting && _dialogOpen) CloseDialog();
        _waiting = false;
    }

    private int _promptGeneration;
    private string _promptName = "";
    private EventHandler<TextChangedEventArgs>? _promptChanged;
    private EventHandler<KeyEventArgs>? _promptKeys;
    private EventHandler<RoutedEventArgs>? _linkClick;

    /// <summary>
    /// Asks for the name to play with when there is no account. As the name is typed the engine says what it would become (its
    /// 12-digit id) or why it cannot be used, and the button only works for a name that can be. The rule itself lives in the engine.
    /// </summary>
    public void ShowOfflinePrompt(string initial = "", Func<Task>? done = null)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowOfflinePrompt(initial, done)); return; }
        ShowDialog("Jugar sin conexión",
            "Escoge el nombre con el que quieres jugar. Sin cuenta ni skin: nomás este nombre. Sirve para un jugador y para servidores que no revisan la cuenta.",
            ("Cancelar", null, false),
            ("Jugar sin conexión", () => _ = UseOfflineNameAsync(_promptName, done), true));
        var confirm = (Button)DialogButtons.Children[^1];
        confirm.IsEnabled = false;
        Avalonia.Automation.AutomationProperties.SetName(confirm, "Confirmar y jugar sin conexión");   // the title has the same words: this one is the button

        Avalonia.Automation.AutomationProperties.SetName(DialogInput, "Nombre para jugar sin conexión");
        DialogInput.Text = initial;
        DialogInput.IsVisible = DialogHint.IsVisible = true;
        SetHint("3 a 16 caracteres: letras, números y guion bajo.", false);

        async void Check()
        {
            var text = _promptName = (DialogInput.Text ?? "").Trim();
            var generation = ++_promptGeneration;
            if (text.Length == 0) { confirm.IsEnabled = false; SetHint("3 a 16 caracteres: letras, números y guion bajo.", false); return; }
            var preview = await _l.PreviewOfflineAsync(text);
            if (generation != _promptGeneration || !DialogInput.IsVisible) return;   // typed on, or the dialog is gone
            confirm.IsEnabled = preview.Valid;
            SetHint(preview.Valid ? $"Tu identificador sin conexión: {preview.Id}. El mismo nombre siempre da el mismo." : preview.Reason ?? "Ese nombre no se vale.", !preview.Valid);
        }
        _promptChanged = (_, _) => Check();
        _promptKeys = (_, e) => { if (e.Key == Key.Enter && confirm.IsEnabled) { e.Handled = true; confirm.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); } };
        DialogInput.TextChanged += _promptChanged;
        DialogInput.KeyDown += _promptKeys;
        DialogInput.Focus();
        DialogInput.SelectAll();
        Check();
    }

    /// <summary>
    /// The skin of the offline player. The player pastes the id (96cab59a8709ce31) or the link of a skin from NameMC: it is read as they
    /// type (or picked up from the clipboard when it holds one), downloaded once, checked, and drawn here before it is used. Nothing is
    /// searched on NameMC (its site is behind a bot check): "Abrir NameMC" only opens it in the browser to choose a skin.
    /// </summary>
    public void ShowSkinPrompt(Func<Task>? done = null)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowSkinPrompt(done)); return; }
        var hasSkin = _l.Account is { Type: "offline", Skin: not null };
        string? skinId = null;
        var buttons = new List<(string Label, Action? Action, bool Primary)> { ("Cancelar", null, false) };
        if (hasSkin) buttons.Add(("Quitar skin", () => _ = ClearSkinAsync(done), false));
        buttons.Add(("Usar esta skin", () => _ = ApplySkinAsync(skinId, done), true));
        ShowDialog("Skin para jugar sin conexión",
            "Escoge una skin en NameMC y pega aquí su id (por ejemplo 96cab59a8709ce31) o su enlace. La bajo una sola vez y la ves al abrir Minecraft.",
            buttons.ToArray());

        var confirm = (Button)DialogButtons.Children[^1];
        confirm.IsEnabled = false;
        Avalonia.Automation.AutomationProperties.SetName(confirm, "Confirmar y usar esta skin");

        DialogLink.Content = new TextBlock { Text = "Abrir NameMC para elegir una skin", FontFamily = Pal.Mono, FontSize = 12.5 };
        DialogLink.IsVisible = true;
        _linkClick = (_, _) => OpenUrl("https://namemc.com/minecraft-skins");
        DialogLink.Click += _linkClick;

        DialogInput.MaxLength = 200;
        Avalonia.Automation.AutomationProperties.SetName(DialogInput, "Id o enlace de la skin");
        DialogInput.Text = "";
        DialogInput.IsVisible = DialogHint.IsVisible = true;
        SetHint("Pega el id o el enlace de la skin.", false);

        async void Check()
        {
            var text = (DialogInput.Text ?? "").Trim();
            var generation = ++_promptGeneration;
            skinId = null;
            confirm.IsEnabled = false;
            DialogImage.IsVisible = false;
            if (text.Length == 0) { SetHint("Pega el id o el enlace de la skin.", false); return; }
            var parsed = await _l.ParseSkinAsync(text);
            if (generation != _promptGeneration || !DialogInput.IsVisible) return;
            if (!parsed.Valid) { SetHint(parsed.Reason ?? "Eso no es un id de NameMC.", false); return; }
            SetHint("Descargando la skin…", false);
            await Task.Delay(250);   // a paste arrives as one change, typing as many: fetch once it settles
            if (generation != _promptGeneration || !DialogInput.IsVisible) return;
            try
            {
                var preview = await _l.FetchSkinAsync(text);
                if (generation != _promptGeneration || !DialogInput.IsVisible) return;
                DialogImage.Source = new Bitmap(preview.Front.StartsWith("file:") ? new Uri(preview.Front).LocalPath : preview.Front);
                DialogImage.IsVisible = true;
                skinId = preview.Id;
                confirm.IsEnabled = true;
                SetHint($"Skin {preview.Id}, modelo {(preview.Model == "slim" ? "fino (Alex)" : "normal (Steve)")}. Pulsa “Usar esta skin”.", false);
            }
            catch (EngineException ex) { if (generation == _promptGeneration) SetHint(ex.Message, true); }
            catch (Exception) { if (generation == _promptGeneration) SetHint("No pude leer esa skin.", true); }
        }
        _promptChanged = (_, _) => Check();
        _promptKeys = (_, e) => { if (e.Key == Key.Enter && confirm.IsEnabled) { e.Handled = true; confirm.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); } };
        DialogInput.TextChanged += _promptChanged;
        DialogInput.KeyDown += _promptKeys;

        // A NameMC link or id already on the clipboard is picked up (only when it is one; nothing else is ever read or kept).
        _ = PickUpClipboardAsync();
        DialogInput.Focus();
        DialogInput.SelectAll();
    }

    private async Task PickUpClipboardAsync()
    {
        try
        {
            if (Clipboard == null) return;
            var copied = (await Avalonia.Input.Platform.ClipboardExtensions.TryGetTextAsync(Clipboard))?.Trim();
            if (copied is { Length: > 0 and <= 300 } && DialogInput.IsVisible && (copied.Contains("namemc.com", StringComparison.OrdinalIgnoreCase) || System.Text.RegularExpressions.Regex.IsMatch(copied, "^[0-9a-fA-F]{16}$")))
                DialogInput.Text = copied;
        }
        catch (Exception) { /* the clipboard can be busy: typing works the same */ }
    }

    private async Task ApplySkinAsync(string? id, Func<Task>? done)
    {
        if (id == null) return;
        ShowToast("Preparando la skin…");
        var error = await _l.ApplySkinAsync(id);
        if (error != null) { HideToast(); ShowDialog("No pude usar esa skin", error, ("Entendido", null, true)); return; }
        ShowToast("Skin lista: la vas a ver al abrir Minecraft.");
        if (done != null) await done();
    }

    private async Task ClearSkinAsync(Func<Task>? done)
    {
        await _l.ClearSkinAsync();
        ShowToast("Skin quitada: regresas a la de siempre.");
        if (done != null) await done();
    }

    private void SetHint(string text, bool problem)
    {
        DialogHint.Text = text;
        DialogHint.Foreground = problem ? Pal.Danger : Pal.Paper3;
    }

    private async Task UseOfflineNameAsync(string name, Func<Task>? done)
    {
        var error = await _l.UseOfflineAsync(name);
        if (error != null) ShowDialog("No pude usar ese nombre", error, ("Entendido", null, true));
        else if (done != null) await done();
    }

    private void CloseDialog()
    {
        _waiting = false;
        if (_promptChanged != null) { DialogInput.TextChanged -= _promptChanged; _promptChanged = null; }
        if (_promptKeys != null) { DialogInput.KeyDown -= _promptKeys; _promptKeys = null; }
        _promptGeneration++;
        DialogInput.IsVisible = DialogHint.IsVisible = DialogImage.IsVisible = false;
        DialogImage.Source = null;
        DialogInput.MaxLength = 16;
        DialogCloud.Source = null;
        DialogCloud.IsVisible = false;
        if (_linkClick != null) { DialogLink.Click -= _linkClick; _linkClick = null; }
        DialogLink.IsVisible = false;
        _dialogOpen = false;
        if (_dialogQueue.Count > 0)
        {
            DialogLayer.IsVisible = false;   // the next question is already waiting: no fade out and in between them
            _dialogQueue.Dequeue()();
            return;
        }
        // leaving is quicker than arriving (the player has already answered), and the buttons stop answering at once
        DialogLayer.IsHitTestVisible = false;
        Motion.Leave(DialogLayer, () => { if (!_dialogOpen) DialogLayer.IsVisible = false; }, 120);
    }

    // ---- styles -----------------------------------------------------------------------------------------------------

    /// <summary>
    /// Ajustes > Launcher > Estilo. The background arrives its own way (StyleHost: a style coming in over the one going away, never a cut);
    /// the interface is dressed again (StyleTheme) and the screen rebuilt under a picture of how it looked, which fades away: type, shapes
    /// and colours all change together, with nothing jumping.
    /// </summary>
    public void ChangeStyle(string id)
    {
        var style = StyleCatalog.Get(id);
        if (style.Id == ST.Current) return;
        Services.NativeSettings.Style = style.Id;
        var picture = Snapshot();
        ST.Apply(style.Id);
        Services.Launcher.RefreshAccent();
        Field.Go(style.Id);
        BackdropScrim.Background = Pal.Backdrop;
        RedressOverlays();
        switch (ViewHost.Content)
        {
            case SettingsView settings: ShowSettings(settings.CurrentTab, settings.ScrollOffset); break;
            case HomeView: ShowHome(quiet: true); break;
            case LoginView: ShowLogin(); break;
            case BlockedView: ShowBlocked(); break;
        }
        if (picture == null) return;
        StyleSnapshot.Source = picture;
        StyleSnapshot.IsVisible = true;
        Motion.Animate(StyleSnapshot, OpacityProperty, 1, 0, 460, 0, Motion.Out, () => { if (StyleSnapshot.Opacity < 0.01) { StyleSnapshot.IsVisible = false; StyleSnapshot.Source = null; } });
        Motion.Animate(ViewHost, OpacityProperty, 0, 1, 380, 70, Motion.Out);
    }

    /// <summary>
    /// What lives over the view (the notices' newspaper, the failure report, the megaphone, the title bar and the dialogs) was built with the style it was
    /// born in; a new style builds it again, so everything wears the style like the rest of the window. One that is open stays as it is until it closes.
    /// </summary>
    private void RedressOverlays()
    {
        if (!NoticesLayer.IsVisible)
        {
            NoticesLayer.Children.Remove(NoticesPanelView);
            NoticesPanelView = NewNoticesPanel();
            NoticesLayer.Children.Add(NoticesPanelView);
        }
        if (!ReportLayer.IsVisible)
        {
            ReportLayer.Children.Remove(ReportPanelView);
            ReportPanelView = NewReportPanel();
            ReportLayer.Children.Add(ReportPanelView);
        }
        StyleModule(NoticePopup, Pal.Panel); StyleModule(Toast, Pal.Panel); StyleModule(DialogPanel, Pal.Dialog);
        BuildChrome();
        Ui.Restyle(DialogTitle, "DisplayText"); DialogTitle.FontSize = 24; Ui.Restyle(ToastText, "BodyText"); Ui.Restyle(DialogMessage, "BodyText"); DialogMessage.Foreground = Pal.Paper2; Ui.Restyle(DialogHint, "CaptionText");
        DialogInput.CornerRadius = new CornerRadius(Pal.RadiusInput); DialogInput.FontFamily = Pal.Mono;
        _mega = new NoticeIconButton(NoticeLook.Megaphone, "Avisos generales");
        _mega.Clicked += () => ShowNotices(general: true);
        MegaHost.Content = _mega;
        UpdateMega();
    }

    /// <summary>"Usar el color del modpack": the modpack's colour wins, or the style's.</summary>
    public void SetPackAccent(bool on)
    {
        Services.NativeSettings.PackAccent = on;
        Services.Launcher.RefreshAccent();
    }

    /// <summary>The interface as it looks now, as a picture (for the crossfade into another style). Null when there is nothing to fade.</summary>
    private RenderTargetBitmap? Snapshot()
    {
        if (!Motion.Enabled || ViewHost.Bounds.Width < 1 || ViewHost.Bounds.Height < 1 || _backgroundOnly) return null;
        try
        {
            var bitmap = new RenderTargetBitmap(new PixelSize((int)Math.Ceiling(ViewHost.Bounds.Width), (int)Math.Ceiling(ViewHost.Bounds.Height)), new Vector(96, 96));
            bitmap.Render(ViewHost);
            return bitmap;
        }
        catch (Exception) { return null; }
    }

    // ---- "ver solo el fondo" -----------------------------------------------------------------------------------------

    private bool _backgroundOnly;
    private readonly DebugOverlay _debug;
    private bool _chromeShown = true;
    private readonly DispatcherTimer _zenWatch = new() { Interval = TimeSpan.FromMilliseconds(120) };
    private long _zenMovedAt;
    private const int ZenRestMs = 5000;

    private void WatchPointer()
    {
        if (!_backgroundOnly) { _zenWatch.Stop(); return; }
        // resting: the buttons go after a while, unless the pointer is resting on them (it is about to press one)
        if (Environment.TickCount64 - _zenMovedAt > ZenRestMs && !WindowButtons.IsPointerOver && !BackgroundOnlyButton.IsPointerOver) ShowChrome(false);
    }

    /// <summary>
    /// The eye in the title bar. On: the whole interface steps aside (the modpacks, the account, the logo, everything) and only the window's
    /// buttons and the eye itself stay; once the pointer rests for five seconds, or leaves the window, those go too and only the background
    /// is left. Moving the pointer brings the buttons back; the eye (or Esc) brings the interface back.
    /// </summary>
    public void SetBackgroundOnly(bool on)
    {
        if (on == _backgroundOnly) return;
        _backgroundOnly = on;
        ToolTip.SetTip(BackgroundOnlyButton, on ? "Mostrar la interfaz" : "Ver solo el fondo");
        Avalonia.Automation.AutomationProperties.SetName(BackgroundOnlyButton, on ? "Mostrar la interfaz" : "Ver solo el fondo");
        foreach (var part in new Control[] { TitleLeft, MegaHost, ViewHost, NoticePopup, Toast })
        {
            if (on)
            {
                if (!part.IsVisible) continue;
                part.IsHitTestVisible = false;
                // hidden once it has faded: the background then treats the space as open (no quiet zones, no glow around Play)
                Motion.Animate(part, OpacityProperty, part.Opacity, 0, 320, 0, Motion.Out, () => { if (_backgroundOnly) part.IsVisible = false; });
            }
            else
            {
                part.IsVisible = part != MegaHost && part != NoticePopup && part != Toast || part.IsVisible;
                part.IsHitTestVisible = true;
                Motion.Animate(part, OpacityProperty, part.Opacity, 1, 320, 0, Motion.Out);
            }
        }
        if (!on) { TitleLeft.IsVisible = true; ViewHost.IsVisible = true; }
        UpdateMega();
        _debug.Update();
        ShowChrome(true);
        if (on) { _zenMovedAt = Environment.TickCount64; _zenWatch.Start(); }
        else _zenWatch.Stop();
    }

    private void ShowChrome(bool shown)
    {
        if (!shown && !_backgroundOnly) return;
        Cursor = shown ? null : new Cursor(StandardCursorType.None);
        if (shown == _chromeShown) return;
        _chromeShown = shown;
        foreach (var part in new Control[] { WindowButtons, BackgroundOnlyButton })
        {
            part.IsHitTestVisible = shown;
            Motion.Animate(part, OpacityProperty, part.Opacity, shown ? 1 : 0, shown ? 180 : 420, 0, Motion.Out);
        }
    }

    // ---- window ---------------------------------------------------------------------------------------------------

    private void OnStateChanged()
    {
        BuildChrome();
        if (WindowState == WindowState.Minimized) TrimMemory();
        if (_backdropPlayer != null) _backdropPlayer.Evaluate();
    }

    // ---- out of the way while Minecraft runs ---------------------------------------------------------------

    private bool _exiting;
    private bool _hiddenForGame;

    private void OnGameChanged()
    {
        _debug.Update();
        var game = _l.Game;
        // Same as the Windows launcher: once Minecraft is up the launcher steps aside, and comes back when it closes.
        if (game.Running && !_hiddenForGame && IsVisible) { _hiddenForGame = true; HideToTray(); }
        else if (game.Phase == "idle" && _hiddenForGame) { _hiddenForGame = false; RestoreFromTray(); }
    }

    private void HideToTray()
    {
        // the notification-area icon (App.axaml.cs) stays; where the desktop has none, the window is minimised instead of hidden so it can still be found
        if (App.HasTray) Hide(); else WindowState = WindowState.Minimized;
        TrimMemory();
    }

    private void RestoreFromTray()
    {
        _hiddenForGame = false;
        Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
    }

    private void OnClosing(object? sender, WindowClosingEventArgs e)
    {
        // While Minecraft runs, closing the window only sends the launcher to the tray.
        if (!_exiting && (_l.Game.Running || _l.Game.Busy)) { e.Cancel = true; HideToTray(); return; }
        // A player closing the launcher sees the logo glitch it away (about half a second). Not when something else is closing it (an update,
        // the tray), not when it is not on screen, and a second click on close means "now".
        if (!_exiting && SplashLayer.Wanted && IsVisible && WindowState != WindowState.Minimized)
        {
            if (!_goodbyeStarted)
            {
                _goodbyeStarted = true;
                e.Cancel = true;
                _ = GoodbyeAsync();
                return;
            }
            _exiting = true;
        }
        try { _l.DisposeAsync().AsTask().Wait(2500); } catch { }
    }

    private async Task GoodbyeAsync()
    {
        try { await SplashLayer.CoverAsync(SplashHost); }
        catch (Exception) { /* the animation is not worth keeping the launcher open for */ }
        if (_closed) return;
        _exiting = true;
        try { Close(); } catch (InvalidOperationException) { /* already closing */ }
    }

    private void TrimMemory()
    {
        try
        {
            _l.TrimMemory();
            GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
        }
        catch { }
    }
}
