using System.Diagnostics;
using System.Globalization;
using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using EmpiLauncher.Linux.Services;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// SHELL: the launcher as a terminal. A warm-black grid with cubes blinking on its points, and HUD panels in the room the interface leaves:
/// a turning sphere of little squares, a LOG, an equalizer of blocks, a readout across the top and a dot meter under the modpack.
///
/// The log is not decoration: every line is something the launcher really did or knows. The modpack chosen, its Minecraft, loader and mods,
/// the players online, each step of a download with its percentage and speed, Minecraft starting and closing, the clicks, the interface's own
/// memory and this week's hours played. The readout is the real time and the interface's memory; the equalizer follows the download.
/// The pointer is tracked with hairlines and its coordinates, a click sends square pixel ripples. It arrives as a dithered, checkerboard
/// boot with cursor blocks at the front.
/// </summary>
internal sealed class ShellField : StyleField
{
    public override double ArriveSeconds => 1.6;
    protected override double AmbientMs => 100;

    private const string Mono = "Cascadia Mono, Consolas";
    private const string Dots = "pack://application:,,,/Assets/Fonts/#Doto Black, Cascadia Mono, Consolas";
    private static readonly Color Ink = Color.FromRgb(0x0d, 0x0c, 0x0b);
    private static readonly Color Paper = Color.FromRgb(217, 212, 199);
    private static readonly SolidColorBrush InkBrush = Frozen(Ink);

    private readonly (int Gx, int Gy, double Speed, double Phase, double Size, bool Accent)[] _cubes;
    private readonly (double X, double Y, double Z)[] _sphere;
    private readonly Stopwatch _uptime = Stopwatch.StartNew();

    private sealed record Line(string Text, double At, bool Mark);
    private readonly List<Line> _lines = [];
    private readonly HashSet<Click> _logged = [];

    // what the log last saw, to write a line when it changes
    private string? _packSeen, _textSeen, _phaseSeen, _statusSeen;
    private int _pctSeen = -1;
    private double _nextIdle = 2;
    private int _idleTurn;
    private double _hoursWeek = -1;
    private string? _hoursFor;

    // the interface's memory, read every two seconds (asking the system for it is not free)
    private long _memoryMb;
    private double _memoryAt = -9;
    private long MemoryMb()
    {
        if (T - _memoryAt > 2 || _memoryAt > T) { _memoryAt = T; using var me = Process.GetCurrentProcess(); _memoryMb = me.WorkingSet64 / 1048576; }
        return _memoryMb;
    }

    private static double Hash(double n) { var x = Math.Sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.Floor(x); }

    public ShellField()
    {
        _cubes = Enumerable.Range(0, 150).Select(i => ((int)(Hash(i) * 80), (int)(Hash(i + 500) * 50), 0.3 + Hash(i + 900) * 1.2, Hash(i + 77) * Math.Tau, 3 + Math.Floor(Hash(i + 33) * 3) * 2, Hash(i + 11) < 0.12)).ToArray();
        _sphere = Enumerable.Range(0, 300).Select(i => { var y = 1 - (i + 0.5) / 150; var r = Math.Sqrt(Math.Max(0, 1 - y * y)); var a = i * 2.399963; return (Math.Cos(a) * r, y, Math.Sin(a) * r); }).ToArray();
    }

    protected override void Resized() => InvalidateBase();

    protected override void RenderBase(Dc dc)
    {
        dc.DrawRectangle(InkBrush, null, new Rect(0, 0, W, H));
        var fine = P(Alpha(Paper, 0.045), 1); var bold = P(Alpha(Paper, 0.08), 1);
        for (var x = 0.5; x < W; x += 24) dc.DrawLine(Math.Abs((x - 0.5) % 96) < 0.1 ? bold : fine, new Point(x, 0), new Point(x, H));
        for (var y = 0.5; y < H; y += 24) dc.DrawLine(Math.Abs((y - 0.5) % 96) < 0.1 ? bold : fine, new Point(0, y), new Point(W, y));
    }

    // ---- the log -----------------------------------------------------------------------------------------------------------

    private void Log(string text, bool mark = false)
    {
        _lines.Add(new Line(text.ToUpperInvariant(), T, mark));
        if (_lines.Count > 14) _lines.RemoveAt(0);
    }

