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
using System.Diagnostics;
using System.IO;
using EmpiLauncher.Ipc;
using Microsoft.VisualBasic.FileIO;

using EmpiLauncher.Linux.Views;

namespace EmpiLauncher.Linux.Views.Tabs;

internal sealed class ModsTab : SettingsTab
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private ModsList? _mods;

    public override string Id => "mods";
    public override string Title => "Mods";

    public override async Task LoadAsync()
    {
        Root.Children.Clear();
        var m = _mods = await _l.Client.CallAsync<ModsList>("mods.list");
        var pack = _l.Selected;
        Root.Children.Add(Ui.Text($"Modpack: {pack?.Name}", "LabelText"));
        ((TextBlock)Root.Children[0]).Margin = new Thickness(4, 0, 0, 10);

        BuildOptional(m);
        BuildRequired(m);
        BuildDropins(m);
        BuildShaders(m);
    }

    private async Task ReloadAsync() => await LoadAsync();

    // ---- optional mods ----

    private void BuildOptional(ModsList m)
    {
        var card = Ui.Section("Mods opcionales", out var body, "Prende o apaga los mods que el modpack deja a tu gusto.");
        if (m.Optional.Count == 0) body.Children.Add(Ui.Text("Este modpack no trae mods opcionales.", "CaptionText"));
        foreach (var node in m.Optional) AddNode(body, node, 0);
        Root.Children.Add(card);
    }

    private void AddNode(StackPanel body, ModNode node, int depth)
    {
        var name = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        name.Children.Add(Ui.Text(node.Name, "BodyText"));
        if (node.Version.Length > 0) name.Children.Add(Ui.Text("v" + node.Version, "CaptionText"));

        Control control = node.Required
            ? Fmt.Pill("OBLIGATORIO")
            : Ui.Switch(node.Enabled, enabled => _ = _l.Client.CallAsync("mods.set", new { path = node.Path, enabled }), node.Name);

        var row = new DockPanel { Margin = new Thickness(depth * 26, 6, 0, 6) };
        DockPanel.SetDock(control, Dock.Right);
        row.Children.Add(control);
        row.Children.Add(name);
        body.Children.Add(row);
        foreach (var child in node.Children) AddNode(body, child, depth + 1);
    }

    // ---- required mods (a long list: built only when asked for) ----

    private void BuildRequired(ModsList m)
    {
        var count = CountNodes(m.Required);
        var card = Ui.Section("Mods del modpack", out var body, "Vienen incluidos y no se pueden quitar: son parte de la versión.");
        var list = new StackPanel { IsVisible = false, Margin = new Thickness(0, 8, 0, 0) };
        var built = false;
        var toggle = Ui.Act($"Ver los {count} mods", () => { }, "GhostButton");
        toggle.HorizontalAlignment = HorizontalAlignment.Left;
        toggle.Click += (_, _) =>
        {
            if (!built)
            {
                built = true;
                foreach (var node in Flatten(m.Required))
                {
                    var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
                    var version = Ui.Text(node.Version.Length > 0 ? "v" + node.Version : "", "CaptionText");
                    DockPanel.SetDock(version, Dock.Right);
                    row.Children.Add(version);
                    row.Children.Add(Ui.Text(node.Name, "BodyText", Ui.Res("Paper2Brush"), 13));
                    list.Children.Add(row);
                }
            }
            var show = list.IsVisible == false;
            list.IsVisible = show;
            toggle.Content = show ? "Ocultar la lista" : $"Ver los {count} mods";
        };
        body.Children.Add(toggle);
        body.Children.Add(list);
        Root.Children.Add(card);
    }

    private static IEnumerable<ModNode> Flatten(IEnumerable<ModNode> nodes) => nodes.SelectMany(n => new[] { n }.Concat(Flatten(n.Children)));
    private static int CountNodes(IEnumerable<ModNode> nodes) => Flatten(nodes).Count();

    // ---- the player's own mods ----

    private void BuildDropins(ModsList m)
    {
        var card = Ui.Section("Tus mods", out var body, "Los mods que añades tú. Arrastra archivos .jar aquí o usa el botón. Si los quitas, se van a la papelera (por si te arrepientes).");
        DragDrop.SetAllowDrop(card, true);
        card.AddHandler(DragDrop.DragOverEvent, (_, e) => e.DragEffects = DragDropEffects.Copy);
        card.AddHandler(DragDrop.DropEvent, async (_, e) =>
        {
            try
            {
                var files = e.DataTransfer?.TryGetFiles()?.Select(f => f.Path.LocalPath).Where(f => f.EndsWith(".jar", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)).ToArray() ?? [];
                if (files.Length == 0) { MainWindow.Instance?.ShowToast("Solo se vale soltar archivos .jar."); return; }
                await _l.Client.CallAsync("dropins.add", new { paths = files, serverId = _l.Selected?.Id });
                await ReloadAsync();
            }
            catch (Exception ex) { MainWindow.Instance?.ShowToast(ex.Message); }
        });

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
        actions.Children.Add(Ui.Act("Añadir mods...", async () =>
        {
            var files = await Pick("Elige mods", ["*.jar", "*.zip", "*.litemod"], true);
            if (files.Length > 0) { await _l.Client.CallAsync("dropins.add", new { paths = files, serverId = _l.Selected?.Id }); await ReloadAsync(); }
        }, "PaperButton"));
        var open = Ui.Act("Abrir carpeta", () => OpenFolder(m.Dropins.Dir));
        open.Margin = new Thickness(8, 0, 0, 0);
        actions.Children.Add(open);
        body.Children.Add(actions);

        if (m.Dropins.Mods.Count == 0) body.Children.Add(Ui.Text("Todavía no le has añadido ningún mod.", "CaptionText"));
        foreach (var mod in m.Dropins.Mods)
        {
            var row = new DockPanel { Margin = new Thickness(0, 6, 0, 6) };
            var toggle = Ui.Switch(!mod.Disabled, async enabled => await _l.Client.CallAsync("dropins.toggle", new { fullName = mod.FullName, enabled }), mod.Name);
            DockPanel.SetDock(toggle, Dock.Right);
            var remove = Ui.Act("Quitar", async () => await RemoveDropin(mod), "DangerButton", 14);
            remove.Margin = new Thickness(0, 0, 14, 0);
            DockPanel.SetDock(remove, Dock.Right);
            row.Children.Add(toggle);
            row.Children.Add(remove);
            row.Children.Add(Ui.Text(mod.Name, "BodyText", null, 13.5));
            body.Children.Add(row);
        }
        Root.Children.Add(card);
    }

    private async Task RemoveDropin(DropinMod mod)
    {
        try
        {
            var resolved = await _l.Client.CallAsync<PathResult>("dropins.resolve", new { fullName = mod.FullName });
            FileSystem.DeleteFile(resolved.Path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
            await ReloadAsync();
        }
        catch (Exception ex) { _l.RaiseNotice($"No pude quitar {mod.Name}: {ex.Message}"); }
    }

    // ---- shaders ----

    private void BuildShaders(ModsList m)
    {
        var card = Ui.Section("Shaders", out var body, "Escoge los shaders con los que se ve el juego.");
        var wrap = new WrapPanel();
        foreach (var pack in m.Shaders.Packs)
        {
            var name = pack.FullName;
            var pill = new RadioButton
            {
                Content = pack.FullName == "OFF" ? "Sin shaders" : pack.Name, GroupName = "shaders", IsChecked = pack.FullName == m.Shaders.Selected,
                Classes = { "tab" }, FontFamily = Pal.Mono, Margin = new Thickness(0, 0, 8, 8), Background = Ui.Res("TintHoverBrush")
            };
            pill.IsCheckedChanged += async (_, _) => { if (pill.IsChecked == true) await _l.Client.CallAsync("shaders.select", new { name }); };
            wrap.Children.Add(pill);
        }
        body.Children.Add(wrap);

        var actions = new StackPanel { Orientation = Orientation.Horizontal };
        actions.Children.Add(Ui.Act("Añadir shaders...", async () =>
        {
            var files = await Pick("Elige shaders", ["*.zip"], true);
            if (files.Length > 0) { await _l.Client.CallAsync("shaders.add", new { paths = files, serverId = _l.Selected?.Id }); await ReloadAsync(); }
        }));
        var open = Ui.Act("Abrir carpeta", () => OpenFolder(m.Shaders.Dir));
        open.Margin = new Thickness(8, 0, 0, 0);
        actions.Children.Add(open);
        body.Children.Add(actions);
        Root.Children.Add(card);
    }

    private static void OpenFolder(string dir)
    {
        Directory.CreateDirectory(dir);
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{dir}\"") { UseShellExecute = true });
    }
}
