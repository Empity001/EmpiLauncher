using System.Globalization;
using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using EmpiLauncher.Linux.Services;
using Avalonia.Threading;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// MINIMAL: a calm dark ground with a soft glow of the accent, and a few clean cards in the room the interface leaves free, each one a real
/// fact of the selected modpack: its mods in a ring of dots (the download's percentage while it downloads), its Minecraft and loader, the
/// players online, and the hours played this week (engine: stats.playtime, counted from the game's own start and exit). The cards settle in
/// one after another when the style arrives, lift a little under the pointer, and a click answers with one thin ring.
///
/// Nothing moves at rest but the ring's slow breathing, so it draws four frames a second then.
/// </summary>
internal sealed class MinimalField : StyleField
{
    public override double ArriveSeconds => 1.1;
    public override double Ease(double raw) => 1 - Math.Pow(1 - raw, 3);
    protected override double AmbientMs => 250;

    private const string Face = "Segoe UI Variable Display, Segoe UI";
    private const string Body = "Segoe UI Variable Text, Segoe UI";
    private static readonly Color Ink = Color.FromRgb(0xf4, 0xf4, 0xf5);
    private static readonly Color Ground = Color.FromRgb(0x0c, 0x0c, 0x0d);
    private static readonly SolidColorBrush GroundBrush = Frozen(Ground);
    private static readonly SolidColorBrush OffDot = Frozen(Color.FromArgb(31, 255, 255, 255));
    private readonly SolidColorBrush[] _cardFill = Enumerable.Range(0, 9).Select(i => Frozen(Color.FromRgb((byte)(24 + i), (byte)(24 + i), (byte)(27 + i)))).ToArray();

    private sealed record Card(string Id, Rect Box);
    private readonly Dictionary<string, double> _lift = [];
    private double _lit, _shownProgress;

    // hours played this week, asked to the engine when the modpack changes and once a minute while shown
    private double[] _hours = new double[7];
    private int[] _weekdays = Enumerable.Range(0, 7).Select(i => (int)DateTime.Now.AddDays(i - 6).DayOfWeek).ToArray();
    private string? _hoursFor;
    private DateTime _hoursAt;

    public MinimalField() { }

    protected override void AccentChanged() => InvalidateBase();
    protected override void Resized() => InvalidateBase();

    protected override void RenderBase(Dc dc)
    {
        dc.DrawRectangle(GroundBrush, null, new Rect(0, 0, W, H));
        var glow = new RadialGradientBrush { Center = new RelativePoint(new Point(W * 0.8, H * 0.35), RelativeUnit.Absolute), GradientOrigin = new RelativePoint(new Point(W * 0.8, H * 0.35), RelativeUnit.Absolute), RadiusX = new RelativeScalar(620, RelativeUnit.Absolute), RadiusY = new RelativeScalar(620, RelativeUnit.Absolute) };
        glow.GradientStops.Add(new GradientStop(Color.FromArgb(20, Accent.R, Accent.G, Accent.B), 0));
        glow.GradientStops.Add(new GradientStop(Color.FromArgb(0, Accent.R, Accent.G, Accent.B), 1));
        glow.Freeze();
        dc.DrawRectangle(glow, null, new Rect(0, 0, W, H));
    }

    /// <summary>The column the cards live in: right of the modpack's text, above the dock. Null when the window leaves no room for them.</summary>
    private Rect? Column()
    {
        double textRight = 0;
        foreach (var r in Quiet) if (r.Left > W * 0.18 && r.Right > textRight) textRight = r.Right;
        var right = W - 24;
        var width = Math.Min(320, right - (textRight + 28));
        if (width < 150) return null;
        var top = 64.0;
        var bottom = (Next is { } n ? n.Top - 30 : H - 120);
        return bottom - top < 150 ? null : new Rect(right - width, top, width, bottom - top);
    }

    private List<Card> Layout(Rect col)
    {
        var cards = new List<Card>();
        var w = col.Width; var y = col.Top; const double gap = 14;
        void Add(string id, double x, double width, double height) { if (y + height <= col.Bottom) cards.Add(new Card(id, new Rect(x, y, width, height))); }
        var ring = Math.Min(w * 0.92, Math.Min(300, col.Height * 0.46));
        Add("ring", col.Left, w, ring); y += ring + gap;
        if (w >= 260)
        {
            var half = (w - gap) / 2;
            Add("ver", col.Left, half, 112); Add("players", col.Left + half + gap, half, 112); y += 112 + gap;
        }
        else { Add("ver", col.Left, w, 86); y += 86 + gap; Add("players", col.Left, w, 86); y += 86 + gap; }
        Add("chart", col.Left, w, 132);
        return cards;
    }

