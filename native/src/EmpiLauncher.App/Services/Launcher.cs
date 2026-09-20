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
        _ = RefreshNoticesAsync();
        try { Prefs = await Client.CallAsync<UiPrefs>("ui.get"); PrefsChanged?.Invoke(); } catch (EngineException) { }
        _ = LoadArtAsync();
    }

    public async Task ReloadDistroAsync(bool refresh = false)
    {
        Distro = await Client.CallAsync<DistroResult>("distro.load", new { refresh });
        SelectedId = Distro.SelectedServer;
        if (Selected is { ProfileOf: { } owner }) _lastProfile[owner] = SelectedId;
        await ApplyThemeAsync();
        await RefreshPackAsync();
        Changed?.Invoke();
    }

    public async Task RefreshConfigAsync()
    {
        Config = await Client.CallAsync<ConfigResult>("config.get");
        Changed?.Invoke();
        if (Notices != null) _ = RefreshNoticesAsync(network: false);   // who plays decides who a maintenance lets in
    }

    /// <summary>
    /// The modpack the screen is about: the one picked in the list. When what plays is one of its profiles (another modpack of the index that
    /// is shown inside it) that is the host, and the profile is what Selected is.
    /// </summary>
    public Modpack? Host => Selected is { ProfileOf: { } hostId } ? Distro?.Servers.FirstOrDefault(s => s.Id == hostId) ?? Selected : Selected;
    public string? HostId => Host?.Id;

    // the profile last played of each modpack that has profiles, so choosing that modpack in the list brings the same one back
    private readonly Dictionary<string, string> _lastProfile = [];

    /// <summary>The modpack that plays when this one is picked in the list: the profile last played if it has profiles, itself otherwise.</summary>
    public string PlayingIn(string hostId)
    {
        if (HostId == hostId && SelectedId != null) return SelectedId;
        return _lastProfile.TryGetValue(hostId, out var last) && Distro?.Servers.Any(s => s.Id == last && s.ProfileOf == hostId) == true ? last : hostId;
    }

    public async Task SelectAsync(string id)
    {
        var target = PlayingIn(id);
        if (target == SelectedId || Game.Busy || Game.Running) return;
        await SwitchAsync(target);
    }

    /// <summary>Plays another profile of the modpack that is shown. A profile is another modpack of the index, so this is choosing it.</summary>
    public async Task ChooseProfileAsync(string profileId)
    {
        if (profileId == SelectedId) return;
        if (Game.Busy || Game.Running) { Notice?.Invoke("Termina o detén lo que está en marcha antes de cambiar de perfil."); return; }
        await SwitchAsync(profileId);
        var name = Host?.Profiles?.List.FirstOrDefault(p => p.Id == profileId)?.Name;
        if (name != null) Notice?.Invoke($"Perfil {name}.");
    }

    private async Task SwitchAsync(string id)
    {
        var before = HostId;
        SelectedId = id;
        if (Selected is { ProfileOf: { } owner }) _lastProfile[owner] = id; else _lastProfile.Remove(id);
        var another = HostId != before;   // another modpack of the list, not another profile of the same one: its look changes, a profile's does not
        Pack = null;
        Status = null;
        if (another) { Art = null; ArtChanged?.Invoke(); }
        Changed?.Invoke();
        await Client.CallAsync("distro.select", new { id });
        if (another) await ApplyThemeAsync();
        await RefreshPackAsync();
        Changed?.Invoke();
        _ = Quietly(() => Client.CallAsync("discord.navigation", new { id }));
        _ = RefreshStatusAsync();
        if (another) _ = LoadArtAsync();
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
        var id = HostId;   // a profile is shown with the look of the modpack it is inside
        try
        {
            var art = await Client.CallAsync<ArtResult>("art.get", new { id }, TimeSpan.FromSeconds(60));
            if (id != HostId) return;   // the player already moved to another modpack
            Art = art;
            ArtChanged?.Invoke();
        }
        catch (Exception) { }   // no art is a normal state: the plain interface still works
    }

    /// <summary>Shows a dot colour right away (while it is being dragged in the picker) without saving it; SetDotColorAsync saves.</summary>
    public void PreviewDotColor(string hex)
    {
        Prefs = Prefs with { DotColor = hex };
        PrefsChanged?.Invoke();
    }

    public async Task SetDotColorAsync(string hex)
    {
        Prefs = await Client.CallAsync<UiPrefs>("ui.set", new { key = "dotColor", value = hex });
        PrefsChanged?.Invoke();
    }

    /// <summary>Shows a background opacity right away (while the slider is dragged) without saving it; SetDotOpacityAsync saves.</summary>
    public void PreviewDotOpacity(double opacity)
    {
        Prefs = Prefs with { DotOpacity = opacity };
        PrefsChanged?.Invoke();
    }

    public async Task SetDotOpacityAsync(double opacity)
    {
        Prefs = await Client.CallAsync<UiPrefs>("ui.set", new { key = "dotOpacity", value = Math.Round(Math.Clamp(opacity, 0.1, 1), 2) });
        PrefsChanged?.Invoke();
    }

    public async Task SetFieldModeAsync(string mode)
    {
        Prefs = await Client.CallAsync<UiPrefs>("ui.set", new { key = "fieldMode", value = mode });
        FieldGovernor.ResetYield();   // picking a mode again is an explicit "try it"
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

    /// <summary>Received and total bytes of the installer being downloaded (total 0 when unknown).</summary>
    public event Action<long, long>? UpdateProgress;

    /// <summary>Downloads the new installer, checks it and starts it; true means it is running and this launcher must close now.</summary>
    public async Task<bool> InstallUpdateAsync()
    {
        var result = await Client.CallAsync<UpdateInstallResult>("update.install", timeout: TimeSpan.FromMinutes(30));
        return result.Launched;
    }

    public Task CancelUpdateAsync() => Quietly(() => Client.CallAsync("update.cancel"));

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
        string? accent = Host?.Accent;
        if (HostId != null)
        {
            try
            {
                var theme = await Client.CallAsync<ThemeResult>("distro.theme", new { id = HostId });
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
        try
        {
            ShowAuthWindow(true, "Termina de iniciar sesión en la ventana de Microsoft. Cuando acabes, esta pantalla continúa sola.");
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
        finally { AuthBusy = false; ShowAuthWindow(false, ""); }
    }

    /// <summary>
    /// Tells the interface a sign-in or sign-out window is (no longer) open. Whatever the interface does with it (a dialog, a picture)
    /// can fail, and that must never leave the launcher believing a sign-in is still in progress: while AuthBusy is set every later
    /// attempt is silently refused, which is exactly how "I cannot sign out or add an account" looks.
    /// </summary>
    private void ShowAuthWindow(bool open, string text)
    {
        try { AuthWindow?.Invoke(open, text); }
        catch (Exception ex) { App.Log("auth window", ex); }
    }

    /// <summary>True while nobody is signed in: the launcher shows the sign-in screen, whatever accounts are saved.</summary>
    public bool SignedOut => Config != null && Account == null;

    /// <summary>A quick switch: from now on this saved account plays. Nothing is asked and nothing is deleted.</summary>
    public async Task UseAccountAsync(string uuid)
    {
        if (AuthBusy) return;
        try
        {
            await Client.CallAsync<AccountList>("account.select", new { uuid });
            await RefreshConfigAsync();
        }
        catch (EngineException ex) { Failure?.Invoke(new GameFailure("auth", ex.Title ?? "No se pudo cambiar de cuenta", ex.Message)); }
    }

    /// <summary>
    /// "Cerrar sesión": nobody is signed in any more and the window takes the player to the sign-in screen. Every account stays saved (there,
    /// they can enter any of them, add another or delete one). It is refused while the game is starting or running, because the sign-in screen
    /// replaces the one with the button that stops it.
    /// </summary>
    public async Task<bool> SignOutAsync()
    {
        if (Game.Busy || Game.Running) { Notice?.Invoke("Cierra Minecraft (o espera a que termine) antes de cerrar sesión."); return false; }
        try
        {
            await Client.CallAsync<AccountList>("account.signout");
            await RefreshConfigAsync();
            return true;
        }
        catch (EngineException ex)
        {
            Failure?.Invoke(new GameFailure("auth", ex.Title ?? "No se pudo cerrar la sesión", ex.Message));
            return false;
        }
    }

    /// <summary>Deletes a saved account (Microsoft accounts also clear the browser session in the helper window). Only the sign-in screen offers it.</summary>
    public async Task<bool> RemoveAccountAsync(string uuid)
    {
        if (AuthBusy) return false;
        AuthBusy = true;
        var microsoft = Config?.Accounts.Accounts.FirstOrDefault(a => a.Uuid == uuid)?.Type == "microsoft";
        try
        {
            if (microsoft) ShowAuthWindow(true, "Elige tu cuenta en la ventana de Microsoft para cerrar su sesión. Se cierra sola al terminar; si la cierras tú, la cuenta también se quita de este launcher.");
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
        finally { AuthBusy = false; if (microsoft) ShowAuthWindow(false, ""); }
    }

    public Task CancelAuthAsync() => Client.CallAsync("auth.cancel");

    // ---- the skin of the offline player (a NameMC id; see engine/src/lib/skin.js) -----------------------------------------------

    public Task<SkinParse> ParseSkinAsync(string input) => Client.CallAsync<SkinParse>("skin.parse", new { input }, TimeSpan.FromSeconds(5));

    /// <summary>Downloads (once) and checks a skin and draws its preview. Throws EngineException with a sentence for the player.</summary>
    public Task<SkinPreview> FetchSkinAsync(string input) => Client.CallAsync<SkinPreview>("skin.fetch", new { input }, TimeSpan.FromSeconds(30));

    /// <summary>Makes it the skin of the offline player. Returns the reason it could not be, or null.</summary>
    public async Task<string?> ApplySkinAsync(string id)
    {
        try { await Client.CallAsync<AccountList>("skin.set", new { id }, TimeSpan.FromSeconds(90)); await RefreshConfigAsync(); return null; }
        catch (EngineException ex) { return ex.Message; }
    }

    public async Task ClearSkinAsync()
    {
        await Client.CallAsync<AccountList>("skin.clear");
        await RefreshConfigAsync();
    }

    /// <summary>The notes of every release newer than this launcher, newest first; empty when up to date or offline.</summary>
    public async Task<ChangelogResult> ChangelogAsync()
    {
        try { return await Client.CallAsync<ChangelogResult>("update.changelog", timeout: TimeSpan.FromSeconds(30)); }
        catch (Exception) { return new ChangelogResult(null, [], "offline"); }
    }

    /// <summary>True when the player in use has no account (only a name).</summary>
    public bool IsOffline => Account?.Type == "offline";

    /// <summary>What a name would become as an offline player: whether it is allowed, and its 12-digit id. The engine owns the rule.</summary>
    public async Task<OfflinePreview> PreviewOfflineAsync(string name)
    {
        try { return await Client.CallAsync<OfflinePreview>("offline.preview", new { name }, TimeSpan.FromSeconds(5)); }
        catch (Exception) { return new OfflinePreview(false, "No se pudo comprobar el nombre. Inténtalo de nuevo.", name, null, null); }
    }

    /// <summary>Plays without an account under this name (creating the offline player, or renaming it). Returns the reason it was refused, or null.</summary>
    public async Task<string?> UseOfflineAsync(string name)
    {
        try
        {
            await Client.CallAsync<AccountList>("offline.set", new { name }, TimeSpan.FromSeconds(10));
            await RefreshConfigAsync();
            Notice?.Invoke($"Jugarás sin conexión como {Account?.DisplayName}.");
            return null;
        }
        catch (EngineException ex) { return ex.Message; }
    }

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
        catch (EngineException ex) when (ex.Code == "blocked")
        {
            // the author closed this modpack (or this launcher is too old): the engine refused, and says why
            await RefreshNoticesAsync();
            Failure?.Invoke(new GameFailure("blocked", "No se puede jugar ahora", ex.Message));
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
            case "game.exit":
                if (data.Deserialize<GameExit>(Json.Options) is { Stopped: false, Code: not (null or 0) } exit) GameCrashed?.Invoke(exit);
                break;
            case "config.changed":
                _ = RefreshConfigAsync();
                break;
            case "update.progress":
                UpdateProgress?.Invoke(data.TryGetProperty("received", out var got) && got.ValueKind == JsonValueKind.Number ? got.GetInt64() : 0,
                    data.TryGetProperty("total", out var all) && all.ValueKind == JsonValueKind.Number ? all.GetInt64() : 0);
                break;
        }
    }

    // ---- avisos, mantenimiento, agenda, version minima ---------------------------------------------------------------

    public NoticesView? Notices { get; private set; }
    private long _noticesTick;

    /// <summary>"Now" by the server's clock (moving the PC's clock changes nothing). Frozen while the last read failed, like the engine's.</summary>
    public DateTimeOffset ServerNow => Notices == null || !DateTimeOffset.TryParse(Notices.ServerNow, out var at)
        ? DateTimeOffset.UtcNow
        : Notices.Online ? at.AddMilliseconds(Environment.TickCount64 - _noticesTick) : at;
    /// <summary>What avisos.json says changed (a read, or something the player did with a notice).</summary>
    public event Action? NoticesChanged;
    /// <summary>Minecraft closed with an error (not because the player stopped it): the window offers the failure report.</summary>
    public event Action<GameExit>? GameCrashed;

    /// <summary>Asks EmpiPacks for avisos.json (a small conditional request). Quiet: without a network the last read stays and blocks stay blocks.</summary>
    public async Task RefreshNoticesAsync(bool network = true)
    {
        try
        {
            Notices = await Client.CallAsync<NoticesView>(network ? "notices.refresh" : "notices.get", timeout: TimeSpan.FromSeconds(25));
            _noticesTick = Environment.TickCount64;
            NoticesChanged?.Invoke();
        }
        catch (Exception) { }
    }

    public async Task MarkNoticeAsync(string id, string state)
    {
        try { Notices = await Client.CallAsync<NoticesView>("notices.mark", new { id, state }); _noticesTick = Environment.TickCount64; NoticesChanged?.Invoke(); }
        catch (Exception) { }
    }

    private static readonly AccessInfo AllClear = new("ok", null, null, null, null, null);

    /// <summary>What stops this modpack from being played or updated (maintenance, not out yet, retired), or the launcher itself being too old.</summary>
    public AccessInfo Access(string? modpackId)
    {
        if (Notices?.Launcher.Blocked == true) return new AccessInfo("launcher", Notices.Launcher.Message, null, null, null, Notices.Launcher.MinVersion);
        return modpackId != null && Notices != null && Notices.Modpacks.TryGetValue(modpackId, out var entry) ? entry.Access : AllClear;
    }

    public static bool BlocksPlaying(AccessInfo access) => access.State is "launcher" or "upcoming" or "retired" || access is { State: "maintenance", Allowed: not true };

    /// <summary>The link of this modpack's news, or the general one.</summary>
    public string? NovedadesFor(string? modpackId) =>
        modpackId != null && Notices != null && Notices.Modpacks.TryGetValue(modpackId, out var entry) && entry.Novedades != null ? entry.Novedades : Notices?.Launcher.Novedades;

    public IEnumerable<NoticeInfo> ActiveNotices => Notices?.Notices.Where(n => n.State != "closed") ?? [];
    public IEnumerable<NoticeInfo> GeneralNotices => ActiveNotices.Where(n => n.General);
    /// <summary>The notices of one modpack. A profile has its own: the author ticks each modpack in "Donde se ve".</summary>
    public IEnumerable<NoticeInfo> NoticesOf(string? modpackId) => modpackId == null ? [] : ActiveNotices.Where(n => !n.General && n.Targets.Contains(modpackId));

    public Task<UninstallPreview> UninstallPreviewAsync(string id) => Client.CallAsync<UninstallPreview>("pack.uninstall.preview", new { id }, TimeSpan.FromSeconds(60));

    public async Task<long> UninstallAsync(string id, bool includePersonal)
    {
        var result = await Client.CallAsync<UninstallResult>("pack.uninstall", new { id, includePersonal }, TimeSpan.FromMinutes(5));
        await RefreshPackAsync();
        Changed?.Invoke();
        return result.FreedBytes;
    }

    /// <summary>The failure report as text to copy. Nothing in it identifies the player, and it is never sent anywhere.</summary>
    public async Task<string> BuildReportAsync(string? serverId = null) =>
        (await Client.CallAsync<ReportResult>("report.build", new { serverId }, TimeSpan.FromSeconds(30))).Text;

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
