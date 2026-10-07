using Avalonia;
using Avalonia.Media;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The Empi Proof Bench tokens (DESIGN.md): halftone black and paper-white with ONE accent, the modpack's own colour or electric pink.
/// Every colour is a brush that is changed in place, so everything painted with it follows when a style is put on (StyleTheme) or a
/// modpack brings its own colour. Radii, fonts and gradient edges are read when a view is built: a change of style rebuilds the views.
/// </summary>
public static class Pal
{
    public const string DefaultAccent = "#ff3d8b";
    private static SolidColorBrush B(string hex) => new(Color.Parse(hex));

    public static readonly SolidColorBrush Well = B("#060607"), Bg = B("#0b0b0d"), Surface = B("#111114"), Surface2 = B("#18181c"), Surface3 = B("#212127");
    public static readonly SolidColorBrush Line = B("#24242a"), LineStrong = B("#3b3b44");
    public static readonly SolidColorBrush Paper = B("#f1efe8"), Paper2 = B("#a5a598"), Paper3 = B("#8b8b81"), PaperInk = B("#47473f");
    public static readonly SolidColorBrush Module = B("#DB111215"), Hair = B("#1AF1EFE8"), HairStrong = B("#38F1EFE8");
    public static readonly SolidColorBrush Tint = B("#0AFFFFFF"), TintHover = B("#21FFFFFF");
    public static readonly SolidColorBrush Danger = B("#ff6a4d"), Warn = B("#ffb14a"), Ok = B("#48dc35");
    public static readonly SolidColorBrush Dock = B("#F20E0F11"), Panel = B("#F218181C"), Dialog = B("#FF111114"), Input = B("#9E060607"), Scrim = B("#B3060607");
    public static readonly SolidColorBrush Title = B("#f1efe8"), ChromeInk = B("#f1efe8"), ChromeBox = B("#F20E0F11"), ChromeBoxEdge = B("#38F1EFE8");
    public static readonly SolidColorBrush Track = B("#1AFFFFFF"), Tabs = B("#B3111215");
    public static readonly SolidColorBrush Clear = B("#00000000");

    /// <summary>The ink of the modpack's name on the home screen (Celestial paints it in foil).</summary>
    public static IBrush TitleInk { get; set; } = Title;
    /// <summary>Celestial's holographic foil for the main action (a plain pastel until the foil is set).</summary>
    public static IBrush HoloFill { get; set; } = B("#ffd6f2");
    private static readonly Dictionary<string, IBrush> Extras = new();
    /// <summary>A token that is not one of the shared brushes (a gradient edge, a heat fill), by its key.</summary>
    public static IBrush? Extra(string key) => Extras.TryGetValue(key, out var brush) ? brush : null;

    /// <summary>The edge of the dock and of a few panels: a plain hairline, or a gradient in some styles (read when a view is built).</summary>
    public static IBrush DockEdge { get; private set; } = Hair;
    public static IBrush Backdrop { get; private set; } = DefaultBackdrop();

    /// <summary>The chosen card (paper-white with dark ink by default) and the others.</summary>
    public static Color CardOn = Color.Parse("#f1efe8"), CardOnInk = Color.Parse("#0b0b0d"), CardOnMeta = Color.Parse("#47473f"), CardOffInk = Color.Parse("#f1efe8"), CardOffMeta = Color.Parse("#8b8b81");

    public static readonly SolidColorBrush Accent = B(DefaultAccent), AccentInk = B("#16030c"), AccentSoft = B("#29ff3d8b");
    /// <summary>The ink of the Play label: readable on the accent, or what a style paints the button with.</summary>
    public static readonly SolidColorBrush PlayInk = B("#16030c");

    public static int RadiusInput = 12, RadiusTile = 16, RadiusModule = 22, RadiusDock = 32, RadiusPlay = 26, RadiusChromeBox = 16;
    /// <summary>Buttons are pills while the style's Play is round; a style with square shapes squares them all.</summary>
    public static CornerRadius PillRadius => RadiusPlay >= 20 ? new CornerRadius(999) : new CornerRadius(RadiusPlay);

    public static readonly FontFamily DisplayDefault = new("avares://EmpiLauncher/Assets/Fonts#Doto Black");
    public static FontFamily Display = DisplayDefault;
    public static FontFamily Mono = new("Geist Mono, Noto Sans Mono, DejaVu Sans Mono, monospace");
    public static FontFamily BodyFont = FontFamily.Default;

