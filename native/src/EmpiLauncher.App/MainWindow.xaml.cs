using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App;

public sealed record PackRow(string Id, string Name, string Meta, Brush Fill, Brush Ink, Brush InkSoft);

public partial class MainWindow : Window
{
    private EngineHost? _engine;
    private DistroResult? _distro;
    private string? _selected;
    private readonly DispatcherTimer _idle = new() { Interval = TimeSpan.FromSeconds(4) };

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await StartAsync();
        Closed += async (_, _) => { if (_engine != null) await _engine.DisposeAsync(); };
        // A launcher spends most of its life waiting: after a quiet moment, hand back what start-up touched.
        _idle.Tick += (_, _) => { _idle.Stop(); TrimMemory(); };
        PreviewMouseMove += (_, _) => { _idle.Stop(); _idle.Start(); };
    }

    private async Task StartAsync()
    {
        var sw = Stopwatch.StartNew();
        try
        {
            _engine = await EngineHost.StartAsync(EngineLocator.Resolve());
            var config = await _engine.Client.CallAsync<ConfigResult>("config.get");
            _distro = await _engine.Client.CallAsync<DistroResult>("distro.load");
            _selected = _distro.SelectedServer;
            Render();
            Status.Text = $"motor listo en {sw.ElapsedMilliseconds} ms, índice {_distro.TookMs} ms, {config.Accounts.Accounts.Count} cuenta(s)";
            _idle.Start();
        }
        catch (Exception ex)
        {
            PackTitle.Text = "No se pudo iniciar el motor";
            Status.Text = ex.Message;
        }
    }

    private void Render()
    {
        if (_distro == null) return;
        var paper = new SolidColorBrush(Color.FromRgb(0xf1, 0xef, 0xe8));
        var card = new SolidColorBrush(Color.FromRgb(0x18, 0x18, 0x1c));
        var ink = new SolidColorBrush(Color.FromRgb(0x05, 0x05, 0x06));
        var text = new SolidColorBrush(Color.FromRgb(0xf1, 0xef, 0xe8));
        var soft = new SolidColorBrush(Color.FromRgb(0xa5, 0xa5, 0x98));
        var softInk = new SolidColorBrush(Color.FromRgb(0x47, 0x47, 0x3f));

        Rail.ItemsSource = _distro.Servers.Select(s =>
        {
            var on = s.Id == _selected;
            var meta = $"{s.MinecraftVersion}  v{s.Version}" + (s.MainServer ? "  Principal" : "") + (s.Whitelist ? "  Whitelist" : "");
            return new PackRow(s.Id, s.Name, meta, on ? paper : card, on ? ink : text, on ? softInk : soft);
        }).ToList();

        var current = _distro.Servers.First(s => s.Id == _selected);
        PackTitle.Text = current.Name;
        PackSub.Text = string.IsNullOrWhiteSpace(current.Description) ? $"Minecraft {current.MinecraftVersion}" : current.Description;
        if (current.Accent is { Length: 7 } hex)
            PlayButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        else
            PlayButton.Background = new SolidColorBrush(Color.FromRgb(0xff, 0x3d, 0x8b));
    }

    private async void OnPackClick(object sender, MouseButtonEventArgs e)
    {
        if (_engine == null || _distro == null || sender is not FrameworkElement { Tag: string id }) return;
        _selected = id;
        Render();
        await _engine.Client.CallAsync("distro.select", new { id });
    }

    private void OnPlayClick(object sender, MouseButtonEventArgs e)
    {
        Status.Text = "Jugar todavía no está conectado: es la siguiente pieza (motor: game.prepare y game.launch).";
    }

    private async void TrimMemory()
    {
        try
        {
            _engine?.Trim();
            GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
            NativeMethods.EmptyWorkingSet(Process.GetCurrentProcess().Handle);
            if (_engine != null)
            {
                var memory = await _engine.Client.CallAsync<EngineMemory>("engine.memory");
                Status.Text += $"\nen reposo: interfaz {Process.GetCurrentProcess().WorkingSet64 / 1048576} MB, motor {memory.RssMB:0} MB";
            }
        }
        catch { }
    }
}
