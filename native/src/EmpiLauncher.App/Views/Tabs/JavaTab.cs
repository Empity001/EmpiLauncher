using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;
using EmpiLauncher.Ipc;
using Microsoft.Win32;

namespace EmpiLauncher.App.Views.Tabs;

internal sealed class JavaTab : SettingsTab
{
    private readonly Launcher _l = Launcher.Instance;
    private readonly Ui.Debounce _save = new();
    private JavaSettings? _settings;
    private Slider? _min, _max;
    private TextBlock? _minLabel, _maxLabel, _memoryStatus, _javaDetails;
    private TextBox? _javaBox;
    private TextBlock? _javaState;
    private Button? _javaInstall;
    private JavaCheck? _check;
    private bool _installing;
    private bool _loading;

    public override string Id => "java";
    public override string Title => "Java";

    public override async Task LoadAsync()
    {
        _loading = true;
        Root.Children.Clear();
        var s = _settings = await _l.Client.CallAsync<JavaSettings>("settings.java");

        // ---- memory ----
        var memory = Ui.Section("Memoria", out var m, $"Este modpack usa entre {s.AbsoluteMinGb:0.#} y {s.AbsoluteMaxGb:0.#} GB. Dar de más puede ir peor: el juego necesita margen para el sistema.");
        _memoryStatus = Ui.Text("", "CaptionText");
        m.Children.Add(_memoryStatus);
        _min = Slider("Memoria mínima", s.MinRAMGb, s, out _minLabel);
        _max = Slider("Memoria máxima", s.MaxRAMGb, s, out _maxLabel);
        m.Children.Add(SliderRow("Mínima", _min, _minLabel));
        m.Children.Add(SliderRow("Máxima", _max, _maxLabel));
        Root.Children.Add(memory);
        UpdateMemoryStatus(s.TotalGB, s.FreeGB);

        // ---- java ----
        var java = Ui.Section("Java", out var j, $"Este modpack necesita Java {s.SuggestedMajor}.");
        _javaBox = Ui.Box(s.JavaExecutable, path => { _ = SaveJavaPath(path); }, "Ruta de Java");
        _javaBox.IsReadOnly = false;
        var pick = Ui.Button("Buscar...", PickJava);
        var line = new DockPanel();
        DockPanel.SetDock(pick, Dock.Right);
        pick.Margin = new Thickness(10, 0, 0, 0);
        line.Children.Add(pick);
        line.Children.Add(_javaBox);
        j.Children.Add(line);
        _javaDetails = Ui.Text("Comprobando...", "CaptionText");
        _javaDetails.Margin = new Thickness(4, 8, 0, 0);
        j.Children.Add(_javaDetails);

        // what this modpack needs, what it uses, and the button to install or update exactly that Java
        _javaState = Ui.Text("Comprobando el Java que pide este modpack...", "CaptionText");
        _javaState.Margin = new Thickness(4, 8, 0, 0);
        _javaState.TextWrapping = TextWrapping.Wrap;
        j.Children.Add(_javaState);
        _javaInstall = Ui.Button("Instalar Java", () => _ = InstallOrUpdateJavaAsync(), "PrimaryButton");
        _javaInstall.IsEnabled = false;
        _javaInstall.HorizontalAlignment = HorizontalAlignment.Left;
        _javaInstall.Margin = new Thickness(0, 12, 0, 0);
        j.Children.Add(_javaInstall);
        j.Children.Add(Ui.Row("Instalar Java automáticamente", "Si al jugar falta el Java que pide el modpack, el launcher lo instala solo. Apágalo si prefieres que te pregunte antes.",
            Ui.Switch(_l.Prefs.AutoJava != false, v => _ = _l.SetAutoJavaAsync(v), "Instalar Java automáticamente")));
        Root.Children.Add(java);
        _l.GameChanged -= OnGameChanged; _l.GameChanged += OnGameChanged;
        _l.JavaInstalled -= OnJavaInstalled; _l.JavaInstalled += OnJavaInstalled;

        // ---- jvm options ----
        var jvm = Ui.Section("Opciones de la JVM", out var o, "Argumentos separados por espacios. Déjalo como está si no sabes qué son.");
        var jvmBox = Ui.Box(string.Join(" ", s.JvmOptions), text => _ = SetJava("jvmOptions", text), "Opciones de la JVM");
        jvmBox.TextWrapping = TextWrapping.Wrap;
        jvmBox.MinHeight = 76;
        jvmBox.VerticalContentAlignment = VerticalAlignment.Top;
        o.Children.Add(jvmBox);
        Root.Children.Add(jvm);

        _loading = false;
        _ = RefreshJavaDetailsAsync(s.JavaExecutable);
        _ = RefreshRequirementAsync();
    }

