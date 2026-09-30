using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Styles;
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

        _weights.Clear();
        // the version stays open on top; everything else folds (Ui.Fold), and stays as the player left it until the launcher closes
        Root.Children.Add(UpdatesSection(config));
        Root.Children.Add(StyleSection());
        Root.Children.Add(FieldSection());   // the background's rate and cost sit right under the styles they change

        var launcher = Ui.Fold("launcher", "Launcher", out var l);
        l.Children.Add(Ui.Row("Animación del logo", "Al abrir, mi logo se arma con glitch, y al cerrar se deshace (un clic o cualquier tecla te la salta). Si Windows tiene las animaciones apagadas, no sale.", Ui.Switch(NativeSettings.Splash, v => NativeSettings.Splash = v, "Animación del logo al abrir y cerrar")));
        l.Children.Add(Ui.Row("Banner y fondo animados", "Si un modpack trae banner o fondo animado (GIF, WebP o APNG), lo ves moverse. Solo se mueve mientras tienes el launcher a la vista, y se queda quieto si Windows tiene las animaciones apagadas. Apágalo si quieres ahorrar procesador y disco.", Ui.Switch(_l.Prefs.AnimatedArt != false, v => _ = _l.SetAnimatedArtAsync(v), "Banner y fondo animados")));
        l.Children.Add(Ui.Row("Versiones de prueba", "Te llegan también las versiones del launcher que todavía ando probando. Pueden traer uno que otro bicho, tú sabes ;3", Ui.Switch(Bool("allowPrerelease"), v => _ = Set("allowPrerelease", v), "Versiones de prueba")));
        Root.Children.Add(launcher);

        var folders = Ui.Fold("carpetas", "Carpetas", out var f, "Aquí viven el juego, tus cuentas y la configuración.");
        f.Children.Add(FolderRow("Datos del juego", Str("dataDirectory")));
        f.Children.Add(FolderRow("Instalaciones", config.InstanceDirectory));
        f.Children.Add(FolderRow("Configuración", config.LauncherDirectory));
        Root.Children.Add(folders);

        var report = Ui.Fold("informe", "Informe de fallo y reparación", out var r, "Para pedirme ayuda: un informe con las versiones, tu equipo, el modpack, los mods y el final del registro del juego. Lo ves completito antes de hacer nada; lo puedes copiar, guardar como .txt o mandármelo a soporte (solo si tú quieres). Nunca lleva tu sesión, tus claves, tu correo ni tu usuario de Windows.");
        r.Children.Add(Ui.Row("Ver el informe", "Del modpack que tienes escogido.", Ui.Button("Ver informe", () => ((MainWindow)Application.Current.MainWindow).ShowReport(), "GhostButton", 18)));
        r.Children.Add(Ui.Row("Verificar y reparar", "Reviso todos los archivos del modpack escogido y vuelvo a bajar los que falten o estén dañados. Tus mundos y tus ajustes ni los toco.", Ui.Button("Verificar y reparar", () => ((MainWindow)Application.Current.MainWindow).AskRepair(), "GhostButton", 18)));
        Root.Children.Add(report);

        var cost = Ui.Fold("consumo", "Consumo ahora mismo", out var c, "Lo que están usando ahorita la interfaz y el motor. Cuando la interfaz está quieta, le regresa memoria al sistema.");
        var ui = Ui.Text("", "BodyText");
        var engine = Ui.Text("", "BodyText");
        c.Children.Add(Ui.Row("Interfaz nativa", null, ui));
        c.Children.Add(Ui.Row("Motor del launcher", "Sin Chromium: pura lógica.", engine));
        Root.Children.Add(cost);
        Root.Children.Add(DebugSection());
        try
        {
            var memory = await _l.Client.CallAsync<EngineMemory>("engine.memory");
            var me = Process.GetCurrentProcess();
            ui.Text = $"{me.WorkingSet64 / 1048576.0:0} MB";
            engine.Text = $"{memory.RssMB:0} MB";
        }
        catch (EngineException) { ui.Text = engine.Text = "sin datos"; }
    }

    /// <summary>One switch per number of the debug panel (DebugOverlay), which sits in the top corner while any of them is on.</summary>
    private static FrameworkElement DebugSection()
    {
        var section = Ui.Fold("depuracion", "Depuración", out var body, "Un panelito en la esquina de arriba con números en vivo, por si quieres ver qué tanto trabaja el launcher. Se esconde cuando ves solo el fondo y mientras juegas.");
        foreach (var (id, title, hint) in new[]
        {
            ("fps", "FPS del fondo", "Los cuadros que de verdad dibuja el fondo contra los que le pides, tipo 28 / 30."),
            ("ms", "Tiempo por cuadro", "Cuántos milisegundos le toma a mi código armar cada cuadro del fondo."),
            ("cpu", "Procesador", "Cuánto procesador usan la interfaz y el motor, cada quien por su lado."),
            ("ram", "Memoria", "La RAM que usan la interfaz y el motor."),
            ("gpu", "Tarjeta gráfica", "Qué tanto trabaja la GPU dibujando en toda tu compu, y cuánto de eso es del launcher. Medirlo cuesta tantito, así que solo lo mido si lo prendes."),
            ("field", "Estado del fondo", "Si el fondo se mueve o está quieto (y por qué), y en qué modo de rendimiento andas."),
        })
            body.Children.Add(Ui.Row(title, hint, Ui.Switch(NativeSettings.Debug.Contains(id), v => NativeSettings.SetDebug(id, v), title)));
        return section;
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

    // ---- the style -----------------------------------------------------------------------------------------------------

    /// <summary>
    /// The styles this launcher offers (StyleCatalog.Available: the base one and each one an update switched on), the switch between the
    /// modpack's colour and the style's, and "ver solo el fondo". Picking a style dresses the whole window at once (MainWindow.ChangeStyle).
    /// </summary>
    /// <summary>The style cards' consumption rings: each redraws itself when the frame rates change (they scale the cost).</summary>
    private readonly List<Action> _weights = [];

    private FrameworkElement StyleSection()
    {
        var main = (MainWindow)Application.Current.MainWindow;
        var section = Ui.Fold("estilo", "Estilo", out var body, "Le cambia la cara a todo el launcher: el fondo, las letras, las formas y los colores. Los textos dicen lo mismo, nomás se visten distinto.");
        body.Children.Add(CostNote());
        var cards = new WrapPanel { Margin = new Thickness(0, 6, 0, 4) };
        foreach (var style in StyleCatalog.Available)
        {
            var id = style.Id;
            cards.Children.Add(StyleCard(style, id == StyleTheme.Current, () => main.ChangeStyle(id)));
        }
        body.Children.Add(cards);
        body.Children.Add(Ui.Row("Usar el color del modpack", "Prendido, cada modpack pinta el launcher con su propio color. Apagado, manda el color del estilo: el suyo, o el que tú le pongas aquí abajo.",
            Ui.Switch(NativeSettings.PackAccent, main.SetPackAccent, "Usar el color del modpack")));
        body.Children.Add(Ui.Row("Color del estilo", $"El color de {StyleCatalog.Get(StyleTheme.Current).Name} cuando no manda el del modpack. Escoge uno o hazte el tuyo; cada estilo se acuerda del suyo.", StyleColorChoice()));
        body.Children.Add(Ui.Row("Ver solo el fondo", "El ojo de arriba a la derecha esconde toda la interfaz para que veas el fondo completito. Si dejas el ratón quieto unos segundos se van también los botones, y al moverlo regresan. El ojo, o Esc, trae todo de vuelta.",
            Ui.Button("Probar ahora", () => main.SetBackgroundOnly(true), "GhostButton", 18)));
        return section;
    }

    /// <summary>The honest warning above the cards: a style costs more than a still launcher, and the rings say how much.</summary>
    private static FrameworkElement CostNote()
    {
        var icon = new TextBlock { Text = "", FontFamily = new FontFamily("Segoe MDL2 Assets"), FontSize = 15, Margin = new Thickness(0, 1, 12, 0), VerticalAlignment = VerticalAlignment.Top };
        icon.SetResourceReference(TextBlock.ForegroundProperty, "WarnBrush");
        var text = Ui.Text("Ojo: los estilos gastan más compu que un launcher quieto, y más todavía si apagas el modo de rendimiento o le subes los FPS al fondo. El circulito de cada tarjeta te dice qué tanto pesa cada uno con tus FPS de ahorita (100 % es lo más pesado), para que escojas con cariño.", "CaptionText");
        text.TextWrapping = TextWrapping.Wrap;
        var row = new DockPanel();
        DockPanel.SetDock(icon, Dock.Left);
        row.Children.Add(icon);
        row.Children.Add(text);
        var note = new Border { Padding = new Thickness(14, 10, 14, 10), Margin = new Thickness(0, 4, 0, 8), BorderThickness = new Thickness(1), Child = row };
        note.SetResourceReference(Border.BorderBrushProperty, "HairStrongBrush");
        note.SetResourceReference(Border.BackgroundProperty, "TintBrush");
        note.SetResourceReference(Border.CornerRadiusProperty, "RadiusTile");
        return note;
    }

    /// <summary>How heavy a style is with the rates in use now: its weight at the default rates (15 quiet, 30 moving), scaled by them.</summary>
    private static int WeightNow(StyleInfo style)
    {
        var (idle, active) = FieldGovernor.Rate(15);
        var factor = 0.5 * idle / 15 + 0.5 * active / 30;
        return (int)Math.Clamp(Math.Round(style.Weight * factor), 1, 100);
    }

    /// <summary>A little ring that fills with the style's weight, and the number, in a dark chip on the sample's corner.</summary>
    private FrameworkElement WeightChip(StyleInfo style)
    {
        var paper = new SolidColorBrush(Color.FromRgb(0xf1, 0xef, 0xe8));
        var track = new System.Windows.Shapes.Ellipse { Width = 13, Height = 13, Stroke = new SolidColorBrush(Color.FromArgb(0x55, 0xf1, 0xef, 0xe8)), StrokeThickness = 2 };
        var arc = new System.Windows.Shapes.Path { StrokeThickness = 2, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
        var ring = new Grid { Width = 13, Height = 13, Margin = new Thickness(0, 0, 5, 0), VerticalAlignment = VerticalAlignment.Center, Children = { track, arc } };
        var number = new TextBlock { FontFamily = (FontFamily)Application.Current.FindResource("MonoFont"), FontSize = 10.5, FontWeight = FontWeights.SemiBold, Foreground = paper, VerticalAlignment = VerticalAlignment.Center };
        var chip = new Border
        {
            Background = new SolidColorBrush(Color.FromArgb(0xc8, 0x0b, 0x0b, 0x0d)), CornerRadius = new CornerRadius(9), Padding = new Thickness(5, 2, 7, 2),
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 5, 5),
            Child = new StackPanel { Orientation = Orientation.Horizontal, Children = { ring, number } }
        };
        void Update()
        {
            var w = WeightNow(style);
            // green, then amber, then red: the ring says at a glance what the number says
            var tone = w < 35 ? Color.FromRgb(0x6f, 0xd0, 0x8c) : w < 65 ? Color.FromRgb(0xf2, 0xb5, 0x4a) : Color.FromRgb(0xff, 0x6b, 0x5e);
            arc.Stroke = new SolidColorBrush(tone);
            arc.Data = w >= 99 ? new EllipseGeometry(new Point(6.5, 6.5), 5.5, 5.5) : Arc(6.5, 6.5, 5.5, Math.Max(0.03, w / 100.0));
            number.Text = $"{w} %";
            chip.ToolTip = $"Qué tanto pesa {style.Name} con tus FPS de ahorita, comparado con los demás estilos. 100 % es lo más pesado.";
            System.Windows.Automation.AutomationProperties.SetName(chip, $"Consumo de {style.Name}: {w} por ciento");
        }
        _weights.Add(Update);
        Update();
        return chip;
    }

    /// <summary>One style: a small sample of it, its name and what it is like. The one in use is outlined.</summary>
    private Button StyleCard(StyleInfo style, bool chosen, Action pick)
    {
        // the sample in the colour the player gave the style, if they gave it one
        if (NativeSettings.StyleColors.TryGetValue(style.Id, out var mine))
            try { style = style with { Accent = (Color)ColorConverter.ConvertFromString(mine) }; } catch (FormatException) { }
        var picture = new Border { Height = 58, CornerRadius = new CornerRadius(10), Background = Sample(style), ClipToBounds = true };
        var sample = new Grid { Margin = new Thickness(0, 0, 0, 10), Children = { picture, WeightChip(style) } };
        var name = Ui.Text(style.Name, "BodyText");
        name.FontWeight = FontWeights.SemiBold;
        var head = new DockPanel();
        if (chosen)
        {
            var inUse = Ui.Text("EN USO", "LabelText", null, 10.5);
            inUse.VerticalAlignment = VerticalAlignment.Center;
            DockPanel.SetDock(inUse, Dock.Right);
            head.Children.Add(inUse);
        }
        head.Children.Add(name);
        var summary = Ui.Text(style.Summary, "CaptionText");
        summary.Margin = new Thickness(0, 4, 0, 0);
        var face = new Border
        {
            Style = (Style)Application.Current.FindResource("Tile"), Width = 196, MinHeight = 158, Padding = new Thickness(12),
            BorderThickness = new Thickness(chosen ? 2 : 1), BorderBrush = Ui.Res(chosen ? "PaperBrush" : "HairBrush"),
            Child = new StackPanel { Children = { sample, head, summary } }
        };
        var button = new Button { Style = (Style)Application.Current.FindResource("BareButton"), Content = face, Margin = new Thickness(0, 0, 10, 10), Cursor = System.Windows.Input.Cursors.Hand };
        System.Windows.Automation.AutomationProperties.SetName(button, "Estilo " + style.Name + (chosen ? ", en uso" : ""));
        button.Click += (_, _) => pick();
        return button;
    }

    /// <summary>A few square centimetres of the style, drawn small: its ground, its shapes and its colour (the ones not drawn yet show their colour).</summary>
    private static Brush Sample(StyleInfo style)
    {
        var group = new DrawingGroup();
        var box = new Rect(0, 0, 172, 58);
        switch (style.Id)
        {
            case "celestial":
                group.Children.Add(new GeometryDrawing(new SolidColorBrush(Color.FromRgb(0x07, 0x06, 0x0c)), null, new RectangleGeometry(box)));
                foreach (var (x, y, rx, color) in new[] { (130.0, 14.0, 70.0, "#ff8fd0"), (60.0, 46.0, 60.0, "#7fe3ff"), (160.0, 52.0, 50.0, "#c9a3ff") })
                {
                    var glow = new RadialGradientBrush { Center = new Point(0.5, 0.5), GradientOrigin = new Point(0.5, 0.5) };
                    glow.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(color), 0));
                    glow.GradientStops.Add(new GradientStop(Colors.Transparent, 1));
                    group.Children.Add(new GeometryDrawing(glow, null, new EllipseGeometry(new Point(x, y), rx, rx * 0.45)));
                }
                var rnd = new Random(3);
                for (var i = 0; i < 26; i++)
                    group.Children.Add(new GeometryDrawing(Brushes.White, null, new EllipseGeometry(new Point(rnd.NextDouble() * 172, rnd.NextDouble() * 58), 0.8, 0.8)));
                break;
            case StyleCatalog.Base:
                group.Children.Add(new GeometryDrawing(new SolidColorBrush(Color.FromRgb(0x0b, 0x0b, 0x0d)), null, new RectangleGeometry(box)));
                for (var row = 0; row < 7; row++)
                    for (var col = 0; col < 20; col++)
                    {
                        var x = col * 9 + (row % 2) * 4.5; var y = 4 + row * 8;
                        var tone = Math.Max(0, 1 - Math.Sqrt(Math.Pow(x / 60.0, 2) + Math.Pow((58 - y) / 40.0, 2)));
                        var r = 0.7 + 2.6 * tone;
                        group.Children.Add(new GeometryDrawing(new SolidColorBrush(tone > 0.55 ? style.Accent : Color.FromRgb(0x64, 0x63, 0x5f)), null, new EllipseGeometry(new Point(x, y), r, r)));
                    }
                break;
            case "minimal":
                Paint(group, "#0c0c0d", new RectangleGeometry(box));
                Paint(group, "#18181b", new RectangleGeometry(new Rect(10, 9, 70, 40), 6, 6), "#2a2a2e");
                Paint(group, "#18181b", new RectangleGeometry(new Rect(88, 9, 74, 40), 6, 6), "#2a2a2e");
                Paint(group, null, new EllipseGeometry(new Point(45, 29), 12, 12), "#2a2a2e", 3);
                Paint(group, null, Arc(45, 29, 12, 0.7), style.Accent, 3);
                for (var i = 0; i < 7; i++) { var h = 6 + 22 * Math.Abs(Math.Sin(i * 1.7 + 1)); Paint(group, i == 5 ? style.Accent : Color.FromRgb(0x3f, 0x3f, 0x46), new RectangleGeometry(new Rect(96 + i * 9, 43 - h, 5, h), 1.5, 1.5)); }
                break;
            case "shell":
                Paint(group, "#0d0c0b", new RectangleGeometry(box));
                for (var x = 0; x < 172; x += 12) Paint(group, "#1b1916", new RectangleGeometry(new Rect(x, 0, 1, 58)));
                for (var y = 0; y < 58; y += 12) Paint(group, "#1b1916", new RectangleGeometry(new Rect(0, y, 172, 1)));
                Say(group, "> empi --jugar", "Cascadia Mono, Consolas", 9, "#d9d4c7", 10, 10);
                Say(group, "[OK] 118 mods", "Cascadia Mono, Consolas", 9, "#77736a", 10, 24);
                Paint(group, style.Accent, new RectangleGeometry(new Rect(10, 40, 6, 10)));
                Paint(group, null, new RectangleGeometry(new Rect(122, 14, 26, 26)), style.Accent, 1.5);
                Paint(group, null, new RectangleGeometry(new Rect(132, 6, 26, 26)), style.Accent, 1);
                break;
            case "explorer":
                var sky = new LinearGradientBrush(Color.FromRgb(0x2f, 0x6c, 0xd8), Color.FromRgb(0xbf, 0xdc, 0xff), 90);
                group.Children.Add(new GeometryDrawing(sky, null, new RectangleGeometry(box)));
                for (var row = 0; row < 3; row++) for (var col = 0; col < 12; col++) if ((row + col) % 2 == 0) Paint(group, "#1a1a1a", new RectangleGeometry(new Rect(col * 15 - row * 3, 40 + row * 6, 15 + row * 2, 6)));
                Paint(group, "#0055ea", new RectangleGeometry(new Rect(50, 10, 76, 34), 4, 4));
                Paint(group, "#ece9d8", new RectangleGeometry(new Rect(52.5, 20, 71, 22)));
                Paint(group, "#e0553a", new RectangleGeometry(new Rect(114, 12.5, 8, 6), 1.5, 1.5));
                Paint(group, "#5cd05c", new RectangleGeometry(new Rect(58, 32, 36, 6), 2, 2));
                break;
            case "remember":
                Paint(group, "#8fa3d8", new RectangleGeometry(box));
                for (var i = 0; i < 40; i++) Paint(group, null, new LineGeometry(new Point(i * 5, 0), new Point(i * 5 - 14, 40)), "#b7a6d8", 1);
                Paint(group, "#f07a3a", new EllipseGeometry(new Point(140, 14), 8, 8));
                Paint(group, "#2f7a42", new EllipseGeometry(new Point(86, 88), 120, 46));
                Paint(group, "#c9503e", new RectangleGeometry(new Rect(106, 26, 22, 18)), "#3a2418", 1.2);
                var roof = new PathGeometry([new PathFigure(new Point(103, 27), [new PolyLineSegment([new Point(117, 15), new Point(131, 27)], true)], true)]);
                Paint(group, "#7a2f25", roof, "#3a2418", 1.2);
                Paint(group, "#f6dc8a", new RectangleGeometry(new Rect(110, 30, 6, 6)));
                break;
            case "oleaje":
                group.Children.Add(new GeometryDrawing(new LinearGradientBrush(Color.FromRgb(0x02, 0x05, 0x0c), Color.FromRgb(0x0c, 0x22, 0x4a), 20), null, new RectangleGeometry(box)));
                for (var i = 0; i < 7; i++)
                {
                    var y = 6 + i * 8.0;
                    var wave = new PathGeometry([new PathFigure(new Point(60, y), [new BezierSegment(new Point(90, y - 7), new Point(120, y + 9), new Point(172, y - 2), true)], false)]);
                    Paint(group, null, wave, i % 3 == 0 ? style.Accent : Color.FromArgb(150, 220, 236, 255), 0.9);
                }
                break;
            case "termico":
                Paint(group, "#040306", new RectangleGeometry(box));
                foreach (var (x, y, r, hex) in new[] { (120.0, 30.0, 46.0, "#7c5cff"), (126.0, 28.0, 30.0, "#ff4f9a"), (130.0, 27.0, 17.0, "#ff8a3d"), (132.0, 26.0, 7.0, "#fff3e0") })
                {
                    var heat = new RadialGradientBrush((Color)ColorConverter.ConvertFromString(hex), Colors.Transparent);
                    group.Children.Add(new GeometryDrawing(heat, null, new EllipseGeometry(new Point(x, y), r, r * 0.8)));
                }
                Paint(group, null, new RectangleGeometry(new Rect(112, 16, 26, 20)), Color.FromArgb(170, 255, 255, 255), 0.7);
                break;
            case "core":
                Paint(group, "#050506", new RectangleGeometry(box));
                for (var ring = 0; ring < 9; ring++)
                {
                    var ry = 3 + 20 * Math.Sin((ring + 0.5) / 9 * Math.PI);
                    Paint(group, null, new EllipseGeometry(new Point(118, 7 + ring * 5.5), ry * 1.2, ry * 0.32), "#c8f1ede0", 0.7);
                }
                Paint(group, style.Accent, new EllipseGeometry(new Point(82, 16), 1.6, 1.6));
                Paint(group, null, new LineGeometry(new Point(40, 12), new Point(82, 16)), "#73f1ede0", 0.6);
                Say(group, "MODS", "Cascadia Mono, Consolas", 6, "#b9b5a9", 14, 6);
                break;
            case "words":
                Paint(group, "#ece3cf", new RectangleGeometry(box));
                for (var line = 0; line < 5; line++)
                    for (var bar = 0; bar < 3; bar++)
                    {
                        var x = 8 + bar * 56 + (line * 13 % 9); var w = 30 + (line * 7 + bar * 11) % 20;
                        if (line == 2 && bar == 1) { Say(group, "espera", "Sitka Text, Georgia", 10, "#2b2620", x, 23); Paint(group, null, new EllipseGeometry(new Point(x + 16, 30), 22, 9), style.Accent, 1.2); continue; }
                        Paint(group, "#15120f", new RectangleGeometry(new Rect(x, 6 + line * 10, w, 7), 2, 2));
                    }
                break;
            case "punk":
                Paint(group, "#e4dfd3", new RectangleGeometry(box));
                Paint(group, style.Accent, Torn(12, 6, 110, 40, 3));
                Paint(group, "#141214", Torn(104, 26, 64, 36, 5));
                var x0 = 20.0;
                foreach (var (ch, fill, ink) in new[] { ("P", "#141214", "#ffffff"), ("U", "#f1ece2", "#141214"), ("N", "#ffffff", "#141214"), ("K", "#d8d2c4", "#141214") })
                {
                    Paint(group, fill, new RectangleGeometry(new Rect(x0, 16, 16, 20)));
                    Say(group, ch, "Impact", 16, ink, x0 + 3, 16);
                    x0 += 19;
                }
                break;
            default:
                group.Children.Add(new GeometryDrawing(new SolidColorBrush(style.Accent), null, new RectangleGeometry(box)));
                break;
        }
        group.ClipGeometry = new RectangleGeometry(box);   // what reaches past the sample (a glow, a hill) must not change its framing
        group.Freeze();
        return new DrawingBrush(group) { Stretch = Stretch.UniformToFill };
    }

    private static void Paint(DrawingGroup group, string? fill, Geometry shape, string? stroke = null, double width = 1) =>
        group.Children.Add(new GeometryDrawing(fill == null ? null : new SolidColorBrush((Color)ColorConverter.ConvertFromString(fill)),
            stroke == null ? null : new Pen(new SolidColorBrush((Color)ColorConverter.ConvertFromString(stroke)), width), shape));

    private static void Paint(DrawingGroup group, Color? fill, Geometry shape, Color? stroke = null, double width = 1) =>
        group.Children.Add(new GeometryDrawing(fill is { } f ? new SolidColorBrush(f) : null, stroke is { } s ? new Pen(new SolidColorBrush(s), width) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round } : null, shape));

    private static void Say(DrawingGroup group, string text, string family, double size, string color, double x, double y)
    {
        var shaped = new FormattedText(text, System.Globalization.CultureInfo.InvariantCulture, FlowDirection.LeftToRight, new Typeface(family), size, Brushes.Black, 1.0);
        Paint(group, color, shaped.BuildGeometry(new Point(x, y)));
    }

    /// <summary>Part of a circle, from the top, clockwise: <paramref name="share"/> of the way round.</summary>
    private static Geometry Arc(double cx, double cy, double r, double share)
    {
        var a = share * Math.Tau - Math.PI / 2;
        return new PathGeometry([new PathFigure(new Point(cx, cy - r), [new ArcSegment(new Point(cx + Math.Cos(a) * r, cy + Math.Sin(a) * r), new Size(r, r), 0, share > 0.5, SweepDirection.Clockwise, true)], false)]);
    }

    /// <summary>A small scrap with torn edges, for Punk's sample.</summary>
    private static Geometry Torn(double x, double y, double w, double h, int seed)
    {
        var rnd = new Random(seed);
        var points = new List<Point>();
        for (var i = 0.0; i < w; i += 4) points.Add(new Point(x + i, y + rnd.NextDouble() * 2));
        for (var i = 0.0; i < h; i += 4) points.Add(new Point(x + w - rnd.NextDouble() * 2, y + i));
        for (var i = w; i > 0; i -= 4) points.Add(new Point(x + i, y + h - rnd.NextDouble() * 2));
        for (var i = h; i > 0; i -= 4) points.Add(new Point(x + rnd.NextDouble() * 2, y + i));
        return new PathGeometry([new PathFigure(points[0], [new PolyLineSegment(points.Skip(1), true)], true)]);
    }

    // ---- the living background ---------------------------------------------------------------------------------------

    /// <summary>
    /// The living background: the performance mode and the frame rates it allows, the three motion choices, its colour and intensity, and,
    /// always visible, whether it is moving right now (and how fast) or why not.
    /// </summary>
    private FrameworkElement FieldSection()
    {
        var section = Ui.Fold("fondo", "Fondo", out var body, StyleTheme.Current == StyleCatalog.Base
            ? "Los puntitos de fondo: se mueven despacio, se acercan al puntero y agarran el color del modpack."
            : "El fondo del estilo que escogiste: se mueve despacio y le contesta al puntero y a los clics.");
        var status = Ui.Text("", "CaptionText");
        var rates = new StackPanel();

        void Refresh()
        {
            FieldGovernor.Evaluate(Application.Current.MainWindow);
            status.Text = FieldGovernor.Allowed ? $"Ahora mismo: moviéndose {FieldGovernor.RateText()}." : "Ahora mismo: quieto porque " + FieldGovernor.Reason + ".";
            foreach (var update in _weights) update();
        }

        body.Children.Add(Ui.Row("Modo de rendimiento", "Activado, topo el fondo en 15 FPS para que tu compu descanse. Automático hace lo mismo solito si tu equipo tiene menos de 6 GB; si no, se mueve entre el mínimo y el máximo que tú le pongas. Desactivado, tú mandas.",
            ModeChoice(() => { Rates(rates, Refresh); Refresh(); })));
        Rates(rates, Refresh);
        body.Children.Add(rates);

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
        body.Children.Add(Ui.Row("Movimiento", "Automático sigue moviéndose mientras descargas o actualizas, y solo se queda quieto si hay algo más importante: Minecraft abierto o poca memoria libre. Siempre no se detiene por eso. Apagado lo deja como foto.", track));
        Refresh();
        status.Margin = new Thickness(0, 4, 0, 0);
        body.Children.Add(status);
        // the dots' own colour belongs to the base style's field; the other styles take the style's colour (Estilo, above)
        if (StyleTheme.Current == StyleCatalog.Base)
            body.Children.Add(Ui.Row("Color de los puntos y las ondas", "El gris es el de siempre. Escoge uno o hazte el tuyo. Cuando una onda del color del modpack se cruza con la tuya, los puntos se mezclan.", DotColorChoice()));
        body.Children.Add(Ui.Row("Intensidad del fondo", "Bájale para un fondo más calmadito: se ve más tenue y se sigue moviendo igual.", DotOpacityChoice()));
        return section;
    }

    /// <summary>The frame rate rows, as the performance mode allows: locked while saving, a minimum and a maximum in automatic, one rate when off.</summary>
    private void Rates(StackPanel panel, Action refresh)
    {
        panel.Children.Clear();
        void Changed() { _l.NotifyFieldSettings(); refresh(); }
        if (FieldGovernor.Saving)
        {
            var locked = FpsSlider(FieldGovernor.SaverFps, _ => { }, "FPS del fondo (fijos)");
            locked.IsEnabled = false;
            panel.Children.Add(Ui.Row("FPS del fondo", FieldGovernor.PerfMode == "on"
                ? "El modo de rendimiento lo tiene topado en 15. Si quieres escoger tú, ponlo en automático o desactívalo."
                : "Tu equipo tiene menos de 6 GB, así que en automático lo topo en 15 para no ahogarlo. Si quieres escoger tú, desactiva el modo de rendimiento.", locked));
            return;
        }
        if (FieldGovernor.PerfMode == "off")
        {
            panel.Children.Add(Ui.Row("FPS del fondo", "Tú mandas: el fondo va siempre a estos FPS, aunque tu compu sude. Más FPS se ve más fluido y gasta más.",
                FpsSlider(NativeSettings.FpsFixed, v => { NativeSettings.FpsFixed = v; Changed(); }, "FPS del fondo")));
            return;
        }
        Slider? min = null, max = null;
        var minRow = FpsSlider(NativeSettings.FpsMin, v => { NativeSettings.FpsMin = v; if (max != null && max.Value < v) max.Value = v; Changed(); }, "FPS mínimo del fondo");
        var maxRow = FpsSlider(NativeSettings.FpsMax, v => { NativeSettings.FpsMax = v; if (min != null && min.Value > v) min.Value = v; Changed(); }, "FPS máximo del fondo");
        min = (Slider)((Panel)minRow).Children[0];
        max = (Slider)((Panel)maxRow).Children[0];
        panel.Children.Add(Ui.Row("FPS mínimo", "Cuando no estás moviendo nada: el fondo sigue vivo pero gastando poquito.", minRow));
        panel.Children.Add(Ui.Row("FPS máximo", "Cuando mueves el ratón, haces clic o llega un estilo. Si tu compu no aguanta, lo bajo solito hacia el mínimo.", maxRow));
    }

    /// <summary>A frame rate slider, 5 to 60 in steps of 5, with its number. The change applies at once.</summary>
    private static FrameworkElement FpsSlider(int value, Action<int> changed, string name)
    {
        var slider = new Slider
        {
            Style = (Style)Application.Current.FindResource("RangeSlider"), Minimum = NativeSettings.FpsLowest, Maximum = NativeSettings.FpsHighest, SmallChange = 5, LargeChange = 10,
            TickFrequency = 5, IsSnapToTickEnabled = true, Width = 190, Value = value
        };
        System.Windows.Automation.AutomationProperties.SetName(slider, name);
        var number = Ui.Text($"{value} FPS", "BodyText", null, 16);
        number.FontWeight = FontWeights.SemiBold; number.MinWidth = 70; number.TextAlignment = TextAlignment.Right; number.VerticalAlignment = VerticalAlignment.Center; number.Margin = new Thickness(10, 0, 0, 0);
        slider.ValueChanged += (_, e) =>
        {
            number.Text = $"{slider.Value:0} FPS";
            if (Math.Abs(e.NewValue - e.OldValue) >= 1) changed((int)Math.Round(slider.Value));
        };
        return new StackPanel { Orientation = Orientation.Horizontal, Children = { slider, number } };
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

    /// <summary>The base style's dots: presets plus the launcher's own colour picker, shown live and saved by the engine.</summary>
    private FrameworkElement DotColorChoice() => ColorChoice((_l.Prefs.DotColor ?? DefaultDots).ToLowerInvariant(), DefaultDots, DotPresets, "Color de los puntos",
        hex => _l.PreviewDotColor(hex), hex => _ = _l.SetDotColorAsync(hex));

    /// <summary>
    /// The style's own colour, used when the modpack's does not win: the style's first (its identity), then a few more, then the picker.
    /// Each style remembers its own; picking the style's own colour again forgets the choice.
    /// </summary>
    private FrameworkElement StyleColorChoice()
    {
        var style = StyleCatalog.Get(StyleTheme.Current);
        var own = style.AccentHex.ToLowerInvariant();
        (string Hex, string Label)[] presets =
        [
            (own, "El del estilo"), ("#ff3d8b", "Rosa"), ("#e2574c", "Rojo"), ("#ff7a2f", "Naranja"), ("#f2b54a", "Ámbar"),
            ("#c8f560", "Lima"), ("#4caf6d", "Verde"), ("#39c6e0", "Cian"), ("#4a6fd8", "Azul"), ("#8b6bd6", "Violeta")
        ];
        presets = presets.DistinctBy(p => p.Hex).ToArray();
        var current = NativeSettings.StyleColors.TryGetValue(style.Id, out var mine) ? mine : own;
        void Apply(string hex, bool save) { NativeSettings.SetStyleColor(style.Id, hex == own ? null : hex, save); Launcher.RefreshAccent(); if (save) foreach (var update in _weights) update(); }
        return ColorChoice(current, own, presets, "Color del estilo", hex => Apply(hex, false), hex => Apply(hex, true));
    }

    /// <summary>Round presets plus a rainbow one that opens the launcher's own colour picker. Whatever is picked is shown live, then committed.</summary>
    private static FrameworkElement ColorChoice(string current, string fallback, (string Hex, string Label)[] presets, string name, Action<string> preview, Action<string> commit)
    {
        var rings = new List<(Border Ring, string Hex)>();
        Border? customRing = null;
        Border? customFace = null;
        var rainbow = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
        foreach (var (offset, color) in new[] { (0.0, "#ff5a5a"), (0.25, "#ffd24a"), (0.5, "#4fdc7a"), (0.75, "#4aa8ff"), (1.0, "#c46bff") })
            rainbow.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(color), offset));

        void Mark(string hex)
        {
            current = hex;
            var preset = presets.Any(p => p.Hex == hex);
            foreach (var (ring, h) in rings) ring.BorderBrush = h == hex ? Ui.Res("PaperBrush") : Brushes.Transparent;
            if (customRing != null && customFace != null)
            {
                customRing.BorderBrush = preset ? Brushes.Transparent : Ui.Res("PaperBrush");
                customFace.Background = preset ? rainbow : new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
            }
        }

        var strip = new WrapPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, MaxWidth = 340 };
        foreach (var (hex, label) in presets)
        {
            var ring = Swatch(new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)));
            rings.Add((ring, hex));
            var button = SwatchButton(ring, label, name);
            var chosen = hex;
            button.Click += (_, _) => { commit(chosen); Mark(chosen); };
            strip.Children.Add(button);
        }

        customFace = new Border { Background = rainbow };
        customRing = Swatch(customFace, out _);
        var custom = SwatchButton(customRing, "Personalizado…", name);
        System.Windows.Automation.AutomationProperties.SetName(custom, name + " personalizado");
        custom.Click += (_, _) =>
        {
            var picker = new ColorPicker(current, fallback, presets, presets[0].Label);
            picker.Changing += hex => { preview(hex); Mark(hex); };
            picker.Committed += hex => { commit(hex); Mark(hex); };
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

    private static Button SwatchButton(Border ring, string label, string name)
    {
        var button = new Button { Style = (Style)Application.Current.FindResource("BareButton"), Content = ring, Margin = new Thickness(0, 0, 3, 0), ToolTip = label };
        System.Windows.Automation.AutomationProperties.SetName(button, name + ": " + label);
        return button;
    }

    /// <summary>Automático, Activado or Desactivado. The engine keeps it; the backgrounds read it at once (the config is read again).</summary>
    private FrameworkElement ModeChoice(Action changed)
    {
        var mode = FieldGovernor.PerfMode;   // unset means automatic
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        var track = new Border { Background = Ui.Res("TintBrush"), Padding = new Thickness(3), Child = row };
        Ui.MakePill(track);
        foreach (var (value, label) in new[] { ("auto", "Automático"), ("on", "Activado"), ("off", "Desactivado") })
        {
            var pill = new RadioButton { Content = label, GroupName = "perf", IsChecked = mode == value, Style = (Style)Application.Current.FindResource("TabPill") };
            var v = value;
            pill.Checked += async (_, _) =>
            {
                await Set("performanceMode", v);
                await _l.RefreshConfigAsync();   // FieldGovernor reads the config: without this the new mode only counted after reopening Ajustes
                _l.NotifyFieldSettings();
                changed();
            };
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
