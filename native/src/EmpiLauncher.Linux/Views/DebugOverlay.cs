using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The debug panel (Ajustes > Launcher > Depuración): a small monospace box in the top corner with the numbers the player switched on, refreshed
/// once a second. Nothing is measured while every number is off, while the interface steps aside ("ver solo el fondo") or while Minecraft runs;
/// the GPU is only asked for while its number is on.
/// </summary>
internal sealed class DebugOverlay : Border
{
    private readonly TextBlock _text = new() { FontFamily = Pal.Mono, FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0xE8, 0xE8, 0xEA)), TextWrapping = TextWrapping.NoWrap };
    private readonly DispatcherTimer _timer = new(DispatcherPriority.Background) { Interval = TimeSpan.FromSeconds(1) };
    private readonly Stopwatch _since = new();
    private readonly Func<bool> _stepAside;
    private TimeSpan _uiCpu, _engineCpu;

    public DebugOverlay(Func<bool> stepAside)
    {
        _stepAside = stepAside;
        Background = new SolidColorBrush(Color.FromArgb(0xC8, 0x0C, 0x0C, 0x10));
        BorderBrush = new SolidColorBrush(Color.FromArgb(0x30, 0xFF, 0xFF, 0xFF));
        BorderThickness = new Thickness(1);
        CornerRadius = new CornerRadius(6);
        Padding = new Thickness(9, 6);
        MaxWidth = 340;
        IsHitTestVisible = false;
        IsVisible = false;
        Child = _text;
        _timer.Tick += (_, _) => Tick();
        NativeSettings.DebugChanged += Update;
        Update();
    }

    /// <summary>Starts or stops the panel as the switches, the eye and the game allow.</summary>
    public void Update()
    {
        if (NativeSettings.Debug.Count == 0) { _timer.Stop(); IsVisible = false; return; }
        if (!_timer.IsEnabled) { Reset(); _timer.Start(); }
        Tick();
    }

    private void Reset()
    {
        _since.Restart();
        FrameClock.FramesDrawn = 0; FrameClock.DrawMs = 0;
        _uiCpu = Process.GetCurrentProcess().TotalProcessorTime;
        _engineCpu = EngineCpu();
    }

    private static TimeSpan EngineCpu()
    {
        try { return Services.Launcher.Instance.EngineProcess is { HasExited: false } p ? p.TotalProcessorTime : TimeSpan.Zero; } catch (Exception) { return TimeSpan.Zero; }
    }

    /// <summary>The GPU's busy percentage where the driver says it (amdgpu: /sys/class/drm/card*/device/gpu_busy_percent); null elsewhere.</summary>
    private static double? GpuBusy()
    {
        try
        {
            foreach (var dir in Directory.EnumerateDirectories("/sys/class/drm", "card?"))
            {
                var file = System.IO.Path.Combine(dir, "device", "gpu_busy_percent");
                if (File.Exists(file) && double.TryParse(File.ReadAllText(file).Trim(), out var v)) return v;
            }
        }
        catch (Exception) { }
        return null;
    }

    private void Tick()
    {
        var shown = NativeSettings.Debug;
        if (_stepAside() || Services.Launcher.Instance.Game.Running) { IsVisible = false; Reset(); return; }
        var seconds = Math.Max(0.001, _since.Elapsed.TotalSeconds);
        var cores = Environment.ProcessorCount;
        var me = Process.GetCurrentProcess();
        var uiCpu = me.TotalProcessorTime;
        var engineCpu = EngineCpu();
        var frames = FrameClock.FramesDrawn;
        var drawMs = FrameClock.DrawMs;

        var lines = new List<string>();
        if (shown.Contains("fps")) lines.Add(FrameClock.Running > 0 ? $"FPS     {frames / seconds:0} / {FrameClock.Wanted:0}" : "FPS     quieto");
        if (shown.Contains("ms")) lines.Add(frames > 0 ? $"cuadro  {drawMs / frames:0.00} ms" : "cuadro  -");
        if (shown.Contains("cpu")) lines.Add($"CPU     UI {Share(uiCpu - _uiCpu, seconds, cores):0.0} %  motor {Share(engineCpu - _engineCpu, seconds, cores):0.0} %");
        if (shown.Contains("ram"))
        {
            var engine = Services.Launcher.Instance.EngineProcess;
            double engineMb = 0;
            try { if (engine is { HasExited: false }) { engine.Refresh(); engineMb = engine.WorkingSet64 / 1048576.0; } } catch (Exception) { }
            lines.Add($"RAM     UI {me.WorkingSet64 / 1048576.0:0} MB  motor {engineMb:0} MB");
        }
        if (shown.Contains("gpu")) lines.Add(GpuBusy() is { } g ? $"GPU     {g:0} %" : "GPU     sin datos");
        if (shown.Contains("field"))
        {
            var mode = FieldGovernor.PerfMode switch { "on" => "rendimiento activado", "off" => "rendimiento desactivado", _ => "rendimiento automático" };
            lines.Add(FieldGovernor.Allowed ? "fondo   se mueve" : "fondo   quieto: " + FieldGovernor.Reason);
            lines.Add("        " + mode + (FieldGovernor.Saving ? " (ahorrando)" : ""));
        }

        _text.Text = string.Join("\n", lines);
        IsVisible = lines.Count > 0;
        _since.Restart();
        FrameClock.FramesDrawn = 0; FrameClock.DrawMs = 0;
        _uiCpu = uiCpu; _engineCpu = engineCpu;
    }

    private static double Share(TimeSpan used, double seconds, int cores) => Math.Max(0, used.TotalSeconds / seconds / cores * 100);
}
