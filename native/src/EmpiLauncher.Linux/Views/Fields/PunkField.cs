using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using EmpiLauncher.Linux.Services;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// PUNK: a photocopied zine glued to a wall. Newsprint with toner grain and blown-out halftone, pages ripped by hand (every panel has a
/// torn edge with the white fibre showing), one spot colour (the accent) and black.
///
/// What is glued there is real: a gig flyer typed with the modpack (its name, Minecraft and loader, how many mods, how many players are in,
/// whether it takes a whitelist), the Minecraft version on a white strip, the mod count in ransom-note letters cut from magazines, the
/// player's name tagged in white marker, and under the modpack a ransom word that says what is going on ("HAZ RUIDO", "BAJANDO 45%",
/// "EN VIVO" while the game runs). Everything moves in stop-motion, eight frames a second: the scraps shiver, the grain changes. A click
/// sprays paint that drips; the pointer leaves a marker scribble that fades. It arrives as big torn sheets slapped on, one after another.
///
/// Cost: the wall and the glued scraps are the base (a texture, drawn again only when the modpack, the accent or the layout change); each
/// frame is a tile of grain, a few dozen letter scraps and whatever paint is fresh.
/// </summary>
internal sealed class PunkField : StyleField
{
    public override double ArriveSeconds => 1.4;
    public override double Ease(double raw) => raw;   // the sheets land at a steady beat, one slap after another
    protected override double AmbientMs => 125;

    private static readonly Color Ink = Color.FromRgb(0x14, 0x12, 0x14);
    private static readonly Color Paper = Color.FromRgb(0xf1, 0xec, 0xe2);
    private static readonly Color News = Color.FromRgb(0xe6, 0xe0, 0xd4);
    private static readonly Color Grey = Color.FromRgb(0xd8, 0xd2, 0xc4);
    private static readonly Color WallC = Color.FromRgb(0xe4, 0xdf, 0xd3);
    private static readonly SolidColorBrush Fibre = Frozen(Color.FromRgb(0xfb, 0xf8, 0xf2));
    private static readonly SolidColorBrush Tape = Frozen(Color.FromArgb(150, 0xdc, 0xd7, 0xc8));
    private static readonly SolidColorBrush Shadow = Frozen(Color.FromArgb(46, 0x14, 0x12, 0x14));
    private static readonly Pen Marker = MarkerPen(Ink, 6);
    private static readonly Pen Edge = MarkerPen(Ink, 1.5);
    private static readonly string[] Fonts = ["Impact", "Georgia", "Courier New", "Arial Black", "Ink Free", "Times New Roman", "Segoe UI Black"];
    private const string Type = "Courier New";

    private static double Hash(double n) { var x = Math.Sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.Floor(x); }
    private static Pen MarkerPen(Color c, double w) { var p = new Pen(Frozen(c), w) { LineCap = PenLineCap.Round, LineJoin = PenLineJoin.Round }; p.Freeze(); return p; }
    private static Color AccentInk() => Pal.AccentInk.Color;

    // ---- the title, cut out of magazines (HomeView asks for it while this style is on) ----------------------------------------------

