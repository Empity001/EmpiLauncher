using System.Windows;
using System.Windows.Controls;
using EmpiLauncher.App.Services;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.App.Views.Tabs;

internal sealed class AccountTab : SettingsTab
{
    private readonly Launcher _l = Launcher.Instance;
    public override string Id => "account";
    public override string Title => "Cuenta";

    private static string KindLabel(AccountSummary account) => account.Type switch
    {
        "microsoft" => "MICROSOFT",
        "offline" => "SIN CONEXIÓN" + (account.OfflineId != null ? "  ID " + account.OfflineId : ""),
        _ => "MOJANG"
    };

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
            var offline = account.Type == "offline";
            var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var text = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            text.Children.Add(Ui.Text(account.DisplayName, "BodyText", null, 15));
            text.Children.Add(Ui.Text(KindLabel(account) + (!offline && account.Username != null && account.Username != account.DisplayName ? "  " + account.Username : ""), "CaptionText"));
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
            if (offline)
            {
                var skin = Ui.Button(account.Skin != null ? "Cambiar skin" : "Skin…", () => ((MainWindow)Application.Current.MainWindow).ShowSkinPrompt(LoadAsync));
                skin.Margin = new Thickness(0, 0, 8, 0);
                actions.Children.Add(skin);
                var rename = Ui.Button("Cambiar nombre", () => ((MainWindow)Application.Current.MainWindow).ShowOfflinePrompt(name, LoadAsync));
                rename.Margin = new Thickness(0, 0, 8, 0);
                actions.Children.Add(rename);
                actions.Children.Add(Ui.Button("Quitar", () => ConfirmRemove(uuid, name, true), "DangerButton", 14));
            }
            else actions.Children.Add(Ui.Button("Cerrar sesión", () => ConfirmRemove(uuid, name, false), "DangerButton", 14));
            Grid.SetColumn(actions, 1);
            row.Children.Add(actions);
            body.Children.Add(new Border { Style = (Style)Application.Current.FindResource("Tile"), Child = row, Margin = new Thickness(0, 0, 0, 8) });
        }

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 6, 0, 0) };
        var add = Ui.Button("Añadir cuenta Microsoft", async () => { if (await _l.LoginAsync()) await LoadAsync(); }, "PrimaryButton", 20);
        buttons.Children.Add(add);
        if (!accounts.Any(a => a.Type == "offline"))
        {
            var play = Ui.Button("Jugar sin conexión", () => ((MainWindow)Application.Current.MainWindow).ShowOfflinePrompt(done: LoadAsync), "GhostButton", 20);
            play.Margin = new Thickness(10, 0, 0, 0);
            buttons.Children.Add(play);
        }
        body.Children.Add(buttons);
        Root.Children.Add(card);

        var note = Ui.Section(null, out var noteBody);
        noteBody.Children.Add(Ui.Text("Al iniciar o cerrar sesión se abre la ventana de Microsoft y se cierra sola al terminar. No queda ningún navegador abierto en segundo plano.", "CaptionText"));
        var offlineNote = Ui.Text("Jugar sin conexión no usa ninguna cuenta: solo el nombre que elijas, con un identificador que siempre es el mismo para ese nombre. Sirve para un jugador y para servidores que no verifican la cuenta. La skin, si quieres una, se elige de NameMC con el botón Skin.", "CaptionText");
        offlineNote.Margin = new Thickness(0, 10, 0, 0);
        noteBody.Children.Add(offlineNote);
        Root.Children.Add(note);
    }

    private void ConfirmRemove(string uuid, string name, bool offline)
    {
        var window = (MainWindow)Application.Current.MainWindow;
        window.ShowDialog(
            offline ? "¿Quitar el jugador sin conexión?" : "¿Cerrar sesión?",
            offline
                ? $"Se quitará {name} de este launcher. Si lo vuelves a crear con el mismo nombre tendrá el mismo identificador y conservarás tus datos de un jugador."
                : $"Se quitará la cuenta {name} de este launcher. Podrás volver a añadirla cuando quieras.",
            ("Cancelar", null, false),
            (offline ? "Quitar" : "Cerrar sesión", async () => { if (await _l.RemoveAccountAsync(uuid)) await LoadAsync(); }, true));
    }
}
