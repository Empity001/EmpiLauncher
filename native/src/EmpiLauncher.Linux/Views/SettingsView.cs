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
using EmpiLauncher.Linux.Views.Tabs;
using Shape = Avalonia.Controls.Shapes.Shape;

namespace EmpiLauncher.Linux.Views;

/// <summary>One tab of the Settings screen. Build() is instant and draws the frame; LoadAsync() fills it from the engine.</summary>
internal abstract class SettingsTab
{
    public abstract string Id { get; }
    public abstract string Title { get; }
    public StackPanel Root { get; } = new();
    public abstract Task LoadAsync();
    /// <summary>Called when the tab is left or the screen closes: save what is pending and let go of what is heavy.</summary>
    public virtual void Release() { }

    /// <summary>The system file chooser: the files picked (full paths), or none.</summary>
    protected static async Task<string[]> Pick(string title, string[] patterns, bool multiple)
    {
        try
        {
            if (MainWindow.Instance?.StorageProvider is not { } storage) return [];
            var options = new Avalonia.Platform.Storage.FilePickerOpenOptions
            {
                Title = title, AllowMultiple = multiple,
                FileTypeFilter = [new Avalonia.Platform.Storage.FilePickerFileType("Archivos") { Patterns = patterns }, Avalonia.Platform.Storage.FilePickerFileTypes.All]
            };
            var files = await storage.OpenFilePickerAsync(options);
            return files.Select(f => f.Path.LocalPath).ToArray();
        }
        catch (Exception) { return []; }
    }
}

public sealed class SettingsView : UserControl
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private SettingsTab? _current;
    private int _loadToken;

    public event Action? Done;
    /// <summary>A tab finished loading: the window may schedule a memory trim.</summary>
    public event Action? TabLoaded;

    /// <summary>The tab on screen, and how far it is scrolled: a change of style rebuilds this screen and puts both back.</summary>
    public string CurrentTab => _current?.Id ?? "account";
    public double ScrollOffset => Scroller.Offset.Y;
#if !EMPI_RELEASE
    /// <summary>Tests only (MainWindow's "scroll y" request).</summary>
    public void TestScroll(double y) => Scroller.Offset = new Vector(0, y);
#endif
    private double? _restoreOffset;

    public SettingsView(string initialTab, double restoreOffset) : this(initialTab) => _restoreOffset = restoreOffset;

    private readonly DockPanel Header = new() { Margin = new Thickness(0, 0, 0, 18) };
    private readonly TextBlock TitleText = Ui.Text("AJUSTES", "DisplayText", null, 30);
    private readonly StackPanel Tabs = new() { Orientation = Orientation.Horizontal };
    private readonly ScrollViewer Scroller = new() { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Focusable = false };
    private readonly ContentControl TabHost = new() { MaxWidth = 820, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 0, 14, 0) };

    public SettingsView(string initialTab = "account")
    {
        var done = Ui.Act("Listo", () => { Release(); Done?.Invoke(); }, "PaperButton", 26);
        done.Padding = new Thickness(26, 11);
        DockPanel.SetDock(done, Dock.Right);
        TitleText.VerticalAlignment = VerticalAlignment.Center; TitleText.Margin = new Thickness(0, 0, 24, 0);
        DockPanel.SetDock(TitleText, Dock.Left);
        var tabsBox = new Border { Background = Pal.Tabs, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = Pal.PillRadius, Padding = new Thickness(3), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Center, Child = Tabs };
        Header.Children.Add(done); Header.Children.Add(TitleText); Header.Children.Add(tabsBox);
        Scroller.Content = TabHost;
        // the page is as wide as the room allows, up to 820 (it measures to its content otherwise, and a tab of short rows would shrink to a column)
        Scroller.SizeChanged += (_, e) => TabHost.Width = Math.Max(300, Math.Min(820, e.NewSize.Width - 14 - 12));
        Grid.SetRow(Scroller, 1);
        Content = new Grid { Margin = new Thickness(24, 0, 24, 24), RowDefinitions = { new RowDefinition(GridLength.Auto), new RowDefinition(1, GridUnitType.Star) }, Children = { Header, Scroller } };

        SettingsTab[] tabs = [new AccountTab(), new MinecraftTab(), new ModsTab(), new JavaTab(), new ShotsTab(), new AboutTab()];
        foreach (var tab in tabs)
        {
            var pill = new RadioButton { Content = tab.Title, Classes = { "tab" }, FontFamily = Pal.Mono, GroupName = "settings-tabs", Tag = tab, IsChecked = tab.Id == initialTab };
            pill.IsCheckedChanged += async (_, _) => { if (pill.IsChecked == true) await ShowAsync(tab); };
            Tabs.Children.Add(pill);
        }
        AttachedToVisualTree += async (_, _) =>
        {
            LivingField.Quiet.Add(Header);
            // the screen arrives: the header settles in and the title tears once (the same glitch the Publisher plays on a new selection);
            // not when it is only being dressed in another style
            if (_restoreOffset == null) { Motion.Rise(Header, 0, 220, 8); Motion.Tear(TitleText); }
            await ShowAsync(tabs.First(t => t.Id == initialTab));
        };
        DetachedFromVisualTree += (_, _) => LivingField.Quiet.Remove(Header);
    }

    private async Task ShowAsync(SettingsTab tab)
    {
        if (ReferenceEquals(_current, tab) && TabHost.Content != null) return;
        _current?.Release();
        _current = tab;
        var token = ++_loadToken;
        TabHost.Content = tab.Root;
        // Nothing of the previous visit to this tab shows while it loads: the content arrives (a block after another) instead of flashing old and then new.
        tab.Root.Opacity = 0;
        Scroller.Offset = default;
        var load = tab.LoadAsync();
        await Task.WhenAny(load, Task.Delay(600));   // a slow tab is shown as it is, and keeps filling in
        if (token == _loadToken)
        {
            tab.Root.Opacity = 1;
            if (_restoreOffset is { } offset)
            {
                // rebuilt in another style: the page comes back where the player was, without replaying its entrance
                _restoreOffset = null;
                
                Scroller.Offset = new Vector(0, offset);
            }
            else Motion.Reveal(Motion.ChildrenOf(tab.Root), 40, 0, 220, 8);
        }
        try { await load; }
        catch (Exception ex)
        {
            if (token == _loadToken) tab.Root.Children.Add(Ui.Text("No pude cargar esta pestaña: " + ex.Message, "CaptionText", Pal.Danger));
        }
        TabLoaded?.Invoke();
        // development only: EMPI_SCROLL=<y> scrolls the page to see the lower sections in a picture
        if (double.TryParse(Environment.GetEnvironmentVariable("EMPI_SCROLL"), out var y)) { await Task.Delay(400); Scroller.Offset = new Vector(0, y); }
    }

    /// <summary>Saves pending changes and frees what the current tab holds. Safe to call more than once.</summary>
    public void Release()
    {
        _current?.Release();
        _current = null;
    }
}
