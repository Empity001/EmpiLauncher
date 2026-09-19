using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Services;

/// <summary>What the launch button and the progress area show. Fed by the engine's game.* events, read by the views.</summary>
public sealed class GameSession
{
    public string Phase { get; private set; } = "idle";     // idle | launching | updating | restoring | running | stopping
    public string? Mode { get; private set; }
    public string? Stage { get; private set; }
    public string Text { get; private set; } = "";
    public int Percent { get; private set; }
    public double? Received { get; private set; }
    public double? Total { get; private set; }
    public double? BytesPerSecond { get; private set; }
    public int? PendingFiles { get; private set; }

    public bool Busy => Phase is "launching" or "updating" or "restoring" or "stopping";
    public bool Running => Phase == "running";

    internal void ApplyState(JsonElement data)
    {
        Phase = data.GetProperty("phase").GetString() ?? "idle";
        Mode = data.TryGetProperty("mode", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null;
        if (Phase is "idle" or "running")
        {
            Stage = null; Text = ""; Percent = 0; Received = Total = BytesPerSecond = null; PendingFiles = null;
        }
    }

    /// <summary>The engine sends only the fields that changed; an explicit null clears one.</summary>
    internal void ApplyProgress(JsonElement data)
    {
        if (data.TryGetProperty("stage", out var stage) && stage.ValueKind == JsonValueKind.String) Stage = stage.GetString();
        if (data.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String) Text = text.GetString() ?? "";
        if (data.TryGetProperty("percent", out var percent) && percent.ValueKind == JsonValueKind.Number) Percent = percent.GetInt32();
        if (data.TryGetProperty("received", out var r)) Received = r.ValueKind == JsonValueKind.Number ? r.GetDouble() : null;
        if (data.TryGetProperty("total", out var t)) Total = t.ValueKind == JsonValueKind.Number ? t.GetDouble() : null;
        if (data.TryGetProperty("bytesPerSecond", out var b)) BytesPerSecond = b.ValueKind == JsonValueKind.Number ? b.GetDouble() : null;
        if (data.TryGetProperty("pendingFiles", out var p)) PendingFiles = p.ValueKind == JsonValueKind.Number ? p.GetInt32() : null;
    }
}

/// <summary>
/// The UI's single view of the launcher: owns the engine, keeps the modpack list, the selection, the pack status and the
/// game session, and turns engine events into UI-thread notifications. The views never talk to the pipe directly.
/// </summary>
public sealed class Launcher : IAsyncDisposable
{
    public static Launcher Instance { get; } = new();

    private EngineHost? _host;
    public EngineClient Client => _host?.Client ?? throw new InvalidOperationException("the engine is not running");
    public bool Connected => _host != null;

    public ConfigResult? Config { get; private set; }
    public DistroResult? Distro { get; private set; }
    public string? SelectedId { get; private set; }
    public PackStatus? Pack { get; private set; }
    public GameSession Game { get; } = new();
    public Modpack? Selected => Distro?.Servers.FirstOrDefault(s => s.Id == SelectedId);
    public AccountSummary? Account => Config?.Accounts.Accounts.FirstOrDefault(a => a.Uuid == Config.Accounts.Selected);

    /// <summary>Anything about the modpacks, the selection or the accounts changed: views rebuild what they show.</summary>
    public event Action? Changed;
    /// <summary>The game session moved (phase, text, percent): cheap to handle, fires often while downloading.</summary>
    public event Action? GameChanged;
    public event Action<GameFailure>? Failure;
    public event Action<NeedJava>? JavaNeeded;
    public event Action<string>? EngineLost;
    public event Action<string>? Notice;