    protected override void RenderLive(Dc dc, double dt)
    {
        var l = Services.Launcher.Instance;
        var pack = l.Selected;
        var game = l.Game;
        var busy = game.Busy;
        var progress = busy ? Math.Clamp(game.Percent / 100.0, 0, 1) : 0;
        var appear = Reveal;
        var eo = (Func<double, double>)(x => 1 - Math.Pow(1 - Math.Clamp(x, 0, 1), 3));

        FadeBase(Math.Min(1, appear * 1.6));   // arriving: the ground comes in first, then the cards settle
        if (pack != null) FetchHours(l, pack.Id);

        _lit += ((busy ? progress : 1) - _lit) * Math.Min(1, dt * 5);
        _shownProgress += (progress - _shownProgress) * Math.Min(1, dt * 8);

        if (Column() is { } col && pack != null)
        {
            var cards = Layout(col);
            for (var i = 0; i < cards.Count; i++)
            {
                var c = cards[i];
                var hot = PointerAmp > 0.3 && c.Box.Contains(Pointer);
                var lift = _lift.GetValueOrDefault(c.Id);
                lift += ((hot ? 1 : 0) - lift) * Math.Min(1, dt * 8);
                _lift[c.Id] = lift;
                var k = eo(appear * 1.5 - i * 0.12);
                if (k <= 0) continue;
                var box = c.Box.Moved(0, (1 - k) * 18 - lift * 3);
                var r = Math.Min(22, box.Height / 4);
                dc.PushOpacity(k);
                dc.DrawRoundedRectangle(_cardFill[(int)Math.Round(lift * 8)], null, box, r, r);
                switch (c.Id)
                {
                    case "ring": DrawRing(dc, box, pack, busy); break;
                    case "ver": DrawFact(dc, box, "Minecraft", pack.MinecraftVersion, pack.Loader ?? ""); break;
                    case "players":
                        var st = l.Status;
                        DrawFact(dc, box, "Jugadores", st is { Online: true, Players: { } p } ? $"{p.Online}/{p.Max}" : "—", st == null ? "" : st.Online ? "en línea" : "sin conexión");
                        break;
                    case "chart": DrawChart(dc, box); break;
                }
                dc.Pop();
            }
        }

        // a click answers with one thin ring that opens and fades
        foreach (var click in Clicks)
        {
            var age = T - click.T0;
            if (age > 0.9) continue;
            var k = eo(age / 0.9);
            var pen = new Pen(Frozen(Alpha(Accent, (1 - k) * 0.7 * click.Weight)), 1.2);
            dc.DrawEllipse(null, pen, new Point(click.X, click.Y), 6 + k * 70, 6 + k * 70);
        }
    }

    private void DrawRing(Dc dc, Rect box, Modpack pack, bool busy)
    {
        var accent = Frozen(Accent);
        var cx = box.X + box.Width / 2; var cy = box.Y + box.Height / 2 + 8;
        var R = Math.Min(box.Width, box.Height) * 0.34;
        var dot = Math.Max(2.4, R / 25);
        const int n = 56;
        for (var j = 0; j < n; j++)
        {
            var a = -Math.PI / 2 + (double)j / n * Math.Tau;
            var on = (double)j / n < _lit;
            var pop = on ? 1 + 0.075 * Math.Max(0, Math.Sin(T * 2 - j * 0.15)) : 1;
            dc.DrawEllipse(on ? accent : OffDot, null, new Point(cx + Math.Cos(a) * R, cy + Math.Sin(a) * R), dot * pop, dot * pop);
        }
        var game = Services.Launcher.Instance.Game;
        var big = busy ? $"{Math.Round(_shownProgress * 100)}%" : pack.Mods > 0 ? pack.Mods.ToString(CultureInfo.InvariantCulture) : pack.MinecraftVersion;
        var size = Math.Clamp(R * 0.5, 24, 52);
        var value = Text(big, Face, size, Ink, FontWeight.SemiBold);
        dc.DrawText(value, new Point(cx - value.Width / 2, cy - value.Height / 2 - 6));
        var under = Text(busy ? "descargando" : pack.Mods > 0 ? "mods" : "Minecraft", Body, Math.Clamp(size * 0.28, 11, 14), Alpha(Ink, 0.5));
        dc.DrawText(under, new Point(cx - under.Width / 2, cy + value.Height / 2 - 4));
        var title = Text(busy ? (game.Mode == "java" ? "Java" : "Descarga") : "Modpack", Body, 13, Alpha(Ink, 0.55), FontWeight.Medium);
        dc.DrawText(title, new Point(box.X + 18, box.Y + 14));
    }