    /// <summary>What the modpack needs against what it uses: the sentence under the path, and what the button offers.</summary>
    private async Task RefreshRequirementAsync()
    {
        if (_javaState == null || _javaInstall == null || _settings == null) return;
        try
        {
            var check = _check = await _l.CheckJavaAsync(_settings.ServerId);
            var need = check.Required.Major;
            var busy = _l.Game.Busy || _l.Game.Running;
            if (check.Current is { Ok: true } fits)
            {
                _javaState.Text = $"Este modpack usa Java {fits.Version}, el que pide (Java {need}).";
                _javaState.Foreground = Ui.Res("Paper3Brush");
                _javaInstall.Content = $"Buscar actualización de Java {need}";
                _javaInstall.Style = (Style)Application.Current.FindResource("GhostButton");
            }
            else
            {
                var using_ = check.Current is { } wrong && wrong.Version != null ? $"Ahora usa Java {wrong.Version}, que no le sirve. " : "";
                _javaState.Text = check.Found is { } found
                    ? $"{using_}Este modpack pide Java {need} y ya hay uno en tu equipo ({found.Version}): lo usará al jugar, o puedes elegirlo ahora."
                    : $"{using_}Este modpack pide Java {need} y no lo encuentro en tu equipo. {(check.AutoInstall ? "Se instalará solo al pulsar Jugar, o puedes instalarlo ahora." : "Instálalo aquí, o el launcher te preguntará al jugar.")}";
                _javaState.Foreground = Ui.Res("WarnBrush");
                _javaInstall.Content = check.Found != null ? $"Usar Java {need}" : $"Instalar Java {need}";
                _javaInstall.Style = (Style)Application.Current.FindResource("PrimaryButton");
            }
            _javaInstall.IsEnabled = !busy;
        }
        catch (EngineException ex) { _javaState.Text = ex.Message; }
    }

    private async Task InstallOrUpdateJavaAsync()
    {
        if (_settings == null || _javaInstall == null || _javaState == null) return;
        _installing = true;
        _javaInstall.IsEnabled = false;
        _javaState.Foreground = Ui.Res("Paper3Brush");
        _javaState.Text = "Preparando...";
        try { await _l.InstallJavaAsync(_settings.ServerId, update: _check?.Current?.Ok == true); }
        catch (EngineException ex) { _installing = false; _javaState.Text = ex.Message; _javaInstall.IsEnabled = true; }
    }

    /// <summary>While it installs, the sentence is the engine's progress; when it stops (done or failed) the tab looks again.</summary>
    private void OnGameChanged()
    {
        if (_javaState == null) return;
        if (_l.Game.Mode == "java" && _l.Game.Busy)
        {
            _javaState.Text = _l.Game.Percent > 0 ? $"{_l.Game.Text}  {_l.Game.Percent}%" : _l.Game.Text;
            if (_javaInstall != null) _javaInstall.IsEnabled = false;
        }
        else if (_installing && !_l.Game.Busy)
        {
            _installing = false;
            _ = RefreshRequirementAsync();
        }
        else if (!_installing && _javaInstall != null && _check != null) _javaInstall.IsEnabled = !(_l.Game.Busy || _l.Game.Running);
    }

    private void OnJavaInstalled(string serverId, int major, bool reused)
    {
        _installing = false;
        if (_settings != null && serverId == _settings.ServerId) _ = LoadAsync();   // the path box and the sentence show the Java it points at now
    }

    private Task SetJava(string key, object value) =>
        _l.Client.CallAsync("settings.java.set", new Dictionary<string, object> { [key] = value });

