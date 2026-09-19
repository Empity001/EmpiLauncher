using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views.Tabs;

internal sealed class AboutTab : SettingsTab
{
    private readonly Launcher _l = Launcher.Instance;
    public override string Id => "about";
    public override string Title => "Acerca";

    private string Str(string key) => _l.Config!.Settings.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    private bool Bool(string key) => _l.Config!.Settings.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.True;

    public override async Task LoadAsync()
    {
        await _l.RefreshConfigAsync();
        Root.Children.Clear();
        var config = _l.Config!;

        // ---- launcher ----
        var launcher = Ui.Section("Launcher", out var l);
        l.Children.Add(Ui.Row("Modo de rendimiento", "Automático ahorra recursos en equipos justos: sin efectos que cuesten memoria o GPU.", ModeChoice()));
        l.Children.Add(Ui.Row("Versiones de prueba", "Recibir también las versiones del launcher que aún se están probando.", Ui.Switch(Bool("allowPrerelease"), v => _ = Set("allowPrerelease", v), "Versiones de prueba")));
        Root.Children.Add(launcher);
        Root.Children.Add(FieldSection());

        // ---- folders ----
        var folders = Ui.Section("Carpetas", out var f, "Aquí viven el juego, las cuentas y la configuración.");
        f.Children.Add(FolderRow("Datos del juego", Str("dataDirectory")));
        f.Children.Add(FolderRow("Instalaciones", config.InstanceDirectory));
        f.Children.Add(FolderRow("Configuración", config.LauncherDirectory));
        Root.Children.Add(folders);

        // ---- what it costs, measured live ----
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

        var about = Ui.Section(null, out var a);
        a.Children.Add(Ui.Text("EmpiLauncher nativo, versión de prueba", "BodyText"));
        a.Children.Add(Ui.Text("La interfaz es nativa de Windows. La lógica de descarga, verificación y lanzamiento es la misma del launcher clásico, ejecutada en un motor aparte sin Chromium.", "CaptionText"));
        ((TextBlock)a.Children[1]).Margin = new Thickness(0, 6, 0, 0);
        Root.Children.Add(about);
    }

    private Task Set(string key, object value) => _l.Client.CallAsync("config.set", new { key, value });

    /// <summary>The living background: three choices and, always visible, whether it is moving right now and why not if it is not.</summary>
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
        body.Children.Add(Ui.Row("Campo de puntos", "Automático se apaga solo si algo importa más: descargas, Minecraft, poca memoria, modo de rendimiento. Siempre no se apaga por eso.", track));
        Refresh();
        status.Margin = new Thickness(0, 4, 0, 0);
        body.Children.Add(status);
        return section;
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
