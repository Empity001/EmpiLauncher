using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace EmpiLauncher.Ipc;

public sealed record EngineHostOptions(
    string RuntimePath,          // node.exe, or electron.exe with ElectronAsNode = true
    string EntryScript,          // engine/src/main.js
    bool ElectronAsNode = false,
    string? UserDataDir = null,  // the classic launcher's data folder (the engine defaults to %APPDATA%\Empi Launcher)
    string? AppVersion = null);

/// <summary>
/// Starts the engine (Node, no Chromium), waits until it is listening, connects, and can trim its memory when everything is idle.
/// The engine follows the UI: when the pipe closes it exits by itself.
/// </summary>
public sealed class EngineHost : IAsyncDisposable
{
    [DllImport("psapi.dll")] private static extern bool EmptyWorkingSet(nint process);

    public Process Process { get; }
    public EngineClient Client { get; }
    public string PipeName { get; }

    private EngineHost(Process process, EngineClient client, string pipeName) { Process = process; Client = client; PipeName = pipeName; }

    public static async Task<EngineHost> StartAsync(EngineHostOptions options, CancellationToken ct = default)
    {
        var pipe = $"empi-engine-{Environment.ProcessId}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant()}";
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

        var info = new ProcessStartInfo(options.RuntimePath)
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        info.ArgumentList.Add(options.EntryScript);
        info.ArgumentList.Add("--pipe"); info.ArgumentList.Add(pipe);
        info.ArgumentList.Add("--token"); info.ArgumentList.Add(token);
        if (options.UserDataDir != null) { info.ArgumentList.Add("--user-data"); info.ArgumentList.Add(options.UserDataDir); }
        if (options.AppVersion != null) { info.ArgumentList.Add("--app-version"); info.ArgumentList.Add(options.AppVersion); }
        if (options.ElectronAsNode) info.Environment["ELECTRON_RUN_AS_NODE"] = "1";

        var process = Process.Start(info) ?? throw new InvalidOperationException("could not start the engine");
        var ready = new TaskCompletionSource();
        process.OutputDataReceived += (_, e) => { if (e.Data != null && e.Data.StartsWith("ENGINE_READY")) ready.TrySetResult(); };
        process.ErrorDataReceived += (_, e) => { if (e.Data != null && e.Data.StartsWith("ENGINE_FAILED")) ready.TrySetException(new InvalidOperationException(e.Data)); };
        process.EnableRaisingEvents = true;
        process.Exited += (_, _) => ready.TrySetException(new InvalidOperationException("the engine exited before it was ready"));
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        using (timeout.Token.Register(() => ready.TrySetCanceled()))
        {
            await ready.Task.ConfigureAwait(false);
        }

        var client = await EngineClient.ConnectAsync(pipe, token, ct).ConfigureAwait(false);
        return new EngineHost(process, client, pipe);
    }

    /// <summary>Gives back the pages the engine touched while it worked; they are paged in again if it is needed.</summary>
    public void Trim()
    {
        try { if (!Process.HasExited) EmptyWorkingSet(Process.Handle); } catch { }
    }

    public async ValueTask DisposeAsync()
    {
        try { await Client.CallAsync("engine.shutdown", timeout: TimeSpan.FromSeconds(2)).ConfigureAwait(false); } catch { }
        await Client.DisposeAsync().ConfigureAwait(false);
        try { if (!Process.WaitForExit(1500)) Process.Kill(true); } catch { }
    }
}
