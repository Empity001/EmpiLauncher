using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;
using EmpiLauncher.Linux.Styles;
using Path = System.IO.Path;
using Visual = Avalonia.Visual;
using Brush = Avalonia.Media.IBrush;
using Shape = Avalonia.Controls.Shapes.Shape;
using System.Text.Json;

using EmpiLauncher.Linux.Views;

namespace EmpiLauncher.Linux.Views.Tabs;

internal sealed class MinecraftTab : SettingsTab
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
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

        var window = Ui.Section("Ventana del juego", out var w, "El tamaño con el que se abre Minecraft. Con 0 lo decide el propio juego.");
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
        w.Children.Add(Ui.Row("Pantalla completa", "El juego se abre ocupando toda la pantalla.", Ui.Switch(Bool("fullscreen"), v => _ = Save("fullscreen", v), "Pantalla completa")));
        Root.Children.Add(window);

        var start = Ui.Section("Al iniciar", out var s);
        s.Children.Add(Ui.Row("Conectar al servidor", "Al abrir el juego entras directito al servidor del modpack.", Ui.Switch(Bool("autoConnect"), v => _ = Save("autoConnect", v), "Conectar al servidor")));
        s.Children.Add(Ui.Row("Separar el juego del launcher", "Minecraft sigue abierto aunque cierres el launcher.", Ui.Switch(Bool("launchDetached"), v => _ = Save("launchDetached", v), "Separar el juego del launcher")));
        Root.Children.Add(start);
    }
}
