using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views.Tabs;

/// <summary>The "Launcher" tab: this launcher's version and updates (with the notes of every version in between), its own settings, the living background and its colour, folders and cost.</summary>
internal sealed class AboutTab : SettingsTab
{
    private readonly Launcher _l = Launcher.Instance;
    private readonly Ui.Debounce _opacitySave = new(350);
    public override string Id => "about";
    public override string Title => "Launcher";

    private string Str(string key) => _l.Config!.Settings.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    private bool Bool(string key) => _l.Config!.Settings.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.True;

    public override async Task LoadAsync()
    {
        await _l.RefreshConfigAsync();
        Root.Children.Clear();
        var config = _l.Config!;

        Root.Children.Add(UpdatesSection(config));

        var launcher = Ui.Section("Launcher", out var l);
        l.Children.Add(Ui.Row("Modo de rendimiento", "Automático ahorra recursos en equipos justos: sin efectos que cuesten memoria o GPU.", ModeChoice()));
        l.Children.Add(Ui.Row("Animación del logo", "El logo se arma con un efecto glitch al abrir el launcher y se deshace al cerrarlo (un clic o una tecla la salta). No se muestra si Windows tiene las animaciones apagadas.", Ui.Switch(NativeSettings.Splash, v => NativeSettings.Splash = v, "Animación del logo al abrir y cerrar")));
        l.Children.Add(Ui.Row("Banner y fondo animados", "Los modpacks con un banner o un fondo animado (GIF, WebP o APNG) los ven en movimiento. Solo se mueven mientras el launcher está a la vista, y se quedan quietos si Windows tiene las animaciones apagadas. Apágalo para ahorrar procesador y disco.", Ui.Switch(_l.Prefs.AnimatedArt != false, v => _ = _l.SetAnimatedArtAsync(v), "Banner y fondo animados")));
        l.Children.Add(Ui.Row("Versiones de prueba", "Recibir también las versiones del launcher que aún se están probando.", Ui.Switch(Bool("allowPrerelease"), v => _ = Set("allowPrerelease", v), "Versiones de prueba")));
        Root.Children.Add(launcher);
        Root.Children.Add(FieldSection());

        var folders = Ui.Section("Carpetas", out var f, "Aquí viven el juego, las cuentas y la configuración.");
        f.Children.Add(FolderRow("Datos del juego", Str("dataDirectory")));
        f.Children.Add(FolderRow("Instalaciones", config.InstanceDirectory));
        f.Children.Add(FolderRow("Configuración", config.LauncherDirectory));
        Root.Children.Add(folders);

        var report = Ui.Section("Informe de fallo y reparación", out var r, "Para pedir ayuda: un informe con las versiones, tu equipo, el modpack, los mods y el final del registro del juego. Lo ves entero antes de hacer nada; puedes copiarlo, guardarlo como .txt o mandarlo a soporte (solo si tú lo pides). Nunca lleva tu sesión, tus claves, tu correo ni tu usuario de Windows.");
        r.Children.Add(Ui.Row("Ver el informe", "Del modpack que tienes elegido.", Ui.Button("Ver informe", () => ((MainWindow)Application.Current.MainWindow).ShowReport(), "GhostButton", 18)));
        r.Children.Add(Ui.Row("Verificar y reparar", "Comprueba todos los archivos del modpack elegido y vuelve a bajar los que falten o estén dañados. No toca tus mundos ni tus ajustes.", Ui.Button("Verificar y reparar", () => ((MainWindow)Application.Current.MainWindow).AskRepair(), "GhostButton", 18)));
        Root.Children.Add(report);

        var cost = Ui.Section("Consumo ahora mismo", out var c, "Lo que usan en este instante la interfaz y el motor. La interfaz devuelve memoria al sistema cuando está quieta.");
        var ui = Ui.Text("", "BodyText");
        var engine = Ui.Text("", "BodyText");
        c.Children.Add(Ui.Row("Interfaz nativa", null, ui));
        c.Children.Add(Ui.Row("Motor del launcher", "Sin Chromium: solo lógica.", engine));
        Root.Children.Add(cost);
        try
        {
            var memory = await _l.Client.CallAsync<EngineMemory>("engine.memory");
            var me = Process.GetCurrentProcess();
            ui.Text = $"{me.WorkingSet64 / 1048576.0:0} MB";
            engine.Text = $"{memory.RssMB:0} MB";
        }
        catch (EngineException) { ui.Text = engine.Text = "sin datos"; }
    }

