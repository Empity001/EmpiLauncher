using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The failure report, in front of the player before anything happens to it: what it says (all of it, readable), and three things to do with
/// it: copy it, save it as a .txt, or send it to support for review. Nothing leaves this PC unless the player presses the last button, and
/// what is sent is exactly the text in the box (plus the note, if they wrote one). It names the player and their PC so the author knows
/// who wrote; it never carries a session, a key, an e-mail or the Windows user name (the engine takes those out).
/// </summary>
internal sealed class ReportPanel : UserControl
{
    private readonly Launcher _l = Launcher.Instance;
    private readonly TextBox _text;
    private readonly TextBox _note;
    private readonly TextBlock _status;
    private readonly TextBlock _where;
    private readonly Button _copy, _save, _send, _copyMail;
    private string _report = "";
    private string? _code;
    private bool _sending, _sent;
    private int _generation;

    public event Action? CloseRequested;

    public ReportPanel()
    {
        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var header = new DockPanel { Margin = new Thickness(0, 0, 0, 10) };
        var exit = new Button { Style = (Style)FindResource("IconButton"), Content = "", Width = 34, Height = 34, FontSize = 12, ToolTip = "Cerrar (Esc)" };
        System.Windows.Automation.AutomationProperties.SetName(exit, "Cerrar el informe");
        exit.Click += (_, _) => CloseRequested?.Invoke();
        DockPanel.SetDock(exit, Dock.Right);
        header.Children.Add(exit);
        header.Children.Add(Ui.Text("INFORME DE FALLO", "DisplayText", null, 26));
        root.Children.Add(header);

        var intro = new StackPanel { Margin = new Thickness(0, 0, 0, 12) };
        var explanation = Ui.Text("Esto es todo lo que contiene: versiones, tu equipo, el modpack, los mods y el final del registro del juego. Lleva tu nombre de jugador para que se sepa quién eres, pero nunca tu sesión, tus claves, tu correo ni tu usuario de Windows. No se envía nada hasta que tú lo pidas.", "BodyText", Fmt.Res("Paper2Brush"));
        explanation.TextWrapping = TextWrapping.Wrap;
        intro.Children.Add(explanation);
        _note = new TextBox { Style = (Style)FindResource("InputBox"), AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 36, MaxHeight = 60, MaxLength = 600, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0, 10, 0, 0) };
        System.Windows.Automation.AutomationProperties.SetName(_note, "Qué estabas haciendo (opcional)");
        intro.Children.Add(new TextBlock { Text = "¿QUÉ ESTABAS HACIENDO? (OPCIONAL, SE ENVÍA CON EL INFORME)", Style = (Style)FindResource("LabelText"), FontSize = 10.5, Margin = new Thickness(0, 12, 0, 4) });
        intro.Children.Add(_note);
        Grid.SetRow(intro, 1);
        root.Children.Add(intro);

        _text = new TextBox
        {
            Style = (Style)FindResource("InputBox"), IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, FontFamily = (FontFamily)FindResource("MonoFont"), FontSize = 11.5,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, Text = "Preparando el informe…"
        };
        System.Windows.Automation.AutomationProperties.SetName(_text, "Contenido del informe");
        Grid.SetRow(_text, 2);
        root.Children.Add(_text);

        _status = Ui.Text("", "CaptionText");
        _status.TextWrapping = TextWrapping.Wrap; _status.VerticalAlignment = VerticalAlignment.Center;
        _where = Ui.Text("", "CaptionText", Fmt.Res("Paper2Brush"));
        _where.TextWrapping = TextWrapping.Wrap; _where.Margin = new Thickness(0, 0, 0, 6);
        _copy = Ui.Button("Copiar", () => Copy(), "GhostButton", 18);
        _save = Ui.Button("Guardar .txt", () => Save(), "GhostButton", 18);
        _copyMail = Ui.Button("Copiar el correo de soporte", () => CopyMail(), "GhostButton", 18);
        _send = Ui.Button("Enviar a soporte para revisión", () => _ = SendAsync(), "PaperButton", 22);
        foreach (var b in new[] { _copy, _save, _copyMail }) b.Margin = new Thickness(0, 0, 8, 0);
        var buttons = new WrapPanel { Children = { _copy, _save, _copyMail, _send } };
        var footer = new StackPanel { Margin = new Thickness(0, 12, 0, 0), Children = { _where, _status, new Border { Height = 8 }, buttons } };
        Grid.SetRow(footer, 3);
        root.Children.Add(footer);

