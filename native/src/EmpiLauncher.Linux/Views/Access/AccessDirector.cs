using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;
using Path = Avalonia.Controls.Shapes.Path;
using Visual = Avalonia.Visual;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// Decides which effect runs and how: a state seen for the first time in this session (for "retired", the first time ever) plays its
/// whole effect once the screen has settled; after that, and after a resize, it is shown in its last pose at once. The base style keeps
/// its seal and glass (HomeView), so it is not handled here (it is the one players already know).
/// </summary>
internal static class AccessDirector
{
    private static readonly HashSet<string> Seen = [];
    private static string _key = "";
    private static Control? _play;
    private static Func<Scene, Task>? _pose;         // the current state's script, for showing it again at once (a resize)
    private static Func<bool, Scene>? _makeScene;
    private static bool _backRunning;
    private static bool _hooked;

    public static bool Handles(string style) => style != EmpiLauncher.Linux.Styles.StyleCatalog.Base && AccessScripts.For(style, "maint") != null;

    /// <summary>Shows a blocked state ("maint", "soon", "retired") on <paramref name="play"/>.</summary>
    public static void Show(Control play, AccessInfo access, string state, bool firstEver, string? packId, string? packName, Action<Action> whenSettled)
    {
        var style = ST.Current;
        var key = $"{style}|{packId}|{state}|{access.Until}|{access.From}";
        if (key == _key && ReferenceEquals(play, _play)) return;
        var script = AccessScripts.For(style, state);
        if (script == null) { Clear(); return; }
        _key = key; _play = play; _pose = script; _backRunning = false;
        var seenKey = $"{packId}|{state}";
        var animate = Motion.Enabled && (state == "retired" ? firstEver : Seen.Add(seenKey));
        Seen.Add(seenKey);
        _makeScene = instant => MakeScene(play, access, packId, packName, instant);
        Hook();
        if (animate) { play.Opacity = 0; whenSettled(() => { if (_key == key) Run(script, instant: false); }); }
        else Later(() => { if (_key == key) Run(script, instant: true); });
    }

    /// <summary>A retired modpack is back: the style's way of bringing Jugar back, once, then the layer empties.</summary>
    public static void Back(Control play, AccessInfo access, string? packId, string? packName, Action<Action> whenSettled)
    {
        var style = ST.Current;
        var script = AccessScripts.For(style, "back");
        if (script == null || !Motion.Enabled) { Clear(); return; }
        _key = $"{style}|{packId}|back"; _play = play; _pose = null; _backRunning = true;
        _makeScene = instant => MakeScene(play, access, packId, packName, instant);
        Hook();
        var key = _key;
        play.Opacity = 0;
        whenSettled(async () =>
        {
            if (_key != key) return;
            await RunAsync(script, instant: false);
            if (_key != key) return;
            _backRunning = false;
            Clear();
        });
    }

    /// <summary>No state to show: the layer empties and Jugar is itself.</summary>
    public static void Clear()
    {
        AccessStage.Instance?.Clear();
        if (_play != null) _play.Opacity = 1;
        TermicoField.Note = null;
        _key = ""; _pose = null; _makeScene = null; _backRunning = false;
    }

    /// <summary>The screen that owned Jugar is going away: only its own effect is cleared (a new screen may already have started one).</summary>
    public static void Release(Control play)
    {
        if (!ReferenceEquals(play, _play)) return;
        Clear();
        _play = null;
    }

    private static Scene MakeScene(Control play, AccessInfo access, string? packId, string? packName, bool instant)
    {
        var stage = AccessStage.Instance!;
        var token = stage.Begin();
        Rect p;
        p = play.TranslatePoint(new Point(0, 0), stage) is { } origin ? new Rect(origin, play.Bounds.Size) : new Rect(0, 0, play.Bounds.Width, play.Bounds.Height);
        var accent = Pal.Accent.Color;
        var radius = new CornerRadius(Pal.RadiusPlay);
        return new Scene(stage, token, instant, p, accent, new AccessWords(access, packId, packName), play, radius);
    }

    private static void Run(Func<Scene, Task> script, bool instant) => _ = RunAsync(script, instant);

    private static async Task RunAsync(Func<Scene, Task> script, bool instant)
    {
        if (_makeScene == null || AccessStage.Instance == null) return;
        var scene = _makeScene(instant);
        try { await script(scene); }
        catch (OperationCanceledException) { }
        catch (Exception ex) { App.Log("access effect", ex); }
    }

    /// <summary>After layout, so Jugar's place is known.</summary>
    private static void Later(Action action) => Dispatcher.UIThread.Post(action, DispatcherPriority.Loaded);

    private static DispatcherTimer? _resize;

    /// <summary>A resize moves Jugar: the current pose is drawn again, at once, in the new place.</summary>
    private static void Hook()
    {
        if (_hooked || AccessStage.Instance == null) return;
        _hooked = true;
        AccessStage.Instance.SizeChanged += (_, _) =>
        {
            if (_pose == null || _backRunning) return;
            _resize ??= new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
            _resize.Stop();
            _resize.Tick -= OnResized; _resize.Tick += OnResized;
            _resize.Start();
        };
    }

    private static void OnResized(object? sender, EventArgs e)
    {
        _resize?.Stop();
        if (_pose != null && !_backRunning) Run(_pose, instant: true);
    }
}
