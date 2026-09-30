using System.Diagnostics;
using System.Windows.Media;
using System.Windows.Threading;

namespace EmpiLauncher.App.Views;

/// <summary>
/// Calls a background's frame at a given rate, and keeps to it. A DispatcherTimer alone cannot: Windows wakes it on its own ~15.6 ms
/// ticks, so "30 per second" came out near 21 and "15" near 13, and the backgrounds looked jerky. Up to 20 per second a timer is used,
/// aimed at deadlines (a late frame makes the next one sooner, so the average holds); above that the frames ride the screen's refresh
/// (CompositionTarget.Rendering) and are skipped to the rate asked for. The screen's refresh costs a little even when nothing is drawn,
/// which is why slow rates stay on the timer.
/// </summary>
internal sealed class FrameClock
{
    private const double VsyncAbove = 20;
    private readonly DispatcherTimer _timer = new(DispatcherPriority.Render);
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly Action _frame;
    private double _fps = 15, _due;
    private bool _running, _vsync;

    public FrameClock(Action frame)
    {
        _frame = frame;
        _timer.Tick += (_, _) => OnTimer();
    }

    public bool IsRunning => _running;

    // for the debug panel (DebugOverlay): frames drawn and the time spent drawing them, by every clock, since it last looked
    public static int FramesDrawn;
    public static double DrawMs;
    public static double Wanted;
    public static int Running;

    /// <summary>Frames per second wanted now. Changing it keeps the clock running.</summary>
    public double Fps
    {
        get => _fps;
        set
        {
            value = Math.Clamp(value, 1, 120);
            if (Math.Abs(value - _fps) < 0.01) return;
            _fps = value;
            if (_running) Arm();
        }
    }

    public void Start()
    {
        if (_running) return;
        _running = true;
        Running++;
        _due = _clock.Elapsed.TotalSeconds + 1 / _fps;
        Arm();
    }

    public void Stop()
    {
        if (!_running) return;
        _running = false;
        Running--;
        _timer.Stop();
        if (_vsync) { CompositionTarget.Rendering -= OnRendering; _vsync = false; }
    }

    private void Arm()
    {
        var vsync = _fps > VsyncAbove;
        if (vsync != _vsync)
        {
            if (vsync) { _timer.Stop(); CompositionTarget.Rendering += OnRendering; }
            else CompositionTarget.Rendering -= OnRendering;
            _vsync = vsync;
        }
        if (!_vsync) Schedule();
    }

    private void Schedule()
    {
        var wait = Math.Max(1, (_due - _clock.Elapsed.TotalSeconds) * 1000);
        _timer.Interval = TimeSpan.FromMilliseconds(wait);
        if (!_timer.IsEnabled) _timer.Start();
    }

    private void OnTimer()
    {
        _timer.Stop();
        if (!_running) return;
        Advance();
        Draw();
        if (_running && !_vsync) Schedule();
    }

    private void OnRendering(object? sender, EventArgs e)
    {
        if (!_running) return;
        // a frame is due when its time has come (with a little slack: the screen's refresh is not exactly a multiple of the rate)
        if (_clock.Elapsed.TotalSeconds + 0.25 / _fps < _due) return;
        Advance();
        Draw();
    }

    private void Draw()
    {
        var start = _clock.Elapsed.TotalMilliseconds;
        _frame();
        DrawMs += _clock.Elapsed.TotalMilliseconds - start;
        FramesDrawn++;
        Wanted = _fps;
    }

    /// <summary>The next deadline: one period on, unless the clock fell far behind (a pause), then from now.</summary>
    private void Advance()
    {
        var now = _clock.Elapsed.TotalSeconds;
        _due += 1 / _fps;
        if (_due < now - 0.25) _due = now + 1 / _fps;
    }
}
