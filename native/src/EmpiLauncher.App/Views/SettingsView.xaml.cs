using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;
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
        Loaded += async (_, _) => await ShowAsync(tabs.First(t => t.Id == initialTab));
    }

    private async Task ShowAsync(SettingsTab tab)
    {
        if (ReferenceEquals(_current, tab) && TabHost.Content != null) return;
        _current?.Release();
        _current = tab;
        var token = ++_loadToken;
        TabHost.Content = tab.Root;
        Scroller.ScrollToTop();
        try { await tab.LoadAsync(); }
        catch (Exception ex)
        {
            if (token == _loadToken) tab.Root.Children.Add(Ui.Text("No se pudo cargar esta pestaña: " + ex.Message, "CaptionText", Ui.Res("DangerBrush")));
        }
    }

    /// <summary>Saves pending changes and frees what the current tab holds. Safe to call more than once.</summary>
    public void Release()
    {
        _current?.Release();
        _current = null;
    }
}
