using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Tabs;

internal sealed class MinecraftTab : SettingsTab
{
    private readonly Launcher _l = Launcher.Instance;
    public override string Id => "minecraft";
    public override string Title => "Minecraft";

    private JsonElement Setting(string key) => _l.Config!.Settings.TryGetValue(key, out var v) ? v : default;
    private bool Bool(string key) => Setting(key).ValueKind == JsonValueKind.True;
    private string Text(string key) => Setting(key).ValueKind switch { JsonValueKind.Number => Setting(key).GetRawText(), JsonValueKind.String => Setting(key).GetString() ?? "", _ => "" };

    private Task Save(string key, object value) => _l.Client.CallAsync("config.set", new { key, value });

    // The classic launcher's own rule: a whole number, zero or more (zero lets Minecraft choose).
    private static bool ValidSize(string text) => int.TryParse(text.Trim(), out var n) && n >= 0;

    public override async Task LoadAsync()
    {
        await _l.RefreshConfigAsync();
        Root.Children.Clear();

        var window = Ui.Section("Ventana del juego", out var w, "Tamaño con el que se abre Minecraft. Con 0 elige el propio juego.");
        var size = new StackPanel { Orientation = Orientation.Horizontal };
        var width = Ui.Box(Text("gameWidth"), text => _ = Save("gameWidth", int.Parse(text.Trim())), "Ancho de la ventana", ValidSize);
        var height = Ui.Box(Text("gameHeight"), text => _ = Save("gameHeight", int.Parse(text.Trim())), "Alto de la ventana", ValidSize);
        width.Width = 96; height.Width = 96;
        size.Children.Add(width);
        size.Children.Add(Ui.Text("x", "LabelText", null, 14));
        ((TextBlock)size.Children[1]).Margin = new Thickness(10, 0, 10, 0);
        ((TextBlock)size.Children[1]).VerticalAlignment = VerticalAlignment.Center;
        size.Children.Add(height);
        w.Children.Add(Ui.Row("Resolución", null, size));
        w.Children.Add(Ui.Row("Pantalla completa", "Abre el juego ocupando toda la pantalla.", Ui.Switch(Bool("fullscreen"), v => _ = Save("fullscreen", v), "Pantalla completa")));
        Root.Children.Add(window);

        var start = Ui.Section("Al iniciar", out var s);
        s.Children.Add(Ui.Row("Conectar al servidor", "Entra directamente al servidor del modpack al abrir el juego.", Ui.Switch(Bool("autoConnect"), v => _ = Save("autoConnect", v), "Conectar al servidor")));
        s.Children.Add(Ui.Row("Separar el juego del launcher", "Minecraft sigue abierto aunque cierres el launcher.", Ui.Switch(Bool("launchDetached"), v => _ = Save("launchDetached", v), "Separar el juego del launcher")));
        Root.Children.Add(start);
    }
}