    private static IBrush DefaultBackdrop() => new LinearGradientBrush
    {
        StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative), EndPoint = new RelativePoint(1, 1, RelativeUnit.Relative),
        GradientStops = { new GradientStop(Color.Parse("#F5060607"), 0), new GradientStop(Color.Parse("#99060607"), 0.5), new GradientStop(Color.Parse("#EB060607"), 1) }
    };

    public static void SetAccent(string hex)
    {
        if (!Color.TryParse(hex, out var color)) color = Color.Parse(DefaultAccent);
        // Readable ink: whichever of the two inks has the higher WCAG contrast against the accent.
        static double Lin(byte c) { var v = c / 255.0; return v <= 0.03928 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4); }
        static double Lum(Color c) => 0.2126 * Lin(c.R) + 0.7152 * Lin(c.G) + 0.0722 * Lin(c.B);
        var dark = Color.FromRgb(0x05, 0x05, 0x06);
        var paper = Color.FromRgb(0xf1, 0xef, 0xe8);
        var lum = Lum(color);
        var ink = (lum + 0.05) / (Lum(dark) + 0.05) >= (Lum(paper) + 0.05) / (lum + 0.05) ? dark : paper;
        Accent.Color = color;
        AccentInk.Color = ink;
        AccentSoft.Color = Color.FromArgb(0x29, color.R, color.G, color.B);
        PlayInk.Color = Styles.StyleTheme.PlayInk ?? ink;
    }

    public static Color ColorOf(SolidColorBrush brush) => brush.Color;

    // ---- tokens -------------------------------------------------------------------------------------------------------

    private static readonly Dictionary<string, SolidColorBrush> Brushes = new()
    {
        ["WellBrush"] = Well, ["BgBrush"] = Bg, ["SurfaceBrush"] = Surface, ["Surface2Brush"] = Surface2, ["Surface3Brush"] = Surface3,
        ["LineBrush"] = Line, ["LineStrongBrush"] = LineStrong, ["PaperBrush"] = Paper, ["Paper2Brush"] = Paper2, ["Paper3Brush"] = Paper3, ["PaperInkBrush"] = PaperInk,
        ["ModuleBrush"] = Module, ["HairBrush"] = Hair, ["HairStrongBrush"] = HairStrong, ["TintBrush"] = Tint, ["TintHoverBrush"] = TintHover,
        ["DangerBrush"] = Danger, ["WarnBrush"] = Warn, ["OkBrush"] = Ok, ["TitleBrush"] = Title, ["DockBrush"] = Dock, ["PanelBrush"] = Panel, ["DialogBrush"] = Dialog,
        ["InputBrush"] = Input, ["ChromeInkBrush"] = ChromeInk, ["ChromeBoxBrush"] = ChromeBox, ["ChromeBoxEdgeBrush"] = ChromeBoxEdge, ["TrackBrush"] = Track, ["TabsBrush"] = Tabs
    };

    /// <summary>The brushes by their resource key (the names the Windows interface uses), so styles written with DynamicResource find them.</summary>
    public static void Register(Avalonia.Controls.IResourceDictionary resources)
    {
        foreach (var (key, brush) in Brushes) resources[key] = brush;
        resources["AccentBrush"] = Accent; resources["AccentInkBrush"] = AccentInk; resources["AccentSoftBrush"] = AccentSoft; resources["PlayInkBrush"] = PlayInk; resources["ClearBrush"] = Clear;
    }

    public static IBrush? Find(string key) => key switch
    {
        "AccentBrush" => Accent, "AccentInkBrush" => AccentInk, "AccentSoftBrush" => AccentSoft, "PlayInkBrush" => PlayInk,
        _ => Brushes.TryGetValue(key, out var brush) ? brush : null
    };

    /// <summary>Puts a set of tokens on (the base style's, then a style's over them). A gradient or a font is rebuilt; a plain colour is changed in place.</summary>
    public static void ApplyTokens(Dictionary<string, string> tokens)
    {
        foreach (var (key, value) in tokens)
        {
            if (Brushes.TryGetValue(key, out var brush) && Color.TryParse(value, out var c)) { brush.Color = c; continue; }
            if (key.EndsWith("Brush") && !Brushes.ContainsKey(key) && key != "DockEdgeBrush" && key != "BackdropScrim")
            {
                if (value.StartsWith("grad:")) Extras[key] = Gradient(value);
                else if (Color.TryParse(value, out var plain)) Extras[key] = new SolidColorBrush(plain);
                continue;
            }
            switch (key)
            {
                case "DockEdgeBrush": DockEdge = value.StartsWith("grad:") ? Gradient(value) : Color.TryParse(value, out var e) ? new SolidColorBrush(e) : Hair; break;
                case "BackdropScrim": Backdrop = value.StartsWith("grad:") ? Gradient(value) : DefaultBackdrop(); break;
                case "CardOnColor": CardOn = Color.Parse(value); break;
                case "CardOnInkColor": CardOnInk = Color.Parse(value); break;
                case "CardOnMetaColor": CardOnMeta = Color.Parse(value); break;
                case "CardOffInkColor": CardOffInk = Color.Parse(value); break;
                case "CardOffMetaColor": CardOffMeta = Color.Parse(value); break;
                case "RadiusInput": RadiusInput = Radius(value); break;
                case "RadiusTile": RadiusTile = Radius(value); break;
                case "RadiusModule": RadiusModule = Radius(value); break;
                case "RadiusDock": RadiusDock = Radius(value); break;
                case "RadiusPlay": RadiusPlay = Radius(value); break;
                case "RadiusChromeBox": RadiusChromeBox = Radius(value); break;
                case "DisplayFont": Display = FontMap.Resolve(value, FontMap.Kind.Display); break;
                case "MonoFont": Mono = FontMap.Resolve(value, FontMap.Kind.Mono); break;
                case "BodyFont": BodyFont = FontMap.Resolve(value, FontMap.Kind.Body); break;
            }
        }
    }

    private static int Radius(string value) => (int)Math.Round(double.TryParse(value.Split(',')[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var r) ? r : 0);

    /// <summary>"grad:0,0;1,1;#ff8a3d@0,#ff4f9a@0.55": start, end and the stops of a linear gradient.</summary>
    private static IBrush Gradient(string spec)
    {
        var parts = spec[5..].Split(';');
        static RelativePoint P(string s) { var xy = s.Split(','); return new RelativePoint(double.Parse(xy[0], System.Globalization.CultureInfo.InvariantCulture), double.Parse(xy[1], System.Globalization.CultureInfo.InvariantCulture), RelativeUnit.Relative); }
        var brush = new LinearGradientBrush { StartPoint = P(parts[0]), EndPoint = P(parts[1]) };
        foreach (var stop in parts[2].Split(','))
        {
            var at = stop.Split('@');
            brush.GradientStops.Add(new GradientStop(Color.Parse(at[0]), double.Parse(at[1], System.Globalization.CultureInfo.InvariantCulture)));
        }
        return brush;
    }
}

