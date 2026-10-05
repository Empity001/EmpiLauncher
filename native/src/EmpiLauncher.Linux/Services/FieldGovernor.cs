using System.Text.Json;
using Avalonia.Controls;
using EmpiLauncher.Linux.Views;

namespace EmpiLauncher.Linux.Services;

/// <summary>
/// Decides whether the living field may move, and how fast. The interface is static by default: modules, cards and pills never animate
/// at rest, and the field is decoration that has to earn its cost. It is switched off, and shows a still frame instead, whenever motion
/// would compete with something that matters or would be pointless: Minecraft is running, the window is minimised or not in front, the
/// machine is short of free memory (unless performance mode is off) or the player turned motion off.
/// How fast (Rate) follows the performance mode: "Activado" (or "Automático" on a machine under 6 GB) caps it at SaverFps; "Automático"
/// moves between the player's minimum and maximum; "Desactivado" holds the one rate the player chose (NativeSettings).
/// </summary>
internal static class FieldGovernor
{
    private const double LowMemoryFreeMb = 800;
    private const double AutoPerformanceBelowGb = 6;
    public const int SaverFps = 15;

    public static string Reason { get; private set; } = "";
    public static bool Allowed => Reason.Length == 0;

    /// <summary>The performance mode the player chose: "auto", "on" or "off".</summary>
    public static string PerfMode =>
        Launcher.Instance.Config != null && Launcher.Instance.Config.Settings.TryGetValue("performanceMode", out var m) && m.ValueKind == JsonValueKind.String && m.GetString() is "on" or "off" ? m.GetString()! : "auto";

    public static bool Saving => PerfMode == "on" || PerfMode == "auto" && Memory().TotalMb < AutoPerformanceBelowGb * 1024;

    public static (double Idle, double Active) Rate(double styleIdleFps)
    {
        if (Saving) return (Math.Min(styleIdleFps, SaverFps), SaverFps);
        if (PerfMode == "off") return (NativeSettings.FpsFixed, NativeSettings.FpsFixed);
        return (NativeSettings.FpsMin, NativeSettings.FpsMax);
    }

    public static string RateText()
    {
        var (idle, active) = Rate(SaverFps);
        return Saving ? $"a {SaverFps} FPS como máximo" : Math.Abs(idle - active) < 0.5 ? $"a {active:0} FPS" : $"entre {idle:0} y {active:0} FPS";
    }

    private static string _yielded = "";
    public static void Yield(string reason) { _yielded = reason; Reason = reason; }
    public static void ResetYield() => _yielded = "";

    public static void Evaluate(Window? window)
    {
        Reason = Decide(window);
        Styles.StyleTheme.SetMoving(Allowed);
    }

    private static string Decide(Window? window)
    {
        // Development and measurement only: EMPI_FIELD=on always moves, EMPI_FIELD=off never does.
        var forced = Environment.GetEnvironmentVariable("EMPI_FIELD");
        if (forced == "on") return "";
        if (forced == "off") return "apagado por EMPI_FIELD";

        var l = Launcher.Instance;
        var choice = l.Prefs.FieldMode;
        if (choice == "off") return "tú lo apagaste en Ajustes";
        if (window is not { IsVisible: true } || window.WindowState == WindowState.Minimized) return "la ventana no está a la vista (ni modo que me mueva para nadie)";
        if (choice == "always") return window.IsActive ? "" : "la ventana no está en primer plano";

        var saverOff = PerfMode == "off";
        if (_yielded.Length > 0 && !saverOff) return _yielded;
        if (l.Game.Running) return "estás jugando Minecraft y no le quiero robar fuerzas";
        if (!window.IsActive) return "la ventana no está en primer plano";
        if (!saverOff && Memory().FreeMb < LowMemoryFreeMb) return "queda poquita memoria libre";
        return "";
    }

    private static DateTime _memAt;
    private static (double TotalMb, double FreeMb) _mem = (double.MaxValue, double.MaxValue);

    /// <summary>Total and available memory from /proc/meminfo (looked at at most every few seconds).</summary>
    private static (double TotalMb, double FreeMb) Memory()
    {
        if (DateTime.UtcNow - _memAt < TimeSpan.FromSeconds(4)) return _mem;
        _memAt = DateTime.UtcNow;
        try
        {
            double total = 0, free = 0;
            foreach (var line in File.ReadLines("/proc/meminfo"))
            {
                if (line.StartsWith("MemTotal:")) total = KbOf(line);
                else if (line.StartsWith("MemAvailable:")) { free = KbOf(line); break; }
            }
            if (total > 0) _mem = (total / 1024, free / 1024);
        }
        catch (Exception) { /* unknown: it never blocks the field */ }
        return _mem;
    }

    private static double KbOf(string line) => double.TryParse(line.Split(' ', StringSplitOptions.RemoveEmptyEntries)[1], out var kb) ? kb : 0;
}