    private static string Bar(double f) { var n = (int)Math.Round(Math.Clamp(f, 0, 1) * 10); return "[" + new string('#', n) + new string('.', 10 - n) + "]"; }

    /// <summary>Writes a line for whatever changed since the last frame; with nothing happening, one real fact every few seconds.</summary>
    private void Watch(Services.Launcher l)
    {
        var pack = l.Selected;
        var game = l.Game;
        if (pack != null && pack.Id != _packSeen)
        {
            _packSeen = pack.Id;
            Log($"PACK {pack.Name} v{pack.Version} SELECCIONADO");
            Log($"MINECRAFT {pack.MinecraftVersion} {(pack.Loader ?? "").ToUpperInvariant()} .. [OK]");
            if (pack.Mods > 0) Log($"MODS {pack.Mods} EN EL INDICE .. [OK]");
        }
        if (game.Phase != _phaseSeen)
        {
            var before = _phaseSeen; _phaseSeen = game.Phase;
            if (before != null)
                Log(game.Phase switch
                {
                    "launching" => "MINECRAFT: INICIANDO",
                    "updating" => game.Mode == "java" ? "JAVA: INSTALANDO" : game.Mode == "verify" ? "ARCHIVOS: VERIFICANDO" : "MODPACK: ACTUALIZANDO",
                    "restoring" => "MODPACK: RESTAURANDO",
                    "running" => "MINECRAFT EN MARCHA .. [OK]",
                    "stopping" => "MINECRAFT: DETENIENDO",
                    _ => before == "running" || before == "stopping" ? "MINECRAFT CERRADO .. [OK]" : "LISTO .. [OK]"
                }, mark: true);
        }
        if (game.Busy && game.Text.Length > 0 && game.Text != _textSeen) { _textSeen = game.Text; Log("> " + game.Text.TrimEnd('.')); }
        if (game.Busy && game.Percent / 5 != _pctSeen / 5)
        {
            _pctSeen = game.Percent;
            var speed = game.BytesPerSecond is > 0 ? $"  {game.BytesPerSecond.Value / 1048576:0.0} MB/S" : "";
            Log($"DESCARGA {game.Percent,3}% {Bar(game.Percent / 100.0)}{speed}");
        }
        if (!game.Busy) _pctSeen = -1;
        var status = l.Status is { } st ? st.Online && st.Players is { } p ? $"SERVIDOR EN LINEA {p.Online}/{p.Max}" : "SERVIDOR SIN CONEXION" : null;
        if (status != null && status != _statusSeen) { _statusSeen = status; Log(status + (status.Contains("EN LINEA") ? " .. [OK]" : "")); }

        foreach (var c in Clicks)
        {
            if (!_logged.Add(c) || T - c.T0 > 0.2) continue;
            Log(c.Accent ? $"FETCH {c.X,4:0},{c.Y,4:0} {Bar(0.6)}" : $"INPUT {c.X,4:0},{c.Y,4:0} [OK]", c.Accent);
        }
        _logged.RemoveWhere(c => !Clicks.Contains(c));

        if (pack != null && (pack.Id != _hoursFor)) { _hoursFor = pack.Id; _ = FetchHours(l, pack.Id); }
        if (T > _nextIdle && !game.Busy)
        {
            _nextIdle = T + 3.2;
            var facts = new List<string>();
            if (pack != null) facts.Add($"PACK {pack.Name} v{pack.Version} READY");
            if (l.Account is { } a) facts.Add($"SESION {a.DisplayName} {(a.Type == "offline" ? "SIN CONEXION" : a.Type.ToUpperInvariant())} .. [OK]");
            facts.Add($"UI {MemoryMb()} MB  UPTIME {_uptime.Elapsed:hh\\:mm\\:ss}");
            if (_hoursWeek >= 0) facts.Add($"HORAS ESTA SEMANA {_hoursWeek.ToString("0.0", CultureInfo.InvariantCulture)} H");
            if (l.Pack is { } ps) facts.Add(ps.Installed ? $"INSTALADO v{ps.InstalledVersion} .. [OK]" : "SIN INSTALAR: PULSA JUGAR");
            facts.Add("MOTOR CONECTADO .. [OK]");
            Log(facts[_idleTurn++ % facts.Count]);
        }
    }

