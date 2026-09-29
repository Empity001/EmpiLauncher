using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Media3D;
using System.Windows.Media.Imaging;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// A style's pixel shader (Styles/Shaders/&lt;name&gt;.ps, compiled from the .hlsl beside it by native/tools/compile-shaders.ps1). Every
/// constant is a float4: the field's size, the clocks, the accent, where the light is, the arrival, and the twelve latest clicks.
/// </summary>
internal sealed class StyleShader : ShaderEffect
{
    public static readonly DependencyProperty InputProperty = RegisterPixelShaderSamplerProperty("Input", typeof(StyleShader), 0);
    public static readonly DependencyProperty NoiseProperty = RegisterPixelShaderSamplerProperty("Noise", typeof(StyleShader), 1);

    private static DependencyProperty Constant(string name, int register) =>
        DependencyProperty.Register(name, typeof(Point4D), typeof(StyleShader), new UIPropertyMetadata(new Point4D(), PixelShaderConstantCallback(register)));

    public static readonly DependencyProperty ResProperty = Constant("Res", 0);
    public static readonly DependencyProperty ClockProperty = Constant("Clock", 1);
    public static readonly DependencyProperty AccProperty = Constant("Acc", 2);
    public static readonly DependencyProperty AuraProperty = Constant("Aura", 3);
    public static readonly DependencyProperty RevealProperty = Constant("Reveal", 4);
    private static readonly DependencyProperty[] WaveProperties = Enumerable.Range(0, 12).Select(i => Constant("Wave" + i, 8 + i)).ToArray();

    public StyleShader(string name, Brush? noise)
    {
        PixelShader = new PixelShader { UriSource = new Uri($"pack://application:,,,/Styles/Shaders/{name}.ps") };
        UpdateShaderValue(InputProperty);
        if (noise != null) SetValue(NoiseProperty, noise);
        foreach (var p in new[] { ResProperty, ClockProperty, AccProperty, AuraProperty, RevealProperty }.Concat(WaveProperties)) UpdateShaderValue(p);
    }

    /// <summary>Sets a constant only when it changes (each change makes WPF draw the effect again).</summary>
    public void Set(DependencyProperty property, Point4D value) { if (!((Point4D)GetValue(property)).Equals(value)) SetValue(property, value); }
    public void SetWave(int index, Point4D value) => Set(WaveProperties[index], value);
}

/// <summary>
/// A style drawn by a pixel shader on the graphics card: the field only feeds it (its size, the time, the accent, where the light is, the
/// arrival, the clicks) and draws on top whatever the style adds (the shader lays its picture under those drawings). The processor does
/// almost nothing per frame.
/// </summary>
internal abstract class ShaderField : StyleField
{
    /// <summary>Whether this graphics card can run the shaders (a machine drawing without one, like a remote session, cannot).</summary>
    public static bool Supported => RenderCapability.IsPixelShaderVersionSupported(3, 0);

    protected readonly StyleShader Fx;
    protected override double AmbientMs => 50;
    protected override double InteractiveMs => 33;

    protected ShaderField(string shader, Brush? noise = null)
    {
        Fx = new StyleShader(shader, noise);
        Effect = Fx;
        ClipToBounds = true;   // the effect maps its picture over the field's own bounds: nothing drawn past the edges may stretch them
    }

    /// <summary>The whole field, so the effect covers it even where nothing is drawn.</summary>
    protected override void RenderBase(DrawingContext dc) => dc.DrawRectangle(Brushes.Transparent, null, new Rect(0, 0, W, H));

    /// <summary>Where the light is: in the room right of the modpack's text, a little above the middle.</summary>
    protected Point Light()
    {
        var text = Quiet.Where(r => r.Left > W * 0.18 && r.Width > 4 && r.Height > 4).ToList();
        var right = text.Count > 0 ? text.Max(r => r.Right) : W * 0.5;
        return new Point(Math.Clamp((right + W) / 2 / W, 0.55, 0.88), 0.42);
    }

    /// <summary>Everything the shader needs for this frame.</summary>
    protected void Feed(double time, double motion = 1)
    {
        var light = Light();
        Fx.Set(StyleShader.ResProperty, new Point4D(W, H, 0, 0));
        Fx.Set(StyleShader.ClockProperty, new Point4D(time, T, 0.7, motion));
        Fx.Set(StyleShader.AccProperty, new Point4D(Accent.R / 255.0, Accent.G / 255.0, Accent.B / 255.0, 1));
        Fx.Set(StyleShader.AuraProperty, new Point4D(light.X, light.Y, 0, 0));
        Fx.Set(StyleShader.RevealProperty, new Point4D(Reveal, Reveal < 1 ? 1 : 0, light.X, light.Y));
        var recent = Clicks.Skip(Math.Max(0, Clicks.Count - 12)).ToList();
        for (var i = 0; i < 12; i++)
            Fx.SetWave(i, i < recent.Count ? new Point4D(recent[i].X / Math.Max(1, W), recent[i].Y / Math.Max(1, H), T - recent[i].T0, recent[i].Weight) : new Point4D());
    }

    /// <summary>A small tileable noise picture (64 cells across, smooth between them) for shaders that need noise.</summary>
    protected static ImageBrush NoiseBrush()
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
        var bitmap = BitmapSource.Create(size, size, 96, 96, PixelFormats.Gray8, null, pixels, size);
        bitmap.Freeze();
        var brush = new ImageBrush(bitmap);
        brush.Freeze();
        return brush;
    }
}
