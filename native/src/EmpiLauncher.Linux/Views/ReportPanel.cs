using System.Text;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input.Platform;
using Avalonia.Layout;
using Avalonia.Media;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The failure report, in front of the player before anything happens to it: what it says (all of it, readable), and three things to do with
/// it: copy it, save it as a .txt, or send it to support for review. Nothing leaves this PC unless the player presses the last button, and
/// what is sent is exactly the text in the box (plus the note, if they wrote one). It names the player and their PC so the author knows
/// who wrote; it never carries a session, a key, an e-mail or the system user name (the engine takes those out).
/// </summary>
internal sealed class ReportPanel : Border
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private readonly TextBox _text, _note;
    private readonly TextBlock _status, _where;
    private readonly Button _copy, _save, _send, _copyMail;
    private string _report = "";
    private string? _code;
    private bool _sending, _sent;
    private int _generation;

    public event Action? CloseRequested;

    public ReportPanel()
    {
        var header = new DockPanel { Margin = new Thickness(0, 0, 0, 10) };
        var exit = Ui.IconBtn(Icons.Close, "Cerrar el informe", () => CloseRequested?.Invoke(), 34);
        DockPanel.SetDock(exit, Dock.Right);
        header.Children.Add(exit);
        header.Children.Add(Ui.Display("INFORME DE FALLO", 26));

        var explanation = Ui.Body("Esto es todo lo que lleva: versiones, tu equipo, el modpack, los mods y el final del registro del juego. Lleva tu nombre de jugador para saber quién eres, pero nunca tu sesión, tus claves ni tu correo.", 13, Pal.Paper2);
        _note = new TextBox { AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 36, MaxHeight = 70, MaxLength = 600, Background = Pal.Input, Foreground = Pal.Paper, BorderBrush = Pal.HairStrong, CornerRadius = new CornerRadius(Pal.RadiusInput), Padding = new Thickness(12, 8) };
        var label = Ui.Label("¿QUÉ ESTABAS HACIENDO? (OPCIONAL, SE ENVÍA CON EL INFORME)", 10.5);
        label.Margin = new Thickness(0, 12, 0, 4);
        var intro = new StackPanel { Margin = new Thickness(0, 0, 0, 12), Children = { explanation, label, _note } };

        _text = new TextBox
        {
            IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, FontFamily = Pal.Mono, FontSize = 11.5, Text = "Preparando el informe…",
            Background = Pal.Input, Foreground = Pal.Paper, BorderBrush = Pal.HairStrong, CornerRadius = new CornerRadius(Pal.RadiusInput), Padding = new Thickness(12, 10)
        };

        _status = Ui.Caption(""); _status.VerticalAlignment = VerticalAlignment.Center;
        _where = Ui.Caption(""); _where.Foreground = Pal.Paper2; _where.Margin = new Thickness(0, 0, 0, 6);
        _copy = Ui.Btn("Copiar", Ui.Kind.Ghost, () => _ = CopyAsync(_report, "Copiado. Pégalo donde lo quieras compartir."), new Thickness(18, 9));
        _save = Ui.Btn("Guardar .txt", Ui.Kind.Ghost, Save, new Thickness(18, 9));
        _copyMail = Ui.Btn("Copiar el correo de soporte", Ui.Kind.Ghost, () => _ = CopyAsync(_l.Notices?.Launcher.Support?.Email ?? "", "Correo de soporte copiado."), new Thickness(18, 9));
        _send = Ui.Btn("Enviar a soporte para revisión", Ui.Kind.Paper, () => _ = SendAsync(), new Thickness(22, 9));
        var buttons = new WrapPanel { Children = { _copy, _save, _copyMail, _send } };
        foreach (var b in buttons.Children) b.Margin = new Thickness(0, 0, 8, 6);
        var footer = new StackPanel { Margin = new Thickness(0, 12, 0, 0), Children = { _where, _status, buttons } };

        var root = new DockPanel();
        DockPanel.SetDock(header, Dock.Top); DockPanel.SetDock(intro, Dock.Top); DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(header); root.Children.Add(intro); root.Children.Add(footer); root.Children.Add(_text);

        Background = Pal.Dialog; BorderBrush = Pal.Hair; BorderThickness = new Thickness(1); CornerRadius = new CornerRadius(Pal.RadiusModule); Padding = new Thickness(24, 20);
        Child = root;
        MinWidth = 640; MaxWidth = 860;
    }

    /// <summary>Builds the report for the modpack that is selected and shows it. Called each time the panel opens.</summary>
    public async Task OpenAsync(string? intro = null)
    {
        var generation = ++_generation;
        _sent = false; _sending = false; _code = null; _report = "";
        _text.Text = "Preparando el informe…";
        Say(intro ?? "", ok: true);
        Layout();
        try
        {
            var built = await _l.BuildReportAsync(_l.Selected?.Id, forSupport: true);
            if (generation != _generation) return;
            _report = built.Text; _code = built.Code;
            _text.Text = _report;
            _text.CaretIndex = 0;
        }
        catch (Exception ex)
        {
            if (generation != _generation) return;
            _text.Text = "No pude preparar el informe: " + ex.Message;
        }
        Layout();
    }

    /// <summary>What is offered depends on where reports can go (avisos.json): sent from here, only an address to write to, or nothing (the file is the way out).</summary>
    private void Layout()
    {
        var support = _l.Notices?.Launcher.Support;
        var ready = _report.Length > 0 && !_sending;
        _copy.IsEnabled = _save.IsEnabled = _report.Length > 0;
        _send.IsVisible = support is { CanSend: true };
        _send.IsEnabled = ready && !_sent;
        ((TextBlock)_send.Content!).Text = _sending ? "Enviando…" : _sent ? "Enviado" : "Enviar a soporte para revisión";
        _copyMail.IsVisible = support is { CanSend: false, Email: not null };
        _where.Text = support switch
        {
            { CanSend: true } => "Me llega a soporte por correo, con esto exactito y tu nota. Tú decides: si prefieres, guárdalo y mándalo tú.",
            { Email: { } mail } => $"Desde aquí no se puede mandar directo. Guarda el informe y mándalo a {mail}.",
            _ => "Guarda el informe y mándaselo a quien te esté echando la mano."
        };
    }

    private async Task CopyAsync(string text, string done)
    {
        try
        {
            if (TopLevel.GetTopLevel(this)?.Clipboard is { } clipboard) { await clipboard.SetTextAsync(text); Say(done, ok: true); }
            else Say("No se pudo copiar (no encuentro el portapapeles).", ok: false);
        }
        catch (Exception) { Say("No se pudo copiar. Inténtalo otra vez.", ok: false); }
    }

    /// <summary>Saved in Documentos (no file dialog: the folder is where the player would look for it).</summary>
    private void Save()
    {
        try
        {
            var folder = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) folder = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var path = System.IO.Path.Combine(folder, $"empi-informe-{DateTime.Now:yyyyMMdd-HHmm}.txt");
            File.WriteAllText(path, _report, new UTF8Encoding(true));
            Say($"Guardado en {path}", ok: true);
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
            Say($"¡Enviado, gracias! Tu código es {_code}: si te escribo, así sé que eres tú.", ok: true);
        }
        catch (EngineException ex) { Say(ex.Message, ok: false); }
        catch (Exception) { Say("No se pudo enviar. Guárdalo como archivo y mándamelo por otro lado.", ok: false); }
        _sending = false;
        Layout();
    }

    private void Say(string text, bool ok)
    {
        _status.Text = text;
        _status.Foreground = ok ? Pal.Paper2 : Pal.Danger;
    }
}
