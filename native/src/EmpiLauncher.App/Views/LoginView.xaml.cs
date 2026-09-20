using System.Windows;
using System.Windows.Controls;
using System.Windows.Shapes;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The sign-in screen. Shown whenever nobody is signed in, which is the case at the first start, after "Cerrar sesión" (Ajustes > Cuenta) and
/// when a saved session could not be renewed. From here a saved account can be entered, another Microsoft account added, the offline player
/// created, or a session deleted. Deleting is only offered here: Ajustes > Cuenta is for quick switches between accounts already in use.
/// </summary>
public partial class LoginView : UserControl
{
    private readonly Launcher _l = Launcher.Instance;
    private string _key = "";
    private bool _arrived;
    private Button? _first;

    public event Action? OpenSettings;

    public LoginView()
    {
        InitializeComponent();
        Loaded += (_, _) =>
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
        Unloaded += (_, _) =>
        {
            _l.Changed -= OnChanged;
            LivingField.Quiet.Remove(Stage);
            if (LivingField.NextAction != null && ReferenceEquals(LivingField.NextAction, _first)) LivingField.NextAction = null;
        };
        SettingsButton.Click += (_, _) => OpenSettings?.Invoke();
    }

    private void OnChanged() => Refresh();

    private List<UIElement> Parts()
    {
        var parts = new List<UIElement> { Pills, TitleText, Lead };
        if (AccountsModule.Visibility == Visibility.Visible) parts.Add(AccountsModule);
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
            ? "Elige con qué cuenta juegas, añade otra o elimina una sesión."
            : "Entra con Microsoft, o juega sin conexión con solo un nombre.";

        AccountsModule.Visibility = accounts.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        Accounts.Children.Clear();
        _first = null;
        foreach (var account in accounts) Accounts.Children.Add(Row(account));

        Actions.Children.Clear();
        var add = Ui.Button("Añadir cuenta Microsoft", async () => await _l.LoginAsync(), accounts.Count == 0 ? "PrimaryButton" : "GhostButton", 20);
        Actions.Children.Add(add);
        if (!accounts.Any(a => a.Type == "offline"))
        {
            var play = Ui.Button("Jugar sin conexión", () => ((MainWindow)Application.Current.MainWindow).ShowOfflinePrompt(), "GhostButton", 20);
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
        avatar.Children.Add(new Ellipse { Fill = Fmt.Res("Surface3Brush") });
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
        var enter = Ui.Button("Entrar", async () => await _l.UseAccountAsync(uuid), "PaperButton", 22);
        System.Windows.Automation.AutomationProperties.SetName(enter, Ui.AccessName($"Entrar como {name}"));
        enter.Margin = new Thickness(0, 0, 8, 0);
        actions.Children.Add(enter);
        _first ??= enter;
        var remove = Ui.Button("Eliminar sesión", () => ConfirmRemove(uuid, name, account.Type), "DangerButton", 14);
        System.Windows.Automation.AutomationProperties.SetName(remove, Ui.AccessName($"Eliminar la sesión de {name}"));
        actions.Children.Add(remove);
        Grid.SetColumn(actions, 2);
        grid.Children.Add(actions);

        return new Border { Style = (Style)FindResource("Tile"), Child = grid, Margin = new Thickness(0, 0, 0, 8), Padding = new Thickness(14, 12, 12, 12) };
    }

    private void ConfirmRemove(string uuid, string name, string type)
    {
        var window = (MainWindow)Application.Current.MainWindow;
        var (title, message) = type switch
        {
            "offline" => ("¿Eliminar el jugador sin conexión?",
                $"Se quitará {name} de este launcher. Si lo vuelves a crear con el mismo nombre tendrá el mismo identificador y conservarás tus datos de un jugador."),
            "microsoft" => ("¿Eliminar la sesión?",
                $"Se cierra la sesión de {name} en Microsoft (su ventana se abre un momento, elige tu cuenta ahí) y se quita de este launcher. Podrás volver a añadirla cuando quieras."),
            _ => ("¿Eliminar la sesión?", $"Se quitará la cuenta {name} de este launcher. Podrás volver a añadirla cuando quieras.")
        };
        window.ShowDialog(title, message,
            ("Cancelar", null, false),
            ("Eliminar sesión", () => _ = _l.RemoveAccountAsync(uuid), true));
    }
}
