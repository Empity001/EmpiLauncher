using System.Globalization;
using System.Windows;
using System.Windows.Media;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// WORDS: blackout poetry. The background is a page of a book, set in a serif; a black marker covers almost all of it, and the few words
/// left uncovered make a short poem that is true: the modpack waiting for the player, how far a download has got, who is playing. The
/// kept words are circled in the accent's pen, dotted around with its stipple, and a pen line walks from one to the next and ends in a
/// small sun around Jugar. The interface is the ink: its panels are black, and the field lays marker ink under the title bar and under the
/// modpack's text so they read.
///
/// It moves like kinetic type: it arrives as marker strokes flooding the window line by line, the words smearing in over the ink before
/// the page develops; when the poem changes the old lines smear out and the new ones in, and the marker inks them again; now and then one
/// blacked-out line wakes up, its words bunch and spread with a smear, and the ink comes back. Under the pointer the ink turns thin and
/// the hidden words can be read; a click spreads contour lines of ink.
///
/// Cost: the page (paper, text, ink, stipple and circles) is the base, drawn again only when the page changes; a frame is the pen line,
/// the sun, and whatever is moving (a waking line, the lens, the rings).
/// </summary>
internal sealed class WordsField : StyleField
{
    public override double ArriveSeconds => 2.6;
    public override double Ease(double raw) => raw;
    protected override double AmbientMs => 100;
    protected override double InteractiveMs => 33;

    private const string Serif = "Sitka Text, Palatino Linotype, Book Antiqua, Georgia";
    private const double FS = 15, LH = 22, Top = 86, BarUp = FS * 0.34;
    private static readonly Color Ink = Color.FromRgb(0x15, 0x12, 0x0f);
    private static readonly Color PaperC = Color.FromRgb(236, 227, 207);
    private static readonly Color TextC = Color.FromRgb(43, 38, 32);
    private static readonly Color WhiteC = Color.FromRgb(244, 239, 228);
    private static readonly Color DryC = Color.FromArgb(71, 92, 84, 74);
    private static readonly Typeface Face = new(new FontFamily(Serif), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);

    // the page's own prose, written for it: long enough that a page never repeats a line
    private static readonly string[] Corpus = ("La noche llegó antes de lo previsto y nadie había terminado la casa. Alguien dejó una antorcha encendida al borde del río, por si acaso. " +
        "En el mapa quedaban lugares sin nombre, y eso era lo mejor del mapa. Los cofres guardaban cosas que ya nadie recordaba haber guardado. " +
        "El camino de grava seguía hasta perderse entre los abedules. Cada bloque tenía su lugar, aunque todavía no lo supiera. " +
        "Bajamos a la mina con tres manzanas y demasiada confianza. Arriba llovía; abajo solo se oía el agua correr entre las piedras. " +
        "Construimos un puente que no llevaba a ninguna parte, y lo cruzamos igual. Hubo un invierno entero en el que solo plantamos trigo. " +
        "Los aldeanos cerraban sus puertas cuando empezaba a oscurecer. El perro se quedó sentado junto a la cama toda la noche. " +
        "Nadie sabe quién escribió el primer cartel, pero todos lo leímos. Volver a casa siempre era más largo que salir de ella. " +
        "La brújula apuntaba a un lugar que ya no existía. Encontramos un templo en el desierto y no nos atrevimos a entrar. " +
        "El horno estuvo encendido tres días seguidos. Había un pozo en el centro del pueblo y una historia en cada ventana. " +
        "Guardamos los diamantes en un cofre y el cofre en otro cofre. La música empezaba sola, siempre en el momento justo. " +
        "Alguien dejó un mensaje en un libro y lo escondió en la biblioteca. El mar era más grande de lo que parecía desde la orilla. " +
        "Las ovejas volvían al corral sin que nadie las llamara. Después de la tormenta el cielo quedó limpio y lleno de estrellas. " +
        "Hicimos una granja de calabazas solo porque sí. En la montaña más alta pusimos una bandera que nadie iba a ver. " +
        "El tren de vagonetas daba una vuelta completa y volvía al mismo lugar. Aprendimos a no cavar hacia abajo. " +
        "Aprendimos también a no escuchar los ruidos de la cueva. Cada mañana el sol salía por el mismo lado y eso nos tranquilizaba. " +
        "Los caminos se hicieron solos, de tanto pasar por ellos. Había lugar para todos en la mesa y en el servidor. " +
        "La lava iluminaba la cueva como una tarde de verano. Esperamos juntos a que amaneciera, sin decir nada. " +
        "Cuando por fin volvimos, la casa seguía ahí.").Split(' ', StringSplitOptions.RemoveEmptyEntries);

