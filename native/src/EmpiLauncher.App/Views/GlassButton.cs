using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using EmpiLauncher.App.Themes;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The Play button of a modpack that has been retired, as broken glass: a hole in the middle with the word RETIRADO inside, the rest of the
/// button in fragments that stayed a little out of place, and light seams between them. Drawn in code (the geometry is generated once,
/// the same on every start) because there are ~100 pieces.
///
///   ShowBroken()      the state itself, static
///   PlayBreak()       the word falls onto the button, which breaks (the first time the retired state is seen)
///   PlayRegenerate()  the glass grows back from itself: two crystals, one at each end, start; each one grows inside its own outline with a
///                     glowing front and a white mesh, and starts the next when its front touches the edge they share. No piece goes back.
///
/// The pieces are the same in all three; only their state changes. Nothing here runs unless the state is on screen.
/// </summary>
internal sealed class GlassButton : Grid
{
    private const double SourceW = 380, SourceH = 72;   // the geometry is designed on this size and scaled to the button's
    private readonly double _w, _h, _sx, _sy;
    private readonly Color _accent, _dim, _ink;
    private readonly Canvas _stage = new();
    private readonly List<Piece> _pieces = [];
    private readonly List<Line> _cracks = [];
    private readonly Path _backing = new() { Fill = new SolidColorBrush(Color.FromRgb(5, 5, 6)) };
    private readonly Rectangle _intact;
    private readonly Border _slab;
    private readonly TranslateTransform _slabShift = new();
    private readonly RotateTransform _slabTurn = new();
    private readonly TextBlock _redWord, _cyanWord;
    private readonly ScaleTransform _squash = new();
    private readonly Canvas _overlay = new() { IsHitTestVisible = false };
    private static readonly Color Cream = Color.FromRgb(0xf1, 0xef, 0xe8);
    private int _generation;
    private readonly Random _random = new(23);

    private sealed class Piece
    {
        public Path Shape = null!;
        public SolidColorBrush Fill = null!, Seam = null!;
        public TranslateTransform Move = null!;
        public RotateTransform Turn = null!;
        public PathGeometry Geometry = null!;
        public List<Point> Points = [];
        public List<Point> Range = [];
        public Point Center;
        public double Distance;
        public bool Fell, IsCenter;
        public int Level;
        public Vector Displacement, Fall;
        public double DisplacementTurn, FallTurn;
        public List<(int To, Point Edge)> Neighbours = [];
    }

    public GlassButton(double width, double height, Color accent)
    {
        _w = width; _h = height; _sx = width / SourceW; _sy = height / SourceH;
        _accent = accent;
        _dim = Mix(accent, Color.FromRgb(0x3a, 0x3a, 0x3e), 0.62);
        _ink = Color.FromRgb(0x0b, 0x0b, 0x0c);
        Width = width; Height = height; IsHitTestVisible = false;
        RenderTransformOrigin = new Point(0.5, 0.5);
        RenderTransform = _squash;
        SnapsToDevicePixels = false;

        _intact = new Rectangle { Width = width, Height = height, RadiusX = height / 2, RadiusY = height / 2, Fill = new SolidColorBrush(accent), Opacity = 0 };
        Build();

        _stage.Width = width; _stage.Height = height;
        _stage.Children.Add(_backing);
        _stage.Children.Add(_intact);
        // free pieces first so the ones that stay draw over them, then the seams that cross everything
        foreach (var piece in _pieces) _stage.Children.Add(piece.Shape);
        foreach (var crack in _cracks) _stage.Children.Add(crack);
        _stage.Children.Add(_overlay);
        Children.Add(_stage);

        // the word: three copies, the two behind offset a little, like the glitch the launcher uses everywhere
        TextBlock Word(Brush brush, double dx) => new()
        {
            Text = "RETIRADO", FontFamily = (FontFamily)Application.Current.FindResource("DisplayFont"), FontWeight = FontWeights.Bold, FontSize = 20 * Math.Min(1, height / 52),
            Foreground = brush, RenderTransform = new TranslateTransform(dx, 0), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center
        };
        _redWord = Word(new SolidColorBrush(Color.FromRgb(0xff, 0x5a, 0x4d)), -2);
        _cyanWord = Word(new SolidColorBrush(Color.FromRgb(0x5a, 0xd2, 0xff)), 2);
        var paper = Word(new SolidColorBrush(Cream), 0);
        var words = new Grid { Children = { _redWord, _cyanWord, paper } };
        _slab = new Border
        {
            BorderThickness = new Thickness(3), BorderBrush = Brushes.Transparent, Background = Brushes.Transparent, Padding = new Thickness(26, 4, 26, 4),
            HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Child = words,
            RenderTransformOrigin = new Point(0.5, 0.5), RenderTransform = new TransformGroup { Children = { _slabTurn, _slabShift } }
        };
        System.Windows.Automation.AutomationProperties.SetName(this, "Retirado");
        Children.Add(_slab);
        ShowBroken();
    }

