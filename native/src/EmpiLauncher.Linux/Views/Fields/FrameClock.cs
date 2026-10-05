using System.Diagnostics;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

/// <summary>Calls a background's frame at a given rate and keeps to it: a timer aimed at deadlines, so a late frame makes the next one sooner and the average holds.</summary>
internal sealed class FrameClock
{
    private readonly DispatcherTimer _timer = new(DispatcherPriority.Render);
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly Action _frame;
    private double _fps = 15, _due;
    private bool _running;

    public FrameClock(Action frame)
    {
        _frame = frame;
        _timer.Tick += (_, _) => OnTimer();
    }

    public bool IsRunning => _running;

    // for the debug panel: frames drawn and the time spent drawing them, by every clock
    public static int FramesDrawn;
    public static double DrawMs;
    public static double Wanted;
    public static int Running;

    public double Fps
    {
        get => _fps;
        set { value = Math.Clamp(value, 1, 120); if (Math.Abs(value - _fps) < 0.01) return; _fps = value; if (_running) Schedule(); }
    }

    public void Start()
    {
        if (_running) return;
        _running = true; Running++;
        _due = _clock.Elapsed.TotalSeconds + 1 / _fps;
        Schedule();
    }

    public void Stop()
    {
        if (!_running) return;
        _running = false; Running--;
        _timer.Stop();
    }

    private void Schedule()
    {
        _timer.Interval = TimeSpan.FromMilliseconds(Math.Max(1, (_due - _clock.Elapsed.TotalSeconds) * 1000));
        if (!_timer.IsEnabled) _timer.Start();
    }

    private void OnTimer()
    {
        _timer.Stop();
        if (!_running) return;
        var now = _clock.Elapsed.TotalSeconds;
        _due += 1 / _fps;
        if (_due < now - 0.25) _due = now + 1 / _fps;   // fell far behind (a pause): start again from now
        var start = _clock.Elapsed.TotalMilliseconds;
        _frame();
        DrawMs += _clock.Elapsed.TotalMilliseconds - start;
        FramesDrawn++; Wanted = _fps;
        if (_running) Schedule();
    }
}
