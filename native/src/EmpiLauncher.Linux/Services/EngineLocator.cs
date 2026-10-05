using EmpiLauncher.Ipc;

namespace EmpiLauncher.Linux.Services;

/// <summary>
/// Finds the engine (engine/src/main.js) and a runtime to run it.
///
/// Installed: the AppImage / package carries "engine/" next to the program and the Electron of the repository's runtime ("runtime/electron"),
/// which also opens the Microsoft sign-in window when it is needed. Development (from the repository): Node from PATH and the repository's Electron.
/// The data is the classic launcher's (~/.config/Empi Launcher and ~/.EmpiLauncher), so accounts, settings and game files are shared with it.
///
/// Overrides: EMPI_ENGINE_MAIN, EMPI_ENGINE_RUNTIME, EMPI_ELECTRON, EMPI_USER_DATA ("shared" = the real data; any other value = that folder as a sandbox).
/// </summary>
internal static class EngineLocator
{
    public static EngineHostOptions Resolve()
    {
        var main = Environment.GetEnvironmentVariable("EMPI_ENGINE_MAIN") ?? FindUp(File.Exists, "engine", "src", "main.js")
            ?? throw new FileNotFoundException("engine/src/main.js not found (set EMPI_ENGINE_MAIN)");

        var bundledElectron = Path.Combine(AppContext.BaseDirectory, "runtime", "electron");
        var electron = Environment.GetEnvironmentVariable("EMPI_ELECTRON")
            ?? (File.Exists(bundledElectron) ? bundledElectron : FindUp(File.Exists, "node_modules", "electron", "dist", "electron"));
        var installed = File.Exists(bundledElectron);

        var bundledNode = Path.Combine(AppContext.BaseDirectory, "runtime-node", "node");
        var runtime = Environment.GetEnvironmentVariable("EMPI_ENGINE_RUNTIME");
        var electronAsNode = false;
        // installed: the Node that came in the package (sharp crashes inside Electron-as-node on Linux)
        if (runtime == null && File.Exists(bundledNode)) runtime = bundledNode;
        if (runtime == null)
        {
            var node = installed ? null : FindOnPath("node");
            if (node != null) runtime = node;
            else if (electron != null) { runtime = electron; electronAsNode = true; }
            else throw new FileNotFoundException("no Node runtime found (install Node or set EMPI_ENGINE_RUNTIME)");
        }
        else electronAsNode = Path.GetFileName(runtime).Equals("electron", StringComparison.OrdinalIgnoreCase);

        var data = Environment.GetEnvironmentVariable("EMPI_USER_DATA");
        var shared = installed ? data is null or "shared" : data == "shared";
        var state = Environment.GetEnvironmentVariable("XDG_STATE_HOME") is { Length: > 0 } s ? s : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "state");
        var sandbox = data is null or "shared" ? Path.Combine(state, "empilauncher", "dev-userdata") : data;
        string? userData = shared ? null : sandbox;
        string? dataDir = shared ? null : Path.Combine(sandbox, "data");
        if (userData != null) Directory.CreateDirectory(userData);
        return new EngineHostOptions(runtime, main, electronAsNode, userData, installed ? InstalledVersion() : "0.0.0-linux-dev", dataDir, electron);
    }

    /// <summary>The version the build stamped on this program; the source-control suffix is dropped.</summary>
    private static string InstalledVersion()
    {
        var text = System.Reflection.Assembly.GetEntryAssembly()?.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
            .OfType<System.Reflection.AssemblyInformationalVersionAttribute>().FirstOrDefault()?.InformationalVersion;
        var plus = text?.IndexOf('+') ?? -1;
        return string.IsNullOrWhiteSpace(text) ? "0.0.0" : plus > 0 ? text![..plus] : text!;
    }

    private static string? FindUp(Func<string, bool> exists, params string[] parts)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        {
            var candidate = Path.Combine(new[] { dir.FullName }.Concat(parts).ToArray());
            if (exists(candidate)) return candidate;
        }
        return null;
    }

    private static string? FindOnPath(string exe) =>
        (Environment.GetEnvironmentVariable("PATH") ?? "").Split(':', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => Path.Combine(p, exe)).FirstOrDefault(File.Exists);
}
