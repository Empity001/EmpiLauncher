using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using EmpiLauncher.App.Services;
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
        UpdateButton.Click += (_, _) => OnUpdateClick();
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

        Loaded += async (_, _) => await StartAsync();
        Closing += OnClosing;
    }

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
        UpdateButton.Visibility = update == null ? Visibility.Collapsed : Visibility.Visible;
        if (update != null) UpdateButton.Content = $"NUEVA VERSIÓN {update.Version}";
    }

    private void OnUpdateClick()
    {
        var update = _l.Update;
        if (update == null) return;
        ShowDialog($"Empi Launcher {update.Version}",
            $"Hay una versión nueva del launcher. Ahora tienes la {update.Current}. Se descarga desde la página de la versión.",
            ("Más tarde", null, false),
            ("Abrir la descarga", () => { if (update.Page != null) Process.Start(new ProcessStartInfo(update.Page) { UseShellExecute = true }); }, true));
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
        ReleaseSettings();
        var home = new HomeView();
        home.OpenSettings += () => ShowSettings();
        ViewHost.Content = home;
        UpdateBackdrop();
        ScheduleTrim();
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

    public void ShowToast(string text)
    {
        ToastText.Text = text;
        Toast.Visibility = Visibility.Visible;
        _toastTimer.Stop();
        _toastTimer.Start();
    }

    private void HideToast() { _toastTimer.Stop(); Toast.Visibility = Visibility.Collapsed; }

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
        DialogLayer.Visibility = Visibility.Visible;
        if (DialogButtons.Children.Count > 0) ((Button)DialogButtons.Children[^1]).Focus();
    }

    private bool _waiting;

    /// <summary>A dialog that stays until the work behind it ends (HideWaiting) or the player cancels.</summary>
    public void ShowWaiting(string title, string message, Action cancel)
    {
        ShowDialog(title, message, ("Cancelar", cancel, false));
        _waiting = _dialogOpen;
    }

    public void HideWaiting()
    {
        if (_waiting && _dialogOpen) CloseDialog();
        _waiting = false;
    }

    private void CloseDialog()
    {
        _waiting = false;
        DialogLayer.Visibility = Visibility.Collapsed;
        _dialogOpen = false;
        if (_dialogQueue.Count > 0) _dialogQueue.Dequeue()();
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

    private string TrayTip() => _l.Game.Running ? $"Empi Launcher: {_l.Selected?.Name} en marcha" : "Empi Launcher";

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
        _tray?.Dispose();
        _ = _l.DisposeAsync();
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
