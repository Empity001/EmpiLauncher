using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;
using EmpiLauncher.App.Views;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App;

public partial class MainWindow : Window
{
    private readonly Launcher _l = Launcher.Instance;
    private readonly DispatcherTimer _idle = new() { Interval = TimeSpan.FromSeconds(4) };
    private readonly DispatcherTimer _toastTimer = new() { Interval = TimeSpan.FromSeconds(7) };
    private readonly Queue<Action> _dialogQueue = new();
    private bool _dialogOpen;
    private SettingsView? _settings;

    public MainWindow()
    {
        InitializeComponent();
        MinButton.Click += (_, _) => WindowState = WindowState.Minimized;
        MaxButton.Click += (_, _) => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        CloseButton.Click += (_, _) => Close();
        ToastClose.Click += (_, _) => HideToast();
        _toastTimer.Tick += (_, _) => HideToast();
        StateChanged += (_, _) => OnStateChanged();

        // A launcher spends most of its life waiting: after a quiet moment, hand back what start-up touched.
        _idle.Tick += (_, _) => { _idle.Stop(); TrimMemory(); };
        PreviewMouseMove += (_, _) => { _idle.Stop(); _idle.Start(); };
        Deactivated += (_, _) => { _idle.Interval = TimeSpan.FromSeconds(2); _idle.Stop(); _idle.Start(); };
        Activated += (_, _) => _idle.Interval = TimeSpan.FromSeconds(4);

        _l.Failure += failure => ShowDialog(failure.Title, failure.Message, ("Entendido", null, true));
        _l.Notice += ShowToast;
        _l.GameChanged += OnGameChanged;
        _l.ArtChanged += UpdateBackdrop;
        _l.Changed += OnUpdateChanged;
        _l.Changed += OnAccountsChanged;
        UpdateButton.Click += (_, _) => ShowUpdateDialog();
        _l.AuthWindow += (open, text) =>
        {
            if (open) ShowWaiting("Esperando a Microsoft", text, () => _ = _l.CancelAuthAsync());
            else HideWaiting();
        };
        _l.EngineLost += message => ShowDialog("El launcher perdió su motor", message + " Ábrelo de nuevo para continuar.", ("Cerrar", Close, true));
        _l.JavaNeeded += need => ShowDialog(
            "Falta una versión de Java",
            $"Para iniciar Minecraft se necesita una instalación de 64 bits de Java {need.SuggestedMajor}. ¿Quieres que la instalemos por ti?",
            ("Ahora no", () => _ = _l.DismissJavaAsync(), false),
            ("Instalar Java", () => _ = _l.InstallJavaAsync(), true));

        Loaded += async (_, _) =>
        {
            // The logo opens over the window while the engine starts (SplashLayer decides whether it plays at all); the field sends its pink ring from the lit dot as it uncovers the launcher.
            if (SplashLayer.Wanted) _ = SplashLayer.OpenAsync(SplashHost, point => Field.Burst(point, accent: true));
            await StartAsync();
        };
        Closing += OnClosing;
        Closed += (_, _) => _closed = true;
        Application.Current.SessionEnding += (_, _) => _sessionEnding = true;   // Windows is shutting down: nothing may hold it up
    }

    private bool _closed, _sessionEnding, _goodbyeStarted;

    private async Task StartAsync()
    {
        ShowHome();
        try
        {
            await _l.StartAsync();
            _idle.Start();
        }
        catch (Exception ex)
        {
            ShowDialog("No se pudo iniciar el motor", ex.Message, ("Cerrar", Close, true));
            return;
        }
        _ = ValidateSessionAsync();
        _ = CheckUpdatesLoopAsync();
    }

    /// <summary>First check a little after start (so it never competes with start-up), then every six hours while the launcher is open.</summary>
    private async Task CheckUpdatesLoopAsync()
    {
        await Task.Delay(TimeSpan.FromSeconds(20));
        while (_l.Connected)
        {
            await _l.CheckUpdateAsync();
            await Task.Delay(TimeSpan.FromHours(6));
        }
    }

    private void OnUpdateChanged()
    {
        var update = _l.Update;
        var appearing = update != null && UpdateButton.Visibility != Visibility.Visible;
        UpdateButton.Visibility = update == null ? Visibility.Collapsed : Visibility.Visible;
        if (update != null) UpdateButton.Content = $"NUEVA VERSIÓN {update.Version}";
        if (appearing) Motion.Pop(UpdateButton, new Point(0, 0.5), 240, 0.9);   // news: it arrives, it does not just appear
    }

