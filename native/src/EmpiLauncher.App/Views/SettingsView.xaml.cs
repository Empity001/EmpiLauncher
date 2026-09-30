using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;
using EmpiLauncher.App.Views.Tabs;

namespace EmpiLauncher.App.Views;

/// <summary>One tab of the Settings screen. Build() is instant and draws the frame; LoadAsync() fills it from the engine.</summary>
internal abstract class SettingsTab
{
    public abstract string Id { get; }
    public abstract string Title { get; }
    public StackPanel Root { get; } = new();
    public abstract Task LoadAsync();
    /// <summary>Called when the tab is left or the screen closes: save what is pending and let go of what is heavy.</summary>
    public virtual void Release() { }
}

public partial class SettingsView : UserControl
{
    private readonly Launcher _l = Launcher.Instance;
    private SettingsTab? _current;
    private int _loadToken;

    public event Action? Done;
    /// <summary>A tab finished loading: the window may schedule a memory trim.</summary>
    public event Action? TabLoaded;

    /// <summary>The tab on screen, and how far it is scrolled: a change of style rebuilds this screen and puts both back.</summary>
    public string CurrentTab => _current?.Id ?? "account";
    public double ScrollOffset => Scroller.VerticalOffset;
#if !EMPI_RELEASE
    /// <summary>Tests only (MainWindow's "scroll y" request).</summary>
    public void TestScroll(double y) => Scroller.ScrollToVerticalOffset(y);
#endif
    private double? _restoreOffset;

    public SettingsView(string initialTab, double restoreOffset) : this(initialTab) => _restoreOffset = restoreOffset;

    public SettingsView(string initialTab = "account")
    {
        InitializeComponent();
        DoneButton.Click += (_, _) => { Release(); Done?.Invoke(); };

        SettingsTab[] tabs = [new AccountTab(), new MinecraftTab(), new ModsTab(), new JavaTab(), new ShotsTab(), new AboutTab()];
        foreach (var tab in tabs)
        {
            var pill = new RadioButton { Content = tab.Title, Style = (Style)FindResource("TabPill"), GroupName = "settings-tabs", Tag = tab, IsChecked = tab.Id == initialTab };
            pill.Checked += async (_, _) => await ShowAsync(tab);
            Tabs.Children.Add(pill);
        }
        Loaded += async (_, _) =>
        {
            LivingField.Quiet.Add(Header);
            // the screen arrives: the header settles in and the title tears once (the same glitch the Publisher plays on a new selection);
            // not when it is only being dressed in another style
            if (_restoreOffset == null) { Motion.Rise(Header, 0, 220, 8); Motion.Tear(TitleText); }
            await ShowAsync(tabs.First(t => t.Id == initialTab));
        };
        Unloaded += (_, _) => LivingField.Quiet.Remove(Header);
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
        Scroller.ScrollToTop();
        var load = tab.LoadAsync();
        await Task.WhenAny(load, Task.Delay(600));   // a slow tab is shown as it is, and keeps filling in
        if (token == _loadToken)
        {
            tab.Root.Opacity = 1;
            if (_restoreOffset is { } offset)
            {
                // rebuilt in another style: the page comes back where the player was, without replaying its entrance
                _restoreOffset = null;
                Scroller.UpdateLayout();
                Scroller.ScrollToVerticalOffset(offset);
            }
            else Motion.Reveal(Motion.ChildrenOf(tab.Root), 40, 0, 220, 8);
        }
        try { await load; }
        catch (Exception ex)
        {
            if (token == _loadToken) tab.Root.Children.Add(Ui.Text("No pude cargar esta pestaña: " + ex.Message, "CaptionText", Ui.Res("DangerBrush")));
        }
        TabLoaded?.Invoke();
    }

    /// <summary>Saves pending changes and frees what the current tab holds. Safe to call more than once.</summary>
    public void Release()
    {
        _current?.Release();
        _current = null;
    }
}
