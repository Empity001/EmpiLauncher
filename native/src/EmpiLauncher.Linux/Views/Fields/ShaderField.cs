using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Rendering.SceneGraph;
using Avalonia.Skia;
using SkiaSharp;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// A style's pixel shader as a Skia runtime effect (SkSL, the Shaders class): every constant is a float4, as in the Windows launcher's HLSL: the field's
/// size, the clocks, the accent, where the light is, the arrival, and the twelve latest clicks. The shader paints the whole field; what the style draws
/// itself (the camera's marks, the ghost name) is drawn over it.
/// </summary>
internal sealed class StyleShader
{
    private readonly SKRuntimeEffect? _effect;
    private SKShader? _noise;
    public readonly Dictionary<string, float[]> Uniforms = [];
    public bool Ok => _effect != null;

    public StyleShader(string sksl, byte[]? noise)
    {
        _effect = SKRuntimeEffect.CreateShader(sksl, out var errors);
        if (_effect == null) { App.Log("shader", new InvalidOperationException(errors)); return; }
        foreach (var name in new[] { "Res", "Clock", "Acc", "Turn", "Aura", "Reveal" }) Uniforms[name] = new float[4];
        Uniforms["Waves"] = new float[48];
        if (noise != null)
        {
            using var image = SKImage.FromPixelCopy(new SKImageInfo(512, 512, SKColorType.Gray8), noise, 512);
            _noise = image.ToShader(SKShaderTileMode.Clamp, SKShaderTileMode.Clamp, new SKSamplingOptions(SKFilterMode.Linear));
        }
    }

    public void Set(string name, float a, float b, float c, float d) { var u = Uniforms[name]; u[0] = a; u[1] = b; u[2] = c; u[3] = d; }
    public void SetWave(int i, float a, float b, float c, float d) { var u = Uniforms["Waves"]; u[i * 4] = a; u[i * 4 + 1] = b; u[i * 4 + 2] = c; u[i * 4 + 3] = d; }

    /// <summary>A draw operation with this frame's constants copied (the render thread draws it later).</summary>
    public ICustomDrawOperation? Operation(Rect bounds)
    {
        if (_effect == null) return null;
        return new Op(bounds, _effect, Uniforms.ToDictionary(p => p.Key, p => (float[])p.Value.Clone()), _noise);
    }

    private sealed class Op(Rect bounds, SKRuntimeEffect effect, Dictionary<string, float[]> values, SKShader? noise) : ICustomDrawOperation
    {
        public Rect Bounds => bounds;
        public void Dispose() { }
        public bool HitTest(Point p) => false;
        public bool Equals(ICustomDrawOperation? other) => false;

        public void Render(ImmediateDrawingContext context)
        {
            var lease = context.TryGetFeature<ISkiaSharpApiLeaseFeature>()?.Lease();
            if (lease == null) return;
            using (lease)
            {
                var uniforms = new SKRuntimeEffectUniforms(effect);
                foreach (var (name, data) in values) uniforms[name] = data;
                var children = new SKRuntimeEffectChildren(effect);
                if (noise != null) children["Noise"] = noise;
                using var shader = effect.ToShader(uniforms, children);
                using var paint = new SKPaint { Shader = shader };
                lease.SkCanvas.DrawRect(new SKRect((float)bounds.Left, (float)bounds.Top, (float)bounds.Right, (float)bounds.Bottom), paint);
            }
        }
    }
}

/// <summary>
/// A style drawn by a pixel shader on the graphics card: the field only feeds it (its size, the time, the accent, where the light is, the arrival, the
/// clicks) and draws on top whatever the style adds. The processor does almost nothing per frame.
/// </summary>
internal abstract class ShaderField : StyleField
{
    /// <summary>Whether Skia could compile the effect (a machine drawing without GPU still can: it runs on the CPU, slowly).</summary>
    public static bool Supported => true;

    protected readonly StyleShader Fx;
    protected override double AmbientMs => 50;

    protected ShaderField(string sksl, byte[]? noise = null)
    {
        Fx = new StyleShader(sksl, noise);
        ClipToBounds = true;
    }

    /// <summary>Where the light is: in the room right of the modpack's text, a little above the middle.</summary>
    protected Point Light()
    {
        var text = Quiet.Where(r => r.Left > W * 0.18 && r.Width > 4 && r.Height > 4).ToList();
        var right = text.Count > 0 ? text.Max(r => r.Right) : W * 0.5;
        return new Point(Math.Clamp((right + W) / 2 / W, 0.55, 0.88), 0.42);
    }

    /// <summary>Everything the shader needs for this frame, then the shader is drawn under whatever the style adds.</summary>
    protected void Feed(Dc dc, double time, double motion = 1)
    {
        var light = Light();
        Fx.Set("Res", (float)W, (float)H, 1, 0);
        Fx.Set("Clock", (float)time, (float)T, 0.7f, (float)motion);
        Fx.Set("Acc", Accent.R / 255f, Accent.G / 255f, Accent.B / 255f, 1);
        Fx.Set("Turn", (float)(HueShift * Math.PI / 180), 0, 0, 0);
        Fx.Set("Aura", (float)light.X, (float)light.Y, 0, 0);
        Fx.Set("Reveal", (float)Reveal, Reveal < 1 ? 1 : 0, (float)light.X, (float)light.Y);
        var recent = Clicks.Skip(Math.Max(0, Clicks.Count - 12)).ToList();
        for (var i = 0; i < 12; i++)
        {
            if (i < recent.Count) Fx.SetWave(i, (float)(recent[i].X / Math.Max(1, W)), (float)(recent[i].Y / Math.Max(1, H)), (float)(T - recent[i].T0), (float)recent[i].Weight);
            else Fx.SetWave(i, 0, 0, 0, 0);
        }
        if (Fx.Operation(new Rect(0, 0, W, H)) is { } op) dc.Custom(op);
    }

    /// <summary>A small tileable noise picture (64 cells across, smooth between them) for shaders that need noise: 512 x 512 gray bytes.</summary>
    protected static byte[] NoiseBytes()
    {
        const int size = 512, cells = 64;
        static double Lattice(int x, int y) { x = ((x % cells) + cells) % cells; y = ((y % cells) + cells) % cells; var h = Math.Sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.Floor(h); }
        static double S(double t) => t * t * t * (t * (t * 6 - 15) + 10);
        var pixels = new byte[size * size];
        for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                double fx = x * (double)cells / size, fy = y * (double)cells / size;
                int ix = (int)Math.Floor(fx), iy = (int)Math.Floor(fy);
                double ux = S(fx - ix), uy = S(fy - iy);
                var top = Lattice(ix, iy) + (Lattice(ix + 1, iy) - Lattice(ix, iy)) * ux;
                var bottom = Lattice(ix, iy + 1) + (Lattice(ix + 1, iy + 1) - Lattice(ix, iy + 1)) * ux;
                pixels[y * size + x] = (byte)Math.Round((top + (bottom - top) * uy) * 255);
            }
        return pixels;
    }
}
