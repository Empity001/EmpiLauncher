using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace EmpiLauncher.Linux.Views;

/// <summary>The shape of a button: every style may cut its buttons its own way (Themes/Looks/*.controls.xaml in the Windows launcher).</summary>
internal enum Cut { Pill, Square, Frame, Xp, Sticker, Pencil, Page, Torn }

/// <summary>One kind of button as a style draws it (Ghost, Paper, Primary or Danger).</summary>
internal sealed record ButtonLook(
    Cut Cut, IBrush Background, IBrush Foreground, IBrush Border, double Thickness, FontFamily Font, double Size, FontWeight Weight, FontStyle Style, Thickness Padding, CornerRadius? Radius = null);

/// <summary>
/// What a style does to the interface's own pieces beyond its colours: the weight of the display type, how labels are written, the outline
/// and corners of panels and tags, and how each kind of button is cut. The Windows launcher keeps these as XAML resources swapped on a style
/// change; here they are plain values the builders read, and a style change rebuilds the screens (MainWindow.ChangeStyle).
/// </summary>
internal static class Look
{
    // text
    public static FontWeight DisplayWeight = FontWeight.Bold;
    public static FontStyle DisplayStyle = FontStyle.Normal;
    public static bool LabelBody; public static double LabelSize = 12; public static FontWeight LabelWeight = FontWeight.Normal; public static bool LabelSmallCaps;
    public static bool CaptionBody; public static double CaptionSize = 11.5; public static FontStyle CaptionStyle = FontStyle.Normal;
    // panels
    public static IBrush? ModuleEdge; public static double ModuleThickness = 1; public static CornerRadius? ModuleRadius; public static Thickness ModulePadding = new(20, 18); public static IBrush? ModuleEdgeHover;
    public static IBrush? ModuleFill;
    // tags
    public static IBrush? PillFill, PillEdge; public static double PillThickness = 1; public static CornerRadius? PillCorners; public static Thickness PillPadding = new(10, 3); public static double PillTurn;
    // buttons
    public static ButtonLook Ghost = null!, Paper = null!, Primary = null!, Danger = null!;
    public static bool XpCaption;

    private static readonly Color Cream = Color.Parse("#f1ede0");
    private static IBrush Brush(string hex) => new SolidColorBrush(Color.Parse(hex));
    private static IBrush Extra(string key, string fallbackHex) => Pal.Extra(key) ?? Brush(fallbackHex);

    private static LinearGradientBrush Vertical(params (string Hex, double At)[] stops)
    {
        var b = new LinearGradientBrush { StartPoint = Rp.Rel(0, 0), EndPoint = Rp.Rel(0, 1) };
        foreach (var (hex, at) in stops) b.GradientStops.Add(new GradientStop(Color.Parse(hex), at));
        return b;
    }

    private static ButtonLook Pill(IBrush bg, IBrush fg, IBrush? border = null, double thick = 0, FontFamily? font = null, double size = 13, FontWeight? weight = null, FontStyle? style = null, Thickness? pad = null) =>
        new(Cut.Pill, bg, fg, border ?? Brushes.Transparent, thick, font ?? Pal.Mono, size, weight ?? FontWeight.Normal, style ?? FontStyle.Normal, pad ?? new Thickness(18, 11));