    private async Task FetchHours(Services.Launcher l, string id)
    {
        var result = await l.PlaytimeAsync(id);
        if (result != null && id == l.Selected?.Id) _hoursWeek = result.Days.Sum(d => d.Seconds) / 3600.0;
    }

    // ---- a frame -----------------------------------------------------------------------------------------------------------

    private sealed record Panel(string Id, string Title, Rect Box);

    /// <summary>The panels go where the interface leaves room: a column right of the modpack's text, a band above it and one under it.</summary>
    private List<Panel> Layout()
    {
        var panels = new List<Panel>();
        var hero = Quiet.Where(r => r.Left > W * 0.18).ToList();
        if (hero.Count == 0) return panels;
        var left = hero.Min(r => r.Left); var right = hero.Max(r => r.Right); var top = hero.Min(r => r.Top); var bottom = hero.Max(r => r.Bottom);
        var dockTop = Next is { } n ? n.Top - 26 : H - 110;
        var colW = Math.Min(320, W - 24 - (right + 28));
        if (colW >= 170)
        {
            var x = W - 24 - colW; double y = 62; var room = dockTop - 18 - y;
            var sphere = Math.Min(252, room * 0.42); var log = Math.Min(170, room * 0.3); var blocks = room - sphere - log - 28;
            panels.Add(new Panel("sphere", "SPECIMEN", new Rect(x, y, colW, sphere))); y += sphere + 14;
            panels.Add(new Panel("log", "LOG", new Rect(x, y, colW, log))); y += log + 14;
            if (blocks > 60) panels.Add(new Panel("blocks", "LEVELS", new Rect(x, y, colW, blocks)));
        }
        var bandRight = colW >= 170 ? W - 24 - colW - 18 : W - 24;
        if (top - 62 - 16 >= 52) panels.Add(new Panel("readout", "SYS", new Rect(left - 12, 58, bandRight - (left - 12), 52)));
        if (dockTop - 16 - (bottom + 18) >= 80) panels.Add(new Panel("dots", "SIGNAL", new Rect(left - 12, bottom + 18, Math.Min(bandRight, left + 560) - (left - 12), Math.Min(120, dockTop - 16 - (bottom + 18)))));
        return panels;
    }

