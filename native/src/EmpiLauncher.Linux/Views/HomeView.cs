using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Controls.Shapes;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using EmpiLauncher.Ipc;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The home screen: the list of modpacks ("versiones") on the left, the selected one in the middle (its name or logo, what it says, its facts and the
/// progress of what is being done) and, at the bottom, the dock with the account, Ajustes and the main action.
/// </summary>
public sealed class HomeView : UserControl
{
    private const double PlayWidth = 340;

    private readonly Launcher _l = Launcher.Instance;
    private readonly MainWindow _window;
    private Border _railModule = null!, _factsModule = null!, _dockModule = null!;

    private readonly StackPanel _rail = new() { Spacing = 6 };
    private readonly TextBlock _railCount = Ui.Label("", 11);
    private readonly WrapPanel _pills = new() { Margin = new Thickness(0, 0, 0, 12) };
    private readonly Image _banner = new() { IsVisible = false, Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Left, MaxHeight = 190, MaxWidth = 440 };
    private readonly TextBlock _title = Ui.Display("", 46, Pal.Title);
    private readonly TextBlock _description = Ui.Body("", 14, Pal.Paper2);
    private readonly Border _accessNote;
    private readonly TextBlock _accessText = Ui.Body("", 14, Pal.Paper2);
    private readonly UniformGrid _facts = new() { Columns = 4 };
    private readonly Button _repair;
    private readonly Border _progress;
    private readonly TextBlock _progressText = Ui.Body("", 14);
    private readonly TextBlock _progressPercent = Ui.Display("", 20);
    private readonly ProgressBar _progressBar = new() { Minimum = 0, Maximum = 100, Height = 8, Margin = new Thickness(0, 12, 0, 0), Foreground = Pal.Accent, Background = Pal.TintHover, CornerRadius = new CornerRadius(4) };
    private readonly TextBlock _progressDetail = Ui.Caption("");
    private readonly TextBlock _accountName = Ui.Body("", 14);
    private readonly TextBlock _accountKind = Ui.Caption("");
    private readonly TextBlock _initial = Ui.Display("", 18);
    private readonly Ellipse _avatar = new() { Width = 40, Height = 40, IsVisible = false };
    private readonly Button _play;
    private readonly Border _playFill = new() { HorizontalAlignment = HorizontalAlignment.Left, Width = 0, Background = Pal.Accent, IsVisible = false };
    private readonly TextBlock _playLabel = new() { FontFamily = Pal.Display, FontWeight = FontWeight.Bold, FontSize = 20, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
    private readonly Button _offline;
    private readonly Button _trash;
    private readonly DispatcherTimer _status = new() { Interval = TimeSpan.FromSeconds(90) };
    private readonly DispatcherTimer _agenda = new() { Interval = TimeSpan.FromSeconds(30) };

    private string _railKey = "";
    private string? _bannerPath;
    private string? _avatarFor;
    private Button? _chip;
    private string _chipKey = "";
    private Flyout? _flyout;

    public HomeView(MainWindow window)
    {
        _window = window;
        _accessNote = Ui.Module(_accessText, new Thickness(20, 14));
        _accessNote.IsVisible = false; _accessNote.MaxWidth = 560; _accessNote.HorizontalAlignment = HorizontalAlignment.Left; _accessNote.Margin = new Thickness(0, 14, 0, 0);

        _repair = Ui.Btn("Verificar y reparar", Ui.Kind.Ghost, () => _window.AskRepair(), new Thickness(16, 7));
        _repair.IsVisible = false; _repair.HorizontalAlignment = HorizontalAlignment.Left; _repair.Margin = new Thickness(0, 10, 0, 0);
        ToolTip.SetTip(_repair, "Reviso todos los archivos del modpack y vuelvo a bajar los que falten o estén dañados");

        _offline = Ui.Btn("Iniciar sin conexión", Ui.Kind.Icon, () => _window.ShowOfflinePrompt(), new Thickness(14, 5), 12);
        _offline.IsVisible = false; _offline.HorizontalAlignment = HorizontalAlignment.Center; _offline.Margin = new Thickness(0, 8, 0, 0);

        _trash = Ui.IconBtn(Icons.Trash, "Quitar este modpack de mi compu", () => _ = TrashAsync(), 38, Pal.Danger);
        _trash.IsVisible = false; _trash.Margin = new Thickness(6, 0, 0, 0);

        _playFill.Transitions = [new DoubleTransition { Property = Layoutable.WidthProperty, Duration = TimeSpan.FromMilliseconds(260) }];
        _play = new Button { Classes = { "pill" }, Width = PlayWidth, Height = 52, Padding = new Thickness(0), ClipToBounds = true };
        Ui.Style(_play, Ui.Kind.Primary);
        _play.Content = new Grid { Children = { _playFill, _playLabel } };
        _play.Click += async (_, _) => await _l.PrimaryActionAsync();

        _progress = Ui.Module(new StackPanel
        {
            Children =
            {
                new DockPanel { Children = { Dock(_progressPercent, Avalonia.Controls.Dock.Right), _progressText } },
                _progressBar, _progressDetail
            }
        });
        _progress.IsVisible = false; _progress.MaxWidth = 560; _progress.HorizontalAlignment = HorizontalAlignment.Left; _progress.Margin = new Thickness(0, 12, 0, 0);
        _progressPercent.Margin = new Thickness(12, 0, 0, 0);
        _progressDetail.Margin = new Thickness(0, 10, 0, 0);

        Content = Build();

        AttachedToVisualTree += (_, _) =>
        {
            _l.Changed += OnChanged; _l.GameChanged += OnGame; _l.ArtChanged += RefreshBanner; _l.NoticesChanged += OnChanged;
            _status.Start(); _agenda.Start();
            // the field keeps the text faint, glows the main action and leaves the panels that hide it alone
            foreach (var part in QuietParts()) LivingField.Quiet.Add(part);
            LivingField.Covers.Add(_railModule); LivingField.Covers.Add(_dockModule);
            LivingField.NextAction = _play;
            Refresh(); RefreshBanner();
            _ = _l.RefreshStatusAsync();
        };
        DetachedFromVisualTree += (_, _) =>
        {
            _l.Changed -= OnChanged; _l.GameChanged -= OnGame; _l.ArtChanged -= RefreshBanner; _l.NoticesChanged -= OnChanged;
            _status.Stop(); _agenda.Stop();
            foreach (var part in QuietParts()) LivingField.Quiet.Remove(part);
            LivingField.Covers.Remove(_railModule); LivingField.Covers.Remove(_dockModule);
            if (ReferenceEquals(LivingField.NextAction, _play)) LivingField.NextAction = null;
        };
        // players online: only asked while the window is in front, once every 90 s. A hidden launcher does not poll the network.
        _status.Tick += (_, _) => { if (_window.IsActive && !_l.Game.Busy) _ = _l.RefreshStatusAsync(); };
        _agenda.Tick += (_, _) => { if (_window.IsActive && !_l.Game.Busy) _ = _l.RefreshNoticesAsync(network: false); };
    }

    private string? _titleShown;

    /// <summary>The modpack's name as the title: in Punk a ransom note, in Words paper cut-outs, in Térmico capitals. Only redone when the name changes.</summary>
    private void SetTitle(string text)
    {
        if (text == _titleShown) return;
        _titleShown = text;
        var style = ST.Current;
        if (style is "punk" or "words")
        {
            _title.Text = null;
            _title.Inlines!.Clear();
            foreach (var piece in style == "punk" ? PunkField.Ransom(text) : WordsField.KeptWords(text)) _title.Inlines.Add(piece);
            return;
        }
        _title.Inlines?.Clear();
        _title.Text = style == "termico" ? text.ToUpperInvariant() : text;
    }

    private Control[] QuietParts() => [_pills, _title, _banner, _description, _accessNote, _factsModule, _repair, _progress];

    private static T Dock<T>(T control, Dock dock) where T : Control { DockPanel.SetDock(control, dock); return control; }

    private Control Build()
    {
        var root = new Grid { Margin = new Thickness(24, 0, 24, 24) };
        root.ColumnDefinitions = new ColumnDefinitions("300,20,*");

        var railHead = new DockPanel { Margin = new Thickness(6, 0, 10, 12) };
        var countPill = new Border { Padding = new Thickness(11, 3), CornerRadius = new CornerRadius(999), BorderThickness = new Thickness(1), BorderBrush = Pal.HairStrong, Background = Pal.Tint, Child = _railCount };
        DockPanel.SetDock(countPill, Avalonia.Controls.Dock.Right);
        railHead.Children.Add(countPill);
        railHead.Children.Add(Ui.Label("VERSIONES"));
        var railBody = new DockPanel();
        DockPanel.SetDock(railHead, Avalonia.Controls.Dock.Top);
        railBody.Children.Add(railHead);
        railBody.Children.Add(new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = new Border { Padding = new Thickness(0, 0, 6, 0), Child = _rail } });
        var railModule = _railModule = Ui.Module(railBody, new Thickness(14, 16, 10, 14));
        Grid.SetColumn(railModule, 0);
        root.Children.Add(railModule);

        var right = new Grid { RowDefinitions = new RowDefinitions("*,Auto") };
        Grid.SetColumn(right, 2);

        var hero = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 12, 24) };
        _title.TextWrapping = TextWrapping.Wrap; _title.TextTrimming = TextTrimming.None; _title.HorizontalAlignment = HorizontalAlignment.Left;
        _description.MaxWidth = 560; _description.HorizontalAlignment = HorizontalAlignment.Left; _description.Margin = new Thickness(0, 12, 0, 0);
        _pills.HorizontalAlignment = HorizontalAlignment.Left;
        var factsModule = _factsModule = Ui.Module(_facts, new Thickness(20, 16));
        factsModule.MaxWidth = 560; factsModule.HorizontalAlignment = HorizontalAlignment.Left; factsModule.Margin = new Thickness(0, 28, 0, 0);
        hero.Children.Add(_pills); hero.Children.Add(_banner); hero.Children.Add(_title); hero.Children.Add(_description);
        hero.Children.Add(_accessNote); hero.Children.Add(factsModule); hero.Children.Add(_repair); hero.Children.Add(_progress);
        right.Children.Add(hero);

        // the dock: account, settings and the main action
        var dock = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto") };
        var avatar = new Grid { Width = 40, Height = 40, Margin = new Thickness(4, 0, 12, 0) };
        avatar.Children.Add(new Ellipse { Fill = Pal.Surface3 });
        _initial.HorizontalAlignment = HorizontalAlignment.Center; _initial.VerticalAlignment = VerticalAlignment.Center;
        avatar.Children.Add(_initial); avatar.Children.Add(_avatar);
        _accountName.FontWeight = FontWeight.SemiBold; _accountName.TextTrimming = TextTrimming.CharacterEllipsis; _accountName.MaxWidth = 240; _accountName.TextWrapping = TextWrapping.NoWrap;
        var who = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        who.Children.Add(avatar);
        who.Children.Add(new StackPanel { VerticalAlignment = VerticalAlignment.Center, Children = { _accountName, _accountKind } });
        dock.Children.Add(who);

        var tools = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 10, 0) };
        tools.Children.Add(Ui.IconBtn(Icons.Gear, "Ajustes", () => _window.ShowSettings()));
        tools.Children.Add(_trash);
        Grid.SetColumn(tools, 1);
        dock.Children.Add(tools);

        var action = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Children = { _play, _offline } };
        Grid.SetColumn(action, 2);
        dock.Children.Add(action);

        var dockModule = _dockModule = new Border { Background = Pal.Dock, BorderBrush = Pal.DockEdge, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(Pal.RadiusDock), Padding = new Thickness(14, 12), Child = dock };
        Grid.SetRow(dockModule, 1);
        right.Children.Add(dockModule);
        root.Children.Add(right);
        return root;
    }

    private void OnChanged() => Refresh();
    private void OnGame() => RefreshGame();

    // ---- the picture ---------------------------------------------------------------------------------------------------

    /// <summary>The modpack's logo replaces the dotted name when there is one. Decoded at 700 px.</summary>
    private async void RefreshBanner()
    {
        var wanted = _l.Art?.Banner;
        if (wanted == _bannerPath && (wanted == null || _banner.Source != null)) return;
        _bannerPath = wanted;
        if (wanted == null) { _banner.Source = null; _banner.IsVisible = false; _title.IsVisible = true; return; }
        var image = await Task.Run(() => Ui.Decode(wanted, 700));
        if (image == null || _bannerPath != wanted) return;
        _banner.Source = image; _banner.IsVisible = true; _title.IsVisible = false;
    }

    // ---- what the screen is about ----------------------------------------------------------------------------------------

    private void Refresh()
    {
        RebuildRail();
        // What the screen is about is the modpack picked in the list (the host); what plays, and what its facts and buttons are about, is the
        // modpack selected, which is one of the host's profiles when it has some.
        var host = _l.Host;
        var pack = _l.Selected;
        SetTitle(host?.Name ?? "Arrancando motores");
        var described = host?.Profiles?.List.FirstOrDefault(p => p.Id == pack?.Id && !p.Self)?.Description;
        _description.Text = host == null || pack == null ? ""
            : !string.IsNullOrWhiteSpace(described) ? described
            : string.IsNullOrWhiteSpace(host.Description) ? $"Minecraft {pack.MinecraftVersion}" : host.Description;

        var chip = pack != null && host?.Profiles is { } profiles ? ProfileChipFor(host, profiles) : null;
        for (var i = _pills.Children.Count - 1; i >= 0; i--)
            if (!ReferenceEquals(_pills.Children[i], chip)) _pills.Children.RemoveAt(i);
        if (pack != null)
        {
            var pills = new List<Control> { Ui.Pill(pack.MinecraftVersion), Ui.Pill($"v{pack.Version}") };
            if (host?.MainServer == true || pack.MainServer) pills.Add(Ui.Pill("PRINCIPAL", Pal.AccentInk, Pal.Accent));
            if (pack.Whitelist) pills.Add(Ui.Pill("WHITELIST", Pal.Warn));
            for (var i = 0; i < pills.Count; i++) _pills.Children.Insert(i, pills[i]);
            if (chip != null && !_pills.Children.Contains(chip)) _pills.Children.Add(chip);
        }
        if (_l.NovedadesFor(pack?.Id) is { } news && Uri.TryCreate(news, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps)
        {
            var pill = new Button { Classes = { "pill" }, Padding = new Thickness(0), Margin = new Thickness(0, 0, 8, 6), Content = Ui.Pill("NOVEDADES  ↗", Pal.Paper) };
            ((Border)pill.Content).Margin = new Thickness(0);
            Ui.Style(pill, Ui.Kind.Icon);
            pill.Click += (_, _) => { try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("xdg-open", uri.ToString()) { UseShellExecute = false }); } catch { } };
            _pills.Children.Add(pill);
        }

        RefreshFacts();
        RefreshAccount();
        RefreshGame();
    }

    private string PlayingLabel(Modpack server, List<Modpack> everyServer)
    {
        var playingId = _l.PlayingIn(server.Id);
        var playing = everyServer.FirstOrDefault(s => s.Id == playingId) ?? server;
        var profile = server.Profiles?.List.FirstOrDefault(p => p.Id == playingId);
        var access = _l.Access(playingId);
        var stop = access.State switch { "retired" => "  ·  RETIRADO", "upcoming" => "  ·  PRÓXIMAMENTE", "maintenance" when access.Allowed != true => "  ·  MANTENIMIENTO", _ => "" };
        return $"{playing.MinecraftVersion}  v{playing.Version}" + (profile != null ? $"  ·  {profile.Name}" : "") + stop;
    }

    private sealed record Card(string Id, SolidColorBrush Back, SolidColorBrush NameInk, SolidColorBrush MetaInk);
    private readonly List<Card> _cards = [];

    /// <summary>The chosen card is paper-white with dark text, the others are clear with light text.</summary>
    private static void Paint(Card card, bool on)
    {
        card.Back.Color = on ? Pal.CardOn : Color.FromArgb(0, Pal.CardOn.R, Pal.CardOn.G, Pal.CardOn.B);
        card.NameInk.Color = on ? Pal.CardOnInk : Pal.CardOffInk;
        card.MetaInk.Color = on ? Pal.CardOnMeta : Pal.CardOffMeta;
    }

    private void RebuildRail()
    {
        var everyServer = _l.Distro?.Servers ?? [];
        // a modpack that is another one's profile is shown inside that one, not on its own; the main modpack is always first
        var mainId = _l.Distro?.MainServer;
        var servers = everyServer.Where(s => s.ProfileOf == null).OrderBy(s => s.Id == mainId ? 0 : 1).ToList();
        var key = string.Join("|", servers.Select(s => $"{s.Id}:{s.Name}:{PlayingLabel(s, everyServer)}"));
        if (key == _railKey) { foreach (var card in _cards) Paint(card, card.Id == _l.HostId); return; }
        _railKey = key;

        _railCount.Text = servers.Count.ToString();
        _rail.Children.Clear();
        _cards.Clear();
        foreach (var server in servers)
        {
            var back = new SolidColorBrush(); var nameInk = new SolidColorBrush(); var metaInk = new SolidColorBrush();
            var name = new TextBlock { Text = server.Name, FontWeight = FontWeight.SemiBold, FontSize = 14, TextTrimming = TextTrimming.CharacterEllipsis, Foreground = nameInk };
            var meta = new TextBlock { Text = PlayingLabel(server, everyServer), FontFamily = Pal.Mono, FontSize = 11.5, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 3, 0, 0), Foreground = metaInk };
            var card = new Button { Classes = { "card" }, Background = back, Padding = new Thickness(16, 12), CornerRadius = new CornerRadius(Pal.RadiusTile), Content = new StackPanel { Children = { name, meta } } };
            var id = server.Id;
            card.Click += async (_, _) => await _l.SelectAsync(id);
            _rail.Children.Add(card);
            var entry = new Card(id, back, nameInk, metaInk);
            _cards.Add(entry);
            Paint(entry, id == _l.HostId);
        }
    }

    // ---- profiles --------------------------------------------------------------------------------------------------------

    private ProfileInfo? CurrentProfile(Modpack host) => host.Profiles?.List.FirstOrDefault(p => p.Id == _l.PlayingIn(host.Id)) ?? host.Profiles?.List.FirstOrDefault(p => p.Self);

    /// <summary>"PERFIL  LITE  v": one small chip in the row of what the modpack is. Kept while nothing about the profiles changes, so an open flyout keeps what it hangs from.</summary>
    private Button ProfileChipFor(Modpack pack, ProfilesInfo profiles)
    {
        var current = CurrentProfile(pack)!;
        var key = $"{pack.Id}|{current.Id}|{string.Join(",", profiles.List.Select(p => p.Name))}";
        if (_chip != null && key == _chipKey) return _chip;

        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        row.Children.Add(Ui.Label("PERFIL", 11));
        row.Children.Add(Ui.Label(current.Name.ToUpperInvariant(), 11, Pal.Accent));
        row.Children.Add(new Avalonia.Controls.Shapes.Path { Data = Icons.Chevron, Stroke = Pal.Paper2, StrokeThickness = 1.4, Width = 9, Height = 9, Stretch = Stretch.Uniform, VerticalAlignment = VerticalAlignment.Center });
        var pill = new Border { Padding = new Thickness(11, 3, 10, 3), CornerRadius = new CornerRadius(999), BorderThickness = new Thickness(1), BorderBrush = Pal.Accent, Background = Pal.AccentSoft, Child = row };
        var chip = new Button { Classes = { "pill" }, Padding = new Thickness(0), Margin = new Thickness(0, 0, 8, 6), Content = pill };
        Ui.Style(chip, Ui.Kind.Icon);
        chip.Click += (_, _) => ToggleProfiles(chip, pack, profiles);
        _chip = chip; _chipKey = key;
        return chip;
    }

    private void ToggleProfiles(Button anchor, Modpack pack, ProfilesInfo profiles)
    {
        var list = new StackPanel { Width = 350, Spacing = 6 };
        var heading = new StackPanel { Margin = new Thickness(8, 4, 8, 8) };
        heading.Children.Add(Ui.Label("PERFIL"));
        var note = Ui.Caption("Cada perfil es una versión aparte, con sus propios mods, mundos y ajustes. Escoge con cuál juegas hoy.");
        note.Margin = new Thickness(0, 5, 0, 0);
        heading.Children.Add(note);
        list.Children.Add(heading);
        var playing = _l.PlayingIn(pack.Id);
        foreach (var profile in profiles.List)
        {
            var chosen = profile.Id == playing;
            var back = new SolidColorBrush(); var nameInk = new SolidColorBrush(); var metaInk = new SolidColorBrush();
            var content = new StackPanel();
            content.Children.Add(new TextBlock { Text = profile.Name, FontWeight = FontWeight.SemiBold, FontSize = 14, Foreground = nameInk });
            if (!string.IsNullOrWhiteSpace(profile.Description))
                content.Children.Add(new TextBlock { Text = profile.Description, FontFamily = Pal.Mono, FontSize = 11.5, TextWrapping = TextWrapping.Wrap, Foreground = metaInk, Margin = new Thickness(0, 3, 0, 0) });
            var facts = new List<string> { $"MINECRAFT {profile.MinecraftVersion}", $"V{profile.Version}" };
            if (profile.Ram is { } ram) facts.Add(ram.MinimumMb == ram.MaximumMb ? $"MEMORIA {Gb(ram.MaximumMb)} GB" : $"MEMORIA {Gb(ram.MinimumMb)}–{Gb(ram.MaximumMb)} GB");
            content.Children.Add(new TextBlock { Text = string.Join("  ·  ", facts), FontFamily = Pal.Mono, FontSize = 10.5, Foreground = metaInk, Margin = new Thickness(0, 7, 0, 0) });
            if (profile.Id == profiles.Recommended)
            {
                var tag = Ui.Pill("RECOMENDADO PARA TU PC", Pal.AccentInk, Pal.Accent);
                tag.Margin = new Thickness(0, 8, 0, 2); tag.HorizontalAlignment = HorizontalAlignment.Left;
                content.Children.Add(tag);
            }
            var card = new Button { Classes = { "card" }, Background = back, Padding = new Thickness(16, 12), CornerRadius = new CornerRadius(Pal.RadiusTile), Content = content };
            Paint(new Card(profile.Id, back, nameInk, metaInk), chosen);
            var id = profile.Id;
            card.Click += (_, _) => { _flyout?.Hide(); if (id != playing) _ = _l.ChooseProfileAsync(id); };
            list.Children.Add(card);
        }
        _flyout = new Flyout
        {
            Content = new Border { Background = Pal.Panel, BorderBrush = Pal.HairStrong, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(22), Padding = new Thickness(10, 10, 10, 6), Child = list },
            Placement = PlacementMode.BottomEdgeAlignedLeft, ShowMode = FlyoutShowMode.Standard
        };
        _flyout.ShowAt(anchor);
    }

    private static string Gb(int megabytes) => (megabytes / 1024.0).ToString(megabytes % 1024 == 0 ? "0" : "0.#", System.Globalization.CultureInfo.InvariantCulture);

    // ---- facts, account, game -------------------------------------------------------------------------------------------------

    private void RefreshFacts()
    {
        _facts.Children.Clear();
        var pack = _l.Pack;
        var state = pack == null ? "Comprobando" : pack.Action switch
        {
            "restore" => "Modificado",
            "update" => pack.Installed ? "Hay actualización" : "Sin instalar",
            _ => pack.Installed ? "Al día" : "Sin instalar"
        };
        _facts.Children.Add(Fact("ESTADO", state));
        _facts.Children.Add(Fact("INSTALADO", pack?.InstalledVersion is { } v ? $"v{v}" : "Ninguna"));
        _facts.Children.Add(Fact("DISPONIBLE", pack != null ? $"v{pack.RemoteVersion}" : "..."));
        var status = _l.Status;
        _facts.Children.Add(Fact("JUGADORES", status == null ? "..." : status.Online && status.Players != null ? $"{status.Players.Online}/{status.Players.Max}" : "Sin conexión"));
    }

    private static StackPanel Fact(string label, string value)
    {
        var caption = Ui.Caption(label); caption.TextWrapping = TextWrapping.NoWrap;
        var text = Ui.Body(value); text.Margin = new Thickness(0, 4, 0, 0); text.TextWrapping = TextWrapping.NoWrap; text.TextTrimming = TextTrimming.CharacterEllipsis;
        return new StackPanel { Margin = new Thickness(0, 0, 12, 0), Children = { caption, text } };
    }

    private void RefreshAccount()
    {
        var account = _l.Account;
        _accountName.Text = account?.DisplayName ?? "Sin cuenta";
        _accountKind.Text = account == null ? "SIN SESIÓN" : account.Type switch { "microsoft" => "MICROSOFT", "offline" => "SIN CONEXIÓN", _ => "MOJANG" };
        _initial.Text = string.IsNullOrEmpty(account?.DisplayName) ? "?" : account.DisplayName[..1].ToUpperInvariant();

        // an offline player has no head at Mojang: with a skin chosen the launcher draws the file the engine made, without it the initial stands in
        if (account is { Type: "offline", Skin.Head: { Length: > 0 } head } && File.Exists(head))
        {
            if (_avatarFor == account.Uuid + head) return;
            _avatarFor = account.Uuid + head;
            if (Ui.Decode(head, 80) is { } bitmap) { _avatar.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill }; _avatar.IsVisible = true; }
            return;
        }
        if (account == null || account.Type == "offline") { _avatar.IsVisible = false; _avatarFor = null; return; }
        if (_avatarFor == account.Uuid) return;
        _avatarFor = account.Uuid;
        _ = LoadHeadAsync(account.Uuid);
    }

    private async Task LoadHeadAsync(string uuid)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var bytes = await http.GetByteArrayAsync($"https://mc-heads.net/avatar/{uuid}/80");
            using var stream = new MemoryStream(bytes);
            var bitmap = new Bitmap(stream);
            if (_avatarFor != uuid) return;
            _avatar.Fill = new ImageBrush(bitmap) { Stretch = Stretch.UniformToFill };
            _avatar.IsVisible = true;
        }
        catch { if (_avatarFor == uuid) _avatar.IsVisible = false; }
    }

    private void RefreshGame()
    {
        var game = _l.Game;
        var label = game.Phase switch
        {
            "launching" => $"INICIANDO  {game.Percent}%",
            "updating" when game.Mode == "verify" => $"VERIFICANDO  {game.Percent}%",
            "updating" when game.Mode == "java" => $"INSTALANDO JAVA  {game.Percent}%",
            "updating" => $"ACTUALIZANDO  {game.Percent}%",
            "restoring" => $"RESTAURANDO  {game.Percent}%",
            "stopping" => "DETENIENDO",
            "running" => "DETENER",
            _ when _l.Account == null => "INICIAR SESIÓN",
            _ => (_l.Pack?.Action ?? "play") switch { "update" => "ACTUALIZAR", "restore" => "RESTAURAR", _ => "JUGAR" }
        };
        _playLabel.Text = ST.Label(label);
        _offline.IsVisible = _l.Account == null && !game.Busy && !game.Running;

        if (game.Busy)
        {
            _play.Background = Pal.Surface2; _playLabel.Foreground = Pal.Paper;
            _playFill.IsVisible = true; _playFill.Width = PlayWidth * Math.Clamp(game.Percent, 0, 100) / 100.0;
            _play.IsHitTestVisible = false;
        }
        else if (game.Running)
        {
            _play.Background = Pal.Surface3; _playLabel.Foreground = Pal.Danger; _playFill.IsVisible = false; _play.IsHitTestVisible = true;
        }
        else
        {
            _play.Background = Pal.Accent; _playLabel.Foreground = Pal.PlayInk; _playFill.IsVisible = false; _play.IsHitTestVisible = true;
        }

        _progress.IsVisible = game.Busy;
        if (game.Busy)
        {
            _progressText.Text = game.Text;
            _progressPercent.Text = $"{game.Percent}%";
            _progressBar.Value = game.Percent;
            var parts = new List<string>();
            if (game.Received != null && game.Total != null) parts.Add($"{Ui.Bytes(game.Received)} / {Ui.Bytes(game.Total)}");
            if (game.BytesPerSecond is > 0) parts.Add($"{Ui.Bytes(game.BytesPerSecond)}/s");
            if (game.PendingFiles is > 0) parts.Add($"{game.PendingFiles} archivos pendientes");
            _progressDetail.Text = string.Join("   ", parts);
            _progressDetail.IsVisible = parts.Count > 0;
        }

        var access = _l.Access(_l.Selected?.Id);
        var retired = access.State == "retired";
        _repair.IsVisible = _l.Pack?.Installed == true && !game.Busy && !game.Running && !retired;
        RefreshAccess(access, game);
    }

    /// <summary>Maintenance, a modpack that is not out yet, a retired one, a launcher that is too old: Jugar steps aside and the author's words stand in its place.</summary>
    private void RefreshAccess(AccessInfo access, GameSession game)
    {
        var blocked = Launcher.BlocksPlaying(access) && !game.Busy && !game.Running;
        var message = access.State switch
        {
            "maintenance" when access.Allowed != true => access.Message ?? "Este modpack está en mantenimiento. Vuelve en un ratito.",
            "upcoming" => access.Message ?? (access.From != null ? $"Este modpack todavía no sale. Abre el {access.From}." : "Este modpack todavía no sale."),
            "retired" => access.Message ?? "Este modpack ya se retiró. Lo puedes quitar de tu compu.",
            "launcher" => access.Message ?? $"Este launcher ya está muy viejito: necesitas la versión {access.MinVersion} o más nueva.",
            _ => null
        };
        _accessNote.IsVisible = message != null && !game.Busy && !game.Running;
        _accessText.Text = message ?? "";
        if (blocked) { _play.IsHitTestVisible = false; _play.Opacity = 0.4; } else _play.Opacity = 1;
        _trash.IsVisible = access.State == "retired" && _l.Pack?.Installed == true;
    }

    // ---- removing a retired modpack ------------------------------------------------------------------------------------------

    private async Task TrashAsync()
    {
        var pack = _l.Selected;
        if (pack == null) return;
        UninstallPreview preview;
        try { preview = await _l.UninstallPreviewAsync(pack.Id); }
        catch (Exception ex) { _window.ShowToast(ex.Message); return; }
        var text = $"Libero {Ui.Bytes(preview.GameBytes)} de archivos del juego. " +
                   (preview.SavesBytes + preview.ScreenshotsBytes > 0
                       ? $"Tus mundos ({Ui.Bytes(preview.SavesBytes)}) y capturas ({Ui.Bytes(preview.ScreenshotsBytes)}) se quedan, a menos que digas que también."
                       : "No tienes mundos ni capturas de este modpack.");
        var buttons = new List<(string, Action?, bool)> { ("Cancelar", null, false), ("Quitar el juego", () => _ = RunUninstall(pack.Id, false), true) };
        if (preview.SavesBytes + preview.ScreenshotsBytes > 0) buttons.Insert(1, ("Quitar todo", () => _ = RunUninstall(pack.Id, true), false));
        _window.ShowDialog($"¿Quitar {pack.Name} de tu compu?", text, buttons.ToArray());
    }

    private async Task RunUninstall(string id, bool personal)
    {
        try { var freed = await _l.UninstallAsync(id, personal); _window.ShowToast($"Listo: liberé {Ui.Bytes(freed)}."); }
        catch (Exception ex) { _window.ShowToast(ex.Message); }
    }
}
