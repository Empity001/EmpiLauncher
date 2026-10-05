using System.IO;
using System.Text.Json;

namespace EmpiLauncher.Linux.Services;

/// <summary>
/// The few preferences the native interface needs BEFORE the engine exists (the opening animation plays while the engine is still
/// starting), kept in a small file of their own next to the launcher's log. Everything else lives in the engine's native-ui.json.
/// Reading is forgiving (a missing or broken file means the defaults) and writing never throws: a preference is never worth a crash.
/// </summary>
internal static class NativeSettings
{
    // a test run (EMPI_USER_DATA points at a scratch folder) keeps its preferences there, never in the real ones
    private static readonly string FilePath = Environment.GetEnvironmentVariable("EMPI_USER_DATA") is { Length: > 0 } sandbox
        ? Path.Combine(sandbox, "native-ui.json")
        : Path.Combine(Environment.GetEnvironmentVariable("XDG_DATA_HOME") is { Length: > 0 } data ? data : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share"), "empilauncher", "ui.json");

    private static bool? _splash;

    /// <summary>Whether the launcher shows its logo with a glitch when it opens and closes. On by default.</summary>
    public static bool Splash
    {
        get
        {
            if (_splash is { } cached) return cached;
            var value = true;
            try
            {
                if (File.Exists(FilePath))
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
                    if (doc.RootElement.TryGetProperty("splash", out var s) && s.ValueKind is JsonValueKind.False) value = false;
                }
            }
            catch (Exception) { /* a broken file is the default */ }
            return (_splash = value).Value;
        }
        set { _splash = value; Save(); }
    }

    private static HashSet<string>? _retired;