    public static void Apply(string id)
    {
        // the base style: pills, hairline panels, the display face in bold
        DisplayWeight = FontWeight.Bold; DisplayStyle = FontStyle.Normal;
        LabelBody = false; LabelSize = 12; LabelWeight = FontWeight.Normal; LabelSmallCaps = false;
        CaptionBody = false; CaptionSize = 11.5; CaptionStyle = FontStyle.Normal;
        ModuleEdge = Pal.Hair; ModuleEdgeHover = Pal.HairStrong; ModuleThickness = 1; ModuleRadius = null; ModulePadding = new Thickness(20, 18); ModuleFill = null;
        PillFill = null; PillEdge = null; PillThickness = 1; PillCorners = null; PillPadding = new Thickness(10, 3); PillTurn = 0;
        XpCaption = false;
        var mono = Pal.Mono;
        Ghost = Pill(Pal.TintHover, Pal.Paper);
        Paper = Pill(Pal.Paper, Pal.Bg);
        Primary = Pill(Pal.Accent, Pal.AccentInk);
        Danger = Pill(Brushes.Transparent, Pal.Danger, Pal.HairStrong, 1);

        switch (id)
        {
            case "celestial":
                DisplayWeight = FontWeight.SemiBold;
                ModuleEdge = Extra("HoloEdgeBrush", "#8Cffb3e6"); ModuleEdgeHover = Extra("HoloEdgeStrongBrush", "#D9ffb3e6");
                PillEdge = Extra("HoloEdgeBrush", "#8Cffb3e6");
                Primary = Pill(Pal.HoloFill, Brush("#241433"), font: Pal.Display, weight: FontWeight.SemiBold);
                break;
            case "core":
                DisplayWeight = FontWeight.Light; LabelSize = 11;
                ModuleEdge = Pal.HairStrong; ModuleEdgeHover = null; ModuleRadius = new CornerRadius(2);
                PillFill = Brushes.Transparent; PillEdge = Pal.HairStrong; PillCorners = new CornerRadius(2); PillPadding = new Thickness(8, 2);
                ButtonLook Frame(IBrush bg, IBrush fg, IBrush edge, double t, FontWeight? w = null) => new(Cut.Frame, bg, fg, edge, t, mono, 12, w ?? FontWeight.Normal, FontStyle.Normal, new Thickness(18, 10), new CornerRadius(2));
                Ghost = Frame(Brushes.Transparent, Pal.Paper, Pal.HairStrong, 1);
                Paper = Frame(Brush("#f1ede0"), Brush("#050506"), Brushes.Transparent, 0);
                Danger = Frame(Brushes.Transparent, Pal.Danger, Pal.HairStrong, 1);
                Primary = Frame(Brushes.Transparent, Pal.PlayInk, Brush("#BFf1ede0"), 1, FontWeight.SemiBold);
                break;
            case "minimal":
                DisplayWeight = FontWeight.SemiBold;
                LabelBody = true; LabelWeight = FontWeight.Medium;
                CaptionBody = true; CaptionSize = 12;
                ModuleEdge = Brushes.Transparent; ModuleEdgeHover = null; ModuleThickness = 0;
                PillFill = Pal.Surface2; PillEdge = Brushes.Transparent; PillThickness = 0; PillPadding = new Thickness(11, 4);
                Primary = Pill(Pal.Accent, Pal.AccentInk, font: Pal.BodyFont, weight: FontWeight.SemiBold);
                break;
            case "shell":
                PillFill = Brushes.Transparent; PillEdge = Pal.HairStrong; PillCorners = new CornerRadius(2); PillPadding = new Thickness(8, 3);
                ButtonLook Sq(IBrush bg, IBrush fg, IBrush edge, double t, FontFamily? f = null, FontWeight? w = null) => new(Cut.Square, bg, fg, edge, t, f ?? mono, 13, w ?? FontWeight.Normal, FontStyle.Normal, new Thickness(18, 11), new CornerRadius(3));
                Ghost = Sq(Pal.TintHover, Pal.Paper, Pal.HairStrong, 1);
                Paper = Sq(Pal.Paper, Pal.Bg, Brushes.Transparent, 0);
                Danger = Sq(Brushes.Transparent, Pal.Danger, Pal.HairStrong, 1);
                Primary = Sq(Pal.Accent, Pal.AccentInk, Brushes.Transparent, 0, Pal.Display, FontWeight.Bold);
                break;
            case "termico":
                DisplayWeight = FontWeight.Black; LabelSize = 11;
                ModuleEdge = Extra("HeatEdgeBrush", "#ff4f9a"); ModuleEdgeHover = null; ModuleRadius = new CornerRadius(16);
                PillFill = Brush("#14ffffff"); PillEdge = Brush("#40ffffff"); PillCorners = new CornerRadius(6); PillPadding = new Thickness(8, 2);
                Primary = Pill(HeatFill(), Pal.PlayInk, font: Pal.Display, weight: FontWeight.Black);
                break;
            case "oleaje":
                DisplayWeight = FontWeight.Light;
                LabelBody = true; LabelSize = 11.5; LabelWeight = FontWeight.Light;
                ModuleEdge = Pal.HairStrong; ModuleEdgeHover = null; ModuleRadius = new CornerRadius(28); ModulePadding = new Thickness(24, 20);
                PillFill = Brush("#0Fffffff"); PillEdge = Pal.HairStrong;
                Primary = Pill(Brush("#f1ede0"), Pal.PlayInk, weight: FontWeight.SemiBold);
                break;
            case "explorer":
                LabelBody = true; LabelSize = 11.5; LabelWeight = FontWeight.Bold;
                CaptionBody = true;
                ModuleEdge = Brush("#7f9db9"); ModuleEdgeHover = null; ModuleRadius = new CornerRadius(4);
                PillFill = Brush("#f5f4ea"); PillEdge = Brush("#7f9db9"); PillCorners = new CornerRadius(3); PillPadding = new Thickness(8, 2);
                var face = Vertical(("#ffffff", 0), ("#f4f3ee", 0.3), ("#ecebe6", 0.7), ("#d6d0c5", 1));
                ButtonLook Xp(IBrush bg, IBrush fg, IBrush edge, double radius, FontWeight? w = null, FontStyle? s = null) => new(Cut.Xp, bg, fg, edge, 1, Pal.BodyFont, 12, w ?? FontWeight.Normal, s ?? FontStyle.Normal, new Thickness(16, 7), new CornerRadius(radius));
                Ghost = Xp(face, Brush("#111111"), Brush("#003c74"), 3);
                Paper = Ghost;
                Danger = Xp(face, Brush("#c0321c"), Brush("#003c74"), 3);
                Primary = Xp(Vertical(("#8ad88a", 0), ("#4fb34f", 0.42), ("#379b37", 0.5), ("#2f8a2f", 0.85), ("#3e9f3e", 1)), Brushes.White, Brush("#1d5e1d"), 6, FontWeight.Bold, FontStyle.Italic);
                XpCaption = true;
                break;
            case "remember":
                LabelWeight = FontWeight.Bold; LabelSize = 13;
                CaptionBody = true; CaptionSize = 11;
                ModuleEdge = Pal.HairStrong; ModuleEdgeHover = null; ModuleThickness = 2;
                PillFill = Brushes.Transparent; PillEdge = Pal.Accent; PillThickness = 2; PillCorners = new CornerRadius(12, 4, 12, 4); PillPadding = new Thickness(9, 2);
                ButtonLook Pencil(IBrush bg, IBrush fg, IBrush edge, double t, FontFamily? f = null) => new(Cut.Pencil, bg, fg, edge, t, f ?? mono, 13, FontWeight.Bold, FontStyle.Normal, new Thickness(18, 9), new CornerRadius(14, 5, 13, 6));
                Ghost = Pencil(Pal.Surface2, Pal.Paper, Pal.HairStrong, 2);
                Paper = Pencil(Brush("#fffaf0"), Pal.Paper, Pal.HairStrong, 2);
                Danger = Pencil(Pal.Surface2, Brush("#b8402c"), Pal.HairStrong, 2);
                Primary = Pencil(Pal.Accent, Pal.AccentInk, Brush("#2b2620"), 2.5, Pal.Display);
                break;
            case "punk":
                DisplayWeight = FontWeight.Normal;
                LabelSize = 13; LabelWeight = FontWeight.Bold;
                CaptionBody = true; CaptionSize = 11;
                ModuleEdge = Brushes.Transparent; ModuleEdgeHover = null; ModuleThickness = 0; ModuleRadius = new CornerRadius(0); ModulePadding = new Thickness(22, 20);
                PillFill = Brush("#f1ece2"); PillEdge = Brush("#141214"); PillThickness = 1.5; PillCorners = new CornerRadius(0); PillPadding = new Thickness(8, 2); PillTurn = -1.5;
                ButtonLook Sticker(IBrush bg, IBrush fg) => new(Cut.Sticker, bg, fg, Brush("#141214"), 2, mono, 13, FontWeight.Bold, FontStyle.Normal, new Thickness(18, 9), new CornerRadius(0));
                Ghost = Sticker(Brush("#f1ece2"), Brush("#141214"));
                Paper = Sticker(Brush("#fffdf8"), Brush("#141214"));
                Danger = Sticker(Brush("#f1ece2"), Brush("#c2261f"));
                Primary = new ButtonLook(Cut.Torn, Brush("#141214"), Pal.PlayInk, Brushes.Transparent, 0, Pal.Display, 15, FontWeight.Normal, FontStyle.Normal, new Thickness(20, 10));
                break;
            case "words":
                DisplayWeight = FontWeight.Normal; DisplayStyle = FontStyle.Italic;
                LabelBody = true; LabelSize = 13; LabelSmallCaps = true;
                CaptionBody = true; CaptionStyle = FontStyle.Italic;
                ModuleEdge = Brushes.Transparent; ModuleEdgeHover = null; ModuleThickness = 0; ModuleRadius = new CornerRadius(3);
                PillFill = Brush("#15120f"); PillEdge = Pal.HairStrong; PillCorners = new CornerRadius(0); PillPadding = new Thickness(9, 2);
                ButtonLook Page(IBrush bg, IBrush fg, IBrush edge, double t, FontFamily? f = null) => new(Cut.Page, bg, fg, edge, t, f ?? Pal.BodyFont, 14, FontWeight.Normal, FontStyle.Italic, new Thickness(18, 9), new CornerRadius(0));
                Ghost = Page(Pal.Tint, Pal.Paper, Pal.HairStrong, 1);
                Paper = Page(Brush("#ece3cf"), Brush("#15120f"), Brushes.Transparent, 0);
                Danger = Page(Brushes.Transparent, Pal.Danger, Pal.HairStrong, 1);
                Primary = Page(Brush("#ece3cf"), Pal.PlayInk, Brush("#15120f"), 1, Pal.Display);
                break;
        }
    }

