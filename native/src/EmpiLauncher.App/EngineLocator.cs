using System.IO;
using System.Runtime.InteropServices;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App;

internal static class NativeMethods
{
    [DllImport("psapi.dll")] internal static extern bool EmptyWorkingSet(nint process);
}

/// <summary>
/// Finds the engine (engine/src/main.js) and a runtime to run it.
///
/// Installed (what the installer lays down): "runtime\electron.exe" sits next to the launcher. It runs the engine
/// (ELECTRON_RUN_AS_NODE) and, on demand, the Microsoft sign-in window; no Node has to be installed. The data is the
/// classic launcher's, shared, so accounts, settings and game files carry over, and the version is the real one.
///
/// Development (from the repository): Node from PATH or the repository's Electron, and an isolated sandbox folder,
/// game files included, so a development build can never repair or launch the real installation.
///
/// Environment overrides: EMPI_ENGINE_MAIN, EMPI_ENGINE_RUNTIME, EMPI_USER_DATA ("shared" = the real data; any other
/// value = that folder as a sandbox, also when installed).
/// </summary>
internal static class EngineLocator
{
    public static EngineHostOptions Resolve()
    {
        var main = Environment.GetEnvironmentVariable("EMPI_ENGINE_MAIN") ?? FindUp("engine", "src", "main.js")
            ?? throw new FileNotFoundException("engine/src/main.js not found (set EMPI_ENGINE_MAIN)");

        var bundled = Path.Combine(AppContext.BaseDirectory, "runtime", "electron.exe");
        var installed = File.Exists(bundled);

        var runtime = Environment.GetEnvironmentVariable("EMPI_ENGINE_RUNTIME");
        var electronAsNode = false;
        if (runtime == null)
        {
            var electron = installed ? bundled : FindUp("node_modules", "electron", "dist", "electron.exe");
            var onPath = installed ? null : FindOnPath("node.exe");
            if (onPath != null) runtime = onPath;
            else if (electron != null) { runtime = electron; electronAsNode = true; }
            else throw new FileNotFoundException("no Node runtime found (install Node or set EMPI_ENGINE_RUNTIME)");
        }
        else electronAsNode = Path.GetFileName(runtime).Equals("electron.exe", StringComparison.OrdinalIgnoreCase);

        var data = Environment.GetEnvironmentVariable("EMPI_USER_DATA");
        var shared = installed ? data is null or "shared" : data == "shared";
        var sandbox = data is null or "shared" ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EmpiLauncher.Native", "dev-userdata") : data;
        string? userData = shared ? null : sandbox;
        string? dataDir = shared ? null : Path.Combine(sandbox, "data");
        if (userData != null) Directory.CreateDirectory(userData);
        var electronPath = installed ? bundled : FindUp("node_modules", "electron", "dist", "electron.exe");
        return new EngineHostOptions(runtime, main, electronAsNode, userData, installed ? InstalledVersion() : "0.0.0-native-dev", dataDir, electronPath);
    }

    /// <summary>The version the build stamped on this program (build.mjs passes it to dotnet publish); the source-control suffix is dropped.</summary>
    private static string InstalledVersion()
    {
        var text = System.Reflection.Assembly.GetEntryAssembly()?.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
            .OfType<System.Reflection.AssemblyInformationalVersionAttribute>().FirstOrDefault()?.InformationalVersion;
        var plus = text?.IndexOf('+') ?? -1;
        return string.IsNullOrWhiteSpace(text) ? "0.0.0" : plus > 0 ? text![..plus] : text!;
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