    private static double Hash(double n) { var x = Math.Sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.Floor(x); }
    private static int HashStr(string s) { var h = 7; foreach (var c in s) h = (h * 31 + c) % 100003; return h; }
    private static double Clamp(double x) => x < 0 ? 0 : x > 1 ? 1 : x;
    private static double Smooth(double x) { x = Clamp(x); return x * x * (3 - 2 * x); }
    private static double Eo(double x) => 1 - Math.Pow(1 - Clamp(x), 3);

    /// <summary>The title in this style: every word of the modpack's name cut out of the page, a paper chip on the ink (HomeView asks for it).</summary>
    public static IEnumerable<System.Windows.Documents.Inline> KeptWords(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < words.Length; i++)
        {
            if (i > 0) yield return new System.Windows.Documents.Run(" ");
            var word = new System.Windows.Controls.TextBlock { Text = words[i], Foreground = Frozen(Ink), Margin = new Thickness(0, -4, 0, -2) };
            var chip = new System.Windows.Controls.Border { Background = Frozen(PaperC), Padding = new Thickness(6, 0, 6, 2), Margin = new Thickness(0, 3, 0, 3), Child = word };
            yield return new System.Windows.Documents.InlineUIContainer(chip) { BaselineAlignment = BaselineAlignment.Center };
        }
    }

    // ---- the page -----------------------------------------------------------------------------------------------------------------

    private sealed class PWord { public required string T; public double X, W; public bool Keep; }
    private sealed class Bar { public double A, B, Seed, H; }
    private sealed class PLine
    {
        public double Y; public bool Frag;
        public List<PWord> Words { get; } = [];
        public List<Bar> Bars { get; } = [];
        public DrawingGroup? Dark, Light;
    }
    private sealed class Frag { public required string Text; public int Line; public double X, W; public int I; }
    private sealed class Page
    {
        public required string Key; public Size Size;
        public List<PLine> Lines { get; } = [];
        public List<Frag> Frags { get; } = [];
        public DrawingGroup? Ink, Pen;
    }

    private Page? _page, _from;
    private string _sig = "", _sigSeen = "";
    private double _sigSince, _pageAt, _reflowAt = -1;
    private readonly Dictionary<string, double> _widths = [];
    private double _space;

    private double WidthOf(string s)
    {
        if (_widths.TryGetValue(s, out var w)) return w;
        if (_widths.Count > 2000) _widths.Clear();
        return _widths[s] = Shape(s, TextC).WidthIncludingTrailingWhitespace;
    }

    private FormattedText Shape(string s, Color c) =>
        new(s, CultureInfo.GetCultureInfo("es-ES"), FlowDirection.LeftToRight, Face, FS, B(c), VisualTreeHelper.GetDpi(this).PixelsPerDip);

    private static string[] PoemFor(Launcher l)
    {
        var pack = l.Selected;
        if (pack == null) return ["Todo", "empieza", "con", "una", "página", "en blanco."];
        var who = l.Account?.DisplayName ?? "tú";
        var game = l.Game;
        if (game.Running) return [who, "está jugando", $"{pack.Name}.", "Vuelve", "cuando quieras."];
        if (game.Busy)
        {
            var pct = (int)Math.Floor(Math.Clamp(game.Percent, 0, 99) / 25.0) * 25;
            return ["descargando", $"el {pct} %", "de", $"{pack.Name}.", pct < 50 ? "Ten paciencia," : "Falta poco,", "no cierres", "la ventana."];
        }
        return [pack.Name, "te espera,", $"{who}.", pack.Mods > 0 ? $"{pack.Mods} mods" : $"Minecraft {pack.MinecraftVersion}", "y un botón", "que dice", "Jugar."];
    }

    private int LineCount => Math.Max(4, (int)Math.Floor((H - 40 - Top) / LH) + 1);

    /// <summary>Filler prose flowed into justified lines, with the poem's fragments set in reading order where nothing covers them.</summary>
    private Page Compose(string[] poem, List<Rect> avoid, string key, string packName)
    {
        var page = new Page { Key = key, Size = new Size(W, H) };
        int nl = LineCount; double x0 = 44, x1 = W - 44, sp = _space;
        var free = new List<List<(double U, double V)>>();
        for (var L = 0; L < nl; L++)
        {
            var y = Top + L * LH; double top = y - LH * 0.75, bot = y + LH * 0.3;
            var spans = new List<(double U, double V)> { (x0, x1) };
            foreach (var r in avoid)
            {
                if (r.Top - 14 > bot || r.Bottom + 14 < top) continue;
                double a = r.Left - 18, b = r.Right + 18;
                spans = spans.SelectMany(s => b <= s.U || a >= s.V ? new[] { s } : new[] { (s.U, Math.Min(s.V, a)), (Math.Max(s.U, b), s.V) }.Where(p => p.Item2 - p.Item1 > 1)).ToList();
            }
            free.Add(spans);
        }
        var seed = HashStr(packName);
        var from = 1;
        for (var i = 0; i < poem.Length; i++)
        {
            var text = poem[i]; var w = WidthOf(text); var need = w + 28;
            var cands = new List<(int L, (double U, double V) S)>();
            for (var L = from; L < nl - 1; L++) { var ok = free[L].Where(s => s.V - s.U >= need).ToList(); if (ok.Count > 0) cands.Add((L, ok[(int)(Hash(seed + L) * ok.Count)])); }
            if (cands.Count == 0) continue;
            var left = poem.Length - i;
            var k = Math.Min(cands.Count - left, (int)Math.Floor(cands.Count / (left + 0.3) * (0.5 + Hash(seed + i * 5) * 0.6)));
            var (line, span) = cands[Math.Max(0, k)];
            page.Frags.Add(new Frag { Text = text, Line = line, X = span.U + 12 + Hash(seed + i * 7 + 1) * (span.V - span.U - need), W = w, I = i });
            from = line + 1 + (Hash(seed + i * 3) < 0.35 ? 1 : 0);
        }

        var next = seed % Corpus.Length;
        var paraLeft = 3 + (int)(Hash(seed + 91) * 5); double indent = 0;
        for (var L = 0; L < nl; L++)
        {
            var ln = new PLine { Y = Top + L * LH };
            var f = page.Frags.FirstOrDefault(p => p.Line == L);
            var last = f == null && paraLeft <= 0;
            var line = L;
            void Fill(double a, double b, bool justify)
            {
                var seg = new List<string>(); double used = 0;
                while (true)
                {
                    var t = Corpus[next % Corpus.Length]; var tw = WidthOf(t);
                    if (used + (seg.Count > 0 ? sp : 0) + tw > b - a) break;
                    used += (seg.Count > 0 ? sp : 0) + tw; seg.Add(t); next++;
                }
                if (seg.Count == 0) return;
                var gap = justify && seg.Count > 1 ? (b - a - seg.Sum(WidthOf)) / (seg.Count - 1) : sp;
                var x = a; var start = ln.Words.Count;
                foreach (var t in seg) { ln.Words.Add(new PWord { T = t, X = x, W = WidthOf(t) }); x += WidthOf(t) + gap; }
                // one bar over the run, now and then lifted between two words so a sliver of paper shows
                var run = ln.Words.Skip(start).ToList(); var s0 = seed + line * 17 + start;
                var cut = run.Count > 5 && Hash(s0) < 0.3 ? 1 + (int)(Hash(s0 + 1) * (run.Count - 2)) : 0;
                var parts = cut > 0 ? new[] { run.Take(cut).ToList(), run.Skip(cut).ToList() } : new[] { run };
                foreach (var part in parts)
                {
                    var j = ln.Bars.Count;
                    // marker strokes are not all the same width: some are thin, some fat enough to run into the next line and make a block
                    ln.Bars.Add(new Bar { A = part[0].X - 3, B = part[^1].X + part[^1].W + 3, Seed = line * 13 + j * 7 + seed, H = 14 + Math.Pow(Hash(seed + line * 29 + j), 1.6) * 11 });
                }
            }
            var a0 = x0 + indent;
            if (f != null) { Fill(a0, f.X - sp, true); ln.Words.Add(new PWord { T = f.Text, X = f.X, W = f.W, Keep = true }); ln.Frag = true; Fill(f.X + f.W + sp, x1, true); }
            else if (last) Fill(a0, a0 + (x1 - a0) * (0.25 + Hash(seed + L * 3) * 0.55), false);
            else Fill(a0, x1, true);
            // paragraphs: a short last line, then an indent, so the blacked-out page gets a real shape
            indent = last ? 26 : 0;
            if (last) paraLeft = 3 + (int)(Hash(seed + L * 7) * 6); else paraLeft--;
            page.Lines.Add(ln);
        }
        return page;
    }

    // ---- drawings of it, made once per page ---------------------------------------------------------------------------------------

    private DrawingGroup Words(PLine ln, bool light)
    {
        var made = light ? ln.Light : ln.Dark;
        if (made != null) return made;
        made = new DrawingGroup();
        using (var g = made.Open())
            foreach (var w in ln.Words) { var t = Shape(w.T, light ? WhiteC : TextC); g.DrawText(t, new Point(w.X, ln.Y - t.Baseline)); }
        made.Freeze();
        return light ? ln.Light = made : ln.Dark = made;
    }

    /// <summary>A stroke of felt-tip marker from a to b (drawn as far as <paramref name="reach"/>), with two dry streaks in it.</summary>
    private void Marker(DrawingContext g, double a, double b, double y, double reach, double seed, double h, double alpha = 1)
    {
        var e = a + (b - a) * reach;
        if (e - a < 1.5 || alpha <= 0.01) return;
        var yc = y - BarUp; var j = (Hash(seed) - 0.5) * 1.4;
        g.DrawRoundedRectangle(B(Alpha(Ink, alpha)), null, new Rect(a, yc - h / 2 + j, e - a, h), Math.Min(4, h / 2), Math.Min(4, h / 2));
        var dry = P(Alpha(DryC, DryC.A / 255.0 * alpha), 0.7);
        for (var s = 0; s < 2; s++)
        {
            var yy = yc - h * 0.28 + h * 0.56 * Hash(seed + 9 + s); var xa = a + (e - a) * Hash(seed + 11 + s) * 0.5;
            g.DrawLine(dry, new Point(xa, yy), new Point(Math.Min(e - 2, xa + (e - a) * (0.25 + 0.45 * Hash(seed + 13 + s))), yy + 0.3));
        }
    }

    private DrawingGroup PageInk(Page page)
    {
        if (page.Ink != null) return page.Ink;
        var ink = new DrawingGroup();
        using (var g = ink.Open()) foreach (var ln in page.Lines) foreach (var bar in ln.Bars) Marker(g, bar.A, bar.B, ln.Y, 1, bar.Seed, bar.H);
        ink.Freeze();
        return page.Ink = ink;
    }

    /// <summary>The accent's pen on the page: a stipple gathered around each kept word and a quick loop around it, never quite closed.</summary>
    private DrawingGroup PagePen(Page page)
    {
        if (page.Pen != null) return page.Pen;
        var pen = new DrawingGroup();
        using (var g = pen.Open())
        {
            var dots = new StreamGeometry();
            using (var s = dots.Open())
                for (var i = 0; i < page.Frags.Count; i++)
                {
                    var f = page.Frags[i]; double cx = f.X + f.W / 2, cy = Top + f.Line * LH - BarUp;
                    for (var n = 0; n < 220; n++)
                    {
                        var a = Hash(i * 1000 + n) * Math.Tau; var r = f.W * 0.35 + 14 + Math.Pow(Hash(i * 1000 + n * 3 + 1), 1.8) * (70 + f.W * 0.4);
                        double x = cx + Math.Cos(a) * r * 1.3, y = cy + Math.Sin(a) * r * 0.62, d = 0.6 + Hash(n * 7 + i) * 1.2;
                        s.BeginFigure(new Point(x - d, y), true, true);
                        s.ArcTo(new Point(x + d, y), new Size(d, d), 0, false, SweepDirection.Clockwise, false, false);
                        s.ArcTo(new Point(x - d, y), new Size(d, d), 0, false, SweepDirection.Clockwise, false, false);
                    }
                }
            dots.Freeze();
            g.DrawGeometry(B(Alpha(Accent, 0.6)), null, dots);
            var loopPen = new Pen(B(Accent), 1.5) { LineJoin = PenLineJoin.Round, StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            foreach (var f in page.Frags)
            {
                double cx = f.X + f.W / 2, cy = Top + f.Line * LH - BarUp, rx = f.W / 2 + 9, ry = 13;
                var loop = new StreamGeometry();
                using (var s = loop.Open())
                    for (var q = 0; q <= 60; q++)
                    {
                        var a = -2.2 + q / 60.0 * Math.Tau * 1.12; var wob = 1 + 0.06 * Math.Sin(a * 3 + f.I) + q / 60.0 * 0.08;
                        var p = new Point(cx + Math.Cos(a) * rx * wob, cy + Math.Sin(a) * ry * wob + Math.Sin(a * 2 + f.I) * 1.2);
                        if (q == 0) s.BeginFigure(p, false, false); else s.LineTo(p, true, true);
                    }
                g.DrawGeometry(null, loopPen, loop);
            }
        }
        pen.Freeze();
        return page.Pen = pen;
    }

    private DrawingGroup? _paper;
    private Size _paperFor;

    /// <summary>Old paper: foxing and the brown of old edges, and the fibres of the sheet.</summary>
    private DrawingGroup Paper()
    {
        if (_paper != null && _paperFor == new Size(W, H)) return _paper;
        var paper = new DrawingGroup();
        using (var g = paper.Open())
        {
            g.DrawRectangle(Frozen(PaperC), null, new Rect(-10, -10, W + 20, H + 20));
            for (var i = 0; i < 26; i++)
            {
                double x = Hash(i * 3.1) * W, y = Hash(i * 7.7) * H, r = 30 + Hash(i * 1.3) * 140;
                var spot = new RadialGradientBrush(Color.FromArgb((byte)((0.05 + Hash(i) * 0.07) * 255), 176, 140, 86), Color.FromArgb(0, 176, 140, 86)); spot.Freeze();
                g.DrawEllipse(spot, null, new Point(x, y), r, r);
            }
            var edge = new RadialGradientBrush { Center = new Point(0.5, 0.5), GradientOrigin = new Point(0.5, 0.5), RadiusX = 0.75, RadiusY = 0.75 };
            edge.GradientStops.Add(new GradientStop(Color.FromArgb(0, 120, 90, 50), 0.5));
            edge.GradientStops.Add(new GradientStop(Color.FromArgb(77, 120, 90, 50), 1));
            edge.Freeze();
            g.DrawRectangle(edge, null, new Rect(-10, -10, W + 20, H + 20));
            foreach (var (tint, pick) in new[] { (Color.FromArgb(20, 90, 70, 40), 0), (Color.FromArgb(20, 255, 255, 245), 1) })
            {
                var fibres = new StreamGeometry();
                using (var s = fibres.Open())
                    for (var i = 0; i < 900; i++)
                    {
                        if ((Hash(i) < 0.5 ? 0 : 1) != pick) continue;
                        var x = Hash(i * 5.3) * W; var y = Hash(i * 9.1) * H; var w = 1 + Hash(i * 2) * 5;
                        s.BeginFigure(new Point(x, y), true, true); s.PolyLineTo([new Point(x + w, y), new Point(x + w, y + 0.7), new Point(x, y + 0.7)], false, false);
                    }
                fibres.Freeze();
                g.DrawGeometry(Frozen(tint), null, fibres);
            }
        }
        paper.Freeze();
        _paperFor = new Size(W, H);
        return _paper = paper;
    }

    // ---- where the interface is ---------------------------------------------------------------------------------------------------

    /// <summary>The ink the interface sits on: a band under the title bar and a block under the text (the modpack, a header).</summary>
    private List<Rect> Backing()
    {
        var list = new List<Rect> { new(-20, -10, W + 40, 64) };
        var text = Quiet.Where(r => r.Width > 4 && r.Height > 4).ToList();
        if (text.Count > 0)
            list.Add(new Rect(new Point(text.Min(r => r.Left) - 26, text.Min(r => r.Top) - 22), new Point(text.Max(r => r.Right) + 26, text.Max(r => r.Bottom) + 22)));
        return list;
    }

    private List<Rect> Covers()
    {
        var list = new List<Rect>();
        foreach (var el in LivingField.Covers)
        {
            if (!el.IsVisible || el.ActualWidth <= 0) continue;
            try { list.Add(el.TransformToVisual(this).TransformBounds(new Rect(0, 0, el.ActualWidth, el.ActualHeight))); } catch (InvalidOperationException) { }
        }
        return list;
    }

    private void DrawBacking(DrawingContext g, List<Rect> backing)
    {
        foreach (var r in backing) g.DrawRoundedRectangle(B(Ink), null, r, 3, 3);
    }

    // ---- base: the page as it stands -----------------------------------------------------------------------------------------------

    protected override void Resized() { _page = null; _from = null; _reflowAt = -1; }
    protected override void AccentChanged() { if (_page != null) _page.Pen = null; if (_from != null) _from.Pen = null; InvalidateBase(); }

    protected override void RenderBase(DrawingContext dc)
    {
        dc.DrawDrawing(Paper());
        if (_page != null)
        {
            foreach (var ln in _page.Lines) dc.DrawDrawing(Words(ln, light: false));
            dc.DrawDrawing(PageInk(_page));
            dc.DrawDrawing(PagePen(_page));
        }
        DrawBacking(dc, Backing());
    }

    // ---- a frame -------------------------------------------------------------------------------------------------------------------

    private int _wakeLine = -1;
    private double _wakeAt, _nextWake = 6;
    private bool _lensOn = true, _wakeOn = true;

    protected override void Render(DrawingContext dc, double dt)
    {
        var l = Launcher.Instance;
        if (_space == 0) _space = Shape(" ", TextC).WidthIncludingTrailingWhitespace * 1.05;
        var backing = Backing();
        var avoid = backing.Concat(Covers()).ToList();
        var sig = string.Join('|', avoid.Select(r => $"{Math.Round(r.Left / 8)},{Math.Round(r.Top / 8)},{Math.Round(r.Right / 8)},{Math.Round(r.Bottom / 8)}"));
        var poem = PoemFor(l);
        var key = string.Join('|', poem) + "#" + (l.Selected?.Name ?? "");
        if (sig != _sigSeen) { _sigSeen = sig; _sigSince = T; }

        // what the page must say, and where the interface leaves room for it: written again when either changes (and has settled)
        if (_page == null || _page.Size != new Size(W, H))
        {
            _page = Compose(poem, avoid, key, l.Selected?.Name ?? ""); _sig = sig; _pageAt = T; InvalidateBase();
        }
        else if ((key != _page.Key || sig != _sig) && _reflowAt < 0 && (!Running || T - _sigSince > 0.6))
        {
            var fresh = Compose(poem, avoid, key, l.Selected?.Name ?? "");
            if (Running && Reveal >= 1 && T - _pageAt > 2.5) { _from = _page; _reflowAt = T; _wakeLine = -1; }
            _page = fresh; _sig = sig; _pageAt = T; InvalidateBase();
        }

        if (Reveal < 1) { Arrival(dc, Reveal, backing); Rings(dc); return; }
        if (_reflowAt >= 0)
        {
            var u = T - _reflowAt;
            if (u > 2.15) { _reflowAt = -1; _from = null; FadeBase(1); }
            else { FadeBase(0); Reflow(dc, u, backing); Rings(dc); return; }
        }
        FadeBase(1);

        // now and then a line wakes up and shows the words under its ink
        if (_wakeOn && Running)
        {
            if (_wakeLine < 0 && T > _nextWake)
            {
                var open = _page.Lines.Select((ln, i) => (ln, i)).Where(p => !p.ln.Frag && p.ln.Words.Count > 3 && p.ln.Bars.Count == 1
                    && !backing.Any(r => p.ln.Y > r.Top - 10 && p.ln.Y - LH < r.Bottom + 10)).ToList();
                if (open.Count > 0) { _wakeLine = open[(int)(Hash(T) * open.Count)].i; _wakeAt = T; }
                _nextWake = T + 5 + Hash(T * 3) * 5;
            }
            if (_wakeLine >= 0) { var u = T - _wakeAt; if (u > 1.7 || _wakeLine >= _page.Lines.Count) _wakeLine = -1; else Wake(dc, _page.Lines[_wakeLine], u); }
        }
        if (_lensOn) Lens(dc, backing);
        PenLine(dc, _page, 1);
        Rings(dc);
    }

    // ---- the moving parts -----------------------------------------------------------------------------------------------------------

    private static double LineP(int line, int lines, double u, double start, double dur, double spread) => Clamp((u - start - (double)line / lines * spread) / dur);

    /// <summary>Arriving: marker strokes flood the window line by line; white words smear in over the ink; the page develops under them.</summary>
    private void Arrival(DrawingContext dc, double p, List<Rect> backing)
    {
        var page = _page!; var n = page.Lines.Count;
        var dev = Smooth((p - 0.64) / 0.36); var back = Clamp(p / 0.3);
        FadeBase(dev);
        dc.DrawRectangle(B(Alpha(Ink, back * (1 - dev))), null, new Rect(-10, -10, W + 20, H + 20));
        for (var L = 0; L < n; L++)
        {
            var ln = page.Lines[L];
            if (dev < 1) Marker(dc, -4, W + 4, ln.Y, Eo(LineP(L, n, p, 0, 0.16, 0.16)), L * 13 + 5, LH + 2, 1 - dev);
            var slide = LineP(L, n, p, 0.26, 0.24, 0.22); var dx = (1 - Eo(slide)) * 220; var alpha = Math.Min(Eo(slide), 1 - dev * 0.999);
            if (alpha <= 0.01) continue;
            var smear = 9 * (1 - slide);
            for (var e = 2; e >= 0; e--)
            {
                if (e > 0 && smear < 0.5) continue;
                var a = alpha * (e > 0 ? 0.4 / e : 1);
                dc.PushTransform(new TranslateTransform(dx + e * smear, 0));
                if (1 - dev > 0.01) { dc.PushOpacity(a * (1 - dev)); dc.DrawDrawing(Words(ln, light: true)); dc.Pop(); }
                if (dev > 0.01) { dc.PushOpacity(a * dev); dc.DrawDrawing(Words(ln, light: false)); dc.Pop(); }
                dc.Pop();
            }
        }
        DrawBacking(dc, backing);   // the interface keeps its ink the whole time
    }

    /// <summary>The poem changed: the ink lifts, the old lines smear out to the left while the new ones smear in, the marker inks them again.</summary>
    private void Reflow(DrawingContext dc, double u, List<Rect> backing)
    {
        dc.DrawDrawing(Paper());
        var a = _from!; var b = _page!; var n = Math.Max(a.Lines.Count, b.Lines.Count);
        for (var L = 0; L < n; L++)
        {
            double lift = Eo(LineP(L, n, u, 0, 0.28, 0.14)), swap = LineP(L, n, u, 0.3, 0.55, 0.5), ink = Eo(LineP(L, n, u, 1.2, 0.3, 0.55));
            if (L < a.Lines.Count && swap < 1)
            {
                var la = a.Lines[L];
                Slide(dc, la, -Eo(swap) * 190, 1 - swap, swap > 0 ? -9 : 0);
                foreach (var bar in la.Bars) Marker(dc, bar.A + (bar.B - bar.A) * lift, bar.B, la.Y, 1, bar.Seed, bar.H);
            }
            if (L < b.Lines.Count && swap > 0)
            {
                var lb = b.Lines[L];
                Slide(dc, lb, (1 - Eo(swap)) * 190, Eo(swap), swap < 1 ? 9 : 0);
                foreach (var bar in lb.Bars) Marker(dc, bar.A, bar.B, lb.Y, ink, bar.Seed, bar.H);
            }
        }
        var pen = u < 0.3 ? 1 - u / 0.3 : Smooth((u - 1.7) / 0.45);
        if (pen > 0.01) { dc.PushOpacity(pen); dc.DrawDrawing(PagePen(u < 0.3 ? a : b)); dc.Pop(); PenLine(dc, u < 0.3 ? a : b, pen); }
        DrawBacking(dc, backing);
    }

    private void Slide(DrawingContext dc, PLine ln, double dx, double alpha, double smear)
    {
        if (alpha <= 0.01) return;
        for (var e = 2; e >= 0; e--)
        {
            if (e > 0 && Math.Abs(smear) < 0.5) continue;
            dc.PushTransform(new TranslateTransform(dx + e * smear, 0));
            dc.PushOpacity(alpha * (e > 0 ? 0.4 / e : 1));
            dc.DrawDrawing(Words(ln, light: false));
            dc.Pop(); dc.Pop();
        }
    }

    /// <summary>One blacked-out line wakes up: its ink lifts, its words bunch up and spread out again with a smear, and the marker covers it again.</summary>
    private void Wake(DrawingContext dc, PLine ln, double u)
    {
        var strip = new Rect(-10, ln.Y - LH * 0.78, W + 20, LH + 2);
        dc.PushClip(new RectangleGeometry(strip)); dc.DrawDrawing(Paper()); dc.Pop();
        double lift = Eo(u / 0.35), ink = Eo((u - 1.35) / 0.35);
        var phase = Clamp((u - 0.35) / 1.0); var squeeze = Math.Sin(phase * Math.PI);
        var moving = squeeze > 0.05 && squeeze < 0.97;
        for (var e = 3; e >= 0; e--)
        {
            if (e > 0 && !moving) continue;
            double px = 44;
            foreach (var w in ln.Words)
            {
                var x = w.X + (px - w.X) * squeeze + (e > 0 ? e * 7 * Math.Sign(Math.Cos(phase * Math.PI)) : 0);
                var t = Text(w.T, Serif, FS, TextC);
                dc.PushOpacity(e > 0 ? 0.3 / e : 1);
                dc.DrawText(t, new Point(x, ln.Y - t.Baseline));
                dc.Pop();
                px += w.W + _space * 0.6;
            }
        }
        foreach (var bar in ln.Bars)
            if (u < 1.35) Marker(dc, bar.A + (bar.B - bar.A) * lift, bar.B, ln.Y, 1, bar.Seed, bar.H);
            else Marker(dc, bar.A, bar.B, ln.Y, ink, bar.Seed, bar.H);
    }

    /// <summary>Under the pointer the ink turns thin and the words it hides can be read.</summary>
    private void Lens(DrawingContext dc, List<Rect> backing)
    {
        var amp = PointerAmp;
        if (amp < 0.03 || _page == null) return;
        const double R = 90;
        Geometry clip = new EllipseGeometry(Pointer, R, R);
        foreach (var r in backing) clip = Geometry.Combine(clip, new RectangleGeometry(r), GeometryCombineMode.Exclude, null);
        var fade = new RadialGradientBrush { Center = new Point(0.5, 0.5), GradientOrigin = new Point(0.5, 0.5), MappingMode = BrushMappingMode.RelativeToBoundingBox };
        fade.GradientStops.Add(new GradientStop(Color.FromArgb(199, 0, 0, 0), 0));
        fade.GradientStops.Add(new GradientStop(Color.FromArgb(115, 0, 0, 0), 0.6));
        fade.GradientStops.Add(new GradientStop(Color.FromArgb(0, 0, 0, 0), 1));
        dc.PushClip(clip);
        dc.PushOpacity(amp);
        dc.PushOpacityMask(fade);
        dc.DrawRectangle(B(PaperC), null, new Rect(Pointer.X - R, Pointer.Y - R, R * 2, R * 2));
        foreach (var ln in _page.Lines)
        {
            if (Math.Abs(ln.Y - Pointer.Y) > R + LH) continue;
            foreach (var w in ln.Words)
            {
                if (w.X + w.W < Pointer.X - R || w.X > Pointer.X + R) continue;
                var t = Text(w.T, Serif, FS, TextC);
                dc.DrawText(t, new Point(w.X, ln.Y - t.Baseline));
            }
        }
        dc.Pop(); dc.Pop(); dc.Pop();
    }

    /// <summary>The pen line from kept word to kept word and on to Jugar, and the little sun around Jugar while it is the thing to do.</summary>
    private void PenLine(DrawingContext dc, Page page, double alpha)
    {
        var pen = P(Alpha(Accent, alpha), 2.2);
        var pts = new List<Point>();
        foreach (var f in page.Frags) { var y = Top + f.Line * LH - BarUp; pts.Add(new Point(f.X - 8, y)); pts.Add(new Point(f.X + f.W + 8, y)); }
        if (Next is { } n && pts.Count > 0) pts.Add(new Point(n.X + n.Width * 0.5, n.Y - 6));
        if (pts.Count > 2)
        {
            var line = new StreamGeometry();
            using (var g = line.Open())
                for (var i = 2; i < pts.Count; i += 2)
                {
                    Point a = pts[i - 1], b = pts[i];
                    var my = (a.Y + b.Y) / 2 + 18 * Math.Sin(i + T * 0.6);
                    g.BeginFigure(a, false, false);
                    g.BezierTo(new Point(a.X + 50, a.Y + (b.Y - a.Y) * 0.15), new Point(b.X - 50, my), b, true, true);
                }
            dc.DrawGeometry(null, pen, line);
        }
        if (Next is { } next && NextAmp > 0.01)
        {
            double cx = next.X + next.Width / 2, cy = next.Y + next.Height / 2;
            var ray = P(Alpha(Accent, alpha), 2);
            for (var i = 0; i < 16; i++)
            {
                var a = i / 16.0 * Math.Tau + 0.1; var reach = (i % 2 == 1 ? 16 : 30) * (0.7 + 0.3 * Math.Sin(T * 2.4 - i)) * NextAmp;
                double ex = cx + Math.Cos(a) * (next.Width / 2 + 6), ey = cy + Math.Sin(a) * (next.Height / 2 + 6);
                dc.DrawLine(ray, new Point(ex, ey), new Point(ex + Math.Cos(a) * reach, ey + Math.Sin(a) * reach * 0.8));
            }
        }
    }

    /// <summary>A click: contour lines of ink spreading around it, like the loops drawn around a word.</summary>
    private void Rings(DrawingContext dc)
    {
        const double life = 2.4;
        foreach (var c in Clicks)
        {
            var age = T - c.T0;
            if (age > life) continue;
            var k = Eo(age / life);
            var pen = P(Alpha(Accent, (1 - age / life) * 0.8 * c.Weight), 1.1);
            for (var i = 0; i < 7; i++)
            {
                var r0 = (10 + i * 9) * (0.4 + k * 2.6);
                var ring = new StreamGeometry();
                using (var g = ring.Open())
                    for (var q = 0; q <= 48; q++)
                    {
                        var a = q / 48.0 * Math.Tau; var r = r0 * (1 + 0.09 * Math.Sin(3 * a + i + c.T0) + 0.05 * Math.Sin(5 * a - i * 2 + age));
                        var p = new Point(c.X + Math.Cos(a) * r * 1.25, c.Y + Math.Sin(a) * r * 0.8);
                        if (q == 0) g.BeginFigure(p, false, true); else g.LineTo(p, true, true);
                    }
                dc.DrawGeometry(null, pen, ring);
            }
        }
    }

    protected override bool Thin()
    {
        if (_lensOn) { _lensOn = false; return true; }
        if (_wakeOn) { _wakeOn = false; _wakeLine = -1; return true; }
        return false;
    }
}
