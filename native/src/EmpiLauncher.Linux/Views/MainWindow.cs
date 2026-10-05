using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using EmpiLauncher.Ipc;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The window: a dotted ground, the picture of the selected modpack, one screen at a time (sign-in, home, settings) and, over them,
/// toasts and dialogs. It owns the engine's lifetime: it starts it when it opens and the engine follows it out.
/// </summary>
public sealed class MainWindow : Window
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private readonly Grid _root = new();
    private readonly AccessStage _accessFx = new();
    private StyleHost _field = null!;
    public static MainWindow? Instance { get; private set; }
    internal StyleHost Field => _field;
    private readonly Image _backdrop = new() { Stretch = Stretch.UniformToFill, IsVisible = false, IsHitTestVisible = false };
    private readonly Border _backdropScrim = new() { IsVisible = false, IsHitTestVisible = false };
    private readonly ContentControl _host = new();
    private readonly Button _updateButton;
    private readonly Button _maxButton;
    private readonly Button _noticesButton;
    private readonly Button _eyeButton;
    private readonly Control _megaphone;
    private readonly Avalonia.Controls.Shapes.Ellipse _noticeDot;
    private readonly Grid _noticesLayer = new() { IsVisible = false, Background = Pal.Scrim, ZIndex = 35 };
    private NoticesPanel? _noticesPanel;
    private bool _backgroundOnly;
    private DebugOverlay _debug = null!;
    private bool _goodbye;
    private bool _minimizedForGame;
    private readonly Border _toast = new();
    private readonly TextBlock _toastText = Ui.Body("", 14);
    private readonly Grid _dialogLayer = new() { IsVisible = false, Background = Pal.Scrim };
    private readonly StackPanel _dialogBody = new();
    private DispatcherTimer? _toastTimer;
    private string _screen = "";
    private SettingsView? _settings;

    public MainWindow()
    {
        Instance = this;
        Title = "Empi Launcher";
        Width = 1120; Height = 700; MinWidth = 940; MinHeight = 620;
        Background = Pal.Well;
        FontSize = 14;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        WindowDecorations = Avalonia.Controls.WindowDecorations.None;
        try { Icon = new WindowIcon(Avalonia.Platform.AssetLoader.Open(new Uri("avares://EmpiLauncher/Assets/icon.png"))); } catch { }

        _root.RowDefinitions = new RowDefinitions("52,*");
        ST.Apply(Environment.GetEnvironmentVariable("EMPI_STYLE") is { Length: > 0 } forced ? forced : Services.NativeSettings.Style);
        _field = new StyleHost { IsHitTestVisible = false };

        _backdropScrim.Background = Pal.Backdrop;
        Grid.SetRowSpan(_field, 2); Grid.SetRowSpan(_backdrop, 2); Grid.SetRowSpan(_backdropScrim, 2);
        _root.Children.Add(_field);
        _root.Children.Add(_backdrop);
        _root.Children.Add(_backdropScrim);

        // the title bar: the name, the channel, a notice of a new version, and the window buttons in a small box of their own
        _updateButton = Ui.Btn("", Ui.Kind.Primary, null, new Thickness(12, 4), 11);
        _updateButton.IsVisible = false;
        _updateButton.Click += (_, _) => AskUpdate();
        var left = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(24, 0, 0, 0), IsHitTestVisible = true };
        left.Children.Add(Ui.Display("EMPI", 19));
        var channel = Ui.Pill("LINUX", Pal.Paper2, null, 10.5);
        channel.Margin = new Thickness(14, 0, 0, 0); channel.Padding = new Thickness(9, 2);
        left.Children.Add(channel);
        _updateButton.Margin = new Thickness(12, 0, 0, 0);
        left.Children.Add(_updateButton);

        _noticesButton = Ui.IconBtn(Icons.Megaphone, "Avisos", ShowNotices, 34);
        _noticeDot = new Avalonia.Controls.Shapes.Ellipse { Width = 9, Height = 9, Fill = Pal.Accent, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 3, 3, 0), IsHitTestVisible = false, IsVisible = false };
        var megaphone = new Grid { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0), IsVisible = false, Children = { _noticesButton, _noticeDot } };
        _megaphone = megaphone;
        _eyeButton = Ui.IconBtn(Icons.Eye, "Ver solo el fondo", ToggleBackgroundOnly, 34);
        _eyeButton.Margin = new Thickness(0, 0, 8, 0);
        _maxButton = Ui.IconBtn(Icons.Maximize, "Maximizar", ToggleMaximize, 30);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal };
        buttons.Children.Add(Ui.IconBtn(Icons.Minimize, "Minimizar", () => WindowState = WindowState.Minimized, 30));
        buttons.Children.Add(_maxButton);
        buttons.Children.Add(Ui.IconBtn(Icons.Close, "Cerrar", Close, 30));
        var box = new Border
        {
            Background = Pal.Dock, BorderBrush = Pal.HairStrong, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(16), Padding = new Thickness(3, 2),
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 14, 0), Child = buttons
        };
        var right = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 14, 0), Children = { _megaphone, _eyeButton, box } };
        box.Margin = new Thickness(0);
        var bar = new Grid { Background = Pal.Clear, ZIndex = 10 };
        bar.Children.Add(left); bar.Children.Add(right);
        bar.PointerPressed += OnBarPressed;
        bar.DoubleTapped += (_, e) => { if (e.Source is not Button) ToggleMaximize(); };
        _root.Children.Add(bar);

        Grid.SetRow(_host, 1);
        _root.Children.Add(_host);
        Grid.SetRowSpan(_accessFx, 2);
        _root.Children.Add(_accessFx);
        BuildToast();
        BuildDialogLayer();
        _noticesPanel = new NoticesPanel(() => _noticesLayer.IsVisible = false);
        _noticesLayer.Children.Add(_noticesPanel);
        Grid.SetRowSpan(_noticesLayer, 2);
        _root.Children.Add(_noticesLayer);
        _debug = new DebugOverlay(() => _backgroundOnly) { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 62, 22, 0), ZIndex = 30 };
        Grid.SetRowSpan(_debug, 2);
        _root.Children.Add(_debug);
        _noticesLayer.PointerPressed += (_, e) => { if (e.Source == _noticesLayer) _noticesLayer.IsVisible = false; };
        _l.NoticesChanged += SyncNoticesIcon;
        AddResizeGrips();
        Content = _root;

        _l.Changed += OnLauncherChanged;
        _l.ArtChanged += RefreshBackdrop;
        _l.Notice += ShowToast;
        _l.GameChanged += OnGameForWindow;
        _l.Failure += failure => ShowDialog(failure.Title, failure.Message, ("Vale", null, true));
        _l.EngineLost += message => ShowDialog("El motor se cerró", message + " Cierra el launcher y ábrelo otra vez, porfa.", ("Cerrar el launcher", Close, true));
        _l.JavaNeeded += OnJavaNeeded;
        _l.AuthWindow += OnAuthWindow;
        _l.GameCrashed += exit => ShowDialog("Minecraft se cerró con un error",
            $"El juego se cerró de golpe (código {exit.Code}). Puedes ver un informe con lo necesario para entender qué pasó, guardarlo o mandármelo a soporte para que lo revise (solo si tú quieres). Si crees que le falta algún archivo al modpack, también puedes verificarlo y repararlo.",
            ("Ahora no", null, false), ("Verificar y reparar", AskRepair, false), ("Ver informe", () => _ = ShowReportAsync(), true));
        _l.GameDone += done => { if (done.Mode == "verify") ShowToast(done.Repaired is > 0 ? $"Listo: arreglé {done.Repaired} archivo(s)." : "Todo en orden: no encontré nada que arreglar."); };
        Opened += async (_, _) =>
        {
            if (SplashLayer.Wanted) _ = SplashLayer.OpenAsync(_root);
            // development only: EMPI_SHOT_EARLY=<ms>,<path> paints the window that long after it opened (to see the opening)
            if (Environment.GetEnvironmentVariable("EMPI_SHOT_EARLY") is { Length: > 0 } early && early.Split(',') is [var ms, var file])
                _ = Task.Run(async () => { await Task.Delay(int.Parse(ms)); Dispatcher.UIThread.Post(() => Shot(file)); });
            await StartAsync();
        };
        Closing += (_, e) =>
        {
            if (!_goodbye && SplashLayer.Wanted && !_l.Game.Busy)
            {
                e.Cancel = true; _goodbye = true;
                _ = GoodbyeAsync();
                return;
            }
            try { _l.DisposeAsync().AsTask().Wait(2500); } catch { }
        };
        KeyDown += (_, e) => { if (e.Key == Key.Escape && _screen == "settings") ShowMain(); };
    }

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
            var grip = new Border { Background = Pal.Clear, Width = w, Height = ht, HorizontalAlignment = h, VerticalAlignment = v, ZIndex = 50, Cursor = new Cursor(cursor) };
            grip.PointerPressed += (_, e) => { if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed) BeginResizeDrag(edge, e); };
            _root.Children.Add(grip);
            Grid.SetRowSpan(grip, 2);
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
        try
        {
            await _l.StartAsync();
        }
        catch (Exception ex)
        {
            App.Log("engine start", ex);
            ShowDialog("No pude arrancar el motor", $"{ex.Message}\n\nSi acabas de instalar el launcher, ábrelo otra vez. Si sigue igual, escríbeme con este texto.", ("Cerrar el launcher", Close, true));
            return;
        }
        // development only: EMPI_AUTO_OFFLINE=<name> signs in as that offline player, EMPI_SCREEN=settings:<tab> opens Ajustes (see CheckForShotAsync)
        if (Environment.GetEnvironmentVariable("EMPI_AUTO_OFFLINE") is { Length: > 0 } auto && _l.Account == null) await _l.UseOfflineAsync(auto);
        ShowMain();
        _ = DevPlayAsync();
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") == "notices") { await Task.Delay(3000); ShowNotices(); }
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") == "report") { await Task.Delay(1500); await ShowReportAsync(); }
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") == "skin") { await Task.Delay(1500); ShowSkinPrompt(); }
        if (Environment.GetEnvironmentVariable("EMPI_SCREEN") is { } screen && screen.StartsWith("settings"))
        {
            ShowSettings();
            if (screen.Contains(':')) await _settings!.OpenTab(screen[(screen.IndexOf(':') + 1)..]);
        }
        var removed = await _l.ValidateSessionAsync();
        if (removed != null) ShowDialog("Tu sesión se venció", $"No pude renovar la sesión de {removed}, así que la quité de la lista. Vuelve a entrar con Microsoft para seguir jugando.", ("Vale", null, true));
        _ = CheckForShotAsync();
        _ = CheckUpdateAsync();
        // development only: EMPI_AUTO_UPDATE=1 takes the offered update without asking (to try the self-update against EMPI_UPDATE_URL)
        if (Environment.GetEnvironmentVariable("EMPI_AUTO_UPDATE") == "1") { await _l.CheckUpdateAsync(); if (_l.Update != null) await InstallUpdateAsync(); }
    }

    private async Task CheckUpdateAsync()
    {
        await _l.CheckUpdateAsync();
        OnLauncherChanged();
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
            if (Environment.GetEnvironmentVariable("EMPI_SHOT_EXIT") == "1") Close();
            return;
        }
        Shot(path);
        if (Environment.GetEnvironmentVariable("EMPI_SHOT_EXIT") == "1") Close();
    }

    public void Shot(string path)
    {
        var size = new PixelSize((int)Bounds.Width, (int)Bounds.Height);
        using var bitmap = new RenderTargetBitmap(size, new Vector(96, 96));
        bitmap.Render(this);
        bitmap.Save(path);
    }

    // ---- screens -----------------------------------------------------------------------------------------------------

    /// <summary>While Minecraft runs the launcher steps out of the way (minimised: costs what a hidden window costs) and comes back when it ends.</summary>
    private async Task GoodbyeAsync()
    {
        try { await SplashLayer.CoverAsync(_root); } catch (Exception ex) { App.Log("goodbye", ex); }
        Close();
    }

    private void OnGameForWindow()
    {
        var game = _l.Game;
        if (game.Running && !_minimizedForGame && IsVisible && WindowState != WindowState.Minimized) { _minimizedForGame = true; WindowState = WindowState.Minimized; }
        else if (game.Phase == "idle" && _minimizedForGame)
        {
            _minimizedForGame = false;
            WindowState = WindowState.Normal; Activate();
        }
    }

    private void SyncNoticesIcon()
    {
        var mine = _l.GeneralNotices.Concat(_l.NoticesOf(_l.HostId)).DistinctBy(n => n.Id).ToList();
        _megaphone.IsVisible = mine.Count > 0;
        _noticeDot.IsVisible = mine.Any(n => n.State == "unread");
        if (_noticesLayer.IsVisible) _noticesPanel!.Fill(_l.HostId);
    }

    public void ShowNotices()
    {
        _noticesPanel!.Fill(_l.HostId);
        _noticesLayer.IsVisible = true;
    }

    /// <summary>"Ver solo el fondo": the interface steps aside so the modpack's picture is seen whole; the eye button brings it back.</summary>
    private void ToggleBackgroundOnly()
    {
        _backgroundOnly = !_backgroundOnly;
        _host.IsVisible = !_backgroundOnly;
        _backdropScrim.IsVisible = _backdrop.IsVisible && !_backgroundOnly;
        _debug.Update();
    }

    private void OnLauncherChanged()
    {
        SyncNoticesIcon();
        if (_l.Update is { } update)
        {
            _updateButton.IsVisible = true;
            ((TextBlock)_updateButton.Content!).Text = $"v{update.Version} DISPONIBLE";
        }
        if (_screen is "login" or "home") ShowMain();   // signing in or out changes which one it is; a no-op when nothing moved
    }

    /// <summary>The sign-in screen while nobody is signed in, the home screen otherwise.</summary>
    public void ShowMain()
    {
        var wanted = _l.Config == null ? _screen : _l.SignedOut ? "login" : "home";
        if (wanted == _screen && _screen != "settings") return;
        if (wanted == "") return;
        _screen = wanted;
        _settings = null;
        _host.Content = wanted == "login" ? new LoginView(this) : new HomeView(this);
        RefreshBackdrop();
    }

    public void ShowSettings()
    {
        _screen = "settings";
        _settings = new SettingsView(this);
        _host.Content = _settings;
        RefreshBackdrop();
    }

    /// <summary>Puts another style on: the tokens, the background (it arrives over the old one) and the screen rebuilt for its radii and fonts.</summary>
    public void ChangeStyle(string id)
    {
        if (id == ST.Current) return;
        Services.NativeSettings.Style = id;
        ST.Apply(id);
        _field.Go(id);
        _backdropScrim.Background = Pal.Backdrop;
        var screen = _screen;
        _screen = "";
        if (screen == "settings") { var tab = _settings?.CurrentTab ?? "launcher"; ShowSettings(); _ = _settings!.OpenTab(tab); }
        else ShowMain();
        Dispatcher.UIThread.Post(RegisterBackdrop);
    }

    private void RegisterBackdrop() { }

    public void CloseSettings() { _screen = "settings"; ShowMain(); }

    private async void RefreshBackdrop()
    {
        var path = _screen == "home" ? _l.Art?.Background : null;
        var wanted = path;
        if (wanted == null) { _backdrop.Source = null; _backdrop.IsVisible = _backdropScrim.IsVisible = false; return; }
        var image = await Task.Run(() => Ui.Decode(wanted, 1280));
        if (image == null || (_screen == "home" ? _l.Art?.Background : null) != wanted) return;
        _backdrop.Source = image;
        _backdrop.IsVisible = _backdropScrim.IsVisible = true;
    }

    // ---- toast -------------------------------------------------------------------------------------------------------

    private void BuildToast()
    {
        var close = Ui.IconBtn(Icons.Close, "Cerrar aviso", () => _toast.IsVisible = false, 30);
        var row = new DockPanel();
        DockPanel.SetDock(close, Dock.Right);
        close.Margin = new Thickness(12, 0, 0, 0);
        row.Children.Add(close);
        _toastText.VerticalAlignment = VerticalAlignment.Center;
        row.Children.Add(_toastText);
        _toast.Child = row;
        _toast.Background = Pal.Panel; _toast.BorderBrush = Pal.Hair; _toast.BorderThickness = new Thickness(1); _toast.CornerRadius = new CornerRadius(22); _toast.Padding = new Thickness(18, 12);
        _toast.MaxWidth = 620; _toast.IsVisible = false; _toast.ZIndex = 20;
        _toast.HorizontalAlignment = HorizontalAlignment.Center; _toast.VerticalAlignment = VerticalAlignment.Bottom; _toast.Margin = new Thickness(0, 0, 0, 110);
        Grid.SetRow(_toast, 1);
        _root.Children.Add(_toast);
    }

    public void ShowToast(string text)
    {
        _toastText.Text = text;
        _toast.IsVisible = true;
        _toastTimer?.Stop();
        _toastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(Math.Clamp(text.Length / 14.0, 4, 12)) };
        _toastTimer.Tick += (_, _) => { _toastTimer?.Stop(); _toast.IsVisible = false; };
        _toastTimer.Start();
    }

    // ---- dialogs -----------------------------------------------------------------------------------------------------

    private readonly Queue<Action> _dialogQueue = new();
    private bool _dialogOpen;
    private TextBox? _dialogInput;
    private TextBlock? _dialogHint;
    private StackPanel? _dialogButtons;

    private void BuildDialogLayer()
    {
        var panel = new Border
        {
            Background = Pal.Dialog, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(22), Padding = new Thickness(28, 24),
            Width = 480, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Child = _dialogBody
        };
        _dialogLayer.Children.Add(panel);
        _dialogLayer.ZIndex = 40;
        Grid.SetRowSpan(_dialogLayer, 2);
        _root.Children.Add(_dialogLayer);
    }

    /// <summary>A question or a failure that needs an answer. Each button is (label, what it does, whether it is the main one); every button closes the dialog.</summary>
    public void ShowDialog(string title, string message, params (string Label, Action? Action, bool Primary)[] buttons)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowDialog(title, message, buttons)); return; }
        _dialogOpen = true;
        _dialogBody.Children.Clear();
        _dialogInput = null; _dialogHint = null;
        var heading = Ui.Display(title, 24);
        heading.TextWrapping = TextWrapping.Wrap; heading.TextTrimming = TextTrimming.None;
        _dialogBody.Children.Add(heading);
        var text = Ui.Body(message, 14, Pal.Paper2);
        text.Margin = new Thickness(0, 12, 0, 0);
        _dialogBody.Children.Add(text);

        _dialogButtons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 24, 0, 0), Spacing = 10 };
        foreach (var (label, action, primary) in buttons)
        {
            var button = Ui.Btn(label, primary ? Ui.Kind.Primary : Ui.Kind.Ghost, () => { CloseDialog(); action?.Invoke(); });
            _dialogButtons.Children.Add(button);
        }
        _dialogBody.Children.Add(_dialogButtons);
        _dialogLayer.IsVisible = true;
    }

    /// <summary>Adds a text box (and a hint line) to the dialog that was just shown.</summary>
    private void AddDialogInput(string initial, int max, string watermark)
    {
        _dialogInput = new TextBox
        {
            Text = initial, MaxLength = max, Watermark = watermark, Margin = new Thickness(0, 18, 0, 0), Background = Pal.Input, Foreground = Pal.Paper,
            BorderBrush = Pal.HairStrong, CornerRadius = new CornerRadius(12), Padding = new Thickness(12, 9)
        };
        _dialogHint = Ui.Caption("");
        _dialogHint.Margin = new Thickness(4, 8, 0, 0);
        _dialogBody.Children.Insert(2, _dialogHint);
        _dialogBody.Children.Insert(2, _dialogInput);
    }

    public void CloseDialog()
    {
        _dialogLayer.IsVisible = false;
        _dialogOpen = false;
        if (_dialogQueue.Count > 0) Dispatcher.UIThread.Post(() => _dialogQueue.Dequeue()());
    }

    /// <summary>Playing without an account: the name is checked by the engine as it is typed (it owns the rule).</summary>
    public void ShowOfflinePrompt(string initial = "", Func<Task>? done = null)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowOfflinePrompt(initial, done)); return; }
        var name = initial;
        ShowDialog("Jugar sin conexión",
            "Escoge el nombre con el que quieres jugar. Sin cuenta ni skin: nomás este nombre. Sirve para un jugador y para servidores que no revisan la cuenta.",
            ("Cancelar", null, false),
            ("Jugar sin conexión", () => _ = UseOfflineAsync(name, done), true));
        var confirm = (Button)_dialogButtons!.Children[^1];
        confirm.IsEnabled = false;
        AddDialogInput(initial, 16, "Tu nombre");
        void Hint(string text, bool bad) { _dialogHint!.Text = text; _dialogHint.Foreground = bad ? Pal.Danger : Pal.Paper3; }
        Hint("3 a 16 caracteres: letras, números y guion bajo.", false);
        var generation = 0;
        _dialogInput!.TextChanged += async (_, _) =>
        {
            name = _dialogInput.Text?.Trim() ?? "";
            var mine = ++generation;
            if (name.Length == 0) { confirm.IsEnabled = false; Hint("3 a 16 caracteres: letras, números y guion bajo.", false); return; }
            var preview = await _l.PreviewOfflineAsync(name);
            if (mine != generation || !_dialogOpen) return;
            confirm.IsEnabled = preview.Valid;
            Hint(preview.Valid ? $"Tu identificador sin conexión: {preview.Id}. El mismo nombre siempre da el mismo." : preview.Reason ?? "Ese nombre no se vale.", !preview.Valid);
        };
        _dialogInput.KeyDown += (_, e) => { if (e.Key == Key.Enter && confirm.IsEnabled) confirm.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); };
        _dialogInput.Focus();
    }

    /// <summary>
    /// The skin of the offline player. The player pastes the id (96cab59a8709ce31) or the link of a skin from NameMC: it is read as they type,
    /// downloaded once, checked, and drawn here before it is used. Nothing is searched on NameMC (its site is behind a bot check): "Abrir NameMC"
    /// only opens it in the browser to choose a skin.
    /// </summary>
    public void ShowSkinPrompt(Func<Task>? done = null)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowSkinPrompt(done)); return; }
        var hasSkin = _l.Account is { Type: "offline", Skin: not null };
        string? skinId = null;
        var buttons = new List<(string Label, Action? Action, bool Primary)> { ("Cancelar", null, false) };
        if (hasSkin) buttons.Add(("Quitar skin", () => _ = ClearSkinAsync(done), false));
        buttons.Add(("Usar esta skin", () => _ = ApplySkinAsync(skinId, done), true));
        ShowDialog("Skin para jugar sin conexión", "Escoge una skin en NameMC y pega aquí su id (por ejemplo 96cab59a8709ce31) o su enlace. La bajo una sola vez y la ves al abrir Minecraft.", buttons.ToArray());
        var confirm = (Button)_dialogButtons!.Children[^1];
        confirm.IsEnabled = false;
        AddDialogInput("", 200, "Id o enlace de la skin");
        var preview = new Image { Width = 90, Height = 180, Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(4, 14, 0, 0), IsVisible = false };
        var link = Ui.Btn("Abrir NameMC para elegir una skin", Ui.Kind.Ghost, () => { try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("xdg-open") { ArgumentList = { "https://namemc.com/minecraft-skins" }, UseShellExecute = false }); } catch { } }, new Thickness(14, 6), 12);
        link.HorizontalAlignment = HorizontalAlignment.Left; link.Margin = new Thickness(0, 12, 0, 0);
        _dialogBody.Children.Insert(4, link); _dialogBody.Children.Insert(5, preview);
        void Hint(string text, bool bad) { _dialogHint!.Text = text; _dialogHint.Foreground = bad ? Pal.Danger : Pal.Paper3; }
        Hint("Pega el id o el enlace de la skin.", false);
        var generation = 0;
        async void Check()
        {
            var text = _dialogInput!.Text?.Trim() ?? "";
            var mine = ++generation;
            skinId = null; confirm.IsEnabled = false; preview.IsVisible = false;
            if (text.Length == 0) { Hint("Pega el id o el enlace de la skin.", false); return; }
            var parsed = await _l.ParseSkinAsync(text);
            if (mine != generation || !_dialogOpen) return;
            if (!parsed.Valid) { Hint(parsed.Reason ?? "Eso no es un id de NameMC.", false); return; }
            Hint("Descargando la skin…", false);
            await Task.Delay(250);   // a paste arrives as one change, typing as many: fetch once it settles
            if (mine != generation || !_dialogOpen) return;
            try
            {
                var shown = await _l.FetchSkinAsync(text);
                if (mine != generation || !_dialogOpen) return;
                preview.Source = Ui.Decode(shown.Front, 192); preview.IsVisible = preview.Source != null;
                skinId = shown.Id; confirm.IsEnabled = true;
                Hint($"Skin {shown.Id}, modelo {(shown.Model == "slim" ? "fino (Alex)" : "normal (Steve)")}. Pulsa “Usar esta skin”.", false);
            }
            catch (EngineException ex) { if (mine == generation) Hint(ex.Message, true); }
        }
        _dialogInput!.TextChanged += (_, _) => Check();
        _dialogInput.KeyDown += (_, e) => { if (e.Key == Key.Enter && confirm.IsEnabled) confirm.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); };
        _dialogInput.Focus();
    }

    private async Task ApplySkinAsync(string? id, Func<Task>? done)
    {
        if (id == null) return;
        ShowToast("Preparando la skin…");
        var error = await _l.ApplySkinAsync(id);
        if (error != null) { _toast.IsVisible = false; ShowDialog("No pude usar esa skin", error, ("Entendido", null, true)); return; }
        ShowToast("Skin lista: la vas a ver al abrir Minecraft.");
        if (done != null) await done();
    }

    private async Task ClearSkinAsync(Func<Task>? done)
    {
        await _l.ClearSkinAsync();
        ShowToast("Skin quitada: regresas a la de siempre.");
        if (done != null) await done();
    }

    /// <summary>Playing without an account: a name change keeps the same player.</summary>
    private async Task UseOfflineAsync(string name, Func<Task>? done = null)
    {
        var problem = await _l.UseOfflineAsync(name);
        if (problem != null) ShowDialog("No se pudo", problem, ("Vale", null, true));
        else if (done != null) await done();
    }

    private void OnJavaNeeded(NeedJava need)
    {
        var distribution = string.IsNullOrEmpty(need.Distribution) ? "" : $" ({need.Distribution})";
        ShowDialog($"Falta Java {need.SuggestedMajor}",
            $"Este modpack necesita Java {need.SuggestedMajor}{distribution} y no lo encuentro en tu compu. Lo puedo instalar yo solito dentro de los datos del launcher, sin tocar el resto del sistema.",
            ("Ahora no", () => _ = _l.DismissJavaAsync(), false),
            ("Instalar Java", () => _ = _l.InstallJavaAsync(), true));
    }

    private void OnAuthWindow(bool open, string text)
    {
        if (open)
            ShowDialog("Esperando a Microsoft", text, ("Cancelar", () => _ = _l.CancelAuthAsync(), false));
        else if (_dialogOpen && _dialogBody.Children.OfType<TextBlock>().FirstOrDefault()?.Text == "Esperando a Microsoft")
            CloseDialog();
    }

    /// <summary>The new version is offered: it is downloaded, checked (sha512) and swapped in by the engine, and the launcher reopens by itself.</summary>
    private void AskUpdate()
    {
        if (_l.Update is not { } update) return;
        var notes = update.Page != null ? "\n\nLas novedades están en " + update.Page : "";
        ShowDialog($"Actualizar a v{update.Version}",
            "Bajo la versión nueva, compruebo que llegó completa y el launcher se vuelve a abrir solito. Tus cuentas, ajustes y modpacks no se tocan." + notes,
            ("Ahora no", null, false),
            ("Actualizar", () => _ = InstallUpdateAsync(), true));
    }

    private async Task InstallUpdateAsync()
    {
        void Progress(long got, long total) => Dispatcher.UIThread.Post(() => ShowToast(total > 0 ? $"Bajando la actualización… {got * 100 / total}%" : "Bajando la actualización…"));
        _l.UpdateProgress += Progress;
        try
        {
            ShowToast("Bajando la actualización…");
            var launched = await _l.InstallUpdateAsync();
            if (launched) Close();
            else ShowDialog("Bajé la versión nueva", "Está lista, pero este launcher no se instaló con el paquete oficial, así que no la puedo poner yo. Descarga el paquete de la página de novedades.", ("Vale", null, true));
        }
        catch (EngineException ex) { ShowDialog("No se pudo actualizar", ex.Message, ("Vale", null, true)); }
        finally { _l.UpdateProgress -= Progress; }
    }

    // ---- the failure report ----------------------------------------------------------------------------------------------

    private readonly Grid _reportLayer = new() { IsVisible = false, Background = Pal.Scrim, ZIndex = 42 };
    private ReportPanel? _reportPanel;

    /// <summary>The report in front of the player, to copy, save as a .txt or send to support. Nothing is sent until they press that button.</summary>
    public async Task ShowReportAsync()
    {
        if (_reportPanel == null)
        {
            _reportPanel = new ReportPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Stretch, Margin = new Thickness(28, 64, 28, 28) };
            _reportPanel.CloseRequested += () => _reportLayer.IsVisible = false;
            _reportLayer.Children.Add(_reportPanel);
            Grid.SetRowSpan(_reportLayer, 2);
            _root.Children.Add(_reportLayer);
            KeyDown += (_, e) => { if (_reportLayer.IsVisible && e.Key == Key.Escape) { _reportLayer.IsVisible = false; e.Handled = true; } };
        }
        _reportLayer.IsVisible = true;
        await _reportPanel.OpenAsync();
    }

    // ---- the screenshot viewer -----------------------------------------------------------------------------------------

    private readonly Grid _viewerLayer = new() { IsVisible = false, Background = Pal.Scrim, ZIndex = 45 };
    private readonly Image _viewerImage = new() { Stretch = Stretch.Uniform, Margin = new Thickness(60, 70, 60, 60) };
    private List<string> _viewerShots = [];
    private int _viewerAt;

    /// <summary>One screenshot full size, with arrows (and the arrow keys) to go through the rest; Esc closes it.</summary>
    public void ShowViewer(List<string> shots, int index)
    {
        if (_viewerLayer.Children.Count == 0)
        {
            var close = Ui.IconBtn(Icons.Close, "Cerrar", () => _viewerLayer.IsVisible = false);
            close.HorizontalAlignment = HorizontalAlignment.Right; close.VerticalAlignment = VerticalAlignment.Top; close.Margin = new Thickness(0, 62, 24, 0);
            var prev = Ui.Btn("‹", Ui.Kind.Ghost, () => StepViewer(-1), new Thickness(16, 6), 20);
            var next = Ui.Btn("›", Ui.Kind.Ghost, () => StepViewer(1), new Thickness(16, 6), 20);
            prev.HorizontalAlignment = HorizontalAlignment.Left; prev.VerticalAlignment = VerticalAlignment.Center; prev.Margin = new Thickness(16, 0, 0, 0);
            next.HorizontalAlignment = HorizontalAlignment.Right; next.VerticalAlignment = VerticalAlignment.Center; next.Margin = new Thickness(0, 0, 16, 0);
            _viewerLayer.Children.Add(_viewerImage); _viewerLayer.Children.Add(close); _viewerLayer.Children.Add(prev); _viewerLayer.Children.Add(next);
            Grid.SetRowSpan(_viewerLayer, 2);
            _root.Children.Add(_viewerLayer);
            KeyDown += (_, e) =>
            {
                if (!_viewerLayer.IsVisible) return;
                if (e.Key == Key.Escape) { _viewerLayer.IsVisible = false; e.Handled = true; }
                else if (e.Key == Key.Left) StepViewer(-1); else if (e.Key == Key.Right) StepViewer(1);
            };
        }
        _viewerShots = shots; _viewerAt = index;
        _viewerLayer.IsVisible = true;
        _ = LoadViewerAsync();
    }

    private void StepViewer(int by) { if (_viewerShots.Count == 0) return; _viewerAt = (_viewerAt + by + _viewerShots.Count) % _viewerShots.Count; _ = LoadViewerAsync(); }

    private async Task LoadViewerAsync()
    {
        var path = _viewerShots[_viewerAt];
        var bmp = await Task.Run(() => Ui.Decode(path, 1920));
        if (_viewerShots.Count > 0 && _viewerShots[_viewerAt] == path) _viewerImage.Source = bmp;
    }

    public void AskRepair()
    {
        ShowDialog("Verificar y reparar",
            "Reviso todos los archivos del modpack y vuelvo a bajar los que falten o estén dañados. Tus mundos, capturas y ajustes no se tocan.",
            ("Cancelar", null, false),
            ("Verificar", () => _ = _l.RepairAsync(), true));
    }
}