    /// <summary>The opacity slider sends every step to the screen at once but saves once it stops.</summary>
    public override void Release() => _opacitySave.Flush();

    private Task Set(string key, object value) => _l.Client.CallAsync("config.set", new { key, value });

    // ---- version and updates ---------------------------------------------------------------------------------------

    /// <summary>The version in use and, when a newer one exists, the notes of EVERY version from this one to the latest, newest first.</summary>
    private FrameworkElement UpdatesSection(ConfigResult config)
    {
        var version = config.AppVersion is { Length: > 0 } v && !v.StartsWith("0.0.0") ? "versión " + v : "versión de desarrollo";
        var section = Ui.Section("Versión y novedades", out var body, $"Empi Launcher, {version}.");
        var trail = new StackPanel { Margin = new Thickness(0, 12, 0, 0) };
        var status = Ui.Text("", "CaptionText");
        status.VerticalAlignment = VerticalAlignment.Center;
        status.Margin = new Thickness(12, 0, 0, 0);

        async Task Fill(bool askDialog)
        {
            status.Text = "Buscando…";
            trail.Children.Clear();
            await _l.CheckUpdateAsync();
            var notes = await _l.ChangelogAsync();
            trail.Children.Clear();
            if (_l.Update != null)
            {
                status.Text = notes.Entries.Count > 1 ? $"Hay {notes.Entries.Count} versiones nuevas hasta la {_l.Update.Version}." : $"Hay una versión nueva: {_l.Update.Version}.";
                foreach (var entry in notes.Entries) trail.Children.Add(TrailEntry(entry));
                if (notes.Entries.Count == 0) trail.Children.Add(Ui.Text("No se pudieron leer las notas de las versiones, pero la actualización está disponible.", "CaptionText"));
                Motion.Reveal(Motion.ChildrenOf(trail), 40, 0, 220, 8);   // the trail of versions arrives one by one, newest first
                if (askDialog) ((MainWindow)Application.Current.MainWindow).ShowUpdateDialog();
            }
            else status.Text = notes.Reason == "offline" && _l.Update == null ? "Tienes la última versión, o no hay conexión para comprobarlo." : "Tienes la última versión.";
        }

        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(Ui.Button("Buscar actualizaciones", () => _ = Fill(true)));
        row.Children.Add(status);
        body.Children.Add(row);
        body.Children.Add(trail);
        _ = Fill(false);   // opening the tab already shows what is new; the dialog is only for the button
        return section;
    }

    /// <summary>One release: its number, its date, a link and its notes, tidied for reading (the notes are Markdown written for GitHub).</summary>
    private FrameworkElement TrailEntry(ChangelogEntry entry)
    {
        var head = new DockPanel();
        if (entry.Url != null)
        {
            var open = Ui.Button("Ver en GitHub", () => { try { Process.Start(new ProcessStartInfo(entry.Url) { UseShellExecute = true }); } catch (Exception) { } }, "GhostButton", 12);
            DockPanel.SetDock(open, Dock.Right);
            head.Children.Add(open);
        }
        var title = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        title.Children.Add(Ui.Text("v" + entry.Version, "BodyText", null, 16));
        if (DateTime.TryParse(entry.Date, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var date))
        {
            var when = Ui.Text(date.ToLocalTime().ToString("d 'de' MMMM 'de' yyyy", CultureInfo.GetCultureInfo("es-ES")), "CaptionText");
            when.Margin = new Thickness(12, 0, 0, 0);
            when.VerticalAlignment = VerticalAlignment.Center;
            title.Children.Add(when);
        }
        head.Children.Add(title);

        var stack = new StackPanel();
        stack.Children.Add(head);
        var notes = Notes(entry.Body);
        notes.Margin = new Thickness(0, 10, 0, 0);
        stack.Children.Add(notes);
        return new Border { Style = (Style)Application.Current.FindResource("Tile"), Child = stack, Margin = new Thickness(0, 0, 0, 8), Padding = new Thickness(16, 12, 16, 12) };
    }

