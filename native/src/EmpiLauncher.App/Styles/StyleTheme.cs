using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;
using EmpiLauncher.App.Themes;
using EmpiLauncher.App.Views;
using EmpiLauncher.App.Views.Styles;

namespace EmpiLauncher.App.Styles;

/// <summary>Which background each style draws. A style that is listed but has no drawing in this build is never offered.</summary>
internal static class StyleFactory
{
    public static bool CanDraw(string id) => id is "actual" or "celestial" or "minimal" or "shell" or "explorer" or "remember";

    public static StyleHost.ILayer Create(string id) => id switch
    {
        "celestial" => new CelestialField(),
        "minimal" => new MinimalField(),
        "shell" => new ShellField(),
        "explorer" => new ExplorerField(),
        "remember" => new RememberField(),
        _ => new LivingField()
    };
}

/// <summary>
/// Dresses the whole interface in a style. The resources are rebuilt in three layers: Themes/Theme.xaml (the tokens every style starts from)
/// with the style's own tokens written over it (Themes/Looks/&lt;id&gt;.tokens.xaml), then Themes/Controls.xaml (every control's shape, which
/// reads those tokens), then the style's own control shapes (Themes/Looks/&lt;id&gt;.controls.xaml). The views already on screen keep what they
/// were built with, so the window rebuilds them after a change (MainWindow.ChangeStyle), under a crossfade.
/// </summary>
internal static class StyleTheme
{
    public static string Current { get; private set; } = StyleCatalog.Base;

    /// <summary>Whether the style writes its labels in sentence case ("Jugar") instead of capitals ("JUGAR").</summary>
    public static bool SentenceCase { get; private set; }

    /// <summary>A label as the style writes it: capitals stay capitals unless the style asks for sentence case.</summary>
    public static string Label(string text)
    {
        if (Current == "shell") return text + "_";   // a terminal: the label ends in its cursor
        if (!SentenceCase || text.Length == 0) return text;
        var lower = text.ToLowerInvariant().Replace("java", "Java");
        return char.ToUpperInvariant(lower[0]) + lower[1..];
    }

    /// <summary>The ink of the Play button's label when the style paints the button itself (null: the ink that reads on the accent).</summary>
    public static Color? PlayInk { get; private set; }

    public static void Apply(string id)
    {
        var app = Application.Current;
        var style = StyleCatalog.Get(id);
        var theme = Load("Themes/Theme.xaml") ?? new ResourceDictionary();
        PlayInk = null;
        SentenceCase = style.Id is "minimal" or "remember" or "words" or "explorer";
        if (style.Id != StyleCatalog.Base && Load($"Themes/Looks/{style.Id}.tokens.xaml") is { } tokens)
            foreach (var key in tokens.Keys) theme[key] = tokens[key];
        Extras(style.Id, theme);

        var merged = app.Resources.MergedDictionaries;
        merged.Clear();
        merged.Add(theme);
        _theme = theme;
        if (Load("Themes/Controls.xaml") is { } controls) merged.Add(controls);
        if (style.Id != StyleCatalog.Base && Load($"Themes/Looks/{style.Id}.controls.xaml") is { } shapes) merged.Add(shapes);
        Current = style.Id;
    }

    private static ResourceDictionary? Load(string path)
    {
        try { return new ResourceDictionary { Source = new Uri($"pack://application:,,,/{path}") }; }
        catch (Exception ex) when (ex is IOException or System.Windows.Markup.XamlParseException) { App.Log("style " + path, ex); return null; }
    }

    /// <summary>What a style needs made in code: brushes that move (a XAML resource cannot hold a running animation).</summary>
    private static void Extras(string id, ResourceDictionary theme)
    {
        if (id == "explorer") { PlayInk = Colors.White; return; }   // white on its green Play
        if (id != "celestial") return;
        // holographic foil on the title and the Play button: it holds still and now and then a sheen passes over it (see Shine)
        Foil(theme, sweep: false);
        PlayInk = Color.FromRgb(0x24, 0x14, 0x33);
        StartShine();
    }

    // The sheen: every ten seconds the foil's bands slide one width along, in 2.4 s. Between sheens nothing ticks, so the interface (kept
    // as a texture by the window) is not drawn again for it. A foil that drifted all the time cost 3 to 4 % of a core more.
    // Each sheen is a new pair of brushes put in place of the old ones (every view points at them through DynamicResource): WPF freezes a
    // brush sitting still in the resources, and a frozen brush can no longer be animated (3.7.0 logged that every ten seconds).
    private static readonly string[] FoilText = ["#ffffff", "#ffd6f2", "#c9f3ff", "#e6d3ff", "#fff6c9", "#ffffff"];
    private static readonly string[] FoilFill = ["#ffd6f2", "#c9f3ff", "#e6d3ff", "#fff6c9", "#ffd6f2"];
    private static readonly System.Windows.Threading.DispatcherTimer ShineTimer = new() { Interval = TimeSpan.FromSeconds(10) };
    private static ResourceDictionary? _theme;
    private static bool _moving = true, _shineWired;

    private static void Foil(ResourceDictionary theme, bool sweep)
    {
        theme["HoloTextBrush"] = Holo(FoilText, sweep);
        theme["HoloFillBrush"] = Holo(FoilFill, sweep);
        theme["TitleBrush"] = theme["HoloTextBrush"];
    }

    private static LinearGradientBrush Holo(string[] colors, bool sweep)
    {
        var brush = new LinearGradientBrush { StartPoint = new Point(0, 0.2), EndPoint = new Point(1, 0.8), SpreadMethod = GradientSpreadMethod.Repeat, MappingMode = BrushMappingMode.RelativeToBoundingBox };
        for (var i = 0; i < colors.Length; i++) brush.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(colors[i]), (double)i / (colors.Length - 1)));
        var shift = new TranslateTransform();
        brush.RelativeTransform = shift;
        if (sweep)
        {
            var pass = new DoubleAnimation(0, -1, TimeSpan.FromSeconds(2.4)) { EasingFunction = Motion.InOut };
            Timeline.SetDesiredFrameRate(pass, 30);
            shift.BeginAnimation(TranslateTransform.XProperty, pass);
        }
        return brush;
    }

    private static void StartShine()
    {
        if (!_shineWired) { _shineWired = true; ShineTimer.Tick += (_, _) => Shine(); }
        if (_moving && Motion.Enabled) ShineTimer.Start();
    }

    private static void Shine()
    {
        if (!_moving || !Motion.Enabled || Current != "celestial" || _theme == null) { ShineTimer.Stop(); return; }
        Foil(_theme, sweep: true);
    }

    /// <summary>
    /// The sheen only passes while the background may move (FieldGovernor): a hidden or idle launcher, or one next to a running game,
    /// keeps its foil still.
    /// </summary>
    public static void SetMoving(bool moving)
    {
        if (moving == _moving) return;
        _moving = moving;
        if (moving && Current == "celestial" && Motion.Enabled) ShineTimer.Start(); else ShineTimer.Stop();
    }
}