    // ---- geometry -----------------------------------------------------------------------------------------------------

    private static readonly (double X, double Y)[] Hole =
    [
        (74, 42), (96, 20), (132, 28), (170, 10), (214, 20), (252, 8), (296, 26), (312, 40), (290, 58), (248, 64), (214, 52), (176, 64), (132, 56), (100, 62)
    ];

    private Point S(double x, double y) => new(x * _sx, y * _sy);
    private static Point Lerp(Point a, Point b, double t) => new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
    private static Point Mid(Point a, Point b) => new((a.X + b.X) / 2, (a.Y + b.Y) / 2);
    private static Color Mix(Color a, Color b, double t) => Color.FromRgb((byte)(a.R * (1 - t) + b.R * t), (byte)(a.G * (1 - t) + b.G * t), (byte)(a.B * (1 - t) + b.B * t));
    private double Rand() => _random.NextDouble();

    private static PathGeometry Poly(IReadOnlyList<Point> pts)
    {
        var figure = new PathFigure { StartPoint = pts[0], IsClosed = true, IsFilled = true };
        for (var i = 1; i < pts.Count; i++) figure.Segments.Add(new LineSegment(pts[i], true));
        return new PathGeometry([figure]);
    }

    private void Build()
    {
        var center = S(190, 36);
        var hole = Hole.Select(p => S(p.X, p.Y)).ToList();
        var n = hole.Count;
        _backing.Data = Poly(hole);

        // the rim of the hole, with a point between each two (so 2n rays), then rings at growing distances
        var rim = new List<Point>();
        for (var i = 0; i < n; i++)
        {
            var j = (i + 1) % n;
            rim.Add(hole[i]);
            var m = Mid(hole[i], hole[j]);
            rim.Add(new Point(m.X + (Rand() - .5) * 6 * _sx, m.Y + (Rand() - .5) * 6 * _sy));
        }
        var count = rim.Count;
        var rings = new List<List<Point>> { rim };
        foreach (var (lo, hi) in new[] { (1.3, 1.75), (2.0, 2.9), (6.0, 6.0) })
            rings.Add(rim.Select(p => { var k = lo + Rand() * (hi - lo); return new Point(center.X + (p.X - center.X) * k, center.Y + (p.Y - center.Y) * k); }).ToList());

        var button = new RectangleGeometry(new Rect(0, 0, _w, _h), _h / 2, _h / 2);
        Piece? Make(List<Point> points, List<Point> visible, int level, bool isCenter, List<Point> range)
        {
            var geometry = Geometry.Combine(Poly(points), button, GeometryCombineMode.Intersect, null);
            if (geometry.IsEmpty()) return null;
            var cx = visible.Average(p => p.X); var cy = visible.Average(p => p.Y);
            var v = new Vector(cx - center.X, cy - center.Y);
            var d = Math.Max(1, v.Length);
            var u = new Vector(v.X / d, v.Y / d);
            var piece = new Piece
            {
                Geometry = geometry, Points = points, Range = range, Center = new Point(cx, cy), Distance = d / _sx, IsCenter = isCenter, Level = level,
                Fell = isCenter || (level == 0 && Rand() < .4) || (level == 1 && Rand() < .13)
            };
            var mag = new[] { 5.0, 3.2, 1.9 }[level] + Rand() * 2.4;
            piece.Displacement = new Vector(u.X * mag * _sx, u.Y * mag * _sy);
            piece.DisplacementTurn = (Rand() - .5) * new[] { 14.0, 9.0, 5.0 }[level];
            piece.Fall = new Vector((u.X * 30 + (Rand() - .5) * 30) * _sx, (70 + Rand() * 50) * _sy);
            piece.FallTurn = (Rand() - .5) * 200;
            piece.Fill = new SolidColorBrush(_dim);
            piece.Seam = new SolidColorBrush(Color.FromRgb(0xe6, 0xe4, 0xdc)) { Opacity = .6 };
            piece.Move = new TranslateTransform();
            piece.Turn = new RotateTransform(0, cx, cy);
            piece.Shape = new Path
            {
                Data = geometry, Fill = piece.Fill, Stroke = piece.Seam, StrokeThickness = 1.2, StrokeLineJoin = PenLineJoin.Round,
                RenderTransform = new TransformGroup { Children = { piece.Turn, piece.Move } }, IsHitTestVisible = false
            };
            return piece;
        }

        var index = new Dictionary<(int, int), int>();
        for (var level = 0; level < 3; level++)
            for (var k = 0; k < count; k++)
            {
                var k2 = (k + 1) % count;
                var poly = new List<Point> { rings[level][k], rings[level][k2], rings[level + 1][k2], rings[level + 1][k] };
                var visible = new List<Point>(poly);
                if (level == 2) { visible[2] = Lerp(poly[1], poly[2], .18); visible[3] = Lerp(poly[0], poly[3], .18); }
                var range = level == 2 ? new List<Point> { poly[0], poly[1], Lerp(poly[1], poly[2], .5), Lerp(poly[0], poly[3], .5) } : poly;
                var piece = Make(poly, visible, level, false, range);
                index[(level, k)] = piece == null ? -1 : AddPiece(piece);
            }
        var centerIndex = new int[n];
        for (var i = 0; i < n; i++)
        {
            var j = (i + 1) % n;
            var tri = new List<Point> { center, hole[i], hole[j] };
            var piece = Make(tri, tri, 0, true, tri);
            centerIndex[i] = piece == null ? -1 : AddPiece(piece);
        }

        // who touches whom, and where they touch (the middle of the shared edge): the order the glass grows back in
        void Link(int a, int b, Point edge) { if (a < 0 || b < 0) return; _pieces[a].Neighbours.Add((b, edge)); _pieces[b].Neighbours.Add((a, edge)); }
        int At(int level, int k) => index[(level, ((k % count) + count) % count)];
        for (var level = 0; level < 3; level++)
            for (var k = 0; k < count; k++)
            {
                var k2 = (k + 1) % count;
                var far = level == 2 ? Lerp(rings[2][k2], rings[3][k2], .3) : rings[level + 1][k2];
                Link(At(level, k), At(level, k2), Mid(rings[level][k2], far));
                if (level < 2) Link(At(level, k), At(level + 1, k), Mid(rings[level + 1][k], rings[level + 1][k2]));
            }
        for (var j = 0; j < n; j++)
        {
            Link(centerIndex[j], centerIndex[(j + 1) % n], Mid(center, hole[(j + 1) % n]));
            Link(centerIndex[j], At(0, 2 * j), Mid(rim[2 * j], rim[2 * j + 1]));
            Link(centerIndex[j], At(0, 2 * j + 1), Mid(rim[2 * j + 1], rim[(2 * j + 2) % count]));
        }

        // long cracks across the whole button
        for (var i = 0; i < 10; i++)
        {
            var angle = i / 10.0 * Math.PI * 2 + (Rand() - .5) * .5;
            var dir = new Vector(Math.Cos(angle), Math.Sin(angle) * .5);
            var from = center;
            foreach (var distance in new[] { 40, 95, 160, 250 })
            {
                var to = new Point(center.X + (dir.X * distance + -dir.Y * (Rand() - .5) * 14) * _sx, center.Y + (dir.Y * distance + dir.X * (Rand() - .5) * 10) * _sy);
                _cracks.Add(new Line { X1 = from.X, Y1 = from.Y, X2 = to.X, Y2 = to.Y, Stroke = new SolidColorBrush(Cream) { Opacity = .55 }, StrokeThickness = 1, IsHitTestVisible = false, Clip = new RectangleGeometry(new Rect(0, 0, _w, _h), _h / 2, _h / 2) });
                from = to;
            }
        }
    }