    /// <summary>The modpacks whose Play button has been seen retired (broken): so it breaks the first time and, when it stops being retired, grows back once.</summary>
    public static HashSet<string> Retired
    {
        get
        {
            if (_retired != null) return _retired;
            var set = new HashSet<string>();
            try
            {
                if (File.Exists(FilePath))
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
                    if (doc.RootElement.TryGetProperty("retired", out var r) && r.ValueKind == JsonValueKind.Array)
                        foreach (var item in r.EnumerateArray()) if (item.ValueKind == JsonValueKind.String && item.GetString() is { } id) set.Add(id);
                }
            }
            catch (Exception) { /* a broken file is an empty list */ }
            return _retired = set;
        }
    }

    public static void SaveRetired() => Save();

    private static HashSet<string>? _debug;

    /// <summary>The numbers the debug panel shows (Ajustes > Launcher > Depuración): "fps", "ms", "cpu", "ram", "gpu", "field". None by default.</summary>
    public static IReadOnlySet<string> Debug
    {
        get
        {
            if (_debug != null) return _debug;
            var set = new HashSet<string>();
            try
            {
                if (File.Exists(FilePath))
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
                    if (doc.RootElement.TryGetProperty("debug", out var d) && d.ValueKind == JsonValueKind.Array)
                        foreach (var item in d.EnumerateArray()) if (item.ValueKind == JsonValueKind.String && item.GetString() is { } id) set.Add(id);
                }
            }
            catch (Exception) { /* a broken file is an empty panel */ }
            return _debug = set;
        }
    }

    /// <summary>Raised when a number of the debug panel is switched on or off.</summary>
    public static event Action? DebugChanged;

    public static void SetDebug(string id, bool on)
    {
        var set = new HashSet<string>(Debug);
        if (on) set.Add(id); else set.Remove(id);
        _debug = set;
        Save();
        DebugChanged?.Invoke();
    }

    private static string? _style;

    /// <summary>
    /// The interface's style (Ajustes > Launcher > Estilo): "actual" by default. It lives here, not in the engine's preferences, because the
    /// window is dressed in it before the engine has started. An id this build does not offer falls back to the base style (StyleCatalog).
    /// </summary>
    public static string Style
    {
        get => _style ??= ReadString("style") ?? "actual";
        set { _style = value; Save(); }
    }

    private static bool? _packAccent;

    /// <summary>Whether the modpack's own colour wins over the style's (on by default). Off: every style keeps its own colour.</summary>
    public static bool PackAccent
    {
        get
        {
            if (_packAccent is { } cached) return cached;
            var value = true;
            try
            {
                if (File.Exists(FilePath))
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
                    if (doc.RootElement.TryGetProperty("packAccent", out var p) && p.ValueKind is JsonValueKind.False) value = false;
                }
            }
            catch (Exception) { /* a broken file is the default */ }
            return (_packAccent = value).Value;
        }
        set { _packAccent = value; Save(); }
    }

    // ---- the background's frame rates (Ajustes > Launcher > Fondo) ----------------------------------------------------------
    // "Automático" moves between a minimum (nothing happening) and a maximum (the player moving or clicking); "Desactivado" (performance
    // mode off) holds one rate the player picks; "Activado" caps it (FieldGovernor.SaverFps) and ignores these.

    public const int FpsLowest = 5, FpsHighest = 60;
    private static int? _fpsMin, _fpsMax, _fpsFixed;

    public static int FpsMin { get => _fpsMin ??= ReadInt("fpsMin", 15); set { _fpsMin = Math.Clamp(value, FpsLowest, FpsHighest); if (FpsMax < _fpsMin) _fpsMax = _fpsMin; Save(); } }
    public static int FpsMax { get => _fpsMax ??= Math.Max(FpsMin, ReadInt("fpsMax", 30)); set { _fpsMax = Math.Clamp(value, FpsLowest, FpsHighest); if (FpsMin > _fpsMax) _fpsMin = _fpsMax; Save(); } }
    public static int FpsFixed { get => _fpsFixed ??= ReadInt("fpsFixed", 30); set { _fpsFixed = Math.Clamp(value, FpsLowest, FpsHighest); Save(); } }

    // ---- each style's own colour, when the modpack's does not win ------------------------------------------------------------

    private static Dictionary<string, string>? _styleColors;

    /// <summary>The colour the player gave a style (style id to "#rrggbb"); a style without one keeps its own (styles.json).</summary>
    public static IReadOnlyDictionary<string, string> StyleColors => _styleColors ??= ReadColors();

    /// <summary>Gives a style a colour (null: back to its own). <paramref name="save"/> false only shows it (the picker being dragged).</summary>
    public static void SetStyleColor(string style, string? hex, bool save = true)
    {
        var colors = new Dictionary<string, string>(StyleColors);
        if (hex == null) colors.Remove(style); else colors[style] = hex.ToLowerInvariant();
        _styleColors = colors;
        if (save) Save();
    }

    private static Dictionary<string, string> ReadColors()
    {
        var colors = new Dictionary<string, string>();
        try
        {
            if (!File.Exists(FilePath)) return colors;
            using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
            if (doc.RootElement.TryGetProperty("styleColors", out var c) && c.ValueKind == JsonValueKind.Object)
                foreach (var p in c.EnumerateObject())
                    if (p.Value.ValueKind == JsonValueKind.String && p.Value.GetString() is { Length: 7 } hex && hex[0] == '#') colors[p.Name] = hex.ToLowerInvariant();
        }
        catch (Exception) { /* a broken file is no colours */ }
        return colors;
    }

    private static System.Text.Json.Nodes.JsonObject? TryParse(string text)
    {
        try { return System.Text.Json.Nodes.JsonNode.Parse(text) as System.Text.Json.Nodes.JsonObject; } catch (Exception) { return null; }
    }

    private static int ReadInt(string key, int fallback)
    {
        try
        {
            if (!File.Exists(FilePath)) return fallback;
            using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
            return doc.RootElement.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? Math.Clamp(n, FpsLowest, FpsHighest) : fallback;
        }
        catch (Exception) { return fallback; }
    }

    private static string? ReadString(string key)
    {
        try
        {
            if (!File.Exists(FilePath)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(FilePath));
            return doc.RootElement.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        }
        catch (Exception) { return null; }
    }

    private static void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            // keys this file does not own are kept (a test run shares one file with the engine's preferences)
            var root = (File.Exists(FilePath) ? TryParse(File.ReadAllText(FilePath)) : null) ?? new System.Text.Json.Nodes.JsonObject();
            var mine = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(new
            {
                splash = Splash, retired = Retired.ToArray(), style = Style, packAccent = PackAccent,
                fpsMin = FpsMin, fpsMax = FpsMax, fpsFixed = FpsFixed, styleColors = StyleColors, debug = Debug.ToArray()
            }))!.AsObject();
            foreach (var (key, value) in mine.ToList()) { mine.Remove(key); root[key] = value; }
            File.WriteAllText(FilePath, root.ToJsonString());
        }
        catch (Exception) { /* not saved: it lasts until the launcher closes */ }
    }
}
