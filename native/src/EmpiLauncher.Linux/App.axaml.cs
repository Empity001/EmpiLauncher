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
