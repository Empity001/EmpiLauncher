using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The backgrounds were written for WPF's DrawingContext (Push... then Pop) and StreamGeometry; this keeps their drawing code as it was:
/// a wrapper that remembers what was pushed, and a geometry writer with WPF's BeginFigure(point, filled, closed).
/// </summary>
internal sealed class Dc : IDisposable
{
    public void Dispose() { }
    private readonly DrawingContext? _inner;
    private readonly List<Action<Dc>>? _rec;
    private readonly Stack<IDisposable> _pushed = new();
    private int _recDepth;

    public Dc(DrawingContext inner) { _inner = inner; }
    /// <summary>A recording: what is drawn on it is kept and drawn again each time it is played (WPF's DrawingGroup).</summary>
    public Dc(List<Action<Dc>> recording) { _rec = recording; }

    private void Do(Action<DrawingContext> live, Action<Dc> replay)
    {
        if (_rec != null) { _rec.Add(replay); return; }
        live(_inner!);
    }

    public void PushOpacity(double opacity) { if (_rec != null) _rec.Add(d => d.PushOpacity(opacity)); else _pushed.Push(_inner!.PushOpacity(opacity)); }
    public void PushClip(Geometry clip) { if (_rec != null) _rec.Add(d => d.PushClip(clip)); else _pushed.Push(_inner!.PushGeometryClip(clip)); }
    public void PushClip(Rect clip) { if (_rec != null) _rec.Add(d => d.PushClip(clip)); else _pushed.Push(_inner!.PushClip(clip)); }
    public void PushTransform(Matrix matrix) { if (_rec != null) _rec.Add(d => d.PushTransform(matrix)); else _pushed.Push(_inner!.PushTransform(matrix)); }
    public void PushOpacityMask(IBrush mask, Rect bounds) { if (_rec != null) _rec.Add(d => d.PushOpacityMask(mask, bounds)); else _pushed.Push(_inner!.PushOpacityMask(mask, bounds)); }
    public void Pop() { if (_rec != null) _rec.Add(d => d.Pop()); else _pushed.Pop().Dispose(); }
    /// <summary>Whatever a drawing left pushed (a style that returned half way) is let go of, so the next frame starts clean.</summary>
    public void PopAll() { while (_pushed.Count > 0) _pushed.Pop().Dispose(); }

    public void DrawEllipse(IBrush? brush, IPen? pen, Point center, double rx, double ry) => Do(c => c.DrawEllipse(brush, pen, center, rx, ry), d => d.DrawEllipse(brush, pen, center, rx, ry));
    public void DrawLine(IPen pen, Point a, Point b) => Do(c => c.DrawLine(pen, a, b), d => d.DrawLine(pen, a, b));
    public void DrawRectangle(IBrush? brush, IPen? pen, Rect rect) => Do(c => c.DrawRectangle(brush, pen, rect), d => d.DrawRectangle(brush, pen, rect));
    public void DrawRoundedRectangle(IBrush? brush, IPen? pen, Rect rect, double rx, double ry) => Do(c => c.DrawRectangle(brush, pen, rect, rx, ry), d => d.DrawRoundedRectangle(brush, pen, rect, rx, ry));
    public void DrawGeometry(IBrush? brush, IPen? pen, Geometry geometry) => Do(c => c.DrawGeometry(brush, pen, geometry), d => d.DrawGeometry(brush, pen, geometry));
    public void DrawText(FormattedText text, Point at) => Do(c => c.DrawText(text, at), d => d.DrawText(text, at));
    public void DrawImage(IImage image, Rect rect) => Do(c => c.DrawImage(image, rect), d => d.DrawImage(image, rect));
    public void DrawImage(IImage image, Rect source, Rect dest) => Do(c => c.DrawImage(image, source, dest), d => d.DrawImage(image, source, dest));
    /// <summary>Plays a recording (a Dg) here.</summary>
    public void DrawDrawing(Dg drawing) => drawing.Play(this);
    /// <summary>A custom Skia draw operation (the shaders). Not available while recording.</summary>
    public void Custom(Avalonia.Rendering.SceneGraph.ICustomDrawOperation op) { if (_rec == null) _inner!.Custom(op); }
}

