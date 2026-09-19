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
            var row = new Grid { Margin = new Thickness(0, 6, 0, 6) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            text.Children.Add(Ui.Text(account.DisplayName, "BodyText", null, 15));
            text.Children.Add(Ui.Text((account.Type == "microsoft" ? "MICROSOFT" : "MOJANG") + (account.Username != null && account.Username != account.DisplayName ? "  " + account.Username : ""), "CaptionText"));
            row.Children.Add(text);

            FrameworkElement action;
            if (selected)
            {
                var pill = Fmt.Pill("SELECCIONADA", Ui.Res("AccentInkBrush"), Ui.Res("AccentBrush"));
                pill.Margin = new Thickness(0);
                action = pill;
            }
            else
            {
                var uuid = account.Uuid;
                action = Ui.Button("Usar esta cuenta", async () =>
                {
                    await _l.Client.CallAsync("account.select", new { uuid });
                    await LoadAsync();
                });
            }
            Grid.SetColumn(action, 1);
            row.Children.Add(action);
            body.Children.Add(new Border { Style = (Style)Application.Current.FindResource("Tile"), Child = row, Margin = new Thickness(0, 0, 0, 8) });
        }
        Root.Children.Add(card);

        var soon = Ui.Section("Añadir o quitar cuentas", out var soonBody);
        soonBody.Children.Add(Ui.Text("Iniciar sesión con Microsoft y cerrar sesión se activan con el nuevo flujo de inicio de sesión, que abre la ventana de Microsoft solo mientras se usa.", "CaptionText"));
        Root.Children.Add(soon);
    }
}