    /// <summary>A ransom note: every letter on its own scrap, with its own face, size, paper and tilt, and a hard shadow. Always the same for the same name.</summary>
    public static IEnumerable<Avalonia.Controls.Documents.Inline> Ransom(string text)
    {
        var shade = Frozen(Color.FromArgb(89, 0, 0, 0));
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (char.IsWhiteSpace(ch)) { yield return new Avalonia.Controls.Documents.Run(" ") { FontSize = 30 }; continue; }
            var n = i;
            double R(int k) { var x = Math.Sin((n + 1) * k * 12.9898 + text.Length) * 43758.5453; return x - Math.Floor(x); }
            var family = Fonts[(int)(R(1) * Fonts.Length)];
            var letter = new Avalonia.Controls.TextBlock
            {
                Text = ch.ToString(), FontFamily = FontMap.Resolve(family, FontMap.Kind.Body), FontSize = 36 + R(4) * 20,
                FontWeight = family is "Georgia" or "Times New Roman" or "Courier New" ? FontWeight.Bold : FontWeight.Normal,
                FontStyle = family == "Times New Roman" ? FontStyle.Italic : FontStyle.Normal
            };
            letter.Margin = new Thickness(0, -3, 0, -3);   // the face's own line gap trimmed: the scrap hugs the letter
            var scrap = new Avalonia.Controls.Border { Padding = new Thickness(5, 0, 5, 0), Child = letter };
            switch ((int)(R(3) * 5))
            {
                case 0: scrap.Background = Frozen(Paper); letter.Foreground = Frozen(Ink); break;
                case 1: scrap.Background = Frozen(Ink); letter.Foreground = Brushes.White; break;
                case 2:
                    scrap.Background = Pal.Accent;
                    letter.Foreground = Pal.AccentInk;
                    scrap.BorderBrush = Frozen(Ink); scrap.BorderThickness = new Thickness(1.5);
                    break;
                case 3: scrap.Background = Brushes.White; letter.Foreground = Frozen(Ink); break;
                default: scrap.Background = Frozen(Grey); letter.Foreground = Frozen(Ink); break;
            }
            var angle = (R(2) - 0.5) * 12;
            scrap.RenderTransformOrigin = Rp.Rel(0.5, 0.5); scrap.RenderTransform = new RotateTransform(angle);
            var under = new Avalonia.Controls.Border { Background = shade, Margin = new Thickness(3, 3, -3, -3), RenderTransformOrigin = Rp.Rel(0.5, 0.5), RenderTransform = new RotateTransform(angle) };
            var cell = new Avalonia.Controls.Grid { Margin = new Thickness(1, 3, 1, 3) };
            cell.Children.Add(under); cell.Children.Add(scrap);
            yield return new Avalonia.Controls.Documents.InlineUIContainer(cell) { BaselineAlignment = BaselineAlignment.Center };
        }
    }

    // ---- where things go: around the modpack's text, never on it ------------------------------------------------------------------

    private Rect _hero, _block;
    private Rect? _flyer, _strip;
    private double _dockTop, _colX, _colW;

    private void Layout()
    {
        var text = Quiet.Where(r => r.Left > W * 0.18 && r.Width > 4 && r.Height > 4).ToList();
        _hero = text.Count > 0
            ? new Rect(new Point(text.Min(r => r.Left), text.Min(r => r.Top)), new Point(text.Max(r => r.Right), text.Max(r => r.Bottom)))
            : new Rect(W * 0.32, H * 0.26, W * 0.36, H * 0.4);
        _dockTop = Next is { } play ? play.Top - 22 : H - 110;
        _colX = _hero.Right + 34;
        _colW = W - 18 - _colX;
        _flyer = _colW >= 210 ? new Rect(W - 18 - Math.Min(300, _colW), Math.Max(62, H * 0.09), Math.Min(300, _colW), 206) : null;
        var top = _flyer?.Bottom ?? H * 0.09;
        _strip = _colW >= 190 ? new Rect(W - 30 - 180, top + 34, 180, 44) : null;
        _block = new Rect(new Point(Math.Max(_colX - 30, W * 0.58), Math.Max(_hero.Bottom - 70, H * 0.5)), new Point(W + 30, _dockTop + 60));
    }

    // ---- the wall and what is glued on it (the base) ------------------------------------------------------------------------------

    private Dg? _wall;
    private Size _wallFor;

    protected override void Resized() { _wall = null; _sheets = null; }

    private void BuildWall()
    {
        var wall = new Dg();
        using (var g = wall.OpenW())
        {
            g.DrawRectangle(Frozen(WallC), null, new Rect(-12, -12, W + 24, H + 24));
            // halftone blown out of two corners of the photocopy
            var dots = new StreamGeometry();
            using (var s = dots.OpenW())
            {
                foreach (var (cx, cy, reach) in new[] { (W * 0.98, H * 0.02, W * 0.34), (W * 0.42, H * 1.04, W * 0.3) })
                    for (var y = cy - reach; y < cy + reach; y += 9)
                        for (var x = cx - reach + ((int)((y - cy) / 9) % 2) * 4.5; x < cx + reach; x += 9)
                        {
                            var d = Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / reach;
                            if (d >= 1 || x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
                            var r = 3.6 * Math.Pow(1 - d, 0.8);
                            if (r < 0.4) continue;
                            s.BeginFigure(new Point(x - r, y), true, true);
                            s.ArcTo(new Point(x + r, y), new Size(r, r), 0, false, SweepDirection.Clockwise, false, false);
                            s.ArcTo(new Point(x - r, y), new Size(r, r), 0, false, SweepDirection.Clockwise, false, false);
                        }
            }
            dots.Freeze();
            g.DrawGeometry(Frozen(Color.FromArgb(46, 0x14, 0x12, 0x14)), null, dots);
            // where the copier dragged
            for (var i = 0; i < 5; i++) g.DrawRectangle(Frozen(Color.FromArgb((byte)(10 + Hash(i + 40) * 14), 0x14, 0x12, 0x14)), null, new Rect(-10, Hash(i + 20) * H, W + 20, 1 + Hash(i + 30) * 4));
        }
        wall.Freeze();
        _wall = wall; _wallFor = new Size(W, H);
    }

    protected override void RenderBase(Dc dc)
    {
        if (_wall == null || _wallFor != new Size(W, H)) BuildWall();
        dc.DrawDrawing(_wall);
        Layout();
        var pack = Services.Launcher.Instance.Selected;

        // the accent's field behind the modpack, reaching right; a black block low on the right, under the end of the dock
        Scrap(dc, new Rect(new Point(_hero.Left - 70, Math.Max(40, H * 0.05)), new Point(Math.Min(W + 12, _colX + 90), _hero.Bottom + 44)), -1.2, Accent, 3);
        Scrap(dc, _block, 1.8, Ink, 5);
        // the slogan over the modpack, if there is room above it
        if (_hero.Top - 70 > 56) Scrap(dc, new Rect(_hero.Left + 24, _hero.Top - 70, 230, 44), -3.4, Ink, 11, (g, w, h) => Centered(g, Text("SIN FUTURO", Type, 24, Colors.White, FontWeight.Bold), w, h));
        if (pack == null) return;
        // the gig flyer: the modpack's real data, typed
        if (_flyer is { } flyer) Scrap(dc, flyer, 3, News, 7, (g, w, h) => Flyer(g, pack, w), tape: true);
        if (_strip is { } strip) Scrap(dc, strip, 4.5, Colors.White, 13, (g, w, h) => Centered(g, Text($"MC {pack.MinecraftVersion}", "Impact", 26, Ink), w, h));
    }

    private void Flyer(Dc g, EmpiLauncher.Ipc.Modpack pack, double w)
    {
        var st = Services.Launcher.Instance.Status;
        var lines = new List<string> { $"MINECRAFT {pack.MinecraftVersion}" + (string.IsNullOrWhiteSpace(pack.Loader) ? "" : $"  /  {pack.Loader.ToUpperInvariant()}") };
        if (pack.Mods > 0) lines.Add($"{pack.Mods} MODS SIN PERMISO");
        if (st is { Online: true, Players: { } p }) lines.Add($"AFORO {p.Online}/{p.Max}");
        lines.Add(pack.Whitelist ? "SOLO CON INVITACIÓN" : "ENTRADA LIBRE");
        lines.Add("TRAE TU PROPIO PICO");
        lines.Add("");
        lines.Add("NO SE ACEPTAN CREEPERS");
        Line(g, Text("EMPI LAUNCHER PRESENTA", Type, 12, Ink, FontWeight.Bold), 12, 12, w);
        Line(g, Text(pack.Name.ToUpperInvariant(), "Impact", 26, Ink), 12, 28, w);
        for (var i = 0; i < lines.Count; i++) Line(g, Text(lines[i], Type, 12, Ink, FontWeight.Bold), 12, 68 + i * 17, w);
    }

    private static void Line(Dc g, FormattedText t, double x, double y, double w)
    {
        t.MaxTextWidth = Math.Max(20, w - x - 10); t.MaxLineCount = 1; t.Trimming = TextTrimming.CharacterEllipsis;
        g.DrawText(t, new Point(x, y));
    }

    private static void Centered(Dc g, FormattedText t, double w, double h) => g.DrawText(t, new Point(w / 2 - t.Width / 2, h / 2 - t.Height / 2 + 1));

    /// <summary>A piece of paper ripped out by hand: a soft shadow, the white fibre along the tear, the paper, and what is printed on it.</summary>
    private void Scrap(Dc dc, Rect r, double rot, Color fill, double seed, Action<Dc, double, double>? inside = null, bool tape = false)
    {
        if (r.Width < 10 || r.Height < 10) return;
        var shape = Torn(r.Width, r.Height, seed, 5);
        dc.PushTransform(Tr.Rotate(rot, r.X + r.Width / 2, r.Y + r.Height / 2));
        dc.PushTransform(Tr.Translate(r.X, r.Y));
        dc.PushTransform(Tr.Translate(3, 5)); dc.DrawGeometry(Shadow, null, shape); dc.Pop();
        dc.PushTransform(Tr.Translate(2, 2)); dc.DrawGeometry(Fibre, null, Torn(r.Width, r.Height, seed + 1, 6)); dc.Pop();
        dc.DrawGeometry(B(fill), null, shape);
        if (inside != null) { dc.PushClip(shape); inside(dc, r.Width, r.Height); dc.Pop(); }
        if (tape) { dc.PushTransform(Tr.Rotate(-4.5, r.Width / 2, -4)); dc.DrawRectangle(Tape, null, new Rect(r.Width / 2 - 28, -13, 56, 18)); dc.Pop(); }
        dc.Pop(); dc.Pop();
    }

    /// <summary>A torn outline: every edge walked in 7 px steps, each step pushed in or out a little.</summary>
    private static StreamGeometry Torn(double w, double h, double seed, double jag)
    {
        var geometry = new StreamGeometry();
        using (var c = geometry.OpenW())
        {
            var first = true;
            void Edge(double x0, double y0, double x1, double y1, int k)
            {
                var len = Math.Sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
                var n = Math.Max(2, (int)(len / 7));
                double nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
                for (var i = 0; i < n; i++)
                {
                    var u = i / (double)n; var off = (Hash(seed + k * 97 + i) - 0.5) * jag * 2;
                    var p = new Point(x0 + (x1 - x0) * u + nx * off, y0 + (y1 - y0) * u + ny * off);
                    if (first) { c.BeginFigure(p, true, true); first = false; } else c.LineTo(p, false, false);
                }
            }
            Edge(0, 0, w, 0, 1); Edge(w, 0, w, h, 2); Edge(w, h, 0, h, 3); Edge(0, h, 0, 0, 4);
        }
        geometry.Freeze();
        return geometry;
    }

    // ---- ransom-note words (live: every letter shivers on its own) --------------------------------------------------------------

    private sealed class Letter { public required Geometry Shape; public required Geometry Tear; public required Color Fill; public required FormattedText Glyph; public double W, H, X, Rot, Seed; }
    private sealed class Word { public List<Letter> Letters { get; } = []; public double Width; public double Size; }
    private readonly Dictionary<string, Word> _words = [];

    private Word Cut(string text, double seed, double size)
    {
        var key = $"{text}\u0001{seed}\u0001{size:0}";
        if (_words.TryGetValue(key, out var made)) return made;
        if (_words.Count > 40) _words.Clear();
        var word = new Word { Size = size };
        double x = 0;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (ch == ' ') { x += size * 0.35; continue; }
            var s = seed + i * 13;
            var fs = size * (0.8 + Hash(s + 2) * 0.4);
            var kind = (int)(Hash(s + 1) * 5);
            var fill = kind switch { 0 => Paper, 1 => Ink, 2 => Accent, 3 => Colors.White, _ => Grey };
            var ink = kind switch { 1 => Colors.White, 2 => AccentInk(), _ => Ink };
            var family = Fonts[(int)(Hash(s) * Fonts.Length)];
            var glyph = Text(ch.ToString(), family, fs, ink, family is "Georgia" or "Times New Roman" or "Courier New" ? FontWeight.Bold : null, family == "Times New Roman" ? FontStyle.Italic : null);
            var w = Math.Max(fs * 0.62, glyph.WidthIncludingTrailingWhitespace + 12); var h = fs * 1.12;
            word.Letters.Add(new Letter { Shape = Torn(w, h, s, 3), Tear = Torn(w, h, s + 1, 3.5), Fill = fill, Glyph = glyph, W = w, H = h, X = x, Rot = (Hash(s + 3) - 0.5) * 16, Seed = s });
            x += w * 0.88;
        }
        word.Width = word.Letters.Count > 0 ? word.Letters.Max(lt => lt.X + lt.W) : 0;
        return _words[key] = word;
    }

    /// <summary>The word cut at that size, or smaller if it would not fit in <paramref name="room"/> px.</summary>
    private Word Fit(string text, double seed, double size, double room)
    {
        var word = Cut(text, seed, size);
        return word.Width <= room ? word : Cut(text, seed, Math.Floor(size * room / word.Width));
    }

    private void DrawWord(Dc dc, Word word, double x0, double cy, double step)
    {
        foreach (var lt in word.Letters)
        {
            var jx = (Hash(step * 7 + lt.Seed) - 0.5) * 2.4; var jy = (Hash(step * 11 + lt.Seed) - 0.5) * 2.4; var jr = (Hash(step * 3 + lt.Seed) - 0.5) * 1.6;
            dc.PushTransform(Tr.Translate(x0 + lt.X + jx, cy - lt.H / 2 + (Hash(lt.Seed + 9) - 0.5) * 10 + jy));
            dc.PushTransform(Tr.Rotate(lt.Rot + jr, lt.W / 2, lt.H / 2));
            dc.PushTransform(Tr.Translate(2, 2)); dc.DrawGeometry(Fibre, null, lt.Tear); dc.Pop();
            dc.DrawGeometry(B(lt.Fill), lt.Fill == Accent ? Edge : null, lt.Shape);
            dc.DrawText(lt.Glyph, new Point(lt.W / 2 - lt.Glyph.Width / 2, lt.H / 2 - lt.Glyph.Height / 2));
            dc.Pop(); dc.Pop();
        }
    }

    protected override void AccentChanged() { _words.Clear(); InvalidateBase(); }

    // ---- a frame ----------------------------------------------------------------------------------------------------------------

    private sealed class Splat { public double X, Y, T0, Seed; public Color C; public required Geometry Dots; }
    private readonly List<Splat> _splats = [];
    private readonly HashSet<Click> _sprayed = [];
    private readonly List<(Point P, double T)> _trail = [];
    private string _dataKey = "";
    private bool _grainOn = true, _trailOn = true;

    protected override void RenderLive(Dc dc, double dt)
    {
        var l = Services.Launcher.Instance;
        var game = l.Game; var pack = l.Selected;
        var players = l.Status is { Online: true, Players: { } p } ? $"{p.Online}/{p.Max}" : "";
        var key = $"{pack?.Id}|{pack?.Name}|{pack?.Mods}|{pack?.MinecraftVersion}|{pack?.Loader}|{pack?.Whitelist}|{players}";
        if (key != _dataKey) { _dataKey = key; InvalidateBase(); }
        Layout();

        // stop-motion: everything moves on eight frames a second; the whole wall shivers a pixel and leans away from the pointer
        var step = Math.Floor(T * 8);
        double J(double k) => (Hash(step * 5 + k) - 0.5) * 2;
        MoveBase(J(1) * 1.1 - (Pointer.X / Math.Max(1, W) - 0.5) * PointerAmp * 10, J(2) * 1.1 - (Pointer.Y / Math.Max(1, H) - 0.5) * PointerAmp * 6);

        // arriving: big torn sheets slapped on one after another; the wall shows only where one has landed
        var beat = Reveal * Order.Length * 1.05; var landed = (int)Math.Floor(beat);
        var arriving = Reveal < 0.97;
        if (arriving)
        {
            var clip = new GeometryGroup();
            for (var i = 0; i < Math.Min(landed, Order.Length); i++) clip.Children.Add(new RectangleGeometry(SheetRect(Order[i])));
            clip.Freeze();
            ClipBase(clip); dc.PushClip(clip);
        }
        else ClipBase(null);

        // toner grain: another photocopy of it every frame
        if (_grainOn) dc.DrawRectangle(Grain()[(int)step % 3], null, new Rect(0, 0, W, H));

        // paint sprayed where the player clicks
        foreach (var c in Clicks)
        {
            if (!_sprayed.Add(c) || T - c.T0 > 0.2) continue;
            var seed = Math.Floor(Hash(c.T0 * 3) * 1000);
            var dots = new GeometryGroup();
            for (var k = 0; k < 90; k++)
            {
                var a = Hash(seed + k) * Math.Tau; var r = Math.Pow(Hash(seed + k * 3), 2) * 46; var z = 1 + Hash(seed + k * 7) * 3;
                dots.Children.Add(CompatExt.Ellipse(new Point(c.X + Math.Cos(a) * r, c.Y + Math.Sin(a) * r), z, z));
            }
            dots.Children.Add(CompatExt.Ellipse(new Point(c.X, c.Y), 16, 16));
            dots.Freeze();
            _splats.Add(new Splat { X = c.X, Y = c.Y, T0 = T, Seed = seed, C = c.Accent || Hash(c.T0) < 0.5 ? Accent : Ink, Dots = dots });
            if (_splats.Count > 12) _splats.RemoveAt(0);
        }
        _sprayed.RemoveWhere(c => !Clicks.Contains(c));

        // the words: what is going on under the modpack, the mods in the right column
        var busy = game.Busy;
        var now = busy ? $"{(game.Mode == "java" ? "JAVA" : "BAJANDO")} {Math.Clamp(game.Percent, 0, 100)}%" : game.Running ? "EN VIVO" : "HAZ RUIDO";
        var below = _hero.Bottom + 24; var room = _dockTop - 8 - below;
        var nowWord = Fit(now, 100, Math.Min(46, room / 1.45), _hero.Width + 40);
        var nowPlaced = false;
        if (nowWord.Size >= 24) { DrawWord(dc, nowWord, _hero.Left + 8, below + nowWord.Size * 0.72, step); nowPlaced = true; }
        var tagY = _dockTop - 70;
        if (_colW >= 150 && pack != null)
        {
            var text = !nowPlaced && (busy || game.Running) ? now : pack.Mods > 0 ? $"{pack.Mods} MODS" : (pack.Loader ?? "VANILLA").ToUpperInvariant();
            var word = Fit(text, 200, 44, _colW - 16);
            var y = Math.Max((_strip?.Bottom ?? H * 0.3) + 70, H * 0.5);
            if (word.Size >= 22 && y + word.Size < tagY - 16) DrawWord(dc, word, _colX + 8, y, step);
        }
        {
            // the circled A, in marker, on the accent's field between the slogan and the flyer
            var left = _hero.Left + 300; var right = _flyer?.Left ?? _colX;
            var ax = (left + right) / 2 + J(3); var ay = Math.Max(104, _hero.Top - 78) + J(4);
            if (right - left > 130 && ay + 58 < _hero.Top - 6)
            {
                dc.DrawEllipse(null, Marker, new Point(ax, ay), 40, 40);
                var a = new StreamGeometry();
                using (var g = a.OpenW())
                {
                    g.BeginFigure(new Point(ax - 34 + J(5), ay + 52), false, false); g.LineTo(new Point(ax + J(6), ay - 58), true, true); g.LineTo(new Point(ax + 36 + J(7), ay + 52), true, true);
                    g.BeginFigure(new Point(ax - 44, ay + 8), false, false); g.LineTo(new Point(ax + 46, ay - 6), true, true);
                }
                dc.DrawGeometry(null, Marker, a);
            }
        }
        // the player's name, tagged in white marker on the black block
        if (l.Account?.DisplayName is { } name && _block.Width > 120)
        {
            var tag = Text(name, "Ink Free", 40, Colors.White, FontWeight.Bold);
            dc.PushTransform(Tr.Rotate(-7, _block.Left + 40, tagY));
            dc.DrawText(tag, new Point(_block.Left + 40 + J(8), tagY - tag.Height / 2 + J(9)));
            dc.Pop();
        }

        for (var i = _splats.Count - 1; i >= 0; i--)
        {
            var sp = _splats[i]; var age = T - sp.T0;
            if (age > 6) { _splats.RemoveAt(i); continue; }
            var paint = B(Alpha(sp.C, age > 5 ? 6 - age : 1));
            dc.DrawGeometry(paint, null, sp.Dots);
            for (var k = 0; k < 3; k++)
            {
                var dx = sp.X + (Hash(sp.Seed + k) - 0.5) * 24; var len = Math.Min(1, age / 1.6) * (30 + Hash(sp.Seed + k * 5) * 70);
                dc.DrawRectangle(paint, null, new Rect(dx - 2, sp.Y + 8, 4, len));
                dc.DrawEllipse(paint, null, new Point(dx, sp.Y + 8 + len), 3.2, 3.2);
            }
        }

        // a marker scribble behind the pointer, fading in under a second
        if (_trailOn)
        {
            if (PointerAmp > 0.3 && (_trail.Count == 0 || (Pointer - _trail[^1].P).Len() > 3)) { _trail.Add((Pointer, T)); if (_trail.Count > 40) _trail.RemoveAt(0); }
            while (_trail.Count > 0 && T - _trail[0].T > 0.9) _trail.RemoveAt(0);
            for (var i = 1; i < _trail.Count; i++)
                dc.DrawLine(P(Alpha(Ink, 1 - (T - _trail[i].T) / 0.9), 3), new Point(_trail[i - 1].P.X + J(i), _trail[i - 1].P.Y + J(i + 1)), _trail[i].P);
        }

        if (arriving)
        {
            dc.Pop();
            // the sheets themselves, landing with a slap
            var sheets = Sheets();
            for (var i = 0; i < Math.Min(landed + 1, Order.Length); i++)
            {
                var local = beat - i;
                if (local <= 0) continue;
                var k = Math.Min(1, local); var scale = 1.12 - 0.12 * k;
                var alpha = i < landed ? Math.Max(0, 1 - (beat - i - 1) * 1.5) : k;
                if (alpha <= 0.02) continue;
                var id = Order[i]; var r = SheetRect(id);
                Color[] fills = [Accent, Ink, Paper, Grey];
                dc.PushTransform(Tr.Translate(r.X + r.Width / 2, r.Y + r.Height / 2));
                dc.PushTransform(Tr.Rotate((Hash(id + 5) - 0.5) * 17));
                dc.PushTransform(Tr.Scale(scale, scale));
                dc.PushOpacity(alpha * 0.9);
                dc.PushTransform(Tr.Translate(-r.Width / 2, -r.Height / 2));
                dc.DrawGeometry(B(fills[id % 4]), null, sheets[id]);
                dc.Pop(); dc.Pop(); dc.Pop(); dc.Pop(); dc.Pop();
            }
        }
    }

    // ---- the arrival's sheets ---------------------------------------------------------------------------------------------------

    private static readonly int[] Order = [5, 0, 2, 7, 1, 6, 3, 4];
    private Geometry[]? _sheets;
    private Rect SheetRect(int i) { var cw = W / 4; var rh = H / 2; return new Rect((i % 4) * cw - 50, (i / 4) * rh - 40, cw + 110, rh + 90); }
    private Geometry[] Sheets()
    {
        if (_sheets != null) return _sheets;
        _sheets = new Geometry[Order.Length];
        for (var i = 0; i < _sheets.Length; i++) { var r = SheetRect(i); _sheets[i] = Torn(r.Width, r.Height, 400 + i * 17, 7); }
        return _sheets;
    }

    // ---- toner grain: three small photocopies of it, tiled -------------------------------------------------------------------

    private static ImageBrush[]? _grain;
    private static ImageBrush[] Grain()
    {
        if (_grain != null) return _grain;
        const int size = 256;
        _grain = new ImageBrush[3];
        var dark = Enumerable.Range(0, 6).Select(k => Frozen(Color.FromArgb((byte)(18 + k * 14), 0x14, 0x12, 0x14))).ToArray();
        var light = Frozen(Color.FromArgb(90, 255, 255, 255));
        for (var f = 0; f < 3; f++)
        {
            var seed = f;
            var bitmap = Raster.Render(size, size, g =>
            {
                for (var i = 0; i < 900; i++)
                {
                    var s = seed * 7919 + i;
                    var brush = Hash(s * 3) < 0.1 ? light : dark[(int)(Hash(s) * dark.Length)];
                    g.DrawRectangle(brush, null, new Rect(Hash(s * 5) * size, Hash(s * 7) * size, 1 + Hash(s * 11) * 1.6, 1 + Hash(s * 13) * 0.8));
                }
            });
            // a tile repeating from an offset that differs per copy, so the three never line up
            _grain[f] = new ImageBrush(bitmap) { TileMode = TileMode.Tile, Stretch = Stretch.None, DestinationRect = new RelativeRect(f * 83, f * 47, size, size, RelativeUnit.Absolute), SourceRect = new RelativeRect(0, 0, size, size, RelativeUnit.Absolute) };
        }
        return _grain;
    }

    protected override bool Thin()
    {
        if (_trailOn) { _trailOn = false; _trail.Clear(); return true; }
        if (_grainOn) { _grainOn = false; return true; }
        return false;
    }
}