    private int AddPiece(Piece piece) { _pieces.Add(piece); return _pieces.Count - 1; }

    // ---- states -------------------------------------------------------------------------------------------------------

    private void Reset()
    {
        _generation++;
        foreach (var piece in _pieces)
        {
            piece.Move.BeginAnimation(TranslateTransform.XProperty, null); piece.Move.BeginAnimation(TranslateTransform.YProperty, null);
            piece.Turn.BeginAnimation(RotateTransform.AngleProperty, null);
            piece.Shape.BeginAnimation(UIElement.OpacityProperty, null);
            piece.Fill.BeginAnimation(SolidColorBrush.ColorProperty, null);
            piece.Seam.BeginAnimation(Brush.OpacityProperty, null);
        }
        foreach (var crack in _cracks) crack.Stroke.BeginAnimation(Brush.OpacityProperty, null);
        _overlay.Children.Clear();
        _squash.BeginAnimation(ScaleTransform.ScaleYProperty, null);
        _slabShift.BeginAnimation(TranslateTransform.YProperty, null);
        _slabTurn.BeginAnimation(RotateTransform.AngleProperty, null);
        _slab.BeginAnimation(OpacityProperty, null);
    }

    /// <summary>The finished state: no animation.</summary>
    public void ShowBroken()
    {
        Reset();
        _intact.Opacity = 0; _backing.Opacity = 1;
        foreach (var piece in _pieces)
        {
            if (piece.Fell) { piece.Shape.Opacity = 0; continue; }
            piece.Shape.Opacity = 1;
            piece.Fill.Color = _dim; piece.Seam.Opacity = .6;
            piece.Move.X = piece.Displacement.X; piece.Move.Y = piece.Displacement.Y; piece.Turn.Angle = piece.DisplacementTurn;
        }
        foreach (var crack in _cracks) crack.Stroke.Opacity = .55;
        _slab.Opacity = 1; _slabShift.Y = 0; _slabTurn.Angle = 0; _slab.BorderBrush = Brushes.Transparent; _slab.Background = Brushes.Transparent;
        _squash.ScaleY = 1;
    }

