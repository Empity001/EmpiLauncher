using System.Text.Json;
using Avalonia.Media;
using EmpiLauncher.Linux.Views;

namespace EmpiLauncher.Linux.Styles;

/// <summary>One style of the interface, as Styles/styles.json describes it.</summary>
/// <param name="Weight">how heavy it is next to the others (1 to 100) at the default frame rates: Ajustes shows it as a ring</param>
internal sealed record StyleInfo(string Id, string Name, string Summary, Color Accent, string AccentHex, bool Ported, string? ReleasedIn, int Weight = 20);

/// <summary>
/// The launcher's styles ("estilos"): the background and the whole interface dressed to match. The list is Styles/styles.json, the same file the
/// Windows launcher embeds; the Publisher's "Pendientes" switches a style on by writing the version it comes out in (releasedIn). A player is
/// offered the base style and the ones switched on that this build can draw, and nothing else. EMPI_ALL_STYLES=1 shows every style that is ready
/// (development builds only: the installer is built with EMPI_RELEASE).
/// </summary>
internal static class StyleCatalog
{
    public const string Base = "actual";
    private static List<StyleInfo>? _all;

    public static IReadOnlyList<StyleInfo> All => _all ??= Load();

    public static IReadOnlyList<StyleInfo> Available
    {
        get
        {
#if EMPI_RELEASE
            const bool everything = false;
#else
            var everything = Environment.GetEnvironmentVariable("EMPI_ALL_STYLES") == "1";
#endif
            return All.Where(s => s.Ported && StyleFactory.CanDraw(s.Id) && (s.Id == Base || s.ReleasedIn != null || everything)).ToList();
        }
    }

    public static StyleInfo Get(string? id) => Available.FirstOrDefault(s => s.Id == id) ?? All.FirstOrDefault(s => s.Id == Base) ?? Fallback;

    private static readonly StyleInfo Fallback = new(Base, "Default", "", Color.Parse("#ff3d8b"), "#ff3d8b", true, null, 18);

    private static List<StyleInfo> Load()
    {
        var list = new List<StyleInfo>();
        try
        {
            using var stream = Avalonia.Platform.AssetLoader.Open(new Uri("avares://EmpiLauncher/Styles/styles.json"));
            using var doc = JsonDocument.Parse(stream);
            foreach (var s in doc.RootElement.GetProperty("styles").EnumerateArray())
            {
                var hex = s.TryGetProperty("accent", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString()! : "#ff3d8b";
                if (!Color.TryParse(hex, out var accent)) { accent = Fallback.Accent; hex = Fallback.AccentHex; }
                list.Add(new StyleInfo(
                    s.GetProperty("id").GetString()!, s.GetProperty("name").GetString()!,
                    s.TryGetProperty("summary", out var sum) ? sum.GetString() ?? "" : "", accent, hex,
                    s.TryGetProperty("ported", out var p) && p.ValueKind == JsonValueKind.True,
                    s.TryGetProperty("releasedIn", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null,
                    s.TryGetProperty("weight", out var wt) && wt.ValueKind == JsonValueKind.Number ? Math.Clamp(wt.GetInt32(), 1, 100) : 20));
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException or KeyNotFoundException or InvalidOperationException)
        {
            App.Log("styles.json", ex);
        }
        if (!list.Any(s => s.Id == Base)) list.Insert(0, Fallback);
        return list;
    }
}

/// <summary>Which background each style draws. A style that is listed but has no drawing in this build is never offered.</summary>
internal static class StyleFactory
{
    private static readonly HashSet<string> Drawn = ["actual"];
    /// <summary>Registers the styles this build can draw (each Field adds itself in StyleFactory.Create's switch).</summary>
    public static bool CanDraw(string id) => id == "actual" || Creators.ContainsKey(id);

    public static readonly Dictionary<string, Func<StyleHost.ILayer>> Creators = new()
    {
        ["celestial"] = () => new CelestialField(),
        ["core"] = () => new CoreField(),
        ["minimal"] = () => new MinimalField(),
        ["shell"] = () => new ShellField(),
        ["remember"] = () => new RememberField(),
        ["punk"] = () => new PunkField(),
        ["words"] = () => new WordsField(),
        ["explorer"] = () => new ExplorerField(),
        ["oleaje"] = () => new OleajeField(),
        ["termico"] = () => new TermicoField(),
    };

    public static StyleHost.ILayer Create(string id) => Creators.TryGetValue(id, out var make) ? make() : new LivingField();
}

/// <summary>
/// Dresses the whole interface in a style: the base tokens, then the style's own written over them (a colour is changed in place, so what is on
/// screen follows; the views are rebuilt for radii, fonts and gradient edges). Control SHAPES that only some styles have are not part of this port.
/// </summary>
internal static class StyleTheme
{
    public static string Current { get; private set; } = StyleCatalog.Base;
    public static bool SentenceCase { get; private set; }
    public static Color? PlayInk { get; private set; }
    public static bool PlayInkIsAccent { get; private set; }

    /// <summary>A label as the style writes it: capitals stay capitals unless the style asks for sentence case.</summary>
    public static string Label(string text)
    {
        if (Current == "shell") return text + "_";
        if (!SentenceCase || text.Length == 0) return text;
        var lower = text.ToLowerInvariant().Replace("java", "Java");
        return char.ToUpperInvariant(lower[0]) + lower[1..];
    }

    public static void Apply(string id)
    {
        var style = StyleCatalog.Get(id);
        PlayInk = style.Id switch
        {
            "explorer" => Colors.White, "words" => Color.FromRgb(0x15, 0x12, 0x0f), "core" => Color.FromRgb(0xf1, 0xed, 0xe0),
            "oleaje" => Color.FromRgb(0x06, 0x12, 0x29), "termico" => Color.FromRgb(0x1a, 0x06, 0x12), "celestial" => Color.FromRgb(0x24, 0x14, 0x33), _ => null
        };
        PlayInkIsAccent = style.Id == "punk";
        SentenceCase = style.Id is "minimal" or "remember" or "words" or "explorer";
        Pal.ApplyTokens(StyleTokens.Base);
        if (style.Id != StyleCatalog.Base && StyleTokens.Looks.TryGetValue(style.Id, out var tokens)) Pal.ApplyTokens(tokens);
        Current = style.Id;
        Services.Launcher.RefreshAccent();
        Views.Look.Apply(style.Id);
        Views.Foil.Set(style.Id == "celestial");
    }

    /// <summary>The sheen of Celestial's foil only passes while the background may move; there is no foil in this port yet, so nothing follows this.</summary>
    public static void SetMoving(bool moving) => Views.Foil.SetMoving(moving);
}
