using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Tabs;

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
        var card = Ui.Section("Cuentas de Minecraft", out var body, "La cuenta seleccionada es la que se usa al jugar.");
        if (accounts.Count == 0)
            body.Children.Add(Ui.Text("Todavía no hay ninguna cuenta guardada.", "BodyText", Ui.Res("Paper2Brush")));

        foreach (var account in accounts)
        {
            var selected = account.Uuid == _l.Config!.Accounts.Selected;
            var uuid = account.Uuid;
            var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            text.Children.Add(Ui.Text(account.DisplayName, "BodyText", null, 15));
            text.Children.Add(Ui.Text((account.Type == "microsoft" ? "MICROSOFT" : "MOJANG") + (account.Username != null && account.Username != account.DisplayName ? "  " + account.Username : ""), "CaptionText"));
            row.Children.Add(text);

            var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            if (selected)
            {
                var pill = Fmt.Pill("SELECCIONADA", Ui.Res("AccentInkBrush"), Ui.Res("AccentBrush"));
                pill.Margin = new Thickness(0, 0, 10, 0);
                actions.Children.Add(pill);
            }
            else
            {
                var use = Ui.Button("Usar esta cuenta", async () =>
                {
                    await _l.Client.CallAsync("account.select", new { uuid });
                    await LoadAsync();
                });
                use.Margin = new Thickness(0, 0, 8, 0);
                actions.Children.Add(use);
            }
            var name = account.DisplayName;
            actions.Children.Add(Ui.Button("Cerrar sesión", () => ConfirmRemove(uuid, name), "DangerButton", 14));
            Grid.SetColumn(actions, 1);
            row.Children.Add(actions);
            body.Children.Add(new Border { Style = (Style)Application.Current.FindResource("Tile"), Child = row, Margin = new Thickness(0, 0, 0, 8) });
        }

        var add = Ui.Button("Añadir cuenta Microsoft", async () => { if (await _l.LoginAsync()) await LoadAsync(); }, "PrimaryButton", 20);
        add.HorizontalAlignment = HorizontalAlignment.Left;
        add.Margin = new Thickness(0, 6, 0, 0);
        body.Children.Add(add);
        Root.Children.Add(card);

        var note = Ui.Section(null, out var noteBody);
        noteBody.Children.Add(Ui.Text("Al iniciar o cerrar sesión se abre la ventana de Microsoft y se cierra sola al terminar. No queda ningún navegador abierto en segundo plano.", "CaptionText"));
        Root.Children.Add(note);
    }

    private void ConfirmRemove(string uuid, string name)
    {
        var window = (MainWindow)Application.Current.MainWindow;
        window.ShowDialog(
            "¿Cerrar sesión?",
            $"Se quitará la cuenta {name} de este launcher. Podrás volver a añadirla cuando quieras.",
            ("Cancelar", null, false),
            ("Cerrar sesión", async () => { if (await _l.RemoveAccountAsync(uuid)) await LoadAsync(); }, true));
    }
}