    /// <summary>The question "install the new version now?" (also reachable from the About tab).</summary>
    public void ShowUpdateDialog()
    {
        var update = _l.Update;
        if (update == null) return;
        if (_l.Game.Running || _l.Game.Busy)
        {
            ShowDialog($"Empi Launcher {update.Version}", "Hay una versión nueva del launcher. Se instala cuando Minecraft esté cerrado y no haya nada descargándose.", ("Entendido", null, true));
            return;
        }
        var size = update.Size is > 0 ? $" (unos {Math.Max(1, update.Size.Value / 1048576)} MB)" : "";
        ShowDialog($"Empi Launcher {update.Version}",
            $"Hay una versión nueva del launcher: tienes la {update.Current}. Se descarga{size}, se comprueba y se instala sola. El launcher se cierra un momento y se vuelve a abrir; tus cuentas, mods y ajustes no cambian.",
            ("Más tarde", null, false),
            ("Actualizar ahora", () => _ = InstallUpdateAsync(update), true));
    }

    /// <summary>Downloads and starts the installer while a dialog shows the progress; the launcher closes once the installer is running.</summary>
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
                SetWaitingText("Instalando… el launcher se abrirá solo en unos segundos.");
                await Task.Delay(400);
                _exiting = true;
                Close();
            }
        }
        catch (EngineException ex) when (ex.Code == "cancelled") { HideWaiting(); }
        catch (Exception ex)
        {
            HideWaiting();
            ShowDialog("No se pudo actualizar", ex.Message + " Puedes descargar el instalador desde la página de la versión.",
                ("Cerrar", null, false),
                ("Abrir la descarga", () => { if (update.Page != null) Process.Start(new ProcessStartInfo(update.Page) { UseShellExecute = true }); }, true));
        }
        finally { _l.UpdateProgress -= Progress; }
    }

    /// <summary>Renews the saved Microsoft session in the background; if it cannot be renewed the player is asked to sign in again.</summary>
    private async Task ValidateSessionAsync()
    {
        var removed = await _l.ValidateSessionAsync();
        if (removed != null)
            ShowDialog("Tu sesión caducó", $"No se pudo renovar la sesión de {removed}. Inicia sesión de nuevo para jugar.",
                ("Más tarde", null, false), ("Iniciar sesión", () => _ = _l.LoginAsync(), true));
    }

    // ---- views ----------------------------------------------------------------------------------------------------

    private void ShowHome()
    {
        if (_l.SignedOut) { ShowLogin(); return; }   // nobody plays until an account is chosen: "Listo" from Ajustes lands here too
        ReleaseSettings();
        var home = new HomeView();
        home.OpenSettings += () => ShowSettings();
        ViewHost.Content = home;
        UpdateBackdrop();
        ScheduleTrim();
    }

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
        if (_l.Config == null) return;
        var signedOut = _l.SignedOut;
        if (_signedOut == signedOut) return;
        _signedOut = signedOut;
        if (signedOut) { if (ViewHost.Content is not LoginView) ShowLogin(); }
        else if (ViewHost.Content is LoginView) ShowHome();
    }

    private void ShowSettings(string tab = "account")
    {
        var view = new SettingsView(tab);
        view.Done += ShowHome;
        view.TabLoaded += ScheduleTrim;
        _settings = view;
        ViewHost.Content = view;
        UpdateBackdrop();
    }

    // ---- the modpack's picture behind the home screen -------------------------------------------------------------

    private string? _backdropPath;
    private int _backdropGeneration;

    /// <summary>Shows the selected modpack's background on the home screen only, decoded at 1280 px, and lets it go everywhere else.</summary>
    private async void UpdateBackdrop()
    {
        var wanted = ViewHost.Content is HomeView ? _l.Art?.Background : null;
        if (wanted == _backdropPath && (wanted == null || Backdrop.Source != null)) return;
        _backdropPath = wanted;
        var generation = ++_backdropGeneration;
        if (wanted == null)
        {
            Backdrop.Source = null;
            Backdrop.Visibility = BackdropScrim.Visibility = Visibility.Collapsed;
            return;
        }
        var image = await Task.Run(() => ScreenshotViewer.Decode(wanted, 1280));
        if (generation != _backdropGeneration) return;
        Backdrop.Source = image;
        Backdrop.Visibility = BackdropScrim.Visibility = image == null ? Visibility.Collapsed : Visibility.Visible;
        if (image != null) Motion.Animate(Backdrop, OpacityProperty, 0, 1, 280);   // the picture arrives when it has been decoded: it fades in instead of popping in
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

    public void ShowViewer(ScreenshotViewer viewer)
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
        var appearing = Toast.Visibility != Visibility.Visible || _toastLeaving;
        _toastLeaving = false;
        Toast.Visibility = Visibility.Visible;
        if (appearing) Motion.Rise(Toast, 0, 220, 12);
        _toastTimer.Stop();
        _toastTimer.Start();
    }

    private void HideToast()
    {
        _toastTimer.Stop();
        if (Toast.Visibility != Visibility.Visible || _toastLeaving) return;
        _toastLeaving = true;
        Motion.Leave(Toast, () => { if (!_toastLeaving) return; _toastLeaving = false; Toast.Visibility = Visibility.Collapsed; }, 160, 8);
    }

    /// <summary>Buttons are (label, action, primary). The dialog closes when any of them is pressed; dialogs queue up if several arrive.</summary>
    public void ShowDialog(string title, string message, params (string Label, Action? Action, bool Primary)[] buttons)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowDialog(title, message, buttons)); return; }
        _dialogOpen = true;
        DialogTitle.Text = title;
        DialogMessage.Text = message;
        DialogButtons.Children.Clear();
        foreach (var (label, action, primary) in buttons)
        {
            var button = new Button { Content = label, Style = (Style)FindResource(primary ? "PrimaryButton" : "GhostButton"), Margin = new Thickness(10, 0, 0, 0) };
            button.Click += (_, _) => { CloseDialog(); action?.Invoke(); };
            DialogButtons.Children.Add(button);
        }
        DialogLayer.IsHitTestVisible = true;
        DialogLayer.Visibility = Visibility.Visible;
        // a modal is not attached to anything, so it grows from its own centre: the backdrop fades in (160 ms) while the panel settles from 96 % (220 ms)
        Motion.Animate(DialogLayer, OpacityProperty, 0, 1, 160);
        Motion.Pop(DialogPanel, new Point(0.5, 0.5), 220, 0.96, fade: false);
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
            DialogCloud.Visibility = Visibility.Visible;
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
    private TextChangedEventHandler? _promptChanged;
    private KeyEventHandler? _promptKeys;
    private RoutedEventHandler? _linkClick;

    /// <summary>
    /// Asks for the name to play with when there is no account. As the name is typed the engine says what it would become (its
    /// 12-digit id) or why it cannot be used, and the button only works for a name that can be. The rule itself lives in the engine.
    /// </summary>
    public void ShowOfflinePrompt(string initial = "", Func<Task>? done = null)
    {
        if (_dialogOpen) { _dialogQueue.Enqueue(() => ShowOfflinePrompt(initial, done)); return; }
        ShowDialog("Jugar sin conexión",
            "Elige el nombre con el que quieres jugar. No usa ninguna cuenta ni skin: solo este nombre. Sirve para un jugador y para servidores que no verifican la cuenta.",
            ("Cancelar", null, false),
            ("Jugar sin conexión", () => _ = UseOfflineNameAsync(_promptName, done), true));
        var confirm = (Button)DialogButtons.Children[^1];
        confirm.IsEnabled = false;
        System.Windows.Automation.AutomationProperties.SetName(confirm, "Confirmar y jugar sin conexión");   // the title has the same words: this one is the button

        System.Windows.Automation.AutomationProperties.SetName(DialogInput, "Nombre para jugar sin conexión");
        DialogInput.Text = initial;
        DialogInput.Visibility = DialogHint.Visibility = Visibility.Visible;
        SetHint("3 a 16 caracteres: letras, números y guion bajo.", false);

        async void Check()
        {
            var text = _promptName = DialogInput.Text.Trim();
            var generation = ++_promptGeneration;
            if (text.Length == 0) { confirm.IsEnabled = false; SetHint("3 a 16 caracteres: letras, números y guion bajo.", false); return; }
            var preview = await _l.PreviewOfflineAsync(text);
            if (generation != _promptGeneration || DialogInput.Visibility != Visibility.Visible) return;   // typed on, or the dialog is gone
            confirm.IsEnabled = preview.Valid;
            SetHint(preview.Valid ? $"Tu identificador sin conexión: {preview.Id}. El mismo nombre siempre da el mismo." : preview.Reason ?? "Ese nombre no se puede usar.", !preview.Valid);
        }
        _promptChanged = (_, _) => Check();
        _promptKeys = (_, e) => { if (e.Key == Key.Enter && confirm.IsEnabled) { e.Handled = true; confirm.RaiseEvent(new RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent)); } };
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
            "Elige una skin en NameMC y pega aquí su id (por ejemplo 96cab59a8709ce31) o su enlace. Se descarga una sola vez y se ve al abrir Minecraft.",
            buttons.ToArray());

        var confirm = (Button)DialogButtons.Children[^1];
        confirm.IsEnabled = false;
        System.Windows.Automation.AutomationProperties.SetName(confirm, "Confirmar y usar esta skin");

        DialogLink.Content = "Abrir NameMC para elegir una skin";
        DialogLink.Visibility = Visibility.Visible;
        _linkClick = (_, _) => { try { Process.Start(new ProcessStartInfo("https://namemc.com/minecraft-skins") { UseShellExecute = true }); } catch (Exception) { } };
        DialogLink.Click += _linkClick;

        DialogInput.MaxLength = 200;
        System.Windows.Automation.AutomationProperties.SetName(DialogInput, "Id o enlace de la skin");
        DialogInput.Text = "";
        DialogInput.Visibility = DialogHint.Visibility = Visibility.Visible;
        SetHint("Pega el id o el enlace de la skin.", false);

        async void Check()
        {
            var text = DialogInput.Text.Trim();
            var generation = ++_promptGeneration;
            skinId = null;
            confirm.IsEnabled = false;
            DialogImage.Visibility = Visibility.Collapsed;
            if (text.Length == 0) { SetHint("Pega el id o el enlace de la skin.", false); return; }
            var parsed = await _l.ParseSkinAsync(text);
            if (generation != _promptGeneration || DialogInput.Visibility != Visibility.Visible) return;
            if (!parsed.Valid) { SetHint(parsed.Reason ?? "Eso no es un id de NameMC.", false); return; }
            SetHint("Descargando la skin…", false);
            await Task.Delay(250);   // a paste arrives as one change, typing as many: fetch once it settles
            if (generation != _promptGeneration || DialogInput.Visibility != Visibility.Visible) return;
            try
            {
                var preview = await _l.FetchSkinAsync(text);
                if (generation != _promptGeneration || DialogInput.Visibility != Visibility.Visible) return;
                var image = new System.Windows.Media.Imaging.BitmapImage();
                image.BeginInit(); image.UriSource = new Uri(preview.Front); image.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad; image.EndInit(); image.Freeze();
                DialogImage.Source = image;
                DialogImage.Visibility = Visibility.Visible;
                skinId = preview.Id;
                confirm.IsEnabled = true;
                SetHint($"Skin {preview.Id}, modelo {(preview.Model == "slim" ? "fino (Alex)" : "normal (Steve)")}. Pulsa “Usar esta skin”.", false);
            }
            catch (EngineException ex) { if (generation == _promptGeneration) SetHint(ex.Message, true); }
        }
        _promptChanged = (_, _) => Check();
        _promptKeys = (_, e) => { if (e.Key == Key.Enter && confirm.IsEnabled) { e.Handled = true; confirm.RaiseEvent(new RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent)); } };
        DialogInput.TextChanged += _promptChanged;
        DialogInput.KeyDown += _promptKeys;

        // A NameMC link or id already on the clipboard is picked up (only when it is one; nothing else is ever read or kept).
        try
        {
            if (Clipboard.ContainsText())
            {
                var copied = Clipboard.GetText().Trim();
                if (copied.Length <= 300 && (copied.Contains("namemc.com", StringComparison.OrdinalIgnoreCase) || System.Text.RegularExpressions.Regex.IsMatch(copied, "^[0-9a-fA-F]{16}$")))
                    DialogInput.Text = copied;
            }
        }
        catch (Exception) { /* the clipboard can be busy: typing works the same */ }
        DialogInput.Focus();
        DialogInput.SelectAll();
    }

    private async Task ApplySkinAsync(string? id, Func<Task>? done)
    {
        if (id == null) return;
        ShowToast("Preparando la skin…");
        var error = await _l.ApplySkinAsync(id);
        if (error != null) { HideToast(); ShowDialog("No se pudo usar esa skin", error, ("Entendido", null, true)); return; }
        ShowToast("Skin lista: la verás al abrir Minecraft.");
        if (done != null) await done();
    }

    private async Task ClearSkinAsync(Func<Task>? done)
    {
        await _l.ClearSkinAsync();
        ShowToast("Skin quitada: vuelves a la skin por defecto.");
        if (done != null) await done();
    }

    private void SetHint(string text, bool problem)
    {
        DialogHint.Text = text;
        DialogHint.Foreground = (System.Windows.Media.Brush)FindResource(problem ? "DangerBrush" : "Paper3Brush");
    }

    private async Task UseOfflineNameAsync(string name, Func<Task>? done)
    {
        var error = await _l.UseOfflineAsync(name);
        if (error != null) ShowDialog("No se pudo usar ese nombre", error, ("Entendido", null, true));
        else if (done != null) await done();
    }

    private void CloseDialog()
    {
        _waiting = false;
        if (_promptChanged != null) { DialogInput.TextChanged -= _promptChanged; _promptChanged = null; }
        if (_promptKeys != null) { DialogInput.KeyDown -= _promptKeys; _promptKeys = null; }
        _promptGeneration++;
        DialogInput.Visibility = DialogHint.Visibility = DialogImage.Visibility = Visibility.Collapsed;
        DialogImage.Source = null;
        DialogInput.MaxLength = 16;
        DialogCloud.Source = null;
        DialogCloud.Visibility = Visibility.Collapsed;
        if (_linkClick != null) { DialogLink.Click -= _linkClick; _linkClick = null; }
        DialogLink.Visibility = Visibility.Collapsed;
        _dialogOpen = false;
        if (_dialogQueue.Count > 0)
        {
            DialogLayer.Visibility = Visibility.Collapsed;   // the next question is already waiting: no fade out and in between them
            _dialogQueue.Dequeue()();
            return;
        }
        // leaving is quicker than arriving (the player has already answered), and the buttons stop answering at once
        DialogLayer.IsHitTestVisible = false;
        Motion.Leave(DialogLayer, () => { if (!_dialogOpen) DialogLayer.Visibility = Visibility.Collapsed; }, 120);
    }

    // ---- window ---------------------------------------------------------------------------------------------------

    private void OnStateChanged()
    {
        // A borderless window that is maximised spills over the screen by the size of its resize border.
        Root.Margin = WindowState == WindowState.Maximized ? new Thickness(SystemParameters.WindowResizeBorderThickness.Left + 2) : new Thickness(0);
        MaxButton.Content = WindowState == WindowState.Maximized ? "" : "";
        if (WindowState == WindowState.Minimized) TrimMemory();
    }

    // ---- tray: out of the way while Minecraft runs ---------------------------------------------------------------

    private TrayIcon? _tray;
    private bool _exiting;
    private bool _hiddenForGame;

    private void OnGameChanged()
    {
        var game = _l.Game;
        // Same as the classic launcher: once Minecraft is up the launcher steps aside, and comes back when it closes.
        if (game.Running && !_hiddenForGame && IsVisible) { _hiddenForGame = true; HideToTray(); }
        else if (game.Phase == "idle" && _hiddenForGame) { _hiddenForGame = false; RestoreFromTray(); }
        else if (!IsVisible) _tray?.Show(TrayTip(), game.Running, !game.Busy);
    }

    private string TrayTip() => _l.Game.Running ? $"Empi Launcher: {_l.Host?.Name} en marcha" : "Empi Launcher";

    private void HideToTray()
    {
        if (_tray == null)
        {
            _tray = new TrayIcon();
            _tray.OpenRequested += RestoreFromTray;
            _tray.StopRequested += () => { try { _ = _l.Client.CallAsync("game.stop"); } catch { } };
            _tray.ExitRequested += () => { _exiting = true; Close(); };
        }
        _tray.Show(TrayTip(), _l.Game.Running, !_l.Game.Busy);
        Hide();
        TrimMemory();
    }

    private void RestoreFromTray()
    {
        _hiddenForGame = false;
        Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
        _tray?.Hide();
    }

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        // While Minecraft runs, closing the window only sends the launcher to the tray.
        if (!_exiting && (_l.Game.Running || _l.Game.Busy)) { e.Cancel = true; HideToTray(); return; }
        // A player closing the launcher sees the logo glitch it away (about half a second). Not when something else is closing it (an update,
        // the tray, Windows shutting down), not when it is not on screen, and a second click on close means "now".
        if (!_exiting && !_sessionEnding && SplashLayer.Wanted && IsVisible && WindowState != WindowState.Minimized)
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
        _tray?.Dispose();
        _ = _l.DisposeAsync();
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
            NativeMethods.EmptyWorkingSet(Process.GetCurrentProcess().Handle);
        }
        catch { }
    }
}
