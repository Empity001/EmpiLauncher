using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace EmpiLauncher.Ipc;

/// <summary>
/// The UI's side of the engine pipe: newline-delimited JSON over a Windows named pipe.
/// Requests carry an id and are answered with the same id; anything without an id is an event pushed by the engine.
/// The UI never needs to know how helios-core works: it asks for an action, the engine does it and reports back.
/// </summary>
public sealed class EngineClient : IAsyncDisposable
{
    private readonly NamedPipeClientStream _pipe;
    private readonly StreamReader _reader;
    private readonly StreamWriter _writer;
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly CancellationTokenSource _stop = new();
    private long _nextId;

    /// <summary>An event pushed by the engine, for example "game.progress". The callback may run on any thread.</summary>
    public event Action<string, JsonElement>? EventReceived;
    public event Action? Disconnected;

    private EngineClient(NamedPipeClientStream pipe)
    {
        _pipe = pipe;
        _reader = new StreamReader(pipe, new UTF8Encoding(false), false, 64 * 1024, leaveOpen: true);
        _writer = new StreamWriter(pipe, new UTF8Encoding(false), 64 * 1024, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
    }

    public static async Task<EngineClient> ConnectAsync(string pipeName, string token, CancellationToken ct = default)
    {
        var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
        await pipe.ConnectAsync(5000, ct).ConfigureAwait(false);
        var client = new EngineClient(pipe);
        _ = Task.Run(client.ReadLoopAsync);
        await client.CallAsync("engine.hello", new { token, client = "EmpiLauncher.App" }, ct: ct).ConfigureAwait(false);
        return client;
    }

    private async Task ReadLoopAsync()
    {
        try
        {
            while (!_stop.IsCancellationRequested)
            {
                var line = await _reader.ReadLineAsync(_stop.Token).ConfigureAwait(false);
                if (line == null) break;
                if (line.Length == 0) continue;
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                if (root.TryGetProperty("id", out var idElement) && idElement.ValueKind == JsonValueKind.Number)
                {
                    if (!_pending.TryRemove(idElement.GetInt64(), out var waiter)) continue;
                    if (root.TryGetProperty("ok", out var ok) && ok.GetBoolean())
                    {
                        waiter.TrySetResult(root.TryGetProperty("result", out var result) ? result.Clone() : default);
                    }
                    else
                    {
                        var error = root.GetProperty("error");
                        waiter.TrySetException(new EngineException(
                            error.TryGetProperty("code", out var code) ? code.GetString() ?? "error" : "error",
                            error.TryGetProperty("message", out var message) ? message.GetString() ?? "" : ""));
                    }
                }
                else if (root.TryGetProperty("event", out var name))
                {
                    var data = root.TryGetProperty("data", out var d) ? d.Clone() : default;
                    EventReceived?.Invoke(name.GetString() ?? "", data);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (IOException) { }
        finally
        {
            foreach (var waiter in _pending.Values) waiter.TrySetException(new EngineException("disconnected", "the engine closed the connection"));
            _pending.Clear();
            Disconnected?.Invoke();
        }
    }

    /// <summary>Calls an engine method and returns the raw JSON result.</summary>
    public async Task<JsonElement> CallAsync(string method, object? parameters = null, TimeSpan? timeout = null, CancellationToken ct = default)
    {
        var id = Interlocked.Increment(ref _nextId);
        var waiter = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = waiter;
        var payload = JsonSerializer.Serialize(new { id, method, @params = parameters ?? new { } }, Json.Options);
        await _writeLock.WaitAsync(ct).ConfigureAwait(false);
        try { await _writer.WriteLineAsync(payload.AsMemory(), ct).ConfigureAwait(false); }
        finally { _writeLock.Release(); }

        using var timer = new CancellationTokenSource(timeout ?? TimeSpan.FromMinutes(2));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(timer.Token, ct);
        using (linked.Token.Register(() => { if (_pending.TryRemove(id, out var w)) w.TrySetCanceled(); }))
        {
            return await waiter.Task.ConfigureAwait(false);
        }
    }

    /// <summary>Calls an engine method and deserializes the result into <typeparamref name="T"/>.</summary>
    public async Task<T> CallAsync<T>(string method, object? parameters = null, TimeSpan? timeout = null, CancellationToken ct = default)
    {
        var result = await CallAsync(method, parameters, timeout, ct).ConfigureAwait(false);
        return result.Deserialize<T>(Json.Options)!;
    }

    public ValueTask DisposeAsync()
    {
        _stop.Cancel();
        try { _pipe.Dispose(); } catch { }
        return ValueTask.CompletedTask;
    }
}