    /// <summary>GitHub Markdown as plain reading text: headings stand out, bullets become bullets, the rest of the markup goes.</summary>
    private static StackPanel Notes(string? markdown)
    {
        var panel = new StackPanel();
        var shown = 0;
        foreach (var raw in (markdown ?? "").Replace("\r", "").Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("<!--") || line == "---") continue;
            if (++shown > 40) { panel.Children.Add(Ui.Text("…", "CaptionText")); break; }
            var heading = line.StartsWith('#');
            var bullet = line.StartsWith("- ") || line.StartsWith("* ");
            var text = line.TrimStart('#', ' ').Replace("**", "").Replace("__", "").Replace("`", "");
            if (bullet) text = "•  " + text[2..].TrimStart();
            var block = Ui.Text(text, heading ? "BodyText" : "CaptionText");
            if (heading) block.FontWeight = FontWeights.SemiBold;
            block.TextWrapping = TextWrapping.Wrap;
            block.Margin = new Thickness(bullet ? 6 : 0, heading ? 8 : 2, 0, 0);
            if (!heading) block.Foreground = Ui.Res("Paper2Brush");
            panel.Children.Add(block);
        }
        if (shown == 0) panel.Children.Add(Ui.Text("Esta versión no trae notas.", "CaptionText"));
        return panel;
    }

    // ---- the living background ---------------------------------------------------------------------------------------

    /// <summary>The living background: three choices, its colour and, always visible, whether it is moving right now and why not if it is not.</summary>
    private FrameworkElement FieldSection()
    {
        var section = Ui.Section("Fondo vivo", out var body, "Puntos de fondo que se mueven despacio y se acercan al puntero, con el color del modpack.");
        var status = Ui.Text("", "CaptionText");

        void Refresh()
        {
            FieldGovernor.Evaluate(Application.Current.MainWindow);
            status.Text = FieldGovernor.Allowed ? "Ahora mismo: en movimiento." : "Ahora mismo: quieto porque " + FieldGovernor.Reason + ".";
        }

        var row = new StackPanel { Orientation = Orientation.Horizontal };
        var track = new Border { Background = Ui.Res("TintBrush"), Padding = new Thickness(3), Child = row };
        Ui.MakePill(track);
        foreach (var (value, label) in new[] { ("auto", "Automático"), ("always", "Siempre"), ("off", "Apagado") })
        {
            var pill = new RadioButton { Content = label, GroupName = "field", IsChecked = _l.Prefs.FieldMode == value, Style = (Style)Application.Current.FindResource("TabPill") };
            var mode = value;
            pill.Checked += async (_, _) => { await _l.SetFieldModeAsync(mode); Refresh(); };
            row.Children.Add(pill);
        }
        body.Children.Add(Ui.Row("Campo de puntos", "Automático sigue en marcha mientras descargas o actualizas y solo se queda quieto si algo importa más: Minecraft abierto, poca memoria, modo de rendimiento. Siempre no se apaga por eso.", track));
        Refresh();
        status.Margin = new Thickness(0, 4, 0, 0);
        body.Children.Add(status);
        body.Children.Add(Ui.Row("Color de los puntos y las ondas", "El gris es el de siempre. Elige uno de la lista o crea el tuyo. Cuando una onda del color del modpack se cruza con la tuya, los puntos se mezclan.", DotColorChoice()));
        body.Children.Add(Ui.Row("Intensidad del fondo", "Baja el porcentaje para un fondo más calmado. Los puntos y las ondas se ven más tenues, sin cambiar cómo se mueven.", DotOpacityChoice()));
        return section;
    }

    /// <summary>A slider from 10 to 100 %. The background follows it live; the value is saved when the slider stops.</summary>
    private FrameworkElement DotOpacityChoice()
    {
        var slider = new Slider
        {
            Style = (Style)Application.Current.FindResource("RangeSlider"), Minimum = 10, Maximum = 100, SmallChange = 5, LargeChange = 10,
            TickFrequency = 5, IsSnapToTickEnabled = true, Width = 190, Value = Math.Round(Math.Clamp(_l.Prefs.DotOpacity ?? 1, 0.1, 1) * 100 / 5) * 5
        };
        System.Windows.Automation.AutomationProperties.SetName(slider, "Deslizador de intensidad del fondo");   // not the row's own words: the title is a different element
        // the value in the readable face: the dot-matrix face draws its percent sign like an X at this size
        var value = Ui.Text($"{slider.Value:0} %", "BodyText", null, 16);
        value.FontWeight = FontWeights.SemiBold; value.MinWidth = 56; value.TextAlignment = TextAlignment.Right; value.VerticalAlignment = VerticalAlignment.Center; value.Margin = new Thickness(10, 0, 0, 0);
        slider.ValueChanged += (_, _) =>
        {
            value.Text = $"{slider.Value:0} %";
            var opacity = slider.Value / 100;
            _l.PreviewDotOpacity(opacity);
            _opacitySave.Run(() => _ = _l.SetDotOpacityAsync(opacity));
        };
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(slider);
        row.Children.Add(value);
        return row;
    }

    private const string DefaultDots = "#64635f";
    private static readonly (string Hex, string Label)[] DotPresets =
    [
        ("#64635f", "Gris"), ("#b8b7b1", "Blanco"), ("#4a6fd8", "Azul"), ("#2fa8b5", "Cian"),
        ("#4caf6d", "Verde"), ("#c99a3a", "Ámbar"), ("#cc5a8a", "Rosa"), ("#8b6bd6", "Violeta")
    ];

    /// <summary>Round presets plus a rainbow one that opens the launcher's own colour picker. Whatever is picked is shown live and saved by the engine.</summary>
    private FrameworkElement DotColorChoice()
    {
        var current = (_l.Prefs.DotColor ?? DefaultDots).ToLowerInvariant();
        var rings = new List<(Border Ring, string Hex)>();
        Border? customRing = null;
        Border? customFace = null;
        var rainbow = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
        foreach (var (offset, color) in new[] { (0.0, "#ff5a5a"), (0.25, "#ffd24a"), (0.5, "#4fdc7a"), (0.75, "#4aa8ff"), (1.0, "#c46bff") })
            rainbow.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(color), offset));

        void Mark(string hex)
        {
            current = hex;
            var preset = DotPresets.Any(p => p.Hex == hex);
            foreach (var (ring, h) in rings) ring.BorderBrush = h == hex ? Ui.Res("PaperBrush") : Brushes.Transparent;
            if (customRing != null && customFace != null)
            {
                customRing.BorderBrush = preset ? Brushes.Transparent : Ui.Res("PaperBrush");
                customFace.Background = preset ? rainbow : new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
            }
        }

        var strip = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        foreach (var (hex, label) in DotPresets)
        {
            var ring = Swatch(new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)));
            rings.Add((ring, hex));
            var button = SwatchButton(ring, label);
            var chosen = hex;
            button.Click += (_, _) => { _ = _l.SetDotColorAsync(chosen); Mark(chosen); };
            strip.Children.Add(button);
        }

        customFace = new Border { Background = rainbow };
        customRing = Swatch(customFace, out var face);
        var custom = SwatchButton(customRing, "Personalizado…");
        System.Windows.Automation.AutomationProperties.SetName(custom, "Color personalizado");
        custom.Click += (_, _) =>
        {
            var picker = new ColorPicker(current, DefaultDots, DotPresets);
            picker.Changing += hex => { _l.PreviewDotColor(hex); Mark(hex); };
            picker.Committed += hex => { _ = _l.SetDotColorAsync(hex); Mark(hex); };
            ColorPicker.Show(custom, picker);
        };
        strip.Children.Add(custom);
        Mark(current);
        return strip;
    }

    private static Border Swatch(Brush fill) => Swatch(new Border { Background = fill }, out _);

    /// <summary>A round colour chip inside a ring that shows which one is chosen.</summary>
    private static Border Swatch(Border face, out Border faceBack)
    {
        face.CornerRadius = new CornerRadius(12);
        face.Width = 24; face.Height = 24;
        faceBack = face;
        return new Border { Width = 32, Height = 32, CornerRadius = new CornerRadius(16), BorderThickness = new Thickness(2), BorderBrush = Brushes.Transparent, Child = face, Padding = new Thickness(2) };
    }

    private static Button SwatchButton(Border ring, string label)
    {
        var button = new Button { Style = (Style)Application.Current.FindResource("BareButton"), Content = ring, Margin = new Thickness(0, 0, 3, 0), ToolTip = label };
        System.Windows.Automation.AutomationProperties.SetName(button, "Color de los puntos: " + label);
        return button;
    }

    private FrameworkElement ModeChoice()
    {
        var mode = Str("performanceMode");
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        var track = new Border { Background = Ui.Res("TintBrush"), Padding = new Thickness(3), Child = row };
        Ui.MakePill(track);
        foreach (var (value, label) in new[] { ("auto", "Automático"), ("on", "Activado"), ("off", "Desactivado") })
        {
            var pill = new RadioButton { Content = label, GroupName = "perf", IsChecked = mode == value, Style = (Style)Application.Current.FindResource("TabPill") };
            var v = value;
            pill.Checked += async (_, _) => await Set("performanceMode", v);
            row.Children.Add(pill);
        }
        return track;
    }

    private static FrameworkElement FolderRow(string title, string path)
    {
        var open = Ui.Button("Abrir", () => { if (Directory.Exists(path)) Process.Start(new ProcessStartInfo("explorer.exe", $"\"{path}\"") { UseShellExecute = true }); });
        var row = Ui.Row(title, path, open);
        return row;
    }
}
