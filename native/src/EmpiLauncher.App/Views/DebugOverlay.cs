using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The debug panel (Ajustes > Launcher > Depuración): a small monospace box in the top corner with the numbers the player switched on,
/// refreshed once a second. Nothing is measured while every number is off, while the interface steps aside ("ver solo el fondo") or while
/// Minecraft runs; the GPU is only asked for while its number is on (Windows' counters for it cost a little to read).
/// </summary>
internal sealed class DebugOverlay : Border
{
    private readonly TextBlock _text = new() { FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0xE8, 0xEA)), TextWrapping = TextWrapping.Wrap };
    private readonly DispatcherTimer _timer = new(DispatcherPriority.Background) { Interval = TimeSpan.FromSeconds(1) };
    private readonly Stopwatch _since = new();
    private readonly Func<bool> _stepAside;
    private TimeSpan _uiCpu, _engineCpu;
    private GpuMeter? _gpu;

    public DebugOverlay(Func<bool> stepAside)
    {
        _stepAside = stepAside;
        Background = new SolidColorBrush(Color.FromArgb(0xC8, 0x0C, 0x0C, 0x10));
        BorderBrush = new SolidColorBrush(Color.FromArgb(0x30, 0xFF, 0xFF, 0xFF));
        BorderThickness = new Thickness(1);
        CornerRadius = new CornerRadius(6);
        Padding = new Thickness(9, 6, 9, 6);
        MaxWidth = 280;
        IsHitTestVisible = false;
        Visibility = Visibility.Collapsed;
        Child = _text;
        _timer.Tick += (_, _) => Tick();
        NativeSettings.DebugChanged += Update;
        Update();
    }

    /// <summary>Starts or stops the panel as the switches, the eye and the game allow.</summary>
    public void Update()
    {
        var any = NativeSettings.Debug.Count > 0;
        if (!NativeSettings.Debug.Contains("gpu")) { _gpu?.Dispose(); _gpu = null; }
        if (!any) { _timer.Stop(); Visibility = Visibility.Collapsed; return; }
        if (!_timer.IsEnabled) { Reset(); _timer.Start(); }
        Tick();
    }

    private void Reset()
    {
        _since.Restart();
        FrameClock.FramesDrawn = 0;
        FrameClock.DrawMs = 0;
        _uiCpu = Process.GetCurrentProcess().TotalProcessorTime;
        _engineCpu = EngineCpu();
    }

    private static TimeSpan EngineCpu()
    {
        try { return Launcher.Instance.EngineProcess is { HasExited: false } p ? p.TotalProcessorTime : TimeSpan.Zero; } catch (Exception) { return TimeSpan.Zero; }
    }

    private void Tick()
    {
        var shown = NativeSettings.Debug;
        if (_stepAside() || Launcher.Instance.Game.Running)
        {
            Visibility = Visibility.Collapsed;
            Reset();
            return;
        }
        var seconds = Math.Max(0.001, _since.Elapsed.TotalSeconds);
        var cores = Environment.ProcessorCount;
        var me = Process.GetCurrentProcess();
        var uiCpu = me.TotalProcessorTime;
        var engineCpu = EngineCpu();
        var frames = FrameClock.FramesDrawn;
        var drawMs = FrameClock.DrawMs;

        var lines = new List<string>();
        if (shown.Contains("fps"))
            lines.Add(FrameClock.Running > 0 ? $"FPS     {frames / seconds:0} / {FrameClock.Wanted:0}" : "FPS     quieto");
        if (shown.Contains("ms"))
            lines.Add(frames > 0 ? $"cuadro  {drawMs / frames:0.00} ms" : "cuadro  -");
        if (shown.Contains("cpu"))
            lines.Add($"CPU     UI {Share(uiCpu - _uiCpu, seconds, cores):0.0} %  motor {Share(engineCpu - _engineCpu, seconds, cores):0.0} %");
        if (shown.Contains("ram"))
        {
            var engine = Launcher.Instance.EngineProcess;
            double engineMb = 0;
            try { if (engine is { HasExited: false }) { engine.Refresh(); engineMb = engine.WorkingSet64 / 1048576.0; } } catch (Exception) { }
            lines.Add($"RAM     UI {me.WorkingSet64 / 1048576.0:0} MB  motor {engineMb:0} MB");
        }
        if (shown.Contains("gpu"))
        {
            _gpu ??= GpuMeter.TryOpen();
            var read = _gpu?.Read();
            lines.Add(read is { } g ? $"GPU     {g.Total:0} %  launcher {g.Mine:0.0} %" : "GPU     sin datos");
        }
        if (shown.Contains("field"))
        {
            var mode = FieldGovernor.PerfMode switch { "on" => "rendimiento activado", "off" => "rendimiento desactivado", _ => "rendimiento automático" };
            lines.Add(FieldGovernor.Allowed ? "fondo   se mueve" : "fondo   quieto: " + FieldGovernor.Reason);
            lines.Add("        " + mode + (FieldGovernor.Saving ? " (ahorrando)" : ""));
        }

        _text.Text = string.Join("\n", lines);
        Visibility = lines.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        _since.Restart();
        FrameClock.FramesDrawn = 0;
        FrameClock.DrawMs = 0;
        _uiCpu = uiCpu;
        _engineCpu = engineCpu;
    }

    private static double Share(TimeSpan used, double seconds, int cores) => Math.Max(0, used.TotalSeconds / seconds / cores * 100);
}

