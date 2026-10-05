using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Threading;
using EmpiLauncher.Linux.Styles;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The background of the window: the style's own drawing (LivingField for the base style, a StyleField for the others).
///
/// Changing style never cuts anything. The styles in play are a stack, bottom to top: the bottom one is fully there, each one above it is
/// arriving or withdrawing at its own pace, with a velocity that eases instead of jumping. A change of mind while one is arriving leaves it
/// arriving underneath the newcomer, and going back to a style makes the ones covering it withdraw the way they came. Each style draws its
/// own arrival from the progress it is given.
/// </summary>
internal sealed class StyleHost : Panel
{
    /// <summary>A style's background as the host drives it.</summary>
    public interface ILayer
    {
        Control View { get; }
        /// <summary>How much of the style is there: 0 nothing, 1 all of it. The style draws its own way in and out.</summary>
        void SetReveal(double progress);
        /// <summary>A ring (or its style's answer to a click) from a point.</summary>
        void Burst(Point point, bool accent);
        double ArriveSeconds { get; }
        double Ease(double raw);
    }

    private sealed class Entry(string id, ILayer layer)
    {
        public string Id { get; } = id;
        public ILayer Layer { get; } = layer;
        public double Raw, Vel;
        public int Dir;
    }

    private readonly List<Entry> _stack = [];
    private readonly DispatcherTimer _timer = new(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(16) };
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private double _last;

    public string Wanted { get; private set; }

    public StyleHost()
    {
        IsHitTestVisible = false;
        Wanted = StyleTheme.Current;
        var first = new Entry(Wanted, StyleFactory.Create(Wanted)) { Raw = 1 };
        _stack.Add(first);
        Children.Add(first.Layer.View);
        first.Layer.SetReveal(1);
        _timer.Tick += (_, _) => Step();
    }

    /// <summary>Brings a style in (or back): it arrives over what is there, or the styles covering it withdraw.</summary>
    public void Go(string id, bool animate = true)
    {
        if (id == Wanted) return;
        Wanted = id;
        if (!animate)
        {
            foreach (var e in _stack) Children.Remove(e.Layer.View);
            _stack.Clear();
            var only = new Entry(id, StyleFactory.Create(id)) { Raw = 1 };
            _stack.Add(only);
            Children.Add(only.Layer.View);
            only.Layer.SetReveal(1);
            return;
        }
        var at = _stack.FindIndex(e => e.Id == id);
        if (at < 0)
        {
            var entry = new Entry(id, StyleFactory.Create(id)) { Raw = 0, Dir = 1 };
            entry.Vel = 1 / entry.Layer.ArriveSeconds;
            _stack.Add(entry);
            Children.Add(entry.Layer.View);
            entry.Layer.SetReveal(0);
        }
        else
        {
            for (var j = at + 1; j < _stack.Count; j++) _stack[j].Dir = -1;
            if (at > 0) _stack[at].Dir = 1;
        }
        Order();
        if (!_timer.IsEnabled) { _last = _clock.Elapsed.TotalSeconds; _timer.Start(); }
    }

    /// <summary>A click or the logo's opening: the style on top answers it.</summary>
    public void Burst(Point point, bool accent) => _stack[^1].Layer.Burst(point, accent);

    private void Order()
    {
        for (var i = 0; i < _stack.Count; i++) _stack[i].Layer.View.ZIndex = i;
    }

    private void Step()
    {
        var now = _clock.Elapsed.TotalSeconds;
        var dt = Math.Min(0.05, now - _last);
        _last = now;
        for (var j = 1; j < _stack.Count; j++)
        {
            var e = _stack[j];
            var want = e.Dir > 0 ? 1 / e.Layer.ArriveSeconds : -1.25 / e.Layer.ArriveSeconds;
            e.Vel += (want - e.Vel) * Math.Min(1, dt * 5);
            e.Raw = Math.Clamp(e.Raw + e.Vel * dt, 0, 1);
            e.Layer.SetReveal(e.Layer.Ease(e.Raw));
        }
        // a style that has withdrawn completely leaves; one that has fully arrived covers everything under it, which can go
        for (var j = _stack.Count - 1; j >= 1; j--)
            if (_stack[j].Dir < 0 && _stack[j].Raw <= 0) { Children.Remove(_stack[j].Layer.View); _stack.RemoveAt(j); }
        for (var j = _stack.Count - 1; j >= 1; j--)
        {
            if (_stack[j].Dir <= 0 || _stack[j].Raw < 1) continue;
            for (var k = 0; k < j; k++) Children.Remove(_stack[k].Layer.View);
            _stack.RemoveRange(0, j);
            break;
        }
        if (_stack.Count == 1)
        {
            var top = _stack[0];
            top.Raw = 1; top.Vel = 0; top.Dir = 0;
            top.Layer.SetReveal(1);
            _timer.Stop();
        }
        Order();
    }
}
