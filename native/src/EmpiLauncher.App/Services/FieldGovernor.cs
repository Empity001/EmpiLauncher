using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;

namespace EmpiLauncher.App.Services;

/// <summary>
/// Decides whether the living field may move, and how fast. The interface is static by default: modules, cards and pills never animate
/// at rest, and the field is decoration that has to earn its cost. It is switched off, and shows a still frame instead, whenever motion
/// would compete with something that matters or would be pointless:
///   - Minecraft itself is running (the launcher is out of the way then anyway);
///   - the window is minimised, hidden or not in front;
///   - the player turned motion off in Windows;
///   - the machine is short of free memory (unless the player switched performance mode off);
///   - drawing is done by software (no GPU acceleration), where animation costs CPU instead of GPU.
/// How fast (Rate) follows the performance mode: "Activado" (or "Automático" on a machine under 6 GB) caps it at SaverFps; "Automático"
/// moves between the player's minimum and maximum; "Desactivado" holds the one rate the player chose (NativeSettings).
/// </summary>
internal static class FieldGovernor
{
    private const double LowMemoryFreeMb = 800;
    private const double AutoPerformanceBelowGb = 6;
    /// <summary>The cap while saving: enough to keep the background alive, cheap enough for a modest machine.</summary>
    public const int SaverFps = 15;

    public static string Reason { get; private set; } = "";
    public static bool Allowed => Reason.Length == 0;

    /// <summary>The performance mode the player chose: "auto", "on" or "off".</summary>
    public static string PerfMode =>
        Launcher.Instance.Config != null && Launcher.Instance.Config.Settings.TryGetValue("performanceMode", out var m) && m.ValueKind == JsonValueKind.String && m.GetString() is "on" or "off" ? m.GetString()! : "auto";

    /// <summary>Whether the background is capped to save (performance mode on, or automatic on a machine under 6 GB).</summary>
    public static bool Saving => PerfMode == "on" || PerfMode == "auto" && Memory().TotalMb < AutoPerformanceBelowGb * 1024;

    /// <summary>
    /// Frames per second for a background now: while nothing happens, and while the player moves, clicks or a style arrives. A style's own
    /// quiet pace (<paramref name="styleIdleFps"/>) only counts while saving, where it may go under the cap.
    /// </summary>
    public static (double Idle, double Active) Rate(double styleIdleFps)
    {
        if (Saving) return (Math.Min(styleIdleFps, SaverFps), SaverFps);
        if (PerfMode == "off") return (NativeSettings.FpsFixed, NativeSettings.FpsFixed);
        return (NativeSettings.FpsMin, NativeSettings.FpsMax);
    }

    /// <summary>The rate in words, for Ajustes: "a 30 FPS", "entre 15 y 30 FPS".</summary>
    public static string RateText()
    {
        var (idle, active) = Rate(SaverFps);
        return Saving ? $"a {SaverFps} FPS como máximo" : Math.Abs(idle - active) < 0.5 ? $"a {active:0} FPS" : $"entre {idle:0} y {active:0} FPS";
    }

    private static string _yielded = "";

    /// <summary>The field measured its own frames, could not afford them even thinned out, and stops until the player picks a mode again.</summary>
    public static void Yield(string reason) { _yielded = reason; Reason = reason; }
    public static void ResetYield() => _yielded = "";

    public static void Evaluate(Window? window)
    {
        Reason = Decide(window);
        Styles.StyleTheme.SetMoving(Allowed);   // a style's moving foil (Celestial's title and Play) follows the same rule as the background
    }

    private static string Decide(Window? window)
    {
        // Development and measurement only: EMPI_FIELD=on always moves, EMPI_FIELD=off never does.
        var forced = Environment.GetEnvironmentVariable("EMPI_FIELD");
        if (forced == "on") return "";
        if (forced == "off") return "apagado por EMPI_FIELD";

        var l = Launcher.Instance;
        // The player's own choice (Ajustes > Acerca): off is off; "always" skips every economy rule below and only needs a window in front.
        var choice = l.Prefs.FieldMode;
        if (choice == "off") return "tú lo apagaste en Ajustes";
        if (window is not { IsVisible: true } || window.WindowState == WindowState.Minimized) return "la ventana no está a la vista (ni modo que me mueva para nadie)";
        if (choice == "always") return window.IsActive ? "" : "la ventana no está en primer plano";

        // performance mode off: the player asked for the background whatever it costs, so the frames it could not afford never stop it
        var saverOff = PerfMode == "off";
        if (_yielded.Length > 0 && !saverOff) return _yielded;
        // Downloads, updates and checks do NOT stop it: the field, its breathing and its click waves stay while the player watches a
        // progress bar. Only the machine's own limits (below) and the player's choice can put it to sleep. Performance mode does not
        // stop it either: it only caps its frames (Rate).
        if (l.Game.Running) return "estás jugando Minecraft y no le quiero robar fuerzas";
        if (!window.IsActive) return "la ventana no está en primer plano";
        if (!SystemParameters.ClientAreaAnimation) return "Windows tiene las animaciones apagadas";
        if (RenderCapability.Tier >> 16 == 0) return "tu compu dibuja sin tarjeta gráfica y moverlo le costaría mucho";
        if (!saverOff && Memory().FreeMb < LowMemoryFreeMb) return "queda poquita memoria libre";
        return "";
    }

    private static (double TotalMb, double FreeMb) Memory()
    {
        var status = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        return GlobalMemoryStatusEx(ref status) ? (status.ullTotalPhys / 1048576.0, status.ullAvailPhys / 1048576.0) : (double.MaxValue, double.MaxValue);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength, dwMemoryLoad;
        public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll")] private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX status);
}