    protected override void RenderLive(Dc dc, double dt)
    {
        var l = Services.Launcher.Instance;
        Watch(l);
        var accent = Accent;

        // arriving: the terminal boots. Cells switch on in a dithered sweep; the cells at the front flash as cursor blocks
        const double C = 32;
        int cols = (int)Math.Ceiling(W / C), rows = (int)Math.Ceiling(H / C);
        int[] b4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        double Ord(int cx, int cy) => 0.62 * (cx / (double)cols * 0.7 + (1 - cy / (double)rows) * 0.3) + 0.38 * (b4[(cx % 4) + (cy % 4) * 4] / 16.0);
        var arriving = Reveal < 1;
        var lim = Reveal * 1.06;
        if (arriving)
        {
            var clip = new StreamGeometry();
            using (var g = clip.OpenW())
                for (var cy = 0; cy < rows; cy++)
                    for (var cx = 0; cx < cols; cx++)
                        if (Ord(cx, cy) < lim)
                        {
                            g.BeginFigure(new Point(cx * C, cy * C), true, true);
                            g.PolyLineTo([new Point(cx * C + C, cy * C), new Point(cx * C + C, cy * C + C), new Point(cx * C, cy * C + C)], false, false);
                        }
            clip.Freeze();
            ClipBase(clip);
            dc.PushClip(clip);
        }
        else ClipBase(null);

        // cubes blinking on grid points, quieter behind the text
        foreach (var c in _cubes)
        {
            var on = Math.Sin(T * c.Speed + c.Phase);
            if (on < 0.55) continue;
            double x = c.Gx * 24 + 0.5, y = c.Gy * 24 + 0.5;
            if (x > W || y > H) continue;
            var a = (on - 0.55) / 0.45 * (0.55 - 0.4 * QuietAt(x, y, 20));
            dc.DrawRectangle(B(Alpha(c.Accent ? accent : Paper, a)), null, new Rect(x - c.Size / 2, y - c.Size / 2, c.Size, c.Size));
        }

        // square ripples from clicks, stepping out in pixels, and the grid points they pass flash
        foreach (var e in Clicks)
        {
            var age = T - e.T0;
            if (age > 1.6) continue;
            var f = e.Weight * (1 - age / 1.6);
            for (var q = 0; q < 3; q++)
            {
                var half = Math.Floor(Math.Max(0, age * 420 - q * 26) / 12) * 12;
                if (half <= 0) continue;
                var pen = P(q == 0 ? Alpha(accent, 0.8 * f) : Alpha(Paper, 0.35 * f * (1 - q / 3.0)), 1);
                dc.DrawRectangle(null, pen, new Rect(Math.Round(e.X - half) + 0.5, Math.Round(e.Y - half) + 0.5, half * 2, half * 2));
            }
            var band = age * 420;
            var flash = B(Alpha(Paper, 0.45 * f));
            for (var k = 0; k < 18; k++)
            {
                var a2 = Hash(k + e.T0) * Math.Tau;
                dc.DrawRectangle(flash, null, new Rect(Math.Round((e.X + Math.Cos(a2) * band) / 24) * 24 - 3, Math.Round((e.Y + Math.Sin(a2) * band) / 24) * 24 - 3, 6, 6));
            }
        }

        foreach (var p in Layout()) DrawPanel(dc, p, l);

        // the pointer is tracked: hairlines across the grid, a target and its coordinates
        if (PointerAmp > 0.02)
        {
            var a = PointerAmp; var x = Math.Round(Pointer.X) + 0.5; var y = Math.Round(Pointer.Y) + 0.5;
            var hair = P(Alpha(Paper, 0.1 * a), 1);
            dc.DrawLine(hair, new Point(0, y), new Point(W, y)); dc.DrawLine(hair, new Point(x, 0), new Point(x, H));
            var aim = P(Alpha(accent, 0.7 * a), 1);
            dc.DrawEllipse(null, aim, new Point(x, y), 9, 9);
            dc.DrawLine(aim, new Point(x - 14, y), new Point(x - 5, y)); dc.DrawLine(aim, new Point(x + 5, y), new Point(x + 14, y));
            dc.DrawLine(aim, new Point(x, y - 14), new Point(x, y - 5)); dc.DrawLine(aim, new Point(x, y + 5), new Point(x, y + 14));
            dc.DrawText(Text($"X {Pointer.X:0000}  Y {Pointer.Y:0000}", Mono, 10, Alpha(Paper, 0.6 * a)), new Point(x + 16, y + 10));
        }

        if (arriving)
        {
            dc.Pop();
            for (var cy = 0; cy < rows; cy++)
                for (var cx = 0; cx < cols; cx++)
                {
                    var o = Ord(cx, cy);
                    if (o < lim && o > lim - 0.06)
                        dc.DrawRectangle(B(Hash(cx * 31 + cy * 17 + Math.Floor(T * 12)) < 0.5 ? Alpha(accent, 0.85) : Alpha(Paper, 0.55)), null, new Rect(cx * C + 4, cy * C + 4, C - 8, C - 8));
                }
        }
    }