    private static void OnUi(Action action)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher == null) return;
        if (dispatcher.CheckAccess()) action(); else dispatcher.BeginInvoke(action);
    }

    public async Task StartAsync()
    {
        _host = await EngineHost.StartAsync(EngineLocator.Resolve());
        _host.Client.EventReceived += (name, data) => OnUi(() => HandleEvent(name, data));
        _host.Client.Disconnected += () => OnUi(() => { if (_host != null) { _host = null; EngineLost?.Invoke("El motor del launcher se cerró de forma inesperada."); } });

        Config = await Client.CallAsync<ConfigResult>("config.get");
        await ReloadDistroAsync();
        var status = await Client.CallAsync<GameStatus>("game.status");
        Game.ApplyState(JsonSerializer.SerializeToElement(new { phase = status.Phase, mode = status.Mode }));
        GameChanged?.Invoke();
        _ = RefreshStatusAsync();   // the home screen asked before the engine was up; ask again now
        try { Prefs = await Client.CallAsync<UiPrefs>("ui.get"); PrefsChanged?.Invoke(); } catch (EngineException) { }
        _ = LoadArtAsync();
    }

    public async Task ReloadDistroAsync(bool refresh = false)
    {
        Distro = await Client.CallAsync<DistroResult>("distro.load", new { refresh });
        SelectedId = Distro.SelectedServer;
        await ApplyThemeAsync();
        await RefreshPackAsync();
        Changed?.Invoke();
    }

    public async Task RefreshConfigAsync()
    {
        Config = await Client.CallAsync<ConfigResult>("config.get");
        Changed?.Invoke();
    }

    public async Task SelectAsync(string id)
    {
        if (id == SelectedId || Game.Busy || Game.Running) return;
        SelectedId = id;
        Pack = null;
        Status = null;
        Art = null;
        ArtChanged?.Invoke();
        Changed?.Invoke();
        await Client.CallAsync("distro.select", new { id });
        await ApplyThemeAsync();
        await RefreshPackAsync();
        Changed?.Invoke();
        _ = Quietly(() => Client.CallAsync("discord.navigation", new { id }));
        _ = RefreshStatusAsync();
        _ = LoadArtAsync();
    }

    public async Task RefreshPackAsync()
    {
        try { Pack = await Client.CallAsync<PackStatus>("pack.status"); }
        catch (EngineException) { Pack = null; }
    }

    // ---- modpack art and native preferences -----------------------------------------------------------------------

    public ArtResult? Art { get; private set; }
    public UiPrefs Prefs { get; private set; } = new("auto");
    public event Action? ArtChanged;
    public event Action? PrefsChanged;

    /// <summary>Banner and background of the selected modpack, as small still previews made by the engine (never the 278 MB originals).</summary>
    public async Task LoadArtAsync()
    {
        var id = SelectedId;
        try
        {
            var art = await Client.CallAsync<ArtResult>("art.get", new { id }, TimeSpan.FromSeconds(60));
            if (id != SelectedId) return;   // the player already moved to another modpack
            Art = art;
            ArtChanged?.Invoke();
        }
        catch (Exception) { }   // no art is a normal state: the plain interface still works
    }

    public async Task SetFieldModeAsync(string mode)
    {
        Prefs = await Client.CallAsync<UiPrefs>("ui.set", new { key = "fieldMode", value = mode });
        PrefsChanged?.Invoke();
    }

    public UpdateInfo? Update { get; private set; }

    /// <summary>Asks whether a newer native launcher is published. Quiet on failure: no network just means no news.</summary>
    public async Task CheckUpdateAsync()
    {
        try
        {
            var info = await Client.CallAsync<UpdateInfo>("update.check", timeout: TimeSpan.FromSeconds(30));
            Update = info.Available ? info : null;
            Changed?.Invoke();
        }
        catch (Exception) { }
    }

    /// <summary>Players online for the selected modpack; null until the first answer. Refreshed by the views only while they are visible.</summary>
    public ServerStatus? Status { get; private set; }

    public async Task RefreshStatusAsync()
    {
        var id = SelectedId;
        try
        {
            var status = await Client.CallAsync<ServerStatus>("server.status", new { id }, TimeSpan.FromSeconds(20));
            if (id == SelectedId) { Status = status; Changed?.Invoke(); }
        }
        catch (Exception) { }   // offline, cancelled or the engine is gone: the count simply stays unknown
    }

    /// <summary>For calls nobody waits for: a failure (engine closed, timeout) must never surface as an unobserved task error.</summary>
    private static async Task Quietly(Func<Task> action)
    {
        try { await action(); } catch (Exception) { }
    }

    // ---- accent ---------------------------------------------------------------------------------------------------

    private async Task ApplyThemeAsync()
    {
        string? accent = Selected?.Accent;
        if (SelectedId != null)
        {
            try
            {
                var theme = await Client.CallAsync<ThemeResult>("distro.theme", new { id = SelectedId });
                if (theme.Theme is { ValueKind: JsonValueKind.Object } t && t.TryGetProperty("accent", out var a) && a.ValueKind == JsonValueKind.String)
                    accent = a.GetString();
            }
            catch (EngineException) { }
        }
        ApplyAccent(accent);
    }

    /// <summary>The one colour of the interface: the modpack's accent, electric pink when it sets none.</summary>
    public static void ApplyAccent(string? hex)
    {
        Color color;
        try { color = (Color)ColorConverter.ConvertFromString(string.IsNullOrWhiteSpace(hex) ? "#ff3d8b" : hex); }
        catch { color = Color.FromRgb(0xff, 0x3d, 0x8b); }

        // Readable ink: whichever of the two inks has the higher WCAG contrast against the accent.
        static double Lin(byte c) { var v = c / 255.0; return v <= 0.03928 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4); }
        static double Lum(Color c) => 0.2126 * Lin(c.R) + 0.7152 * Lin(c.G) + 0.0722 * Lin(c.B);
        var dark = Color.FromRgb(0x05, 0x05, 0x06);
        var paper = Color.FromRgb(0xf1, 0xef, 0xe8);
        var lum = Lum(color);
        var ink = (lum + 0.05) / (Lum(dark) + 0.05) >= (Lum(paper) + 0.05) / (lum + 0.05) ? dark : paper;

        static SolidColorBrush Frozen(Color c) { var b = new SolidColorBrush(c); b.Freeze(); return b; }
        var res = Application.Current.Resources;
        res["AccentBrush"] = Frozen(color);
        res["AccentInkBrush"] = Frozen(ink);
        res["AccentSoftBrush"] = Frozen(Color.FromArgb(0x29, color.R, color.G, color.B));
    }

    // ---- accounts -------------------------------------------------------------------------------------------------

    /// <summary>The sign-in window is open (true) or gone (false): the UI shows a waiting message with a cancel button.</summary>
    public event Action<bool, string>? AuthWindow;
    public bool AuthBusy { get; private set; }

    /// <summary>Opens the Microsoft window, waits for it, and signs the account in. Tokens stay inside the engine.</summary>
    public async Task<bool> LoginAsync()
    {
        if (AuthBusy) return false;
        AuthBusy = true;
        AuthWindow?.Invoke(true, "Termina de iniciar sesión en la ventana de Microsoft. Cuando acabes, esta pantalla continúa sola.");
        try
        {
            await Client.CallAsync<AccountList>("auth.microsoft.login", timeout: TimeSpan.FromMinutes(11));
            await RefreshConfigAsync();
            Notice?.Invoke($"Sesión iniciada como {Account?.DisplayName}.");
            return true;
        }
        catch (EngineException ex) when (ex.Code == "cancelled") { return false; }
        catch (EngineException ex)
        {
            Failure?.Invoke(new GameFailure("auth", ex.Title ?? "Error al iniciar sesión", ex.Message));
            return false;
        }
        finally { AuthBusy = false; AuthWindow?.Invoke(false, ""); }
    }

    /// <summary>Signs an account out (Microsoft accounts also clear the browser session in the helper window).</summary>
    public async Task<bool> RemoveAccountAsync(string uuid)
    {
        if (AuthBusy) return false;
        AuthBusy = true;
        var microsoft = Config?.Accounts.Accounts.FirstOrDefault(a => a.Uuid == uuid)?.Type == "microsoft";
        if (microsoft) AuthWindow?.Invoke(true, "Cierra sesión en la ventana de Microsoft. Se cerrará sola al terminar.");
        try
        {
            await Client.CallAsync<AccountList>("account.remove", new { uuid }, TimeSpan.FromMinutes(11));
            await RefreshConfigAsync();
            return true;
        }
        catch (EngineException ex) when (ex.Code == "cancelled") { return false; }
        catch (EngineException ex)
        {
            Failure?.Invoke(new GameFailure("auth", ex.Title ?? "No se pudo cerrar la sesión", ex.Message));
            return false;
        }
        finally { AuthBusy = false; if (microsoft) AuthWindow?.Invoke(false, ""); }
    }

    public Task CancelAuthAsync() => Client.CallAsync("auth.cancel");

    /// <summary>Renews the saved session at start-up. Returns the name of an account that had to be taken off the list, if any.</summary>
    public async Task<string?> ValidateSessionAsync()
    {
        if (Account == null) return null;
        try
        {
            var result = await Client.CallAsync<ValidateResult>("auth.validate", timeout: TimeSpan.FromMinutes(2));
            await RefreshConfigAsync();
            return result.Valid ? null : result.Removed;
        }
        catch (EngineException) { return null; }
    }

    // ---- Play -----------------------------------------------------------------------------------------------------

    /// <summary>What the main button does right now: sign in when there is no account, play/update/restore when idle, stop while the game runs.</summary>
    public async Task PrimaryActionAsync()
    {
        if (Game.Running) { await Client.CallAsync("game.stop"); return; }
        if (Game.Busy) return;
        if (Account == null) { await LoginAsync(); return; }
        try
        {
            var result = await Client.CallAsync<GameStartResult>("game.start", new { mode = "auto" });
            if (!result.Started && result.Reason == "modified")
            {
                await RefreshPackAsync();
                Changed?.Invoke();
                Notice?.Invoke("Se detectaron cambios en las carpetas protegidas del modpack. Pulsa Restaurar para volver a la versión original.");
            }
        }
        catch (EngineException ex) { Notice?.Invoke(ex.Message); }
    }

    public Task InstallJavaAsync() => Client.CallAsync("java.install");
    public Task DismissJavaAsync() => Client.CallAsync("java.dismiss");

    // ---- events ---------------------------------------------------------------------------------------------------

    private void HandleEvent(string name, JsonElement data)
    {
        switch (name)
        {
            case "game.state":
                Game.ApplyState(data);
                GameChanged?.Invoke();
                break;
            case "game.progress":
                Game.ApplyProgress(data);
                GameChanged?.Invoke();
                break;
            case "game.failure":
                Failure?.Invoke(data.Deserialize<GameFailure>(Json.Options)!);
                break;
            case "game.needJava":
                JavaNeeded?.Invoke(data.Deserialize<NeedJava>(Json.Options)!);
                break;
            case "game.notice":
                Notice?.Invoke(data.GetProperty("text").GetString() ?? "");
                break;
            case "pack.status":
                Pack = data.Deserialize<PackStatus>(Json.Options);
                Changed?.Invoke();
                break;
            case "distro.refreshed":
                Distro = data.Deserialize<DistroResult>(Json.Options);
                Changed?.Invoke();
                break;
            case "config.changed":
                _ = RefreshConfigAsync();
                break;
        }
    }

    public void TrimMemory() => _host?.Trim();

    /// <summary>For views that need to tell the player something short without owning the toast.</summary>
    public void RaiseNotice(string text) => Notice?.Invoke(text);

    public async ValueTask DisposeAsync()
    {
        var host = _host;
        _host = null;
        if (host != null) await host.DisposeAsync();
    }
}
