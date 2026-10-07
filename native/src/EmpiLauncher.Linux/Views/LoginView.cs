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
using Shape = Avalonia.Controls.Shapes.Shape;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The sign-in screen. Shown whenever nobody is signed in, which is the case at the first start, after "Cerrar sesión" (Ajustes > Cuenta) and
/// when a saved session could not be renewed. From here a saved account can be entered, another Microsoft account added, the offline player
/// created, or a session deleted. Deleting is only offered here: Ajustes > Cuenta is for quick switches between accounts already in use.
/// </summary>
public sealed class LoginView : UserControl
{
    private readonly Services.Launcher _l = Services.Launcher.Instance;
    private string _key = "";
    private bool _arrived;
    private Button? _first;
    private readonly StackPanel Stage = new() { Margin = new Thickness(12, 0, 12, 24) };
    private readonly WrapPanel Pills = new() { Margin = new Thickness(0, 0, 0, 16) };
    private readonly TextBlock TitleText = Ui.Text("INICIAR SESIÓN", "DisplayText", null, 46);
    private readonly TextBlock Lead = Ui.Text("", "BodyText", Pal.Paper2);
    private readonly Border AccountsModule;
    private readonly StackPanel Accounts = new();
    private readonly StackPanel Actions = new() { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 18, 0, 0) };

    public event Action? OpenSettings;

    public LoginView()
    {
        // The sign-in screen: shown whenever nobody is signed in (first start, after "Cerrar sesión", or when a session could not be renewed).
        // Enter any saved account, add another one, or delete a session. Same anchor as the modpack's presentation on the home screen.
        TitleText.TextWrapping = TextWrapping.Wrap; TitleText.TextTrimming = TextTrimming.None; TitleText.LineHeight = 50;
        Lead.Margin = new Thickness(0, 12, 0, 0); Lead.MaxWidth = 560; Lead.HorizontalAlignment = HorizontalAlignment.Left;
        var saved = Ui.Text("CUENTAS GUARDADAS", "LabelText");
        var savedHint = Ui.Text("Eliminar sesión quita la cuenta de este launcher; la puedes volver a añadir cuando quieras.", "CaptionText");
        savedHint.Margin = new Thickness(0, 6, 0, 10);
        AccountsModule = Ui.Module(new StackPanel { Children = { saved, savedHint, Accounts } }, new Thickness(20, 16));
        AccountsModule.Margin = new Thickness(0, 28, 0, 0);
        Stage.Children.Add(Pills); Stage.Children.Add(TitleText); Stage.Children.Add(Lead); Stage.Children.Add(AccountsModule); Stage.Children.Add(Actions);
        var settings = Ui.IconBtn(Icons.Gear, "Ajustes", () => OpenSettings?.Invoke());
        Avalonia.Automation.AutomationProperties.SetName(settings, "Ajustes");
        settings.HorizontalAlignment = HorizontalAlignment.Right; settings.VerticalAlignment = VerticalAlignment.Bottom;
        Content = new Grid
        {
            Margin = new Thickness(24, 0, 24, 24),
            Children = { new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Focusable = false, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Left, Width = 664, Content = Stage }, settings }
        };
        AttachedToVisualTree += (_, _) =>
        {
            _l.Changed += OnChanged;
            LivingField.Quiet.Add(Stage);   // dots stay faint behind the text, like behind a modpack's presentation
            // While the logo's opening still covers the window the parts wait hidden, and arrive the moment it uncovers them.
            if (SplashLayer.Playing)
            {
                foreach (var part in Parts()) part.Opacity = 0;
                SplashLayer.WhenRevealing(Arrive);
            }
            Refresh();
            if (!SplashLayer.Playing) Arrive();
        };
        DetachedFromVisualTree += (_, _) =>
        {
            _l.Changed -= OnChanged;
            LivingField.Quiet.Remove(Stage);
            if (LivingField.NextAction != null && ReferenceEquals(LivingField.NextAction, _first)) LivingField.NextAction = null;
        };
    }

    private void OnChanged() => Refresh();

    private List<Control> Parts()
    {
        var parts = new List<Control> { Pills, TitleText, Lead };
        if (AccountsModule.IsVisible) parts.Add(AccountsModule);
        parts.Add(Actions);
        return parts;
    }

    /// <summary>The screen arrives once, in reading order: what it is, what it says, the accounts, then the ways to add one.</summary>
    private void Arrive()
    {
        if (_arrived) return;
        _arrived = true;
        Motion.Reveal(Parts(), 45, 0, 260, 10);
        Motion.Tear(TitleText);
    }

    private void Refresh()
    {
        var accounts = _l.Config?.Accounts.Accounts ?? [];
        var key = string.Join("|", accounts.Select(a => $"{a.Uuid}:{a.DisplayName}:{a.Type}:{a.OfflineId}"));
        if (key == _key && Actions.Children.Count > 0) return;   // the engine's news arrive all the time; nothing about the accounts moved
        _key = key;

        Pills.Children.Clear();
        Pills.Children.Add(Fmt.Pill("SIN SESIÓN", Fmt.Res("WarnBrush")));
        if (accounts.Count > 0) Pills.Children.Add(Fmt.Pill(accounts.Count == 1 ? "1 CUENTA GUARDADA" : $"{accounts.Count} CUENTAS GUARDADAS"));

        Lead.Text = accounts.Count > 0
            ? "Escoge con qué cuenta juegas hoy, añade otra o elimina una sesión."
            : "Entra con Microsoft, o juega sin conexión con nomás un nombre.";

        AccountsModule.IsVisible = accounts.Count > 0;
        Accounts.Children.Clear();
        _first = null;
        foreach (var account in accounts) Accounts.Children.Add(Row(account));

        Actions.Children.Clear();
        var add = Ui.Act("Añadir cuenta Microsoft", async () => await _l.LoginAsync(), accounts.Count == 0 ? "PrimaryButton" : "GhostButton", 20);
        Actions.Children.Add(add);
        if (!accounts.Any(a => a.Type == "offline"))
        {
            var play = Ui.Act("Jugar sin conexión", () => MainWindow.Instance!.ShowOfflinePrompt(), "GhostButton", 20);
            play.Margin = new Thickness(10, 0, 0, 0);
            Actions.Children.Add(play);
        }

        // The main action glows in the accent: entering the first saved account, or adding the first one.
        _first ??= add;
        LivingField.NextAction = _first;
    }

    /// <summary>One saved account: who it is, "Entrar" (the quick way in) and "Eliminar sesión".</summary>
    private Border Row(AccountSummary account)
    {
        var uuid = account.Uuid;
        var name = account.DisplayName;
        var offline = account.Type == "offline";

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var avatar = new Grid { Width = 38, Height = 38, Margin = new Thickness(0, 0, 14, 0), VerticalAlignment = VerticalAlignment.Center };
        avatar.Children.Add(new Avalonia.Controls.Shapes.Ellipse { Fill = Fmt.Res("Surface3Brush") });
        var initial = Ui.Text(string.IsNullOrEmpty(name) ? "?" : name[..1].ToUpperInvariant(), "DisplayText", null, 17);
        initial.HorizontalAlignment = HorizontalAlignment.Center;
        initial.VerticalAlignment = VerticalAlignment.Center;
        avatar.Children.Add(initial);
        grid.Children.Add(avatar);

        var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) };
        var title = Ui.Text(name, "BodyText", null, 15);
        title.TextTrimming = TextTrimming.CharacterEllipsis;
        title.TextWrapping = TextWrapping.NoWrap;
        text.Children.Add(title);
        text.Children.Add(Ui.Text(Fmt.AccountKind(account), "CaptionText"));
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var enter = Ui.Act("Entrar", async () => await _l.UseAccountAsync(uuid), "PaperButton", 22);
        Avalonia.Automation.AutomationProperties.SetName(enter, Ui.AccessName($"Entrar como {name}"));
        enter.Margin = new Thickness(0, 0, 8, 0);
        actions.Children.Add(enter);
        _first ??= enter;
        var remove = Ui.Act("Eliminar sesión", () => ConfirmRemove(uuid, name, account.Type), "DangerButton", 14);
        Avalonia.Automation.AutomationProperties.SetName(remove, Ui.AccessName($"Eliminar la sesión de {name}"));
        actions.Children.Add(remove);
        Grid.SetColumn(actions, 2);
        grid.Children.Add(actions);

        return new Border { Background = Pal.Tint, CornerRadius = new CornerRadius(Pal.RadiusTile), Child = grid, Margin = new Thickness(0, 0, 0, 8), Padding = new Thickness(14, 12, 12, 12) };
    }

    private void ConfirmRemove(string uuid, string name, string type)
    {
        var window = MainWindow.Instance!;
        var (title, message) = type switch
        {
            "offline" => ("¿Eliminar el jugador sin conexión?",
                $"Quito a {name} de este launcher. Si lo vuelves a crear con el mismo nombre, tiene el mismo identificador y conservas tus datos de un jugador, no se pierde nada."),
            "microsoft" => ("¿Eliminar la sesión?",
                $"Cierro la sesión de {name} en Microsoft (su ventana se abre un momentito, escoge tu cuenta ahí) y la quito de este launcher. La puedes volver a añadir cuando quieras."),
            _ => ("¿Eliminar la sesión?", $"Quito la cuenta {name} de este launcher. La puedes volver a añadir cuando quieras.")
        };
        window.ShowDialog(title, message,
            ("Cancelar", null, false),
            ("Eliminar sesión", () => _ = _l.RemoveAccountAsync(uuid), true));
    }
}
