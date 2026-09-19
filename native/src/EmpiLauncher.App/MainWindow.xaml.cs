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
        }
    }

    // ---- views ----------------------------------------------------------------------------------------------------

    private void ShowHome()
    {
        ReleaseSettings();
        var home = new HomeView();
        home.OpenSettings += () => ShowSettings();
        ViewHost.Content = home;
    }

    private void ShowSettings(string tab = "account")
    {
        var view = new SettingsView(tab);
        view.Done += ShowHome;
        _settings = view;
        ViewHost.Content = view;
    }

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

    private void CloseDialog()
    {
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

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        // While Minecraft runs the launcher stays out of the way (the classic one hides to the tray): closing only minimises.
        if (_l.Game.Running || _l.Game.Busy) { e.Cancel = true; WindowState = WindowState.Minimized; return; }
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