        Content = new Border { Style = (Style)FindResource("Module"), Background = new SolidColorBrush(Color.FromRgb(0x11, 0x11, 0x14)), Padding = new Thickness(24, 20, 24, 20), Child = root };
        MinWidth = 640; MaxWidth = 860; MaxHeight = 720;
    }

    /// <summary>Builds the report for the modpack that is selected and shows it. Called each time the panel opens.</summary>
    public async Task OpenAsync(string? intro = null)
    {
        var generation = ++_generation;
        _sent = false; _sending = false; _code = null; _report = "";
        _text.Text = "Preparando el informe…";
        _status.Text = intro ?? "";
        _status.Foreground = Fmt.Res("Paper2Brush");
        Layout();
        try
        {
            var built = await _l.BuildReportAsync(_l.Selected?.Id, forSupport: true);
            if (generation != _generation) return;
            _report = built.Text; _code = built.Code;
            _text.Text = _report;
            _text.ScrollToHome();
        }
        catch (Exception ex)
        {
            if (generation != _generation) return;
            _text.Text = "No se pudo preparar el informe: " + ex.Message;
        }
        Layout();
    }

    /// <summary>What is offered depends on where reports can go (avisos.json): sent from here, only an address to write to, or nothing (the file is the way out).</summary>
    private void Layout()
    {
        var support = _l.Notices?.Launcher.Support;
        var ready = _report.Length > 0 && !_sending;
        _copy.IsEnabled = _save.IsEnabled = _report.Length > 0;
        _send.Visibility = support is { CanSend: true } ? Visibility.Visible : Visibility.Collapsed;
        _send.IsEnabled = ready && !_sent;
        _send.Content = _sending ? "Enviando…" : _sent ? "Enviado" : "Enviar a soporte para revisión";
        _copyMail.Visibility = support is { CanSend: false, Email: not null } ? Visibility.Visible : Visibility.Collapsed;
        _where.Text = support switch
        {
            { CanSend: true } => "Se envía a soporte por correo, con este contenido exacto y tu nota. Tú eliges: si prefieres, guárdalo y mándalo tú.",
            { Email: { } mail } => $"Aquí no se puede enviar directamente. Guarda el informe y mándalo a {mail}.",
            _ => "Guarda el informe y envíaselo a quien te esté ayudando."
        };
    }

    private void Copy()
    {
        try { Clipboard.SetText(_report); Say("Copiado. Pégalo donde quieras compartirlo.", ok: true); }
        catch (Exception) { Say("No se pudo copiar (otro programa está usando el portapapeles). Vuelve a intentarlo.", ok: false); }
    }

    private void CopyMail()
    {
        try { Clipboard.SetText(_l.Notices?.Launcher.Support?.Email ?? ""); Say("Correo de soporte copiado.", ok: true); }
        catch (Exception) { Say("No se pudo copiar el correo.", ok: false); }
    }

    private void Save()
    {
        var dialog = new Microsoft.Win32.SaveFileDialog { Title = "Guardar el informe", FileName = $"empi-informe-{DateTime.Now:yyyyMMdd-HHmm}.txt", Filter = "Texto (*.txt)|*.txt", DefaultExt = ".txt", AddExtension = true };
        if (dialog.ShowDialog(Window.GetWindow(this)) != true) return;
        try
        {
            // with a byte-order mark, so every version of Notepad reads the accents right
            File.WriteAllText(dialog.FileName, _report.Replace("\n", "\r\n"), new UTF8Encoding(true));
            Say($"Guardado en {dialog.FileName}", ok: true);
        }
        catch (Exception ex) { Say("No se pudo guardar el archivo: " + ex.Message, ok: false); }
    }

    private async Task SendAsync()
    {
        if (_sending || _sent || _report.Length == 0) return;
        _sending = true; Layout();
        Say("Enviando…", ok: true);
        try
        {
            await _l.SendReportAsync(_report, _code, _note.Text);
            _sent = true;
            Say($"Enviado. Gracias. Tu código es {_code}: si te escriben, menciónalo.", ok: true);
        }
        catch (EngineException ex) { Say(ex.Message, ok: false); }
        catch (Exception) { Say("No se pudo enviar. Guárdalo como archivo y mándalo por otro medio.", ok: false); }
        _sending = false;
        Layout();
    }

    private void Say(string text, bool ok)
    {
        _status.Text = text;
        _status.Foreground = ok ? Fmt.Res("Paper2Brush") : Fmt.Res("DangerBrush");
    }
}