/// <summary>WPF's DrawingGroup: a drawing made once with Open() and drawn many times with DrawDrawing.</summary>
internal sealed class Dg
{
    private readonly List<Action<Dc>> _ops = [];
    private bool _opened;
    public Dc Open() { _ops.Clear(); _opened = true; return new Dc(_ops); }
    public void Play(Dc dc) { foreach (var op in _ops) op(dc); }
    public bool IsEmpty => !_opened || _ops.Count == 0;
}

/// <summary>Draws something once into a bitmap (the sprites and grain the styles keep as textures).</summary>
internal static class Raster
{
    public static RenderTargetBitmap Render(int pixelW, int pixelH, Action<Dc> draw, double scale = 1)
    {
        var bitmap = new RenderTargetBitmap(new PixelSize(Math.Max(1, pixelW), Math.Max(1, pixelH)), new Vector(96, 96));
        using var context = bitmap.CreateDrawingContext();
        var dc = new Dc(context);
        try { if (Math.Abs(scale - 1) > 0.001) dc.PushTransform(Tr.Scale(scale, scale)); draw(dc); } finally { dc.PopAll(); }
        return bitmap;
    }
}

/// <summary>Matrices for the transforms WPF wrote as RotateTransform(angle, cx, cy) and the like.</summary>
internal static class Tr
{
    public static Matrix Translate(double x, double y) => Matrix.CreateTranslation(x, y);
    public static Matrix Scale(double sx, double sy, double cx = 0, double cy = 0) => Matrix.CreateTranslation(-cx, -cy) * Matrix.CreateScale(sx, sy) * Matrix.CreateTranslation(cx, cy);
    /// <summary>Degrees, clockwise, around (cx, cy).</summary>
    public static Matrix Rotate(double degrees, double cx = 0, double cy = 0) => Matrix.CreateTranslation(-cx, -cy) * Matrix.CreateRotation(degrees * Math.PI / 180) * Matrix.CreateTranslation(cx, cy);
    /// <summary>The same as WPF's MatrixTransform(m11, m12, m21, m22, offsetX, offsetY).</summary>
    public static Matrix M(double m11, double m12, double m21, double m22, double dx, double dy) => new(m11, m12, m21, m22, dx, dy);
}

internal static class CompatExt
{
    /// <summary>WPF froze brushes, pens and geometries to make them cheap; here they are used as they are.</summary>
    public static T Freeze<T>(this T value) => value;

    public static Sg OpenW(this StreamGeometry geometry) => new(geometry.Open());
    public static Dc OpenW(this Dg drawing) => drawing.Open();

    /// <summary>A rectangle moved by (dx, dy): Avalonia's Rect has no WPF Offset that changes it in place.</summary>
    public static Rect Moved(this Rect r, double dx, double dy) => new(r.X + dx, r.Y + dy, r.Width, r.Height);
    public static double Len(this Point p) => Math.Sqrt(p.X * p.X + p.Y * p.Y);
    /// <summary>The same as WPF's EllipseGeometry(center, rx, ry).</summary>
    public static EllipseGeometry Ellipse(Point c, double rx, double ry) => new(new Rect(c.X - rx, c.Y - ry, rx * 2, ry * 2));
}

/// <summary>WPF's StreamGeometryContext shape: BeginFigure(point, filled, closed) ends the figure before it; Dispose ends the last one.</summary>
internal sealed class Sg(StreamGeometryContext context) : IDisposable
{
    private bool _open, _closed;

    public void BeginFigure(Point start, bool filled, bool closed)
    {
        End();
        context.BeginFigure(start, filled);
        _open = true; _closed = closed;
    }

    public void LineTo(Point p, bool stroked = true, bool smooth = false) => context.LineTo(p);
    public void BezierTo(Point c1, Point c2, Point p, bool stroked = true, bool smooth = false) => context.CubicBezierTo(c1, c2, p);
    public void QuadraticBezierTo(Point c, Point p, bool stroked = true, bool smooth = false) => context.QuadraticBezierTo(c, p);
    public void ArcTo(Point p, Size size, double rotation, bool large, SweepDirection sweep, bool stroked = true, bool smooth = false) => context.ArcTo(p, size, rotation, large, sweep);
    public void PolyLineTo(IList<Point> points, bool stroked = true, bool smooth = false) { foreach (var p in points) context.LineTo(p); }