    /// <summary>Térmico's heat gradient: the fill of Jugar and of every main action.</summary>
    public static LinearGradientBrush HeatFill()
    {
        var b = new LinearGradientBrush { StartPoint = Rp.Rel(0, 0.5), EndPoint = Rp.Rel(1, 0.5) };
        b.GradientStops.Add(new GradientStop(Color.Parse("#ff8a3d"), 0)); b.GradientStops.Add(new GradientStop(Color.Parse("#ff4f9a"), 0.55)); b.GradientStops.Add(new GradientStop(Color.Parse("#b06bff"), 1));
        return b;
    }

    private static string ShapeClass(Cut cut) => cut switch
    {
        Cut.Square => "shape-square", Cut.Frame => "shape-frame", Cut.Xp => "shape-xp", Cut.Sticker => "shape-sticker", Cut.Pencil => "shape-pencil", Cut.Page => "shape-page", Cut.Torn => "shape-torn", _ => "pill"
    };

    /// <summary>Cuts and dresses a button as this style draws that kind of button.</summary>
    public static void Dress(Button button, ButtonLook look)
    {
        foreach (var c in new[] { "pill", "shape-square", "shape-frame", "shape-xp", "shape-sticker", "shape-pencil", "shape-page", "shape-torn" }) button.Classes.Remove(c);
        button.Classes.Add(ShapeClass(look.Cut));
        button.Background = look.Background; button.Foreground = look.Foreground; button.BorderBrush = look.Border; button.BorderThickness = new Thickness(look.Thickness);
        button.FontFamily = look.Font; button.FontSize = look.Size; button.FontWeight = look.Weight; button.FontStyle = look.Style;
        button.CornerRadius = look.Radius ?? Pal.PillRadius;
    }

