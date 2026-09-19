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
    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EmpiLauncher.Native", "ui.json");

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
        set
        {
            _splash = value;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
                File.WriteAllText(FilePath, JsonSerializer.Serialize(new { splash = value }));
            }
            catch (Exception) { /* not saved: it lasts until the launcher closes */ }
        }
    }
}
