using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using EmpiLauncher.App.Themes;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views;

/// <summary>
/// Plays an animated banner or background: the engine turned the GIF / WebP / APNG into a short list of small still files with the time each one
/// stays and how many times to loop (0 = for ever), and this puts them on an Image one after the other. Only the frame that is shown is in memory
/// (each one is read from its file when its time comes), so a 96-frame banner costs about what one picture does.
///
/// It plays while it can be seen and is worth its cost: the window is in front and not minimised, the image is visible, Windows animations are on
/// and the player did not turn animated art off in Ajustes. Otherwise it stops where it is and picks up again when it can; the still picture
/// underneath is always what the Image holds first. Time is kept by a clock, not by counting ticks, so a slow tick never slows the animation down.
/// </summary>
internal sealed class FramePlayer : IDisposable
{
    private readonly Image _target;
    private readonly AnimInfo _anim;
    private readonly int _decodeWidth;
    private readonly Func<bool> _allowed;
    private readonly long[] _starts;
    private readonly long _period;
    private readonly DispatcherTimer _timer = new(DispatcherPriority.Render);
    private readonly Stopwatch _clock = new();
    private long _elapsedBefore;   // playing time accumulated before the last pause
    private int _shown = -1;
    private bool _finished, _disposed;
    private Window? _window;

    public FramePlayer(Image target, AnimInfo anim, int decodeWidth, Func<bool> allowed)
    {
        _target = target; _anim = anim; _decodeWidth = decodeWidth; _allowed = allowed;
        _starts = new long[anim.Delays.Count];
        long total = 0;
        for (var i = 0; i < anim.Delays.Count; i++) { _starts[i] = total; total += Math.Max(1, anim.Delays[i]); }
        _period = Math.Max(1, total);
        _timer.Tick += (_, _) => Step();
    }

    /// <summary>Is this the same animation (the same files), so a running player does not have to be replaced?</summary>
    public bool Matches(AnimInfo other) => other.Frames.Count == _anim.Frames.Count && other.Frames.Count > 0 && other.Frames[0] == _anim.Frames[0];

    public void Start()
    {
        _window = Window.GetWindow(_target) ?? Application.Current.MainWindow;
        if (_window != null) { _window.Activated += OnWindowChanged; _window.Deactivated += OnWindowChanged; _window.StateChanged += OnWindowChanged; }
        _target.IsVisibleChanged += OnVisibleChanged;
        Show(0);
        Evaluate();
    }

    private void OnWindowChanged(object? sender, EventArgs e) => Evaluate();
    private void OnVisibleChanged(object sender, DependencyPropertyChangedEventArgs e) => Evaluate();

    /// <summary>Play or pause according to whether it is worth it right now.</summary>
    public void Evaluate()
    {
        if (_disposed || _finished) return;
        var can = _allowed() && _window is { IsActive: true, WindowState: not WindowState.Minimized } && _target.IsVisible;
        if (can && !_clock.IsRunning) { _clock.Restart(); Schedule(); }
        else if (!can && _clock.IsRunning) { _elapsedBefore += _clock.ElapsedMilliseconds; _clock.Reset(); _timer.Stop(); }
    }

    private long Elapsed => _elapsedBefore + (_clock.IsRunning ? _clock.ElapsedMilliseconds : 0);

    private void Step()
    {
        if (_disposed) return;
        var elapsed = Elapsed;
        var loops = _anim.Loops;
        if (loops > 0 && elapsed >= loops * _period)
        {
            // a picture that loops a fixed number of times ends on its last frame
            Show(_starts.Length - 1);
            _finished = true; _timer.Stop(); _clock.Reset();
            return;
        }
        var inLoop = elapsed % _period;
        var index = Array.FindLastIndex(_starts, s => s <= inLoop);
        Show(index < 0 ? 0 : index);
        Schedule();
    }

    /// <summary>The next tick is when the next frame is due (a long pause does not tick in between).</summary>
    private void Schedule()
    {
        if (!_clock.IsRunning) return;
        var inLoop = Elapsed % _period;
        var next = _shown + 1 < _starts.Length ? _starts[_shown + 1] : _period;
        _timer.Interval = TimeSpan.FromMilliseconds(Math.Clamp(next - inLoop, 5, 60000));
        _timer.Start();
    }

    private void Show(int index)
    {
        if (index == _shown || index < 0 || index >= _anim.Frames.Count) return;
        var frame = ScreenshotViewer.Decode(_anim.Frames[index], _decodeWidth);
        if (frame == null) return;   // a frame that cannot be read is skipped: the one before stays
        _shown = index;
        _target.Source = frame;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _timer.Stop(); _clock.Reset();
        if (_window != null) { _window.Activated -= OnWindowChanged; _window.Deactivated -= OnWindowChanged; _window.StateChanged -= OnWindowChanged; }
        _target.IsVisibleChanged -= OnVisibleChanged;
    }

    /// <summary>Animated art plays only if Windows animations are on and the player has not turned it off.</summary>
    public static bool Wanted => Motion.Enabled && Services.Launcher.Instance.Prefs.AnimatedArt != false;
}
