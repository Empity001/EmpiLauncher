using System.Text.Json;
using System.Text.Json.Serialization;

namespace EmpiLauncher.Ipc;

/// <summary>What the engine answers with when a request fails: a stable machine code and a message meant for people.</summary>
public sealed class EngineException : Exception
{
    public string Code { get; }
    public EngineException(string code, string message) : base(message) => Code = code;
}

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };
}

// ---- contracts the UI relies on (docs/native/PROTOCOL.md is the source of truth) ----

public sealed record Visual(string? Path, string? Url, string? Local, long? Size, string? Md5);

public sealed record Visuals(Visual? Banner, Visual? Background, Visual? BannerPreview, Visual? BackgroundPreview, Visual? Theme);

public sealed record Modpack(
    string Id, string Name, string Description, string? Icon, string MinecraftVersion, string Version,
    bool MainServer, bool Whitelist, string? Address, string? Accent, Visuals Visuals);

public sealed record DistroResult(long TookMs, string SelectedServer, string MainServer, List<Modpack> Servers);

public sealed record AccountSummary(string Uuid, string DisplayName, string? Username, string Type, string? ExpiresAt);

public sealed record AccountList(string? Selected, List<AccountSummary> Accounts);

public sealed record ConfigResult(Dictionary<string, JsonElement> Settings, bool FirstLaunch, string LauncherDirectory, string CommonDirectory, string InstanceDirectory, AccountList Accounts);

public sealed record EngineMemory(double RssMB, double HeapUsedMB, double ExternalMB);
