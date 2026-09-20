using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Tabs;

/// <summary>
/// Ajustes > Cuenta: quick switches between the accounts already in use, and "Cerrar sesión". Adding an account, playing without one and
/// deleting a session live on the sign-in screen (LoginView), which "Cerrar sesión" leads to.
/// </summary>
internal sealed class AccountTab : SettingsTab
{
    private readonly Launcher _l = Launcher.Instance;
    public override string Id => "account";
    public override string Title => "Cuenta";

    public override async Task LoadAsync()
    {
        await _l.RefreshConfigAsync();
        Root.Children.Clear();

        var accounts = _l.Config?.Accounts.Accounts ?? [];
        var card = Ui.Section("Cuentas de Minecraft", out var body,
            accounts.Count == 0 ? null : _l.SignedOut ? "Ahora no hay ninguna sesión iniciada. Elige con cuál jugar." : "La cuenta seleccionada es la que se usa al jugar. Cambia de una a otra cuando quieras.");
        if (accounts.Count == 0)
            body.Children.Add(Ui.Text("Todavía no hay ninguna cuenta guardada. Añade una desde la pantalla de inicio de sesión.", "BodyText", Ui.Res("Paper2Brush")));

        foreach (var account in accounts)
        {
            var selected = account.Uuid == _l.Config!.Accounts.Selected;
            var uuid = account.Uuid;
            var offline = account.Type == "offline";
            var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            text.Children.Add(Ui.Text(account.DisplayName, "BodyText", null, 15));
            text.Children.Add(Ui.Text(Fmt.AccountKind(account), "CaptionText"));
            row.Children.Add(text);

            var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            var name = account.DisplayName;
            if (offline)
            {
                // the offline player's own settings, not a session: they stay next to it
                var skin = Ui.Button(account.Skin != null ? "Cambiar skin" : "Skin…", () => ((MainWindow)Application.Current.MainWindow).ShowSkinPrompt(LoadAsync));
                skin.Margin = new Thickness(0, 0, 8, 0);
                actions.Children.Add(skin);
                var rename = Ui.Button("Cambiar nombre", () => ((MainWindow)Application.Current.MainWindow).ShowOfflinePrompt(name, LoadAsync));
                rename.Margin = new Thickness(0, 0, 8, 0);
                actions.Children.Add(rename);
            }
            if (selected)
            {
                actions.Children.Add(Fmt.Pill("SELECCIONADA", Ui.Res("AccentInkBrush"), Ui.Res("AccentBrush")));
            }
            else
            {
                var use = Ui.Button("Usar esta cuenta", async () =>
                {
                    await _l.UseAccountAsync(uuid);
                    await LoadAsync();
                });
                System.Windows.Automation.AutomationProperties.SetName(use, Ui.AccessName($"Usar la cuenta {name}"));
                actions.Children.Add(use);
            }
            Grid.SetColumn(actions, 1);
            row.Children.Add(actions);
            body.Children.Add(new Border { Style = (Style)Application.Current.FindResource("Tile"), Child = row, Margin = new Thickness(0, 0, 0, 8) });
        }

        if (!_l.SignedOut && accounts.Count > 0)
        {
            var signOut = Ui.Button("Cerrar sesión", async () => await _l.SignOutAsync(), "DangerButton", 20);
            signOut.Margin = new Thickness(0, 6, 0, 0);
            signOut.HorizontalAlignment = HorizontalAlignment.Left;
            body.Children.Add(signOut);
        }
        Root.Children.Add(card);

        var note = Ui.Section(null, out var noteBody);
        noteBody.Children.Add(Ui.Text("Cerrar sesión no borra nada: te lleva a la pantalla de inicio de sesión, donde puedes entrar con cualquiera de tus cuentas, añadir otra (Microsoft o sin conexión) o eliminar una sesión guardada.", "CaptionText"));
        Root.Children.Add(note);
    }
}