    public static ButtonLook Of(Ui.Kind kind) => kind switch { Ui.Kind.Paper => Paper, Ui.Kind.Primary => Primary, Ui.Kind.Danger => Danger, _ => Ghost };

    /// <summary>Panel edge, corners and padding as the style draws a module.</summary>
    public static void Dress(Border module)
    {
        module.Background = ModuleFill ?? Pal.Module;
        module.BorderBrush = ModuleEdge ?? Pal.Hair;
        module.BorderThickness = new Thickness(ModuleThickness);
        module.CornerRadius = ModuleRadius ?? new CornerRadius(Pal.RadiusModule);
        if (ModuleEdgeHover != null)
        {
            var normal = ModuleEdge ?? Pal.Hair; var hover = ModuleEdgeHover;
            module.PointerEntered += (_, _) => module.BorderBrush = hover;
            module.PointerExited += (_, _) => module.BorderBrush = normal;
        }
    }

    /// <summary>A tag as the style draws it.</summary>
    public static void DressPill(Border pill)
    {
        pill.Background = PillFill ?? Pal.Tint;
        pill.BorderBrush = PillEdge ?? Pal.Hair;
        pill.BorderThickness = new Thickness(PillThickness);
        pill.CornerRadius = PillCorners ?? Pal.PillRadius;
        pill.Padding = PillPadding;
        if (PillTurn != 0) { pill.RenderTransformOrigin = RelativePoint.Center; pill.RenderTransform = new RotateTransform(PillTurn); }
    }
}