    private void DrawPanel(Dc dc, Panel p, Services.Launcher l)
    {
        var box = p.Box; var accent = Accent;
        var frame = P(Alpha(Paper, 0.32), 1);
        dc.DrawRectangle(B(Color.FromArgb(200, Ink.R, Ink.G, Ink.B)), frame, new Rect(box.X + 0.5, box.Y + 0.5, box.Width - 1, box.Height - 1));
        dc.DrawRectangle(B(Alpha(Paper, 0.85)), null, new Rect(box.X, box.Y, box.Width, 13));
        dc.DrawText(Text(p.Title, Mono, 10, Ink, FontWeight.SemiBold), new Point(box.X + 6, box.Y));
        var chrome = Text("_ □ ×", Mono, 10, Ink, FontWeight.SemiBold);
        dc.DrawText(chrome, new Point(box.Right - chrome.Width - 6, box.Y));
        // crop marks inside the corners
        var marks = P(Alpha(Paper, 0.55), 1); const double m = 7;
        double x0 = box.X + 6, y0 = box.Y + 19, x1 = box.Right - 6, y1 = box.Bottom - 6;
        foreach (var (cx, cy, sx, sy) in new[] { (x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1) })
        {
            dc.DrawLine(marks, new Point(cx, cy), new Point(cx + m * sx, cy));
            dc.DrawLine(marks, new Point(cx, cy), new Point(cx, cy + m * sy));
        }
        double ix = box.X + 12, iy = box.Y + 22, iw = box.Width - 24, ih = box.Height - 32;
        var game = l.Game;
        switch (p.Id)
        {
            case "sphere":
            {
                // a sphere of squares, turning, leaning toward the pointer; near squares bigger and brighter
                var yaw = T * 0.45 + PointerAmp * ((Pointer.X - (box.X + box.Width / 2)) / W);
                var pitch = 0.35 + PointerAmp * ((Pointer.Y - (box.Y + box.Height / 2)) / H) * 0.8;
                double cyw = Math.Cos(yaw), syw = Math.Sin(yaw), cp = Math.Cos(pitch), sp = Math.Sin(pitch);
                double cx = ix + iw / 2, cy = iy + ih / 2 + 6, R = Math.Min(iw, ih) * 0.42;
                double pulse = 0;
                foreach (var e in Clicks) { var a2 = T - e.T0 - Math.Sqrt((e.X - cx) * (e.X - cx) + (e.Y - cy) * (e.Y - cy)) / 420; pulse += e.Weight * 0.12 * Math.Exp(-a2 * a2 * 20); }
                for (var i = 0; i < _sphere.Length; i++)
                {
                    var (x, y, z) = _sphere[i];
                    var x1r = x * cyw + z * syw; var z1 = -x * syw + z * cyw; var y2 = y * cp - z1 * sp; var z2 = y * sp + z1 * cp;
                    var jit = Hash(i + Math.Floor(T * 3)) < 0.02 ? 6 : 0;
                    var px = cx + x1r * R * (1 + pulse) + jit; var py = cy - y2 * R * (1 + pulse);
                    var sz = Math.Round(1.4 + (z2 + 1) * 1.6); var a = 0.2 + 0.8 * (z2 + 1) / 2;
                    dc.DrawRectangle(B(Alpha(i % 37 == 0 ? accent : Paper, a)), null, new Rect(Math.Round(px - sz / 2), Math.Round(py - sz / 2), sz, sz));
                }
                dc.DrawText(Text($"ROT {yaw * 57.3 % 360:0.0}°", Mono, 10, Alpha(Paper, 0.6)), new Point(ix, iy));
                var mods = l.Selected?.Mods ?? 0;
                var tag = Text(mods > 0 ? $"MODS {mods}" : $"N {_sphere.Length}", Mono, 10, Alpha(Paper, 0.6));
                dc.DrawText(tag, new Point(ix + iw - tag.Width, iy));
                break;
            }
            case "log":
            {
                // lines type themselves in; the newest ends in a blinking block cursor
                const double lh = 13;
                var fit = Math.Max(1, (int)(ih / lh));
                var shown = _lines.Skip(Math.Max(0, _lines.Count - fit)).ToList();
                for (var k = 0; k < shown.Count; k++)
                {
                    var ln = shown[k];
                    var n = Math.Min(ln.Text.Length, (int)((T - ln.At) * 60));
                    var done = n == ln.Text.Length;
                    var ok = done && (ln.Text.Contains("[OK]") || ln.Text.EndsWith("READY"));
                    var color = ln.Mark || ln.Text.StartsWith("FETCH") || ln.Text.StartsWith("INPUT") ? Alpha(accent, 0.95) : ok ? Alpha(Paper, 0.85) : Alpha(Paper, 0.6);
                    var text = Text(ln.Text[..n], Mono, 10, color);
                    text.MaxTextWidth = iw; text.MaxLineCount = 1; text.Trimming = TextTrimming.CharacterEllipsis;
                    dc.DrawText(text, new Point(ix, iy + k * lh));
                    if (k == shown.Count - 1 && Math.Sin(T * 9) > 0) dc.DrawRectangle(B(color), null, new Rect(Math.Min(ix + iw - 6, ix + text.WidthIncludingTrailingWhitespace + 2), iy + k * lh + 2, 6, 10));
                }
                break;
            }
            case "blocks":
            {
                // an equalizer of blocks: while something downloads it follows the transfer, otherwise it idles
                const double cw = 14, gap = 3;
                var ncol = (int)(iw / (cw + gap)); var nrow = (int)(ih / (cw + gap));
                double pulse = 0;
                foreach (var e in Clicks) { var a2 = T - e.T0; if (a2 < 1) pulse += e.Weight * (1 - a2); }
                var busy = game.Busy; var pct = game.Percent / 100.0;
                var solid = B(Alpha(Paper, 0.75)); var empty = P(Alpha(Paper, 0.14), 1); var topPen = P(Alpha(accent, 0.95), 1); var topDot = B(Alpha(accent, 0.95));
                for (var c = 0; c < ncol; c++)
                {
                    var wave = 0.5 + 0.5 * Math.Sin(T * (0.7 + Hash(c) * 1.3) + c * 0.6);
                    var level = busy ? (c / (double)ncol <= pct ? 0.55 + 0.4 * wave : 0.12) : 0.25 + 0.5 * wave + 0.3 * pulse * Hash(c + 40);
                    var lvl = (int)Math.Round(nrow * Math.Min(1, level));
                    for (var r = 0; r < nrow; r++)
                    {
                        var x = ix + c * (cw + gap); var y = iy + ih - (r + 1) * (cw + gap);
                        if (r < lvl - 1) dc.DrawRectangle(solid, null, new Rect(x, y, cw, cw));
                        else if (r == lvl - 1) { dc.DrawRectangle(null, topPen, new Rect(x + 0.5, y + 0.5, cw - 1, cw - 1)); dc.DrawRectangle(topDot, null, new Rect(x + 5, y + 5, 4, 4)); }
                        else dc.DrawRectangle(null, empty, new Rect(x + 0.5, y + 0.5, cw - 1, cw - 1));
                    }
                }
                break;
            }
            case "readout":
            {
                // the real time, big, and what the interface costs right now
                var now = DateTime.Now;
                dc.DrawText(Text($"{now:HH:mm:ss} | {now:dd.MM.yy}", Dots, 20, Alpha(Paper, 0.9), FontWeight.Bold), new Point(ix, iy + 1));
                var st = l.Status;
                var small = Text($"UI {MemoryMb()} MB · {(st is { Online: true, Players: { } pl } ? $"{pl.Online} EN LINEA" : "SIN SERVIDOR")} · {(game.Busy ? $"{game.Percent}%" : game.Running ? "JUGANDO" : "EN ESPERA")}", Mono, 10, Alpha(Paper, 0.6));
                if (ix + 250 + small.Width < box.Right) dc.DrawText(small, new Point(box.Right - 12 - small.Width, iy + 6));
                break;
            }
            case "dots":
            {
                // a dot-matrix meter: lit up to a level that follows the signal (the download's, when there is one)
                const double stp = 9;
                var ncol = (int)(iw / stp); var nrow = (int)(ih / stp);
                var dim = B(Alpha(Paper, 0.1)); var lit = B(Alpha(Paper, 0.8)); var head = B(Alpha(accent, 0.95));
                for (var c = 0; c < ncol; c++)
                {
                    var lv = game.Busy ? (c / (double)ncol <= game.Percent / 100.0 ? 0.7 + 0.2 * Math.Sin(T * 3 + c * 0.4) : 0.08)
                        : 0.35 + 0.3 * Math.Sin(T * 1.3 + c * 0.35) + 0.2 * Math.Sin(T * 2.7 - c * 0.9) + 0.15 * Hash(c + Math.Floor(T * 6));
                    foreach (var e in Clicks) { var a2 = T - e.T0; if (a2 < 1.2) lv += e.Weight * 0.5 * Math.Exp(-Math.Pow((c - ncol / 2.0) / 8 - a2 * 3, 2)); }
                    var on = (int)Math.Round(Math.Min(1, lv) * nrow);
                    for (var r = 0; r < nrow; r++) dc.DrawRectangle(r < on ? (r == on - 1 ? head : lit) : dim, null, new Rect(ix + c * stp, iy + ih - (r + 1) * stp, 3, 3));
                }
                break;
            }
        }
    }
}