    private void End() { if (_open) { context.EndFigure(_closed); _open = false; } }
    /// <summary>WPF's StreamGeometryContext.Close(): the geometry is finished.</summary>
    public void Close() => Dispose();
    public void Dispose() { End(); context.Dispose(); }
}

internal static class Rp
{
    /// <summary>A point of a gradient in 0..1 of the shape it paints (WPF's default mapping).</summary>
    public static RelativePoint Rel(double x, double y) => new(x, y, RelativeUnit.Relative);
    /// <summary>A point of a gradient in device-independent pixels (WPF's MappingMode.Absolute).</summary>
    public static RelativePoint Abs(Point p) => new(p, RelativeUnit.Absolute);
    /// <summary>A radius of a gradient as a fraction of the shape.</summary>
    public static RelativeScalar Sc(double v) => new(v, RelativeUnit.Relative);
}

internal static class Gr
{
    /// <summary>WPF's LinearGradientBrush(c0, c1, start, end): the points are 0..1 of the shape.</summary>
    public static LinearGradientBrush Linear(Color c0, Color c1, Point start, Point end) => new()
    {
        StartPoint = Rp.Rel(start.X, start.Y), EndPoint = Rp.Rel(end.X, end.Y), GradientStops = { new GradientStop(c0, 0), new GradientStop(c1, 1) }
    };

    /// <summary>WPF's LinearGradientBrush(c0, c1, angle): 0 runs left to right, 90 top to bottom.</summary>
    public static LinearGradientBrush Linear(Color c0, Color c1, double angle)
    {
        var a = angle * Math.PI / 180;
        var dx = Math.Cos(a) / 2; var dy = Math.Sin(a) / 2;
        return Linear(c0, c1, new Point(0.5 - dx, 0.5 - dy), new Point(0.5 + dx, 0.5 + dy));
    }

    /// <summary>WPF's RadialGradientBrush(centre colour, edge colour): centred, reaching the edge of the shape.</summary>
    /// <summary>A radial gradient in absolute pixels (WPF's MappingMode.Absolute with Center, GradientOrigin and the radii).</summary>
    public static RadialGradientBrush RadialAbs(Color center, Color edge, Point at, double rx, double ry) => new()
    {
        Center = new RelativePoint(at, RelativeUnit.Absolute), GradientOrigin = new RelativePoint(at, RelativeUnit.Absolute),
        RadiusX = new RelativeScalar(rx, RelativeUnit.Absolute), RadiusY = new RelativeScalar(ry, RelativeUnit.Absolute),
        GradientStops = { new GradientStop(center, 0), new GradientStop(edge, 1) }
    };

    public static RadialGradientBrush Radial(Color center, Color edge) => new() { GradientStops = { new GradientStop(center, 0), new GradientStop(edge, 1) } };
}

internal static class Px
{
    /// <summary>A small bitmap written from BGRA bytes (the light beams of Celestial are made this way).</summary>
    public static WriteableBitmap Make(int w, int h) => new(new PixelSize(w, h), new Vector(96, 96), PixelFormat.Bgra8888, AlphaFormat.Opaque);

    /// <summary>A greyscale copy of a bitmap (luminance in the three colour channels, alpha kept).</summary>
    public static WriteableBitmap? Grey(Bitmap source)
    {
        try
        {
            var size = source.PixelSize;
            var stride = size.Width * 4;
            var pixels = new byte[stride * size.Height];
            var handle = GCHandle.Alloc(pixels, GCHandleType.Pinned);
            try { source.CopyPixels(new PixelRect(0, 0, size.Width, size.Height), handle.AddrOfPinnedObject(), pixels.Length, stride); }
            finally { handle.Free(); }
            for (var i = 0; i < pixels.Length; i += 4)
            {
                var y = (byte)(0.114 * pixels[i] + 0.587 * pixels[i + 1] + 0.299 * pixels[i + 2]);
                pixels[i] = pixels[i + 1] = pixels[i + 2] = y;
            }
            var grey = new WriteableBitmap(size, new Vector(96, 96), PixelFormat.Bgra8888, AlphaFormat.Premul);
            Write(grey, pixels);
            return grey;
        }
        catch (Exception) { return null; }
    }

    public static void Write(WriteableBitmap bitmap, byte[] bgra)
    {
        using var frame = bitmap.Lock();
        Marshal.Copy(bgra, 0, frame.Address, Math.Min(bgra.Length, frame.RowBytes * frame.Size.Height));
    }
}