/// <summary>
/// The GPU's 3D engines as Windows' own counters see them (Task Manager reads the same ones): all of them, and the part that is this
/// process. Read through pdh.dll, so no extra package; a machine without the counters gets null and the panel says so.
/// </summary>
internal sealed class GpuMeter : IDisposable
{
    private const uint FmtDouble = 0x00000200, FmtNoCap100 = 0x00008000;
    private const int MoreData = unchecked((int)0x800007D2);
    private nint _query, _counter;
    private readonly string _mine = $"pid_{Environment.ProcessId}_";

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)] private static extern int PdhOpenQuery(string? source, nint user, out nint query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)] private static extern int PdhAddEnglishCounter(nint query, string path, nint user, out nint counter);
    [DllImport("pdh.dll")] private static extern int PdhCollectQueryData(nint query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)] private static extern int PdhGetFormattedCounterArray(nint counter, uint format, ref uint bytes, out uint count, nint items);
    [DllImport("pdh.dll")] private static extern int PdhCloseQuery(nint query);

    public static GpuMeter? TryOpen()
    {
        var meter = new GpuMeter();
        try
        {
            if (PdhOpenQuery(null, 0, out meter._query) != 0) return null;
            if (PdhAddEnglishCounter(meter._query, @"\GPU Engine(*engtype_3D)\Utilization Percentage", 0, out meter._counter) != 0) { meter.Dispose(); return null; }
            PdhCollectQueryData(meter._query);   // a rate needs two samples: the first one is taken now, the panel reads from the next second on
            return meter;
        }
        catch (Exception) { meter.Dispose(); return null; }
    }

    public (double Total, double Mine)? Read()
    {
        if (_query == 0 || PdhCollectQueryData(_query) != 0) return null;
        uint bytes = 0;
        if (PdhGetFormattedCounterArray(_counter, FmtDouble | FmtNoCap100, ref bytes, out _, 0) != MoreData || bytes == 0) return null;
        var buffer = Marshal.AllocHGlobal((int)bytes);
        try
        {
            if (PdhGetFormattedCounterArray(_counter, FmtDouble | FmtNoCap100, ref bytes, out var count, buffer) != 0) return null;
            double total = 0, mine = 0;
            // PDH_FMT_COUNTERVALUE_ITEM_W: the name's pointer, then the value (its status, then the double, aligned to 8): 24 bytes on both x86 and x64
            const int size = 24;
            for (var i = 0; i < count; i++)
            {
                var item = buffer + i * size;
                if (Marshal.ReadInt32(item, 8) != 0) continue;
                var value = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item, 16));
                total += value;
                if (Marshal.PtrToStringUni(Marshal.ReadIntPtr(item))?.StartsWith(_mine, StringComparison.Ordinal) == true) mine += value;
            }
            return (Math.Min(100, total), Math.Min(100, mine));
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    public void Dispose()
    {
        if (_query != 0) PdhCloseQuery(_query);
        _query = 0;
    }
}
