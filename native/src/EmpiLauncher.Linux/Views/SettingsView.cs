using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;
using SC = EmpiLauncher.Linux.Styles.StyleCatalog;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;

namespace EmpiLauncher.Linux.Views;

/// <summary>Ajustes: the account, the Minecraft side (memory and Java), the mods and the launcher itself. Esc or "Listo" goes back.</summary>
public sealed class SettingsView : UserControl
{
    private readonly Launcher _l = Launcher.Instance;
    private readonly MainWindow _window;
    private readonly StackPanel _body = new() { Spacing = 14 };
    private readonly StackPanel _tabs = new() { Orientation = Orientation.Horizontal, Spacing = 4 };
    private readonly Dictionary<string, Button> _tabButtons = [];
    private string _tab = "account";

    public SettingsView(MainWindow window)
    {
        _window = window;
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 18) };
        var done = Ui.Btn("Listo", Ui.Kind.Paper, () => _window.CloseSettings(), new Thickness(24, 9));
        DockPanel.SetDock(done, Dock.Right);
        head.Children.Add(done);
        head.Children.Add(Ui.Display("Ajustes", 32));

        foreach (var (id, title) in new[] { ("account", "Cuenta"), ("java", "Minecraft"), ("mods", "Mods"), ("shots", "Capturas"), ("launcher", "Launcher") })
        {
            var button = Ui.Btn(title, Ui.Kind.Ghost, () => _ = Open(id), new Thickness(18, 8));
            _tabButtons[id] = button;
            _tabs.Children.Add(button);
        }
        var strip = new Border { Background = Pal.Module, CornerRadius = new CornerRadius(999), Padding = new Thickness(4), HorizontalAlignment = HorizontalAlignment.Left, Child = _tabs, Margin = new Thickness(0, 0, 0, 18) };

        var scroll = new ScrollViewer { VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto, Content = new Border { Padding = new Thickness(0, 0, 14, 8), Child = _body } };
        var panel = new DockPanel { Margin = new Thickness(40, 8, 40, 28), MaxWidth = 900 };
        DockPanel.SetDock(head, Dock.Top); DockPanel.SetDock(strip, Dock.Top);
        panel.Children.Add(head); panel.Children.Add(strip); panel.Children.Add(scroll);
        Content = panel;

        AttachedToVisualTree += (_, _) => _ = Open(_tab);
    }

    public Task OpenTab(string tab) => Open(tab);

    public string CurrentTab => _tab;

    private int _generation;

    private async Task Open(string tab)
    {
        _tab = tab;
        var mine = ++_generation;
        foreach (var (id, button) in _tabButtons) Ui.Style(button, id == tab ? Ui.Kind.Paper : Ui.Kind.Icon);
        // built apart and shown only if it is still the tab asked for last: clicking through the tabs quickly must never mix two of them
        var page = new StackPanel { Spacing = 14 };
        try
        {
            switch (tab)
            {
                case "account": await AccountTab(page); break;
                case "java": await JavaTab(page); break;
                case "mods": await ModsTab(page); break;
                case "shots": await ShotsTab(page); break;
                default: await LauncherTab(page); break;
            }
        }
        catch (Exception ex)
        {
            App.Log("settings " + tab, ex);
            page.Children.Add(Section("No pude cargar esto", null, Ui.Body(ex.Message, 14, Pal.Paper2)));
        }
        if (mine != _generation) return;
        _body.Children.Clear();
        _body.Children.Add(page);
    }

    // ---- pieces ------------------------------------------------------------------------------------------------------

    private static Border Section(string? title, string? hint, params Control[] children)
    {
        var stack = new StackPanel { Spacing = 10 };
        if (title != null) stack.Children.Add(Ui.Display(title, 20));
        if (hint != null) { var h = Ui.Body(hint, 13.5, Pal.Paper2); stack.Children.Add(h); }
        foreach (var c in children) stack.Children.Add(c);
        return Ui.Module(stack, new Thickness(22, 18));
    }

    private static Control Row(Control left, Control? right)
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        left.VerticalAlignment = VerticalAlignment.Center;
        grid.Children.Add(left);
        if (right != null) { right.VerticalAlignment = VerticalAlignment.Center; Grid.SetColumn(right, 1); grid.Children.Add(right); }
        return new Border { Background = Pal.Tint, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(16), Padding = new Thickness(14, 10), Child = grid };
    }

    private static ToggleSwitch Switch(bool on, Action<bool> changed, string name)
    {
        var toggle = new ToggleSwitch { IsChecked = on, OnContent = null, OffContent = null, Foreground = Pal.Paper };
        Avalonia.Automation.AutomationProperties.SetName(toggle, name);
        toggle.IsCheckedChanged += (_, _) => changed(toggle.IsChecked == true);
        return toggle;
    }

    private static Control Labeled(string title, string? hint)
    {
        var stack = new StackPanel { Spacing = 2 };
        stack.Children.Add(Ui.Body(title, 14.5));
        if (hint != null) stack.Children.Add(Ui.Caption(hint));
        return stack;
    }

    // ---- Cuenta ------------------------------------------------------------------------------------------------------

    private async Task AccountTab(StackPanel into)
    {
        await _l.RefreshConfigAsync();
        var accounts = _l.Config?.Accounts.Accounts ?? [];
        var list = new List<Control>();
        if (accounts.Count == 0) list.Add(Ui.Body("Todavía no hay ninguna cuenta guardada. Añade una desde la pantalla de inicio de sesión.", 14, Pal.Paper2));
        foreach (var account in accounts)
        {
            var selected = account.Uuid == _l.Config!.Accounts.Selected;
            var uuid = account.Uuid;
            var name = new StackPanel { Children = { Ui.Body(account.DisplayName, 15), Ui.Caption(Ui.AccountKind(account)) } };
            var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
            if (account.Type == "offline")
            {
                // the offline player's own settings, not a session: they stay next to it
                var dn = account.DisplayName;
                actions.Children.Add(Ui.Btn(account.Skin != null ? "Cambiar skin" : "Skin…", Ui.Kind.Ghost, () => _window.ShowSkinPrompt(() => Open("account")), new Thickness(14, 8), 12));
                actions.Children.Add(Ui.Btn("Cambiar nombre", Ui.Kind.Ghost, () => _window.ShowOfflinePrompt(dn, () => Open("account")), new Thickness(14, 8), 12));
            }
            if (selected) { var pill = Ui.Pill("SELECCIONADA", Pal.AccentInk, Pal.Accent); pill.Margin = new Thickness(0); actions.Children.Add(pill); }
            else actions.Children.Add(Ui.Btn("Usar esta cuenta", Ui.Kind.Ghost, async () => { await _l.UseAccountAsync(uuid); await Open("account"); }));
            list.Add(Row(name, actions));
        }
        if (!_l.SignedOut && accounts.Count > 0)
        {
            var signOut = Ui.Btn("Cerrar sesión", Ui.Kind.Danger, async () => await _l.SignOutAsync(), new Thickness(20, 10));
            signOut.HorizontalAlignment = HorizontalAlignment.Left;
            list.Add(signOut);
        }
        into.Children.Add(Section("Cuentas de Minecraft",
            accounts.Count == 0 ? null : _l.SignedOut ? "Ahorita no hay ninguna sesión iniciada. Escoge con cuál jugar." : "La cuenta escogida es la que se usa al jugar. Cambia de una a otra cuando quieras.", list.ToArray()));
        into.Children.Add(Section(null, null, Ui.Body("Cerrar sesión no borra nada, tranqui: te lleva a la pantalla de inicio de sesión, donde puedes entrar con cualquiera de tus cuentas, añadir otra o jugar sin conexión.", 13.5, Pal.Paper2)));
    }

    // ---- Minecraft: memory and Java --------------------------------------------------------------------------------------

    private async Task JavaTab(StackPanel into)
    {
        var serverId = _l.Selected?.Id;
        var s = await _l.Client.CallAsync<JavaSettings>("settings.java", new { serverId });
        var pack = _l.Selected?.Name ?? "este modpack";

        var memText = Ui.Body("", 14);
        var min = Slider(s.AbsoluteMinGb, s.AbsoluteMaxGb, s.MinRAMGb);
        var max = Slider(s.AbsoluteMinGb, s.AbsoluteMaxGb, s.MaxRAMGb);
        void Show() => memText.Text = $"Mínima {min.Value:0.#} GB   ·   Máxima {max.Value:0.#} GB   ·   tu compu tiene {s.TotalGB:0.#} GB ({s.FreeGB:0.#} libres)";
        Show();
        DispatcherTimer? debounce = null;
        void Save()
        {
            Show();
            debounce?.Stop();
            debounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            debounce.Tick += async (_, _) =>
            {
                debounce.Stop();
                if (max.Value < min.Value) max.Value = min.Value;
                await _l.Client.CallAsync("settings.java.set", new { serverId, minRAMGb = min.Value, maxRAMGb = max.Value });
            };
            debounce.Start();
        }
        min.PropertyChanged += (_, e) => { if (e.Property == Avalonia.Controls.Primitives.RangeBase.ValueProperty) Save(); };
        max.PropertyChanged += (_, e) => { if (e.Property == Avalonia.Controls.Primitives.RangeBase.ValueProperty) Save(); };
        into.Children.Add(Section($"Memoria de {pack}", "Cada modpack tiene la suya. Si no sabes, déjala como viene: la puso el autor del modpack.",
            memText, Ui.Label("MÍNIMA"), min, Ui.Label("MÁXIMA"), max));

        var path = new TextBox { Text = s.JavaExecutable, Watermark = "Automático (el launcher escoge o instala el Java que haga falta)", Background = Pal.Input, Foreground = Pal.Paper, BorderBrush = Pal.HairStrong, CornerRadius = new CornerRadius(12), Padding = new Thickness(12, 9) };
        var verdict = Ui.Caption($"Este modpack pide Java {s.SuggestedMajor} ({s.Supported}).");
        var check = Ui.Btn("Comprobar", Ui.Kind.Ghost, async () =>
        {
            var details = await _l.Client.CallAsync<JavaDetails>("java.details", new { serverId, path = path.Text ?? "" });
            verdict.Text = details.Valid ? $"Sirve: Java {details.Version} ({details.Vendor})." : string.IsNullOrEmpty(details.Path) ? "Sin ruta: el launcher lo resuelve solito." : "Ese Java no sirve para este modpack.";
            verdict.Foreground = details.Valid ? Pal.Ok : Pal.Warn;
            await _l.Client.CallAsync("settings.java.set", new { serverId, javaExecutable = path.Text ?? "" });
        }, new Thickness(16, 8), 12);
        var install = Ui.Btn("Instalar o actualizar Java", Ui.Kind.Ghost, async () =>
        {
            try { await _l.InstallJavaAsync(serverId ?? "", true); _window.ShowToast("Bajando Java, mira el progreso en la pantalla principal."); }
            catch (EngineException ex) { _window.ShowToast(ex.Message); }
        }, new Thickness(16, 8), 12);
        var jvm = new TextBox { Text = string.Join(" ", s.JvmOptions), Background = Pal.Input, Foreground = Pal.Paper, BorderBrush = Pal.HairStrong, CornerRadius = new CornerRadius(12), Padding = new Thickness(12, 9), AcceptsReturn = false };
        jvm.LostFocus += async (_, _) => await _l.Client.CallAsync("settings.java.set", new { serverId, jvmOptions = jvm.Text ?? "" });
        into.Children.Add(Section("Java", null, Ui.Label("EJECUTABLE"), path, new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Children = { check, install } }, verdict,
            Ui.Label("OPCIONES DE LA JVM"), jvm));

        var auto = Switch(_l.Prefs.AutoJava ?? true, on => _ = _l.SetAutoJavaAsync(on), "Instalar Java automáticamente");
        into.Children.Add(Section(null, null, Row(Labeled("Instalar Java automáticamente", "Si falta el Java del modpack, lo instalo sin preguntar."), auto)));
    }

    private static Slider Slider(double min, double max, double value) => new()
    {
        Minimum = min, Maximum = Math.Max(max, min + 0.5), Value = Math.Clamp(value, min, Math.Max(max, min + 0.5)), TickFrequency = 0.5, IsSnapToTickEnabled = true,
        Foreground = Pal.Accent, Background = Pal.TintHover
    };

    // ---- Mods --------------------------------------------------------------------------------------------------------

    private async Task ModsTab(StackPanel into)
    {
        var m = await _l.Client.CallAsync<ModsList>("mods.list", new { serverId = _l.Selected?.Id });
        var req = m.Required.Count;
        into.Children.Add(Section("Mods del modpack", $"{req} obligatorios (no se pueden apagar) y {m.Optional.Count} opcionales."));

        void Nodes(StackPanel into, IEnumerable<ModNode> nodes, int depth)
        {
            foreach (var node in nodes)
            {
                var label = Labeled(node.Name, string.IsNullOrEmpty(node.Version) ? null : node.Version);
                label.Margin = new Thickness(depth * 18, 0, 0, 0);
                var path = node.Path;
                Control? right = node.Required ? Ui.Caption("OBLIGATORIO") : Switch(node.Enabled, on => _ = _l.Client.CallAsync("mods.set", new { path, enabled = on, serverId = _l.Selected?.Id }), node.Name);
                into.Children.Add(Row(label, right));
                if (node.Children.Count > 0) Nodes(into, node.Children, depth + 1);
            }
        }
        if (m.Optional.Count > 0)
        {
            var optional = new StackPanel { Spacing = 6 };
            Nodes(optional, m.Optional, 0);
            into.Children.Add(Section("Opcionales", "Los que tú quieras prender o apagar.", optional));
        }

        var drop = new StackPanel { Spacing = 6 };
        foreach (var mod in m.Dropins.Mods)
        {
            var name = mod.FullName;
            drop.Children.Add(Row(Labeled(mod.Name, mod.Ext), Switch(!mod.Disabled, on => _ = _l.Client.CallAsync("dropins.toggle", new { fullName = name, enabled = on, serverId = _l.Selected?.Id }), mod.Name)));
        }
        if (m.Dropins.Mods.Count == 0) drop.Children.Add(Ui.Caption("Ninguno todavía."));
        var zone = new Border { BorderBrush = Pal.HairStrong, BorderThickness = new Thickness(1.5), CornerRadius = new CornerRadius(Pal.RadiusTile), Padding = new Thickness(16), Background = Pal.Tint, Child = Ui.Caption("Suelta aquí tus .jar (o escoge con el botón) y aparecen en la lista.") };
        DragDrop.SetAllowDrop(zone, true);
        zone.AddHandler(DragDrop.DragOverEvent, (_, e) => e.DragEffects = DragDropEffects.Copy);
        zone.AddHandler(DragDrop.DropEvent, async (_, e) =>
        {
            try
            {
                var files = e.DataTransfer?.TryGetFiles()?.Select(f => f.Path.LocalPath).Where(p => p.EndsWith(".jar", StringComparison.OrdinalIgnoreCase)).ToArray() ?? [];
                if (files.Length == 0) { _window.ShowToast("Solo se vale soltar archivos .jar."); return; }
                await _l.Client.CallAsync("dropins.add", new { paths = files, serverId = _l.Selected?.Id });
                await Open("mods");
            }
            catch (Exception ex) { _window.ShowToast(ex.Message); }
        });
        drop.Children.Add(zone);
        drop.Children.Add(Ui.Btn("Abrir la carpeta de mods propios", Ui.Kind.Ghost, () => OpenFolder(m.Dropins.Dir), new Thickness(16, 8), 12));
        ((Button)drop.Children[^1]).HorizontalAlignment = HorizontalAlignment.Left;
        into.Children.Add(Section("Mods propios", "Suelta aquí tus .jar y aparecen en esta lista.", drop));

        var shaders = new StackPanel { Spacing = 6 };
        var none = Row(Labeled("Ninguno", null), m.Shaders.Selected is "" or "OFF" ? Ui.Pill("EN USO", Pal.AccentInk, Pal.Accent) : Ui.Btn("Usar", Ui.Kind.Ghost, async () => { await _l.Client.CallAsync("shaders.select", new { name = "OFF", serverId = _l.Selected?.Id }); await Open("mods"); }, new Thickness(14, 7), 12));
        shaders.Children.Add(none);
        foreach (var pack in m.Shaders.Packs)
        {
            var name = pack.FullName;
            shaders.Children.Add(Row(Labeled(pack.Name, null), pack.FullName == m.Shaders.Selected ? Ui.Pill("EN USO", Pal.AccentInk, Pal.Accent)
                : Ui.Btn("Usar", Ui.Kind.Ghost, async () => { await _l.Client.CallAsync("shaders.select", new { name, serverId = _l.Selected?.Id }); await Open("mods"); }, new Thickness(14, 7), 12)));
        }
        shaders.Children.Add(Ui.Btn("Abrir la carpeta de shaders", Ui.Kind.Ghost, () => OpenFolder(m.Shaders.Dir), new Thickness(16, 8), 12));
        ((Button)shaders.Children[^1]).HorizontalAlignment = HorizontalAlignment.Left;
        into.Children.Add(Section("Shaders", null, shaders));
    }

    /// <summary>The release notes are Markdown: headings lose their hashes and bold its asterisks (the first heading repeats the version, so it goes).</summary>
    private static string PlainNotes(string body)
    {
        var lines = body.Replace("\r", "").Split('\n').Select(l => System.Text.RegularExpressions.Regex.Replace(l.TrimEnd(), @"^#{1,6}\s*", m => "")).Select(l => l.Replace("**", "")).ToList();
        if (lines.Count > 0 && lines[0].StartsWith("Empi Launcher")) lines.RemoveAt(0);
        return string.Join("\n", lines).Trim();
    }

    private async Task FillNotesAsync(StackPanel notes)
    {
        var result = await _l.ChangelogAsync();
        Dispatcher.UIThread.Post(() =>
        {
            notes.Children.Clear();
            if (result.Entries.Count == 0) { notes.Children.Add(Ui.Caption(result.Reason == "offline" ? "No pude conectarme para ver las novedades." : "Ya tienes la última versión: no hay novedades nuevas.")); return; }
            foreach (var entry in result.Entries.Take(8))
            {
                var box = new StackPanel { Spacing = 4 };
                box.Children.Add(Ui.Display($"v{entry.Version}", 18));
                if (!string.IsNullOrWhiteSpace(entry.Body)) box.Children.Add(Ui.Body(PlainNotes(entry.Body), 13, Pal.Paper2));
                notes.Children.Add(new Border { Background = Pal.Tint, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(Pal.RadiusTile), Padding = new Thickness(16, 12), Child = box });
            }
        });
    }

    // ---- Capturas ----------------------------------------------------------------------------------------------------

    private async Task ShotsTab(StackPanel into)
    {
        var dir = (await _l.Client.CallAsync<DirResult>("screenshots.dir", new { serverId = _l.Selected?.Id })).Dir;
        var shots = await Task.Run(() => Directory.Exists(dir)
            ? new DirectoryInfo(dir).EnumerateFiles().Where(f => new[] { ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp" }.Contains(f.Extension.ToLowerInvariant()))
                .OrderByDescending(f => f.LastWriteTimeUtc).Select(f => f.FullName).ToList()
            : []);
        var open = Ui.Btn("Abrir carpeta", Ui.Kind.Ghost, () => OpenFolder(dir), new Thickness(16, 8), 12);
        open.HorizontalAlignment = HorizontalAlignment.Left;
        into.Children.Add(Section("Capturas", shots.Count == 0 ? "Todavía no hay capturas de este modpack. Con F2 dentro del juego salen aquí." : $"{shots.Count} capturas de {_l.Selected?.Name}. Pícale a una para verla en grande.", open));
        if (shots.Count == 0) return;
        var grid = new WrapPanel();
        into.Children.Add(grid);
        var decoders = new SemaphoreSlim(2);
        for (var i = 0; i < Math.Min(shots.Count, 60); i++)
        {
            var index = i;
            var picture = new Image { Stretch = Stretch.UniformToFill };
            var tile = new Button { Classes = { "card" }, Width = 220, Height = 138, Margin = new Thickness(4), Padding = new Thickness(0), Background = Pal.Surface2, CornerRadius = new CornerRadius(14), ClipToBounds = true, Content = picture };
            tile.Click += (_, _) => _window.ShowViewer(shots, index);
            grid.Children.Add(tile);
            _ = Task.Run(async () =>
            {
                await decoders.WaitAsync();
                try { var bmp = Ui.Decode(shots[index], 320); if (bmp != null) Dispatcher.UIThread.Post(() => picture.Source = bmp); }
                finally { decoders.Release(); }
            });
        }
    }

    private static void OpenFolder(string dir)
    {
        try { Directory.CreateDirectory(dir); Process.Start(new ProcessStartInfo("xdg-open") { ArgumentList = { dir }, UseShellExecute = false }); } catch { }
    }

    // ---- Launcher ----------------------------------------------------------------------------------------------------

    private async Task LauncherTab(StackPanel into)
    {
        var version = _l.Config?.AppVersion ?? "";
        var updateText = Ui.Caption("");
        var updateButton = Ui.Btn("Buscar actualizaciones", Ui.Kind.Ghost, async () =>
        {
            updateText.Text = "Buscando…";
            var reached = await _l.CheckUpdateAsync();
            updateText.Text = !reached ? "No pude conectarme. Revisa tu internet." : _l.Update is { } u ? $"Hay una versión nueva: v{u.Version}. Esta es la de Windows; en Linux se actualiza el AppImage desde la página de descargas." : "Ya tienes la última.";
        }, new Thickness(16, 8), 12);
        into.Children.Add(Section("Versión", null, Row(Labeled($"Empi Launcher {(string.IsNullOrEmpty(version) ? "" : "v" + version)}".Trim(), "Interfaz de Linux · motor compartido con la de Windows"), updateButton), updateText));
        var notes = new StackPanel { Spacing = 10 };
        into.Children.Add(Section("Novedades", "Lo que trae cada versión nueva.", notes));
        _ = FillNotesAsync(notes);

        into.Children.Add(Section(null, null, Row(Labeled("Logo al abrir y cerrar", "Mi logo con su glitchecito cuando entras y cuando sales. Un clic o una tecla se lo salta."),
            Switch(NativeSettings.Splash, on => NativeSettings.Splash = on, "Logo al abrir y cerrar"))));
        // the style: the background and the whole interface dressed to match
        var styles = new StackPanel { Spacing = 8 };
        foreach (var info in SC.Available)
        {
            var id = info.Id;
            var on = id == ST.Current;
            var swatch = new Avalonia.Controls.Shapes.Ellipse { Width = 14, Height = 14, Fill = new SolidColorBrush(info.Accent), VerticalAlignment = VerticalAlignment.Center };
            var text = new StackPanel { Children = { Ui.Body(info.Name, 15), Ui.Caption(info.Summary) } };
            var left = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Children = { swatch, text } };
            Control right = on ? Ui.Pill("EN USO", Pal.AccentInk, Pal.Accent) : Ui.Btn("Usar", Ui.Kind.Ghost, () => _window.ChangeStyle(id), new Thickness(16, 8), 12);
            if (right is Border b) b.Margin = new Thickness(0);
            styles.Children.Add(Row(left, right));
        }
        into.Children.Add(Section("Estilo", "El fondo y todo el launcher vestido a juego. Cada estilo nuevo sale como su propia actualización.", styles,
            Row(Labeled("Usar el color del modpack", "Apagado, cada estilo se queda con su color."), Switch(Services.NativeSettings.PackAccent, on => { Services.NativeSettings.PackAccent = on; Services.Launcher.RefreshAccent(); }, "Usar el color del modpack"))));

        // the dotted ground
        var opacity = new Slider { Minimum = 0.1, Maximum = 1, Value = _l.Prefs.DotOpacity ?? 0.9, Foreground = Pal.Accent, Background = Pal.TintHover };
        DispatcherTimer? debounce = null;
        opacity.PropertyChanged += (_, e) =>
        {
            if (e.Property != Avalonia.Controls.Primitives.RangeBase.ValueProperty) return;
            _l.PreviewDotOpacity(opacity.Value);
            debounce?.Stop();
            debounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(400) };
            debounce.Tick += async (_, _) => { debounce.Stop(); await _l.SetDotOpacityAsync(opacity.Value); };
            debounce.Start();
        };
        var swatches = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        foreach (var hex in new[] { "#55555f", "#ff3d8b", "#33e6ff", "#48dc35", "#ffb14a", "#a78bfa", "#f1efe8" })
        {
            var color = hex;
            var dot = new Button { Classes = { "pill" }, Width = 30, Height = 30, Padding = new Thickness(0), Background = new SolidColorBrush(Color.Parse(hex)), BorderBrush = Pal.HairStrong, BorderThickness = new Thickness(1) };
            dot.Click += async (_, _) => { _l.PreviewDotColor(color); await _l.SetDotColorAsync(color); };
            swatches.Children.Add(dot);
        }
        // how and when the background moves
        var modes = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        foreach (var (mode, title) in new[] { ("auto", "Automático"), ("always", "Siempre"), ("off", "Apagado") })
        {
            var m = mode;
            var chosen = (_l.Prefs.FieldMode ?? "auto") == m;
            var pill = Ui.Btn(title, chosen ? Ui.Kind.Paper : Ui.Kind.Ghost, async () => { await _l.SetFieldModeAsync(m); _ = Open("launcher"); }, new Thickness(16, 8), 12);
            modes.Children.Add(pill);
        }
        var perf = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        foreach (var (mode, title) in new[] { ("on", "Activado"), ("auto", "Automático"), ("off", "Desactivado") })
        {
            var m = mode;
            var chosen = FieldGovernor.PerfMode == m;
            perf.Children.Add(Ui.Btn(title, chosen ? Ui.Kind.Paper : Ui.Kind.Ghost, async () =>
            {
                await _l.Client.CallAsync("config.set", new { key = "performanceMode", value = m });
                await _l.RefreshConfigAsync(); FieldGovernor.ResetYield(); _l.NotifyFieldSettings(); _ = Open("launcher");
            }, new Thickness(16, 8), 12));
        }
        Control FpsRow(string label, int value, Action<int> set)
        {
            var text = Ui.Caption($"{label}: {value} FPS");
            var slider = new Slider { Minimum = NativeSettings.FpsLowest, Maximum = NativeSettings.FpsHighest, Value = value, TickFrequency = 5, IsSnapToTickEnabled = true, Foreground = Pal.Accent, Background = Pal.TintHover };
            slider.PropertyChanged += (_, e) => { if (e.Property == Avalonia.Controls.Primitives.RangeBase.ValueProperty) { var v = (int)Math.Round(slider.Value); text.Text = $"{label}: {v} FPS"; set(v); _l.NotifyFieldSettings(); } };
            return new StackPanel { Children = { text, slider } };
        }
        var rates = new StackPanel { Spacing = 6 };
        if (FieldGovernor.PerfMode == "on") rates.Children.Add(Ui.Caption($"Con el modo de rendimiento activado el fondo se mueve {FieldGovernor.RateText()}."));
        else if (FieldGovernor.PerfMode == "off") rates.Children.Add(FpsRow("FPS del fondo", NativeSettings.FpsFixed, v => NativeSettings.FpsFixed = v));
        else { rates.Children.Add(FpsRow("Mínimo (sin tocar nada)", NativeSettings.FpsMin, v => NativeSettings.FpsMin = v)); rates.Children.Add(FpsRow("Máximo (moviendo el ratón)", NativeSettings.FpsMax, v => NativeSettings.FpsMax = v)); }
        var why = Ui.Caption(FieldGovernor.Allowed ? "Ahorita el fondo se mueve." : "Ahorita el fondo está quieto: " + FieldGovernor.Reason + ".");
        into.Children.Add(Section("Movimiento del fondo", "Cuándo se mueve y a cuántos cuadros por segundo. Menos es más tranqui para tu compu.",
            Ui.Label("EL FONDO"), modes, Ui.Label("MODO DE RENDIMIENTO"), perf, rates, why));

        into.Children.Add(Section("Fondo", "Los puntitos de atrás. Nada se mueve solo: gastan casi nada.", Ui.Label("COLOR"), swatches, Ui.Label("QUÉ TANTO SE VEN"), opacity));

        // folders and the engine
        var folders = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        if (_l.Config is { } c)
        {
            folders.Children.Add(Ui.Btn("Datos del launcher", Ui.Kind.Ghost, () => OpenFolder(c.LauncherDirectory), new Thickness(16, 8), 12));
            folders.Children.Add(Ui.Btn("Archivos del juego", Ui.Kind.Ghost, () => OpenFolder(c.CommonDirectory), new Thickness(16, 8), 12));
            folders.Children.Add(Ui.Btn("Instancias", Ui.Kind.Ghost, () => OpenFolder(c.InstanceDirectory), new Thickness(16, 8), 12));
        }
        into.Children.Add(Section("Carpetas", null, folders));

        var debug = new StackPanel { Spacing = 6 };
        foreach (var (id, title, hint) in new[]
        {
            ("fps", "FPS del fondo", "Los cuadros que de verdad dibuja el fondo contra los que le pides, tipo 28 / 30."),
            ("ms", "Tiempo por cuadro", "Cuántos milisegundos le toma a mi código armar cada cuadro del fondo."),
            ("cpu", "Procesador", "Cuánto procesador usan la interfaz y el motor, cada quien por su lado."),
            ("ram", "Memoria", "La RAM que usan la interfaz y el motor."),
            ("gpu", "Tarjeta gráfica", "Qué tanto trabaja la GPU (si tu driver lo dice, como amdgpu)."),
            ("field", "Estado del fondo", "Si el fondo se mueve o está quieto (y por qué), y en qué modo de rendimiento andas."),
        })
            debug.Children.Add(Row(Labeled(title, hint), Switch(NativeSettings.Debug.Contains(id), v => NativeSettings.SetDebug(id, v), title)));
        into.Children.Add(Section("Depuración", "Un panelito en la esquina de arriba con números en vivo, por si quieres ver qué tanto trabaja el launcher. Se esconde cuando ves solo el fondo y mientras juegas.", debug));

        var memory = Ui.Caption("");
        try
        {
            var m = await _l.Client.CallAsync<EngineMemory>("engine.memory");
            var own = Process.GetCurrentProcess().WorkingSet64 / 1048576.0;
            memory.Text = $"Interfaz {own:0} MB  ·  motor {m.RssMB:0} MB";
        }
        catch { }
        var report = Ui.Btn("Ver informe para soporte", Ui.Kind.Ghost, async () =>
        {
            try
            {
                var r = await _l.BuildReportAsync(_l.Selected?.Id, false);
                var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"empi-informe-{DateTime.Now:yyyyMMdd-HHmm}.txt");
                await File.WriteAllTextAsync(path, r.Text);
                OpenFolder(System.IO.Path.GetDirectoryName(path)!);
                _window.ShowToast($"Dejé el informe en {path}. Revísalo antes de mandarlo, trae lo que ves ahí y nada más.");
            }
            catch (Exception ex) { _window.ShowToast(ex.Message); }
        }, new Thickness(16, 8), 12);
        report.HorizontalAlignment = HorizontalAlignment.Left;
        into.Children.Add(Section("Consumo e informe", "Cuánto gasta el launcher ahorita, y un informe de lo que pasó por si algo falla.", memory, report));
    }
}
