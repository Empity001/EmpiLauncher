using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.Linux.Views;

/// <summary>Small factories for the pieces every screen is made of: text in the three voices, pills, modules and buttons.</summary>
public static class Ui
{
    public static TextBlock Display(string text, double size = 24, IBrush? ink = null) => new()
    {
        Text = text, FontFamily = Pal.Display, FontWeight = FontWeight.Bold, FontSize = size, Foreground = ink ?? Pal.Paper,
        TextTrimming = TextTrimming.CharacterEllipsis
    };

    public static TextBlock Label(string text, double size = 12, IBrush? ink = null) => new() { Text = text, FontFamily = Pal.Mono, FontSize = size, Foreground = ink ?? Pal.Paper2 };

    public static TextBlock Caption(string text, double size = 11.5) => new() { Text = text, FontFamily = Pal.Mono, FontSize = size, Foreground = Pal.Paper3, TextWrapping = TextWrapping.Wrap };

    public static TextBlock Body(string text, double size = 14, IBrush? ink = null) => new() { Text = text, FontSize = size, Foreground = ink ?? Pal.Paper, TextWrapping = TextWrapping.Wrap };

    public static Border Pill(string text, IBrush? ink = null, IBrush? fill = null, double size = 11) => new()
    {
        Margin = new Thickness(0, 0, 8, 6), Padding = new Thickness(11, 3), CornerRadius = Pal.PillRadius, BorderThickness = new Thickness(1),
        BorderBrush = Pal.HairStrong, Background = fill ?? Pal.Tint, Child = Label(text, size, ink ?? Pal.Paper2)
    };

    public static Border Module(Control child, Thickness? padding = null, IBrush? fill = null) => new()
    {
        Background = fill ?? Pal.Module, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(Pal.RadiusModule),
        Padding = padding ?? new Thickness(20, 16), Child = child, Classes = { "module" }
    };

    public enum Kind { Ghost, Paper, Primary, Danger, Icon }

    public static Button Btn(string text, Kind kind = Kind.Ghost, Action? click = null, Thickness? padding = null, double size = 13)
    {
        var button = new Button { Classes = { "pill" }, Padding = padding ?? new Thickness(18, 10), CornerRadius = Pal.PillRadius };
        Style(button, kind);
        button.Content = new TextBlock { Text = text, FontFamily = Pal.Mono, FontSize = size };
        if (click != null) button.Click += (_, _) => click();
        return button;
    }

    public static void Style(Button button, Kind kind)
    {
        switch (kind)
        {
            case Kind.Paper: button.Background = Pal.Paper; button.Foreground = Pal.Bg; button.BorderThickness = new Thickness(0); break;
            case Kind.Primary: button.Background = Pal.Accent; button.Foreground = Pal.AccentInk; button.BorderThickness = new Thickness(0); break;
            case Kind.Danger: button.Background = Pal.Clear; button.Foreground = Pal.Danger; button.BorderBrush = Pal.HairStrong; button.BorderThickness = new Thickness(1); break;
            case Kind.Icon: button.Background = Pal.Clear; button.Foreground = Pal.Paper2; button.BorderThickness = new Thickness(0); break;
            default: button.Background = Pal.TintHover; button.Foreground = Pal.Paper; button.BorderThickness = new Thickness(0); break;
        }
    }

    /// <summary>An icon button: a drawn glyph (see Icons) in a round hit area.</summary>
    public static Button IconBtn(Geometry glyph, string tip, Action click, double size = 38, IBrush? ink = null)
    {
        var button = new Button { Classes = { "pill" }, Width = size, Height = size, Padding = new Thickness(0), CornerRadius = Pal.PillRadius };
        Style(button, Kind.Icon);
        button.Content = new Avalonia.Controls.Shapes.Path { Data = glyph, Stroke = ink ?? Pal.Paper2, StrokeThickness = 1.6, StrokeLineCap = PenLineCap.Round, StrokeJoin = PenLineJoin.Round, Stretch = Stretch.None, Width = 16, Height = 16 };
        ToolTip.SetTip(button, tip);
        button.Click += (_, _) => click();
        return button;
    }

    public static string Bytes(double? value)
    {
        if (value is not { } v || v < 0) return "";
        if (v < 1024) return $"{v:0} B";
        string[] units = ["KB", "MB", "GB", "TB"];
        var amount = v / 1024;
        var i = 0;
        while (amount >= 1024 && i < units.Length - 1) { amount /= 1024; i++; }
        return $"{amount.ToString(amount >= 100 ? "0" : amount >= 10 ? "0.0" : "0.00", System.Globalization.CultureInfo.InvariantCulture)} {units[i]}";
    }

    /// <summary>What kind of account it is, as the account lists show it.</summary>
    public static string AccountKind(AccountSummary account) => account.Type switch
    {
        "microsoft" => "MICROSOFT",
        "offline" => "SIN CONEXIÓN" + (account.OfflineId != null ? "  ID " + account.OfflineId : ""),
        _ => "MOJANG"
    } + (account.Type != "offline" && account.Username != null && account.Username != account.DisplayName ? "  " + account.Username : "");

    /// <summary>A still picture from disk, decoded at the width it is drawn (never the full size). Null when it cannot be read.</summary>
    public static Bitmap? Decode(string? path, int width)
    {
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
        try { using var stream = File.OpenRead(path); return Bitmap.DecodeToWidth(stream, width, BitmapInterpolationMode.MediumQuality); }
        catch { return null; }
    }

    public static Bitmap? Art(string name, int width)
    {
        try { using var stream = Avalonia.Platform.AssetLoader.Open(new Uri($"avares://EmpiLauncher/Assets/Art/{name}")); return Bitmap.DecodeToWidth(stream, width); }
        catch { return null; }
    }
}

/// <summary>The few drawn glyphs the interface needs, as 16x16 strokes (the system may not have symbol fonts).</summary>
public static class Icons
{
    public static readonly Geometry Gear = Geometry.Parse("M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M12.6 3.4l-1.4 1.4 M4.8 11.2l-1.4 1.4");
    public static readonly Geometry Close = Geometry.Parse("M3 3l10 10 M13 3L3 13");
    public static readonly Geometry Minimize = Geometry.Parse("M3 8h10");
    public static readonly Geometry Maximize = Geometry.Parse("M3.5 3.5h9v9h-9Z");
    public static readonly Geometry Trash = Geometry.Parse("M2.5 4.5h11 M6 4.5V3h4v1.5 M4 4.5l.7 8.5h6.6l.7-8.5 M6.7 7v4 M9.3 7v4");
    public static readonly Geometry Check = Geometry.Parse("M3 8.5l3.2 3.2L13 4.8");
    public static readonly Geometry Chevron = Geometry.Parse("M4 6l4 4 4-4");
    public static readonly Geometry Megaphone = Geometry.Parse("M2.5 6.2v3.6h2.2L10 13V3L4.7 6.2H2.5Z M12.2 5.4a3.4 3.4 0 0 1 0 5.2");
    public static readonly Geometry Eye = Geometry.Parse("M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z M8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z");
}
