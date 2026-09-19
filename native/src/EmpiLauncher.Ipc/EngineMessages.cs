using System.Text.Json;
using System.Text.Json.Serialization;

namespace EmpiLauncher.Ipc;

/// <summary>What the engine answers with when a request fails: a stable machine code and a message meant for people.</summary>
public sealed class EngineException : Exception
{
    public string Code { get; }
    /// <summary>A short heading for errors the player should read (sign-in failures); null for the rest.</summary>
    public string? Title { get; }
    public EngineException(string code, string message, string? title = null) : base(message) { Code = code; Title = title; }
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

/// <summary>
/// ExpiresAt is a Unix time in milliseconds (a number in the engine's answer, not text). Type is "microsoft", "mojang" or "offline";
/// an offline player (no account, just a name) also carries its 12-digit OfflineId.
/// </summary>
public sealed record AccountSummary(string Uuid, string DisplayName, string? Username, string Type, double? ExpiresAt, string? OfflineId = null);

/// <summary>What a name would become as an offline player (offline.preview); Reason says why not when Valid is false.</summary>
public sealed record OfflinePreview(bool Valid, string? Reason, string Name, string? Id, string? Uuid);

public sealed record AccountList(string? Selected, List<AccountSummary> Accounts);

public sealed record ConfigResult(Dictionary<string, JsonElement> Settings, bool FirstLaunch, string LauncherDirectory, string CommonDirectory, string InstanceDirectory, AccountList Accounts, string? AppVersion = null);

public sealed record EngineMemory(double RssMB, double HeapUsedMB, double ExternalMB);

// ---- Play / update / restore ----

/// <summary>What the launch button should offer for a modpack: "play", "update" or "restore".</summary>
public sealed record PackStatus(
    string ServerId, bool Installed, string? InstalledVersion, string RemoteVersion,
    bool NeedsUpdate, bool Modified, List<JsonElement> Differences, string Action);

public sealed record GameStatus(string Phase, string? Mode, string? ServerId, int? Pid);

/// <summary>Started = false with Reason "modified" means the protected folders changed and the pack must be restored first.</summary>
public sealed record GameStartResult(bool Started, string? Mode, string? Reason);

public sealed record GameFailure(string Code, string Title, string Message);

public sealed record NeedJava(string ServerId, int SuggestedMajor, string? Distribution);

public sealed record GameExit(int? Code, string? Signal, bool Stopped);

// ---- Settings ----

public sealed record SystemMemory(double TotalGB, double FreeGB);

public sealed record JavaSettings(
    string ServerId, double MinRAMGb, double MaxRAMGb, double AbsoluteMinGb, double AbsoluteMaxGb,
    double TotalGB, double FreeGB, string JavaExecutable, List<string> JvmOptions, int SuggestedMajor, string Supported);

public sealed record JavaDetails(bool Valid, string? Version, string? Vendor, string Path);

public sealed record ModNode(string Id, List<string> Path, string Name, string Version, bool Required, bool Enabled, List<ModNode> Children);

public sealed record DropinMod(string FullName, string Name, string Ext, bool Disabled);

public sealed record DropinInfo(string Dir, List<DropinMod> Mods);

public sealed record ShaderPack(string FullName, string Name);

public sealed record ShaderInfo(string Dir, List<ShaderPack> Packs, string Selected);

public sealed record ModsList(string ServerId, List<ModNode> Required, List<ModNode> Optional, DropinInfo Dropins, ShaderInfo Shaders);

public sealed record ThemeResult(string Source, JsonElement? Theme);

public sealed record ValidResult(bool Valid);

/// <summary>Small still images of a modpack's art (cached by the engine); null where there is none or it is too big to fetch.</summary>
public sealed record ArtResult(string ServerId, string? Banner, string? Background);

/// <summary>Preferences only the native interface has. FieldMode: auto | always | off.</summary>
public sealed record UiPrefs(string FieldMode);

/// <summary>Answer of update.check. Reason is set when nothing is offered: no_channel (nothing published), bad_channel, offline.</summary>
public sealed record UpdateInfo(bool Available, string? Current, string? Version, string? Installer, string? Sha512, long? Size, string? Page, string? Reason);

/// <summary>Answer of update.install: Launched is true when the installer was started and the launcher should close.</summary>
public sealed record UpdateInstallResult(bool Launched, string? File, string? Version);

public sealed record PlayerCount(int Online, int Max);

public sealed record ServerStatus(bool Online, PlayerCount? Players);

public sealed record PathResult(string Path);

public sealed record DirResult(string Dir);

/// <summary>Valid = false with Removed set means the saved session could not be renewed and the account was taken off the list.</summary>
public sealed record ValidateResult(bool Valid, bool? None, string? Removed, AccountList? Accounts);