    private void ShowIntact()
    {
        Reset();
        _intact.Opacity = 0;
        foreach (var piece in _pieces) { piece.Shape.Opacity = 1; piece.Fill.Color = _accent; piece.Seam.Opacity = 0; piece.Move.X = piece.Move.Y = 0; piece.Turn.Angle = 0; }
        foreach (var crack in _cracks) crack.Stroke.Opacity = 0;
    }

    // ---- animation helpers --------------------------------------------------------------------------------------------

    private static readonly IEasingFunction Gravity = new PowerEase { Power = 3, EasingMode = EasingMode.EaseIn };
    private static Duration Ms(double ms) => new(TimeSpan.FromMilliseconds(Math.Max(1, ms)));

    private static void Run(DependencyObject target, DependencyProperty property, double from, double to, double ms, double delay, IEasingFunction? ease = null)
    {
        var animatable = (IAnimatable)target;
        if (!Motion.Enabled) { animatable.BeginAnimation(property, null); target.SetValue(property, to); return; }
        animatable.BeginAnimation(property, new DoubleAnimation(from, to, Ms(ms)) { BeginTime = TimeSpan.FromMilliseconds(delay), EasingFunction = ease ?? Motion.Out, FillBehavior = FillBehavior.HoldEnd });
    }

    /// <summary>A jump that happens in a few sudden steps (the launcher's glitch), not smoothly.</summary>
    private static void Steps(DependencyObject target, DependencyProperty property, double from, double to, double ms, double delay, int steps = 3)
    {
        var animatable = (IAnimatable)target;
        if (!Motion.Enabled) { animatable.BeginAnimation(property, null); target.SetValue(property, to); return; }
        var frames = new DoubleAnimationUsingKeyFrames { BeginTime = TimeSpan.FromMilliseconds(delay), FillBehavior = FillBehavior.HoldEnd };
        frames.KeyFrames.Add(new DiscreteDoubleKeyFrame(from, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        for (var i = 1; i <= steps; i++) frames.KeyFrames.Add(new DiscreteDoubleKeyFrame(from + (to - from) * i / steps, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(ms * i / steps))));
        animatable.BeginAnimation(property, frames);
    }

    private static void ColorTo(SolidColorBrush brush, Color from, Color to, double ms, double delay)
    {
        if (!Motion.Enabled) { brush.BeginAnimation(SolidColorBrush.ColorProperty, null); brush.Color = to; return; }
        brush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation(from, to, Ms(ms)) { BeginTime = TimeSpan.FromMilliseconds(delay), EasingFunction = Motion.Out, FillBehavior = FillBehavior.HoldEnd });
    }

