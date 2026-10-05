using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using EmpiLauncher.Linux.Services;
using EmpiLauncher.Linux.Views;

namespace EmpiLauncher.Linux;

public partial class App : Application
{
    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            // Fluent's own controls (slider, switch) wear the accent too: the keys hold the same brush the rest of the interface mutates
            foreach (var key in new[] { "SliderThumbBackground", "SliderThumbBackgroundPointerOver", "SliderThumbBackgroundPressed", "SliderTrackValueFill", "SliderTrackValueFillPointerOver",
                                        "SliderTrackValueFillPressed", "ToggleSwitchFillOn", "ToggleSwitchFillOnPointerOver", "ToggleSwitchFillOnPressed", "TextControlBorderBrushFocused" })
                Resources[key] = Views.Pal.Accent;
            var window = new MainWindow();
            desktop.MainWindow = window;
            // the notification-area icon (where the desktop has one: GNOME needs the AppIndicator extension, KDE and others have it)
            try
            {
                void Show() { if (window.WindowState == Avalonia.Controls.WindowState.Minimized) window.WindowState = Avalonia.Controls.WindowState.Normal; window.Show(); window.Activate(); }
                var open = new Avalonia.Controls.NativeMenuItem("Abrir Empi Launcher"); open.Click += (_, _) => Show();
                var stop = new Avalonia.Controls.NativeMenuItem("Detener Minecraft"); stop.Click += (_, _) => { if (Services.Launcher.Instance.Game.Running) _ = Services.Launcher.Instance.PrimaryActionAsync(); };
                var exit = new Avalonia.Controls.NativeMenuItem("Salir"); exit.Click += (_, _) => { if (!Services.Launcher.Instance.Game.Busy) window.Close(); };
                var menu = new Avalonia.Controls.NativeMenu { open, stop, new Avalonia.Controls.NativeMenuItemSeparator(), exit };
                var tray = new Avalonia.Controls.TrayIcon { ToolTipText = "Empi Launcher", Menu = menu, Icon = new Avalonia.Controls.WindowIcon(Avalonia.Platform.AssetLoader.Open(new Uri("avares://EmpiLauncher/Assets/icon.png"))) };
                tray.Clicked += (_, _) => Show();
                Avalonia.Controls.TrayIcon.SetIcons(this, new Avalonia.Controls.TrayIcons { tray });
            }
            catch (Exception ex) { Log("tray", ex); }
            desktop.ShutdownRequested += (_, _) => { try { Launcher.Instance.DisposeAsync().AsTask().Wait(3000); } catch { } };
        }
        base.OnFrameworkInitializationCompleted();
    }

    /// <summary>One line in ~/.local/state/empilauncher/launcher.log (and on stderr) for things that must not crash the window.</summary>
    public static void Log(string what, Exception? ex = null)
    {
        try
        {
            var dir = Path.Combine(Environment.GetEnvironmentVariable("XDG_STATE_HOME") is { Length: > 0 } s ? s : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "state"), "empilauncher");
            Directory.CreateDirectory(dir);
            File.AppendAllText(Path.Combine(dir, "launcher.log"), $"{DateTime.Now:s} {what} {ex}\n");
        }
        catch { }
        Console.Error.WriteLine($"{what} {ex?.Message}");
    }
}