    private void DrawFact(Dc dc, Rect box, string label, string value, string note)
    {
        var compact = box.Height < 100;
        dc.DrawText(Text(label, Body, 13, Alpha(Ink, 0.55), FontWeight.Medium), new Point(box.X + 18, box.Y + (compact ? 12 : 16)));
        var big = Text(value, Face, compact ? 21 : 26, Ink, FontWeight.SemiBold);
        big.MaxTextWidth = Math.Max(20, box.Width - 30); big.Trimming = TextTrimming.CharacterEllipsis; big.MaxLineCount = 1;
        dc.DrawText(big, new Point(box.X + 18, box.Y + (compact ? 32 : 40)));
        if (note.Length > 0) dc.DrawText(Text(note, Body, 13, Accent, FontWeight.Medium), new Point(box.X + 18, box.Y + (compact ? 60 : 78)));
    }

    private static readonly string[] Days = ["D", "L", "M", "X", "J", "V", "S"];

    /// <summary>Hours played on each of the last seven days: a smooth line through them, today marked.</summary>
    private void DrawChart(Dc dc, Rect box)
    {
        dc.DrawText(Text("Horas jugadas", Body, 13, Alpha(Ink, 0.55), FontWeight.Medium), new Point(box.X + 18, box.Y + 14));
        var week = _hours.Sum();
        var total = Text(week < 0.05 ? "sin partidas" : week < 1 ? $"{Math.Round(week * 60)} min" : $"{week.ToString(week < 10 ? "0.0" : "0", CultureInfo.InvariantCulture)} h", Body, 13, Ink, FontWeight.SemiBold);
        dc.DrawText(total, new Point(box.Right - 18 - total.Width, box.Y + 14));
        double x0 = box.X + 20, x1 = box.Right - 20, y0 = box.Y + 44, y1 = box.Bottom - 30;
        var top = Math.Max(1, _hours.Max()) * 1.1;
        var appear = Math.Min(1, Reveal * 1.2);
        var pts = _hours.Select((h, j) => new Point(x0 + (x1 - x0) * j / 6, y1 - (y1 - y0) * (h / top) * appear)).ToArray();
        var line = new StreamGeometry();
        using (var g = line.OpenW())
        {
            g.BeginFigure(pts[0], false, false);
            for (var j = 1; j < pts.Length; j++)
            {
                var q = pts[j - 1]; var p = pts[j]; var mx = (q.X + p.X) / 2;
                g.BezierTo(new Point(mx, q.Y), new Point(mx, p.Y), p, true, true);
            }
        }
        line.Freeze();
        dc.DrawGeometry(null, new Pen(Frozen(Alpha(Ink, 0.8)), 1.6), line);
        var today = pts[^1];
        var dash = new Pen(Frozen(Alpha(Accent, 0.9)), 1) { DashStyle = new DashStyle([2, 3], 0) };
        dc.DrawLine(dash, new Point(today.X, y0 - 6), new Point(today.X, y1));
        var fill = Frozen(Color.FromRgb(0x18, 0x18, 0x1b));
        for (var j = 0; j < pts.Length; j++)
        {
            var mark = j == pts.Length - 1;
            dc.DrawEllipse(fill, new Pen(mark ? Frozen(Accent) : Frozen(Alpha(Ink, 0.8)), 1.6), pts[j], 3.4, 3.4);
            var day = Text(Days[_weekdays[j]], Body, 10.5, Alpha(Ink, mark ? 0.85 : 0.4), mark ? FontWeight.SemiBold : FontWeight.Normal);
            dc.DrawText(day, new Point(pts[j].X - day.Width / 2, y1 + 8));
        }
    }

    private async void FetchHours(Services.Launcher l, string id)
    {
        if (id == _hoursFor && DateTime.UtcNow - _hoursAt < TimeSpan.FromMinutes(1)) return;
        _hoursFor = id; _hoursAt = DateTime.UtcNow;
        var result = await l.PlaytimeAsync(id);
        if (result == null || result.Days.Count != 7 || id != l.Selected?.Id) return;
        _hours = result.Days.Select(d => d.Seconds / 3600.0).ToArray();
        _weekdays = result.Days.Select(d => Math.Clamp(d.Weekday, 0, 6)).ToArray();
    }
}
