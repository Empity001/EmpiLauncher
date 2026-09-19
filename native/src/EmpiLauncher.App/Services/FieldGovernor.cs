using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;

namespace EmpiLauncher.App.Services;

/// <summary>
/// Decides whether the living field may move. The interface is static by default: modules, cards and pills never animate at rest,
/// and the field is decoration that has to earn its cost. It is switched off, and shows a still frame instead, whenever motion
/// would compete with something that matters or would be pointless:
///   - a download, verification, game preparation or Minecraft itself is running;
///   - the window is minimised, hidden or not in front;
///   - the player turned motion off in Windows, or asked for performance mode (or "auto" on a machine under 6 GB);
///   - the machine is short of free memory;
///   - drawing is done by software (no GPU acceleration), where animation costs CPU instead of GPU.
/// </summary>
internal static class FieldGovernor
{
    private const double LowMemoryFreeMb = 800;
    private const double AutoPerformanceBelowGb = 6;

    public static string Reason { get; private set; } = "";
    public static bool Allowed => Reason.Length == 0;

    public static void Evaluate(Window? window)
    {
        Reason = Decide(window);
    }

    private static string Decide(Window? window)
    {
        // Development and measurement only: EMPI_FIELD=on always moves, EMPI_FIELD=off never does.
        var forced = Environment.GetEnvironmentVariable("EMPI_FIELD");
        if (forced == "on") return "";
        if (forced == "off") return "apagado por EMPI_FIELD";

        var l = Launcher.Instance;
        if (l.Game.Busy) return "hay una operación en curso";
        if (l.Game.Running) return "Minecraft está en marcha";
        if (window is not { IsVisible: true, IsActive: true } || window.WindowState == WindowState.Minimized) return "la ventana no está a la vista";
        if (!SystemParameters.ClientAreaAnimation) return "las animaciones están desactivadas en Windows";
        if (RenderCapability.Tier >> 16 == 0) return "el dibujo es por software, sin aceleración";

        var (totalMb, freeMb) = Memory();
        var mode = l.Config != null && l.Config.Settings.TryGetValue("performanceMode", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : "auto";
        if (mode == "on") return "el modo de rendimiento está activado";
        if (mode == "auto" && totalMb < AutoPerformanceBelowGb * 1024) return "equipo con poca memoria (modo automático)";
        if (freeMb < LowMemoryFreeMb) return "queda poca memoria libre";
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
