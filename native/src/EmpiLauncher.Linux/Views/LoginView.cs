using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The sign-in screen. Shown whenever nobody is signed in: the first start, after "Cerrar sesión" (Ajustes > Cuenta) and when a saved session
/// could not be renewed. From here a saved account can be entered, another Microsoft account added, the offline player created, or a session deleted.
/// </summary>
public sealed class LoginView : UserControl
{
    private readonly Launcher _l = Launcher.Instance;
    private readonly MainWindow _window;
    private readonly WrapPanel _pills = new() { Margin = new Thickness(0, 0, 0, 14) };
    private readonly TextBlock _lead = Ui.Body("", 15, Pal.Paper2);
    private readonly StackPanel _accounts = new() { Spacing = 8 };
    private readonly Border _accountsModule;
    private readonly StackPanel _actions = new() { Orientation = Orientation.Horizontal, Spacing = 10, Margin = new Thickness(0, 22, 0, 0) };
    private string _key = "";
    private Control _stage = null!;
    private Button? _firstAction, _firstEnter;

    public LoginView(MainWindow window)
    {
        _window = window;
        var title = Ui.Display("Entrar", 52, Pal.Title);
        _lead.MaxWidth = 520; _lead.HorizontalAlignment = HorizontalAlignment.Left; _lead.Margin = new Thickness(0, 14, 0, 0);
        _accountsModule = Ui.Module(_accounts, new Thickness(14, 14));
        _accountsModule.Margin = new Thickness(0, 22, 0, 0); _accountsModule.MaxWidth = 620; _accountsModule.HorizontalAlignment = HorizontalAlignment.Left;

        var stage = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(48, 0, 0, 40), Children = { _pills, title, _lead, _accountsModule, _actions } };
        var settings = Ui.IconBtn(Icons.Gear, "Ajustes", () => _window.ShowSettings());
        settings.HorizontalAlignment = HorizontalAlignment.Right; settings.VerticalAlignment = VerticalAlignment.Bottom; settings.Margin = new Thickness(0, 0, 24, 24);
        Content = new Grid { Children = { stage, settings } };

        _stage = stage;
        AttachedToVisualTree += (_, _) => { _l.Changed += OnChanged; LivingField.Quiet.Add(_stage); Refresh(); };
        DetachedFromVisualTree += (_, _) => { _l.Changed -= OnChanged; LivingField.Quiet.Remove(_stage); if (ReferenceEquals(LivingField.NextAction, _firstAction)) LivingField.NextAction = null; };
    }

    private void OnChanged() => Refresh();

    private void Refresh()
    {
        var accounts = _l.Config?.Accounts.Accounts ?? [];
        var key = string.Join("|", accounts.Select(a => $"{a.Uuid}:{a.DisplayName}:{a.Type}:{a.OfflineId}"));
        if (key == _key && _actions.Children.Count > 0) return;   // the engine's news arrive all the time; nothing about the accounts moved
        _key = key;

        _pills.Children.Clear();
        _pills.Children.Add(Ui.Pill("SIN SESIÓN", Pal.Warn));
        if (accounts.Count > 0) _pills.Children.Add(Ui.Pill(accounts.Count == 1 ? "1 CUENTA GUARDADA" : $"{accounts.Count} CUENTAS GUARDADAS"));
        _lead.Text = accounts.Count > 0
            ? "Escoge con qué cuenta juegas hoy, añade otra o elimina una sesión."
            : "Entra con Microsoft, o juega sin conexión con nomás un nombre.";

        _accountsModule.IsVisible = accounts.Count > 0;
        _accounts.Children.Clear();
        _firstEnter = null;
        foreach (var account in accounts) _accounts.Children.Add(Row(account));

        _actions.Children.Clear();
        var add = Ui.Btn("Añadir cuenta Microsoft", accounts.Count == 0 ? Ui.Kind.Primary : Ui.Kind.Ghost, () => _ = _l.LoginAsync(), new Thickness(20, 12));
        _actions.Children.Add(add);
        _firstAction = _firstEnter ?? add;
        LivingField.NextAction = _firstAction;
        if (!accounts.Any(a => a.Type == "offline"))
            _actions.Children.Add(Ui.Btn("Jugar sin conexión", Ui.Kind.Ghost, () => _window.ShowOfflinePrompt(), new Thickness(20, 12)));
    }

    /// <summary>One saved account: who it is, "Entrar" (the quick way in) and "Eliminar sesión".</summary>
    private Control Row(AccountSummary account)
    {
        var uuid = account.Uuid; var name = account.DisplayName;
        var avatar = new Grid { Width = 38, Height = 38, Margin = new Thickness(0, 0, 14, 0), VerticalAlignment = VerticalAlignment.Center };
        avatar.Children.Add(new Avalonia.Controls.Shapes.Ellipse { Fill = Pal.Surface3 });
        var initial = Ui.Display(string.IsNullOrEmpty(name) ? "?" : name[..1].ToUpperInvariant(), 17);
        initial.HorizontalAlignment = HorizontalAlignment.Center; initial.VerticalAlignment = VerticalAlignment.Center;
        avatar.Children.Add(initial);

        var title = Ui.Body(name, 15); title.TextTrimming = TextTrimming.CharacterEllipsis; title.TextWrapping = TextWrapping.NoWrap;
        var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0), Children = { title, Ui.Caption(Ui.AccountKind(account)) } };

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        var enter = Ui.Btn("Entrar", Ui.Kind.Paper, () => _ = _l.UseAccountAsync(uuid), new Thickness(22, 9));
        _firstEnter ??= enter;
        actions.Children.Add(enter);
        actions.Children.Add(Ui.Btn("Eliminar sesión", Ui.Kind.Danger, () => ConfirmRemove(uuid, name, account.Type), new Thickness(14, 9), 12));

        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto") };
        Grid.SetColumn(text, 1); Grid.SetColumn(actions, 2);
        grid.Children.Add(avatar); grid.Children.Add(text); grid.Children.Add(actions);
        return new Border { Background = Pal.Tint, BorderBrush = Pal.Hair, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(16), Padding = new Thickness(14, 12, 12, 12), Child = grid };
    }

    private void ConfirmRemove(string uuid, string name, string type)
    {
        var (title, message) = type switch
        {
            "offline" => ("¿Eliminar el jugador sin conexión?", $"Quito a {name} de este launcher. Si lo vuelves a crear con el mismo nombre, tiene el mismo identificador y conservas tus datos de un jugador, no se pierde nada."),
            "microsoft" => ("¿Eliminar la sesión?", $"Cierro la sesión de {name} en Microsoft (su ventana se abre un momentito, escoge tu cuenta ahí) y la quito de este launcher. La puedes volver a añadir cuando quieras."),
            _ => ("¿Eliminar la sesión?", $"Quito la cuenta {name} de este launcher. La puedes volver a añadir cuando quieras.")
        };
        _window.ShowDialog(title, message, ("Cancelar", null, false), ("Eliminar sesión", () => _ = _l.RemoveAccountAsync(uuid), true));
    }
}
