using System.IO;
using System.Text.Json;

namespace EmpiLauncher.App.Services;

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
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EmpiLauncher.Native", "ui.json");

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

    private static void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(new { splash = Splash, retired = Retired.ToArray() }));
        }
        catch (Exception) { /* not saved: it lasts until the launcher closes */ }
    }
}
