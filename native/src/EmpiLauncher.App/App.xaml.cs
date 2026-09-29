using System.IO;
using System.Windows;

namespace EmpiLauncher.App;

public partial class App : Application
{
    /// <summary>Where the launcher writes what went wrong, so a crash is never silent.</summary>
    public static string LogPath { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EmpiLauncher.Native", "launcher.log");

    public App()
    {
        DispatcherUnhandledException += (_, e) => { Log("UI thread", e.Exception); e.Handled = true; };
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log("unhandled", e.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, e) => { Log("task", e.Exception); e.SetObserved(); };
    }

    /// <summary>The window is dressed in the player's style from its first frame (the engine is not needed for that: NativeSettings).</summary>
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        try
        {
            var style = Styles.StyleCatalog.Get(Services.NativeSettings.Style).Id;
            if (style != Styles.StyleCatalog.Base) Styles.StyleTheme.Apply(style);
            Services.Launcher.RefreshAccent();
        }
        catch (Exception ex) { Log("style at start", ex); }
    }

    public static void Log(string where, Exception? ex)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            File.AppendAllText(LogPath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{where}] {ex}\n");
        }
        catch { /* logging must never be the thing that crashes */ }
    }
}
