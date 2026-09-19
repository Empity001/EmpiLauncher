using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using EmpiLauncher.App.Services;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views;

internal static class Fmt
{
    public static string Bytes(double? value)
    {
        if (value is not { } v || v < 0) return "";
        if (v < 1024) return $"{v:0} B";
        string[] units = ["KB", "MB", "GB", "TB"];
        var amount = v / 1024;
        var i = 0;
        while (amount >= 1024 && i < units.Length - 1) { amount /= 1024; i++; }
        return $"{amount.ToString(amount >= 100 ? "0" : amount >= 10 ? "0.0" : "0.00")} {units[i]}";
    }

    public static Border Pill(string text, Brush? ink = null, Brush? fill = null)
    {
        var pill = new Border { Style = (Style)Application.Current.FindResource("Pill"), Margin = new Thickness(0, 0, 8, 6) };
        if (fill != null) pill.Background = fill;
        pill.Child = new TextBlock { Text = text, Style = (Style)Application.Current.FindResource("LabelText"), FontSize = 11, Foreground = ink ?? (Brush)Application.Current.FindResource("Paper2Brush") };
        return pill;
    }

    public static Brush Res(string key) => (Brush)Application.Current.FindResource(key);
}

public partial class HomeView : UserControl
{
    private const double PlayWidth = 340;
    private readonly Launcher _l = Launcher.Instance;
    private string _railKey = "";
    private string? _avatarFor;
    private readonly System.Windows.Threading.DispatcherTimer _status = new() { Interval = TimeSpan.FromSeconds(90) };

    public event Action? OpenSettings;

    public HomeView()
    {
        InitializeComponent();
        Loaded += (_, _) =>
        {
            _l.Changed += OnChanged; _l.GameChanged += OnGame; _l.ArtChanged += RefreshBanner;
            Refresh(); RefreshBanner(); _status.Start(); _ = _l.RefreshStatusAsync();
            LivingField.NextAction = PlayButton;   // the main action glows in the modpack's accent
            LivingField.Quiet.Add(Hero);           // dots stay faint behind the title and the facts
        };
        Unloaded += (_, _) =>
        {
            _l.Changed -= OnChanged; _l.GameChanged -= OnGame; _l.ArtChanged -= RefreshBanner; _status.Stop(); PackBanner.Source = null;
            if (ReferenceEquals(LivingField.NextAction, PlayButton)) LivingField.NextAction = null;
            LivingField.Quiet.Remove(Hero);
        };
        // Players online: only asked while the window is in front, once every 90 s. A hidden launcher does not poll the network.
        _status.Tick += (_, _) =>
        {
            var window = Window.GetWindow(this);
            if (window is { IsActive: true, WindowState: not WindowState.Minimized } && !_l.Game.Busy) _ = _l.RefreshStatusAsync();
        };
        SettingsButton.Click += (_, _) => OpenSettings?.Invoke();
        PlayButton.Click += async (_, _) => await _l.PrimaryActionAsync();
        OfflineButton.Click += (_, _) => ((MainWindow)Application.Current.MainWindow).ShowOfflinePrompt();
    }

    private void OnChanged() => Refresh();
    private void OnGame() => RefreshGame();

    private string? _bannerPath;
    private int _bannerGeneration;

    /// <summary>The modpack's logo replaces the dotted name when there is one. Decoded at 700 px; the name stays as the accessible label.</summary>
    private async void RefreshBanner()
    {
        var wanted = _l.Art?.Banner;
        if (wanted == _bannerPath && (wanted == null || PackBanner.Source != null)) return;
        _bannerPath = wanted;
        var generation = ++_bannerGeneration;
        if (wanted == null) { PackBanner.Source = null; PackBanner.Visibility = Visibility.Collapsed; PackTitle.Visibility = Visibility.Visible; return; }
        var image = await Task.Run(() => ScreenshotViewer.Decode(wanted, 700));
        if (generation != _bannerGeneration || image == null) return;
        PackBanner.Source = image;
        System.Windows.Automation.AutomationProperties.SetName(PackBanner, _l.Selected?.Name ?? "Modpack");
        PackBanner.Visibility = Visibility.Visible;
        PackTitle.Visibility = Visibility.Collapsed;
    }

