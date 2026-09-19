using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;
using EmpiLauncher.Ipc;
using Microsoft.VisualBasic.FileIO;
using Microsoft.Win32;

namespace EmpiLauncher.App.Views.Tabs;

internal sealed class ModsTab : SettingsTab
{
    private readonly Launcher _l = Launcher.Instance;
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
        var card = Ui.Section("Mods opcionales", out var body, "Activa o desactiva los mods que el modpack deja a tu elección.");
        if (m.Optional.Count == 0) body.Children.Add(Ui.Text("Este modpack no tiene mods opcionales.", "CaptionText"));
        foreach (var node in m.Optional) AddNode(body, node, 0);
        Root.Children.Add(card);
    }

    private void AddNode(StackPanel body, ModNode node, int depth)
    {
        var name = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        name.Children.Add(Ui.Text(node.Name, "BodyText"));
        if (node.Version.Length > 0) name.Children.Add(Ui.Text("v" + node.Version, "CaptionText"));

        FrameworkElement control = node.Required
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
        var card = Ui.Section("Mods del modpack", out var body, "Vienen incluidos y no se pueden quitar: forman parte de la versión.");
        var list = new StackPanel { Visibility = Visibility.Collapsed, Margin = new Thickness(0, 8, 0, 0) };
        var built = false;
        var toggle = Ui.Button($"Ver los {count} mods", () => { }, "GhostButton");
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
            var show = list.Visibility != Visibility.Visible;
            list.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
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
        var card = Ui.Section("Tus mods", out var body, "Mods que añades tú. Arrastra archivos .jar aquí o usa el botón. Quitarlos los manda a la papelera.");
        card.AllowDrop = true;
        card.Drop += async (_, e) =>
        {
            if (e.Data.GetData(DataFormats.FileDrop) is string[] files) { await _l.Client.CallAsync("dropins.add", new { paths = files }); await ReloadAsync(); }
        };

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
        actions.Children.Add(Ui.Button("Añadir mods...", async () =>
        {
            var dialog = new OpenFileDialog { Title = "Elige mods", Filter = "Mods (*.jar;*.zip;*.litemod)|*.jar;*.zip;*.litemod", Multiselect = true };
            if (dialog.ShowDialog() == true) { await _l.Client.CallAsync("dropins.add", new { paths = dialog.FileNames }); await ReloadAsync(); }
        }, "PaperButton"));
        var open = Ui.Button("Abrir carpeta", () => OpenFolder(m.Dropins.Dir));
        open.Margin = new Thickness(8, 0, 0, 0);
        actions.Children.Add(open);
        body.Children.Add(actions);

        if (m.Dropins.Mods.Count == 0) body.Children.Add(Ui.Text("Todavía no has añadido ningún mod.", "CaptionText"));
        foreach (var mod in m.Dropins.Mods)
        {
            var row = new DockPanel { Margin = new Thickness(0, 6, 0, 6) };
            var toggle = Ui.Switch(!mod.Disabled, async enabled => await _l.Client.CallAsync("dropins.toggle", new { fullName = mod.FullName, enabled }), mod.Name);
            DockPanel.SetDock(toggle, Dock.Right);
            var remove = Ui.Button("Quitar", async () => await RemoveDropin(mod), "DangerButton", 14);
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
        catch (Exception ex) { _l.RaiseNotice($"No se pudo quitar {mod.Name}: {ex.Message}"); }
    }

    // ---- shaders ----

    private void BuildShaders(ModsList m)
    {
        var card = Ui.Section("Shaders", out var body, "Elige el paquete de shaders que usará el juego.");
        var wrap = new WrapPanel();
        foreach (var pack in m.Shaders.Packs)
        {
            var name = pack.FullName;
            var pill = new RadioButton
            {
                Content = pack.FullName == "OFF" ? "Sin shaders" : pack.Name, GroupName = "shaders", IsChecked = pack.FullName == m.Shaders.Selected,
                Style = (Style)Application.Current.FindResource("TabPill"), Margin = new Thickness(0, 0, 8, 8), Background = Ui.Res("TintHoverBrush")
            };
            pill.Checked += async (_, _) => await _l.Client.CallAsync("shaders.select", new { name });
            wrap.Children.Add(pill);
        }
        body.Children.Add(wrap);

        var actions = new StackPanel { Orientation = Orientation.Horizontal };
        actions.Children.Add(Ui.Button("Añadir shaders...", async () =>
        {
            var dialog = new OpenFileDialog { Title = "Elige shaders", Filter = "Shaders (*.zip)|*.zip", Multiselect = true };
            if (dialog.ShowDialog() == true) { await _l.Client.CallAsync("shaders.add", new { paths = dialog.FileNames }); await ReloadAsync(); }
        }));
        var open = Ui.Button("Abrir carpeta", () => OpenFolder(m.Shaders.Dir));
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
