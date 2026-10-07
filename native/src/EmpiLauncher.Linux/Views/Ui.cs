using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.Linux.Views;

/// <summary>Small factories for the pieces every screen is made of: text in the three voices, pills, modules and buttons.</summary>
public static partial class Ui
{
    public static TextBlock Display(string text, double size = 24, IBrush? ink = null)
    {
        var t = Voice("DisplayText"); t.Text = text; t.FontSize = size; if (ink != null) t.Foreground = ink;
        return t;
    }

    public static TextBlock Label(string text, double size = 12, IBrush? ink = null)
    {
        var t = Voice("LabelText"); t.Text = text; t.FontSize = size; if (ink != null) t.Foreground = ink;
        return t;
    }

    public static TextBlock Caption(string text, double size = 11.5)
    {
        var t = Voice("CaptionText"); t.Text = text; if (size != 11.5) t.FontSize = size;
        return t;
    }

    public static TextBlock Body(string text, double size = 14, IBrush? ink = null)
    {
        var t = Voice("BodyText"); t.Text = text; t.FontSize = size; if (ink != null) t.Foreground = ink;
        return t;
    }

    public static Border Pill(string text, IBrush? ink = null, IBrush? fill = null, double size = 11)
    {
        var pill = new Border { Margin = new Thickness(0, 0, 8, 6), Child = Label(text, size, ink ?? Pal.Paper2), Classes = { "tag" } };
        Look.DressPill(pill);
        if (fill != null) pill.Background = fill;
        return pill;
    }

    public static Border Module(Control child, Thickness? padding = null, IBrush? fill = null)
    {
        var module = new Border { Child = child, Classes = { "module" } };
        Look.Dress(module);
        module.Padding = padding ?? Look.ModulePadding;
        if (fill != null) module.Background = fill;
        return module;
    }

    public enum Kind { Ghost, Paper, Primary, Danger, Icon }

    public static Button Btn(string text, Kind kind = Kind.Ghost, Action? click = null, Thickness? padding = null, double size = 13)
    {
        var button = new Button { Classes = { "pill" } };
        Style(button, kind);
        if (padding != null) button.Padding = padding.Value;
        button.Content = new TextBlock { Text = text, FontFamily = button.FontFamily, FontSize = size == 13 ? button.FontSize : size, FontWeight = button.FontWeight, FontStyle = button.FontStyle };
        if (click != null) button.Click += (_, _) => click();
        return button;
    }

    /// <summary>Dresses a button as the style in use draws that kind of button (colour, outline, font and, in some styles, its whole shape).</summary>
    public static void Style(Button button, Kind kind)
    {
        if (kind == Kind.Icon)
        {
            button.Background = Pal.Clear; button.Foreground = Pal.Paper2; button.BorderThickness = new Thickness(0); button.CornerRadius = Pal.PillRadius;
            return;
        }
        Look.Dress(button, Look.Of(kind));
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
    public static readonly Geometry Bubble = Geometry.Parse("M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2Z");
    public static readonly Geometry Restore = Geometry.Parse("M5.5 3.5h7v7 M3.5 5.5h7v7h-7Z");
    public static readonly Geometry Warning = Geometry.Parse("M8 2L14.5 13.5H1.5Z M8 6.5v3.5 M8 11.8v.2");
    public static readonly Geometry Eye = Geometry.Parse("M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z M8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z");
}