    private void Refresh()
    {
        RebuildRail();
        var pack = _l.Selected;
        PackTitle.Text = pack?.Name ?? "Conectando con el motor";
        PackDescription.Text = pack == null ? "" : string.IsNullOrWhiteSpace(pack.Description) ? $"Minecraft {pack.MinecraftVersion}" : pack.Description;

        Pills.Children.Clear();
        if (pack != null)
        {
            Pills.Children.Add(Fmt.Pill(pack.MinecraftVersion));
            Pills.Children.Add(Fmt.Pill($"v{pack.Version}"));
            if (pack.MainServer) Pills.Children.Add(Fmt.Pill("PRINCIPAL", Fmt.Res("AccentInkBrush"), Fmt.Res("AccentBrush")));
            if (pack.Whitelist) Pills.Children.Add(Fmt.Pill("WHITELIST", Fmt.Res("WarnBrush")));
        }

        RefreshFacts();
        RefreshAccount();
        RefreshGame();
    }

    private void RebuildRail()
    {
        var servers = _l.Distro?.Servers ?? [];
        var key = string.Join("|", servers.Select(s => $"{s.Id}:{s.Name}:{s.Version}:{s.MainServer}")) + "#" + _l.SelectedId;
        if (key == _railKey) return;
        _railKey = key;

        RailCount.Text = servers.Count.ToString();
        Rail.Children.Clear();
        foreach (var server in servers)
        {
            var on = server.Id == _l.SelectedId;
            var name = new TextBlock { Text = server.Name, FontWeight = FontWeights.SemiBold, FontSize = 14, TextTrimming = TextTrimming.CharacterEllipsis, Foreground = on ? Fmt.Res("BgBrush") : Fmt.Res("PaperBrush") };
            var meta = new TextBlock
            {
                Text = $"{server.MinecraftVersion}  v{server.Version}",
                Style = (Style)FindResource("CaptionText"), TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 3, 0, 0),
                Foreground = on ? Fmt.Res("PaperInkBrush") : Fmt.Res("Paper3Brush")
            };
            var card = new Button
            {
                Style = (Style)FindResource("PackCard"), Margin = new Thickness(0, 0, 0, 6), Tag = server.Id,
                Background = on ? Fmt.Res("PaperBrush") : Brushes.Transparent,
                Content = new StackPanel { Children = { name, meta } }
            };
            System.Windows.Automation.AutomationProperties.SetName(card, server.Name);
            card.Click += async (_, _) => await _l.SelectAsync(server.Id);
            Rail.Children.Add(card);
        }
    }

    private void RefreshFacts()
    {
        Facts.Children.Clear();
        var pack = _l.Pack;
        string state = pack == null ? "Comprobando" : pack.Action switch
        {
            "restore" => "Modificado",
            "update" => pack.Installed ? "Hay actualización" : "Sin instalar",
            _ => pack.Installed ? "Al día" : "Sin instalar"
        };
        Facts.Children.Add(Fact("ESTADO", state));
        Facts.Children.Add(Fact("INSTALADO", pack?.InstalledVersion is { } v ? $"v{v}" : "Ninguna"));
        Facts.Children.Add(Fact("DISPONIBLE", pack != null ? $"v{pack.RemoteVersion}" : "..."));
        var status = _l.Status;
        Facts.Children.Add(Fact("JUGADORES", status == null ? "..." : status.Online && status.Players != null ? $"{status.Players.Online}/{status.Players.Max}" : "Sin conexión"));
    }

    private StackPanel Fact(string label, string value) => new()
    {
        Margin = new Thickness(0, 0, 12, 0),
        Children =
        {
            new TextBlock { Text = label, Style = (Style)FindResource("CaptionText"), TextWrapping = TextWrapping.NoWrap },
            new TextBlock { Text = value, Style = (Style)FindResource("BodyText"), Margin = new Thickness(0, 4, 0, 0), TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis }
        }
    };

    private void RefreshAccount()
    {
        var account = _l.Account;
        AccountName.Text = account?.DisplayName ?? "Sin cuenta";
        AccountKind.Text = account == null ? "SIN SESIÓN" : account.Type switch { "microsoft" => "MICROSOFT", "offline" => "SIN CONEXIÓN", _ => "MOJANG" };
        AvatarInitial.Text = string.IsNullOrEmpty(account?.DisplayName) ? "?" : account.DisplayName[..1].ToUpperInvariant();

        // No account, or no skin to fetch: the initial is the whole avatar (an offline player has no head to show).
        // An offline player has no head at Mojang: with a skin chosen the launcher draws it itself (from the file the engine made), without it the initial stands in.
        if (account is { Type: "offline", Skin.Head: { Length: > 0 } head } && System.IO.File.Exists(head))
        {
            _avatarFor = account.Uuid + head;
            var bitmap = new BitmapImage();
            bitmap.BeginInit(); bitmap.UriSource = new Uri(head); bitmap.CacheOption = BitmapCacheOption.OnLoad; bitmap.DecodePixelWidth = 80; bitmap.EndInit(); bitmap.Freeze();
            AvatarImage.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill };
            RenderOptions.SetBitmapScalingMode(AvatarImage, BitmapScalingMode.NearestNeighbor);
            AvatarImage.Visibility = Visibility.Visible;
            return;
        }
        if (account == null || account.Type == "offline") { AvatarImage.Visibility = Visibility.Collapsed; _avatarFor = null; return; }
        if (_avatarFor == account.Uuid) return;
        _avatarFor = account.Uuid;
        try
        {
            // The classic launcher shows the head from mc-heads too. Decoded at the size it is drawn, never at full size.
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.UriSource = new Uri($"https://mc-heads.net/avatar/{account.Uuid}/80");
            bitmap.DecodePixelWidth = 80;
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.EndInit();
            void Show() { AvatarImage.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill }; AvatarImage.Visibility = Visibility.Visible; }
            if (bitmap.IsDownloading) { bitmap.DownloadCompleted += (_, _) => Show(); bitmap.DownloadFailed += (_, _) => AvatarImage.Visibility = Visibility.Collapsed; }
            else Show();
        }
        catch { AvatarImage.Visibility = Visibility.Collapsed; }
    }

    private void RefreshGame()
    {
        var game = _l.Game;
        var label = game.Phase switch
        {
            "launching" => $"INICIANDO  {game.Percent}%",
            "updating" => $"ACTUALIZANDO  {game.Percent}%",
            "restoring" => $"RESTAURANDO  {game.Percent}%",
            "stopping" => "DETENIENDO",
            "running" => "DETENER",
            _ when _l.Account == null => "INICIAR SESIÓN",
            _ => (_l.Pack?.Action ?? "play") switch { "update" => "ACTUALIZAR", "restore" => "RESTAURAR", _ => "JUGAR" }
        };
        PlayLabel.Text = label;
        System.Windows.Automation.AutomationProperties.SetName(PlayButton, label);
        OfflineButton.Visibility = _l.Account == null && !game.Busy && !game.Running ? Visibility.Visible : Visibility.Collapsed;

        if (game.Busy)
        {
            PlayButton.Background = Fmt.Res("Surface2Brush");
            PlayLabel.Foreground = Fmt.Res("PaperBrush");
            PlayFill.Visibility = Visibility.Visible;
            PlayFill.Width = PlayWidth * Math.Clamp(game.Percent, 0, 100) / 100.0;
            PlayButton.IsHitTestVisible = false;
        }
        else if (game.Running)
        {
            PlayButton.Background = Fmt.Res("Surface3Brush");
            PlayLabel.Foreground = Fmt.Res("DangerBrush");
            PlayFill.Visibility = Visibility.Collapsed;
            PlayButton.IsHitTestVisible = true;
        }
        else
        {
            PlayButton.ClearValue(BackgroundProperty);
            PlayLabel.SetResourceReference(TextBlock.ForegroundProperty, "AccentInkBrush");
            PlayFill.Visibility = Visibility.Collapsed;
            PlayButton.IsHitTestVisible = true;
        }

        ProgressPanel.Visibility = game.Busy ? Visibility.Visible : Visibility.Collapsed;
        if (game.Busy)
        {
            ProgressText.Text = game.Text;
            ProgressPercent.Text = $"{game.Percent}%";
            ProgressBar.Value = game.Percent;
            var parts = new List<string>();
            if (game.Received != null && game.Total != null) parts.Add($"{Fmt.Bytes(game.Received)} / {Fmt.Bytes(game.Total)}");
            if (game.BytesPerSecond is > 0) parts.Add($"{Fmt.Bytes(game.BytesPerSecond)}/s");
            if (game.PendingFiles is > 0) parts.Add($"{game.PendingFiles} archivos pendientes");
            ProgressDetail.Text = string.Join("   ", parts);
            ProgressDetail.Visibility = parts.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        }
    }
}