    private void Later(double ms, Action action, int generation)
    {
        if (!Motion.Enabled || ms <= 0) { action(); return; }
        var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(ms) };
        timer.Tick += (_, _) => { timer.Stop(); if (generation == _generation) action(); };
        timer.Start();
    }

    // ---- breaking -----------------------------------------------------------------------------------------------------

    /// <summary>The word falls onto the button, and the button breaks around it. Ends in ShowBroken's state.</summary>
    public void PlayBreak()
    {
        ShowIntact();
        var generation = _generation;
        const double impact = 572;
        if (!Motion.Enabled) { ShowBroken(); return; }
        _backing.Opacity = 0;
        _intact.Opacity = 1;

        // the slab (the word in a frame) falls, faster and faster, and lands a little crooked
        _slab.BorderBrush = new SolidColorBrush(Cream); _slab.Background = new SolidColorBrush(Color.FromRgb(0x0b, 0x0b, 0x0c)); _slab.Opacity = 0;
        _slab.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, Ms(50)) { BeginTime = TimeSpan.FromMilliseconds(250), FillBehavior = FillBehavior.HoldEnd });
        Run(_slabShift, TranslateTransform.YProperty, -150 * (_h / 52), 0, impact - 250, 250, Gravity);
        Run(_slabTurn, RotateTransform.AngleProperty, -10, -3, impact - 250, 250, Gravity);
        Later(impact, () =>
        {
            Run(_slabShift, TranslateTransform.YProperty, -6, 0, 240, 0);
            Run(_slabTurn, RotateTransform.AngleProperty, -1.5, 0, 240, 0);
            _slab.BorderBrush = Brushes.Transparent; _slab.Background = Brushes.Transparent;
            _intact.Opacity = 0; _backing.Opacity = 1;
            Run(_squash, ScaleTransform.ScaleYProperty, .86, 1, 170, 0);
        }, generation);

        foreach (var piece in _pieces)
        {
            if (piece.Fell)
            {
                var ms = 520 + Rand() * 200;
                var delay = impact + 30 + piece.Distance * .6 + (piece.IsCenter ? 20 : 0);
                Run(piece.Move, TranslateTransform.XProperty, 0, piece.Fall.X, ms, delay, Gravity);
                Run(piece.Move, TranslateTransform.YProperty, 0, piece.Fall.Y, ms, delay, Gravity);
                Run(piece.Turn, RotateTransform.AngleProperty, 0, piece.FallTurn, ms, delay, Gravity);
                Run(piece.Shape, UIElement.OpacityProperty, 1, 0, ms * .55, delay + ms * .45, Gravity);
                piece.Seam.Opacity = 0; piece.Seam.BeginAnimation(Brush.OpacityProperty, new DoubleAnimation(0, .6, Ms(1)) { BeginTime = TimeSpan.FromMilliseconds(impact + piece.Distance * .6), FillBehavior = FillBehavior.HoldEnd });
            }
            else
            {
                ColorTo(piece.Fill, _accent, _dim, 460, impact + piece.Distance * .6);
                piece.Seam.BeginAnimation(Brush.OpacityProperty, new DoubleAnimation(0, .6, Ms(1)) { BeginTime = TimeSpan.FromMilliseconds(impact + piece.Distance * .6), FillBehavior = FillBehavior.HoldEnd });
                var delay = impact + 40 + piece.Distance * .55;
                Steps(piece.Move, TranslateTransform.XProperty, 0, piece.Displacement.X, 200, delay);
                Steps(piece.Move, TranslateTransform.YProperty, 0, piece.Displacement.Y, 200, delay);
                Steps(piece.Turn, RotateTransform.AngleProperty, 0, piece.DisplacementTurn, 200, delay);
            }
        }
        for (var i = 0; i < _cracks.Count; i++)
            _cracks[i].Stroke.BeginAnimation(Brush.OpacityProperty, new DoubleAnimation(0, .55, Ms(170)) { BeginTime = TimeSpan.FromMilliseconds(impact + i * 4), FillBehavior = FillBehavior.HoldEnd });
    }

    // ---- growing back -------------------------------------------------------------------------------------------------

    /// <summary>The glass regenerates from itself, crystal by crystal. When it is done the button is whole (the caller then shows the real one).</summary>
    public void PlayRegenerate(Action done)
    {
        _generation++;
        var generation = _generation;
        if (!Motion.Enabled) { done(); return; }
        const double speed = .5, band = 18, gap = 6;
        var count = _pieces.Count;
        var time = Enumerable.Repeat(double.PositiveInfinity, count).ToArray();
        var origin = new Point[count];
        var settled = new bool[count];
        var info = new (Vector U, double X0, double X1, double Dur)[count];

        // the two crystals that start: the outermost one on the left and the outermost one on the right
        int left = -1, right = -1;
        for (var i = 0; i < count; i++)
        {
            if (_pieces[i].Level != 2 || _pieces[i].IsCenter) continue;
            if (left < 0 || _pieces[i].Center.X < _pieces[left].Center.X) left = i;
            if (right < 0 || _pieces[i].Center.X > _pieces[right].Center.X) right = i;
        }
        var middle = new Point(_w / 2, _h / 2);
        foreach (var seed in new[] { left, right }.Where(s => s >= 0))
        {
            var away = _pieces[seed].Center - middle;
            away.Normalize();
            time[seed] = 0;
            origin[seed] = _pieces[seed].Center + away * 40;
        }

        for (var step = 0; step < count; step++)
        {
            var best = -1;
            for (var i = 0; i < count; i++) if (!settled[i] && !double.IsPositiveInfinity(time[i]) && (best < 0 || time[i] < time[best])) best = i;
            if (best < 0) break;
            settled[best] = true;
            var piece = _pieces[best];
            var direction = piece.Center - origin[best];
            if (direction.Length < 1e-6) direction = new Vector(1, 0);
            direction.Normalize();
            double lo = double.MaxValue, hi = double.MinValue;
            foreach (var p in piece.Range) { var projection = (p.X - piece.Center.X) * direction.X + (p.Y - piece.Center.Y) * direction.Y; lo = Math.Min(lo, projection); hi = Math.Max(hi, projection); }
            var x0 = lo - band - 6; var x1 = hi + band + 6;
            var duration = (x1 - x0) / (speed * _sx);
            info[best] = (direction, x0, x1, duration);
            foreach (var (to, edge) in piece.Neighbours)
            {
                if (settled[to]) continue;
                var projection = (edge.X - piece.Center.X) * direction.X + (edge.Y - piece.Center.Y) * direction.Y;
                var fraction = Math.Clamp((projection - (x0 + band)) / Math.Max(1, (x1 - band) - (x0 + band)), 0, 1);
                var candidate = time[best] + fraction * duration + gap + Rand() * 6;
                if (candidate < time[to]) { time[to] = candidate; origin[to] = edge; }
            }
        }

        _overlay.Children.Clear();
        var end = 0.0;
        const double start = 140;
        var mesh = MeshBrush();
        for (var i = 0; i < count; i++)
        {
            if (settled[i] == false) continue;
            var piece = _pieces[i];
            var (u, x0, x1, duration) = info[i];
            var t = start + time[i];
            // the crystal: clipped to its own outline, with a solid part behind the front, a band of mesh, and a bright line
            var holder = new Canvas { Width = _w, Height = _h, Clip = piece.Geometry, IsHitTestVisible = false };
            var turn = new Canvas { RenderTransform = new RotateTransform(Math.Atan2(u.Y, u.X) * 180 / Math.PI, piece.Center.X, piece.Center.Y) };
            var slide = new Canvas();
            var shift = new TranslateTransform(x0, 0);
            slide.RenderTransform = shift;
            Rectangle Bar(double left, double width, Brush fill, double opacity = 1) => new()
            {
                Width = width, Height = 600, Fill = fill, Opacity = opacity, IsHitTestVisible = false
            };
            void Put(Rectangle r, double left) { Canvas.SetLeft(r, piece.Center.X + left); Canvas.SetTop(r, piece.Center.Y - 300); slide.Children.Add(r); }
            Put(Bar(0, 1500 - band, new SolidColorBrush(_accent)), -1500);
            Put(Bar(0, band, new SolidColorBrush(_accent), .3), -band);
            Put(Bar(0, band, mesh), -band);
            Put(Bar(0, 9, new SolidColorBrush(Cream), .35), -5);
            Put(Bar(0, 2, new SolidColorBrush(Cream)), -1);
            turn.Children.Add(slide); holder.Children.Add(turn); _overlay.Children.Add(holder);
            Run(shift, TranslateTransform.XProperty, x0, x1, duration, t, Motion.Linear);
            // the piece that was there goes out just as its crystal arrives
            var old = piece;
            if (!old.Fell) old.Shape.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, 0, Ms(110)) { BeginTime = TimeSpan.FromMilliseconds(t), FillBehavior = FillBehavior.HoldEnd });
            end = Math.Max(end, t + duration);
        }
        foreach (var crack in _cracks) crack.Stroke.BeginAnimation(Brush.OpacityProperty, new DoubleAnimation(.55, 0, Ms(260)) { BeginTime = TimeSpan.FromMilliseconds(start), FillBehavior = FillBehavior.HoldEnd });
        _slab.BeginAnimation(OpacityProperty, new DoubleAnimationUsingKeyFrames
        {
            BeginTime = TimeSpan.FromMilliseconds(start + end * .55), FillBehavior = FillBehavior.HoldEnd,
            KeyFrames = { new DiscreteDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.Zero)), new DiscreteDoubleKeyFrame(.15, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(50))), new DiscreteDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(100))), new DiscreteDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(150))) }
        });

        Later(end + 40, () => done(), generation);
    }

    /// <summary>The lattice of thin triangles that leads each crystal's front.</summary>
    private Brush MeshBrush()
    {
        var pen = new Pen(new SolidColorBrush(Colors.White), 1);
        var w = 14 * _sx * 1.2; var h = 12.12 * _sy * 1.2;
        var group = new DrawingGroup();
        var lines = new GeometryGroup();
        lines.Children.Add(new LineGeometry(new Point(0, 0), new Point(w, 0)));
        lines.Children.Add(new LineGeometry(new Point(0, h), new Point(w / 2, 0)));
        lines.Children.Add(new LineGeometry(new Point(w / 2, 0), new Point(w, h)));
        group.Children.Add(new GeometryDrawing(null, pen, lines));
        var brush = new DrawingBrush(group) { TileMode = TileMode.Tile, Viewport = new Rect(0, 0, w, h), ViewportUnits = BrushMappingMode.Absolute, Viewbox = new Rect(0, 0, w, h), ViewboxUnits = BrushMappingMode.Absolute };
        brush.Freeze();
        return brush;
    }

    /// <summary>Lets go of everything running (the view is being left).</summary>
    public void Stop() => Reset();
}