/// <summary>The fonts the styles ask for are Windows ones: the first that exists here is used, else a family of the same kind.</summary>
internal static class FontMap
{
    public enum Kind { Display, Mono, Body }

    private static HashSet<string>? _installed;
    private static HashSet<string> Installed => _installed ??= new HashSet<string>(Avalonia.Media.FontManager.Current.SystemFonts.Select(f => f.Name), StringComparer.OrdinalIgnoreCase);

    public static FontFamily Resolve(string value, Kind kind)
    {
        var list = value.StartsWith("font:") ? value[5..] : value;
        // the bundled dot-matrix face
        if (list.Contains("Doto")) return Pal.DisplayDefault;
        var names = list.Split(',').Select(n => n.Trim()).Where(n => n.Length > 0).ToList();
        foreach (var name in names) if (Installed.Contains(name)) return new FontFamily(name);
        var lower = list.ToLowerInvariant();
        bool serif = lower.Contains("sitka") || lower.Contains("palatino") || lower.Contains("georgia") || lower.Contains("book antiqua");
        bool script = lower.Contains("ink free") || lower.Contains("segoe print") || lower.Contains("comic");
        bool mono = kind == Kind.Mono && !serif && !script || lower.Contains("consolas") || lower.Contains("courier") || lower.Contains("cascadia");
        if (serif) return new FontFamily("Noto Serif, DejaVu Serif, serif");
        if (script) return new FontFamily("Comic Neue, Noto Sans, sans-serif");
        if (mono && kind != Kind.Body) return new FontFamily("Geist Mono, Noto Sans Mono, DejaVu Sans Mono, monospace");
        return kind == Kind.Display ? new FontFamily("Noto Sans, DejaVu Sans, sans-serif") : FontFamily.Default;
    }
}