    private Slider Slider(string name, double value, JavaSettings s, out TextBlock label)
    {
        var slider = new Slider
        {
            Style = (Style)Application.Current.FindResource("RangeSlider"), Minimum = s.AbsoluteMinGb, Maximum = Math.Max(s.AbsoluteMaxGb, s.AbsoluteMinGb + 0.5),
            SmallChange = 0.5, LargeChange = 0.5, TickFrequency = 0.5, IsSnapToTickEnabled = true, Value = Math.Clamp(value, s.AbsoluteMinGb, s.AbsoluteMaxGb)
        };
        System.Windows.Automation.AutomationProperties.SetName(slider, name);
        var text = new TextBlock { Style = (Style)Application.Current.FindResource("DisplayText"), FontSize = 20, MinWidth = 76, TextAlignment = TextAlignment.Right };
        label = text;
        text.Text = $"{slider.Value:0.0} G";
        text.Foreground = Tone(slider.Value, s.TotalGB);
        slider.ValueChanged += (_, _) =>
        {
            text.Text = $"{slider.Value:0.0} G";
            text.Foreground = Tone(slider.Value, s.TotalGB);
            if (_loading) return;
            // Never a maximum below the minimum: drag the other one along, like the classic sliders.
            if (ReferenceEquals(slider, _min) && _max != null && _max.Value < slider.Value) _max.Value = slider.Value;
            if (ReferenceEquals(slider, _max) && _min != null && _min.Value > slider.Value) _min.Value = slider.Value;
            _save.Run(() => _ = SetMemory(_min!.Value, _max!.Value));
        };
        return slider;
    }

    private Task SetMemory(double min, double max) => _l.Client.CallAsync("settings.java.set", new { minRAMGb = min, maxRAMGb = max });

    private static System.Windows.Media.Brush Tone(double gb, double totalGb) =>
        gb >= totalGb * 0.75 ? Ui.Res("DangerBrush") : gb >= totalGb * 0.5 ? Ui.Res("WarnBrush") : Ui.Res("PaperBrush");

    private static Grid SliderRow(string title, Slider slider, TextBlock label)
    {
        var grid = new Grid { Margin = new Thickness(0, 10, 0, 6) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(80) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.Children.Add(Ui.Text(title, "LabelText"));
        Grid.SetColumn(slider, 1); grid.Children.Add(slider);
        Grid.SetColumn(label, 2); grid.Children.Add(label);
        ((TextBlock)grid.Children[0]).VerticalAlignment = VerticalAlignment.Center;
        label.VerticalAlignment = VerticalAlignment.Center;
        return grid;
    }

    private void UpdateMemoryStatus(double total, double free)
    {
        if (_memoryStatus != null) _memoryStatus.Text = $"RAM del equipo {total:0.0} G   libre ahora {free:0.0} G";
    }

    private void PickJava()
    {
        var dialog = new OpenFileDialog { Title = "Elige el ejecutable de Java", Filter = "Java (java.exe;javaw.exe)|java.exe;javaw.exe|Todos los archivos|*.*", CheckFileExists = true };
        if (dialog.ShowDialog() == true && _javaBox != null)
        {
            _javaBox.Text = dialog.FileName;
            _ = SaveJavaPath(dialog.FileName);
        }
    }

    private async Task SaveJavaPath(string path)
    {
        await _l.Client.CallAsync("settings.java.set", new { javaExecutable = path });
        await RefreshJavaDetailsAsync(path);
    }

    private async Task RefreshJavaDetailsAsync(string path)
    {
        if (_javaDetails == null) return;
        try
        {
            var details = await _l.Client.CallAsync<JavaDetails>("java.details", new { path });
            _javaDetails.Text = details.Valid ? $"Java {details.Version}  {details.Vendor}" : path.Length == 0 ? "Sin Java elegido: se buscará o instalará al jugar." : "Esta ruta no es un Java compatible con el modpack.";
            _javaDetails.Foreground = details.Valid || path.Length == 0 ? Ui.Res("Paper3Brush") : Ui.Res("DangerBrush");
        }
        catch (EngineException ex) { _javaDetails.Text = ex.Message; }
    }

    public override void Release()
    {
        _l.GameChanged -= OnGameChanged;
        _l.JavaInstalled -= OnJavaInstalled;
        _save.Flush();
    }
}
