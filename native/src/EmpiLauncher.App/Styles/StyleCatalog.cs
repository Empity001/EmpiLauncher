using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;

namespace EmpiLauncher.App.Styles;

/// <summary>One style of the interface, as Styles/styles.json describes it.</summary>
internal sealed record StyleInfo(string Id, string Name, string Summary, Color Accent, string AccentHex, bool Ported, string? ReleasedIn);

/// <summary>
/// The launcher's styles ("estilos"): the background and the whole interface dressed to match. The list is Styles/styles.json, embedded in
/// the build; the Publisher's "Pendientes" switches a style on by writing the version it comes out in (releasedIn), so every style reaches
/// players as its own update. A player is offered the base style and the ones switched on that this build can draw, and nothing else: a
/// style that is ready but not released cannot be shown by any setting. Only a development build (not the installer, see EMPI_RELEASE in the
/// .csproj) can show every ready style, with EMPI_ALL_STYLES=1.
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
            // the installer players get: only what a release switched on, whatever the environment says
            const bool everything = false;
#else
            // a development build: EMPI_ALL_STYLES=1 shows every style that is ready, to try them before they are released
            var everything = Environment.GetEnvironmentVariable("EMPI_ALL_STYLES") == "1";
#endif
            return All.Where(s => s.Ported && StyleFactory.CanDraw(s.Id) && (s.Id == Base || s.ReleasedIn != null || everything)).ToList();
        }
    }

    /// <summary>The style with that id if it is offered, the base style otherwise.</summary>
    public static StyleInfo Get(string? id) => Available.FirstOrDefault(s => s.Id == id) ?? All.FirstOrDefault(s => s.Id == Base) ?? Fallback;

    private static readonly StyleInfo Fallback = new(Base, "Actual", "", Color.FromRgb(0xff, 0x3d, 0x8b), "#ff3d8b", true, null);

    private static List<StyleInfo> Load()
    {
        var list = new List<StyleInfo>();
        try
        {
            var resource = Application.GetResourceStream(new Uri("pack://application:,,,/Styles/styles.json"));
            if (resource == null) return [Fallback];
            using var stream = resource.Stream;
            using var doc = JsonDocument.Parse(stream);
            foreach (var s in doc.RootElement.GetProperty("styles").EnumerateArray())
            {
                var hex = s.TryGetProperty("accent", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString()! : "#ff3d8b";
                Color accent;
                try { accent = (Color)ColorConverter.ConvertFromString(hex); } catch (FormatException) { accent = Fallback.Accent; hex = Fallback.AccentHex; }
                list.Add(new StyleInfo(
                    s.GetProperty("id").GetString()!,
                    s.GetProperty("name").GetString()!,
                    s.TryGetProperty("summary", out var sum) ? sum.GetString() ?? "" : "",
                    accent, hex,
                    s.TryGetProperty("ported", out var p) && p.ValueKind == JsonValueKind.True,
                    s.TryGetProperty("releasedIn", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null));
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
