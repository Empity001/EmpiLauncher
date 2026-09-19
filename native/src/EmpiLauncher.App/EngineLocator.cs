using System.IO;
using System.Runtime.InteropServices;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App;

internal static class NativeMethods
{
    [DllImport("psapi.dll")] internal static extern bool EmptyWorkingSet(nint process);
}

/// <summary>
/// Finds the engine (engine/src/main.js) and a runtime to run it, for development from the repository and, later, an installed layout.
/// Environment overrides: EMPI_ENGINE_MAIN, EMPI_ENGINE_RUNTIME, EMPI_USER_DATA (use "shared" for the classic launcher's data).
/// Until the native launcher is the real one, it works on its own data folder so it cannot disturb the classic launcher's config.
/// </summary>
internal static class EngineLocator
{
    public static EngineHostOptions Resolve()
    {
        var main = Environment.GetEnvironmentVariable("EMPI_ENGINE_MAIN") ?? FindUp("engine", "src", "main.js")
            ?? throw new FileNotFoundException("engine/src/main.js not found (set EMPI_ENGINE_MAIN)");

        var runtime = Environment.GetEnvironmentVariable("EMPI_ENGINE_RUNTIME");
        var electronAsNode = false;
        if (runtime == null)
        {
            var electron = FindUp("node_modules", "electron", "dist", "electron.exe");
            var onPath = FindOnPath("node.exe");
            if (onPath != null) runtime = onPath;
            else if (electron != null) { runtime = electron; electronAsNode = true; }
            else throw new FileNotFoundException("no Node runtime found (install Node or set EMPI_ENGINE_RUNTIME)");
        }
        else electronAsNode = Path.GetFileName(runtime).Equals("electron.exe", StringComparison.OrdinalIgnoreCase);

        // "shared" = the classic launcher's real config, accounts AND game installation (what the released native launcher will use).
        // Anything else is an isolated sandbox, game files included: a development build must never repair or launch the real install.
        var data = Environment.GetEnvironmentVariable("EMPI_USER_DATA");
        var shared = data == "shared";
        var sandbox = data is null or "shared" ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EmpiLauncher.Native", "dev-userdata") : data;
        string? userData = shared ? null : sandbox;
        string? dataDir = shared ? null : Path.Combine(sandbox, "data");
        if (userData != null) Directory.CreateDirectory(userData);
        var electronPath = FindUp("node_modules", "electron", "dist", "electron.exe");
        return new EngineHostOptions(runtime, main, electronAsNode, userData, "0.0.0-native-dev", dataDir, electronPath);
    }

    private static string? FindUp(params string[] parts)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        {
            var candidate = Path.Combine(new[] { dir.FullName }.Concat(parts).ToArray());
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static string? FindOnPath(string exe) =>
        (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => { try { return Path.Combine(p.Trim(), exe); } catch { return null; } })
            .FirstOrDefault(p => p != null && File.Exists(p));
}
