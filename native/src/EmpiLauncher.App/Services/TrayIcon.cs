using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace EmpiLauncher.App.Services;

/// <summary>
/// A notification-area icon with a native popup menu, straight on Shell_NotifyIcon. No WinForms, no extra assembly:
/// while Minecraft runs the launcher sits here, using as little as the window it replaced.
/// </summary>
internal sealed class TrayIcon : IDisposable
{
    private const int WM_TRAY = 0x8001, WM_LBUTTONUP = 0x0202, WM_RBUTTONUP = 0x0205;
    private const uint NIM_ADD = 0, NIM_MODIFY = 1, NIM_DELETE = 2, NIF_MESSAGE = 1, NIF_ICON = 2, NIF_TIP = 4;
    private const uint MF_STRING = 0, MF_GRAYED = 1, MF_SEPARATOR = 0x800, TPM_RETURNCMD = 0x100, TPM_RIGHTBUTTON = 2;
    private const int IdOpen = 1, IdStop = 2, IdExit = 3;

    private readonly HwndSource _source;
    private nint _icon;
    private bool _added;
    private bool _canStop, _canExit = true;

    public event Action? OpenRequested, StopRequested, ExitRequested;

    public TrayIcon()
    {
        _source = new HwndSource(new HwndSourceParameters("EmpiTray") { ParentWindow = new IntPtr(-3) /* HWND_MESSAGE */, Width = 0, Height = 0 });
        _source.AddHook(WndProc);
        var large = new nint[1];
        var small = new nint[1];
        ExtractIconEx(Environment.ProcessPath!, 0, large, small, 1);
        _icon = small[0] != 0 ? small[0] : large[0];
    }

    public void Show(string tooltip, bool canStop, bool canExit)
    {
        _canStop = canStop; _canExit = canExit;
        var data = NewData(tooltip);
        Shell_NotifyIcon(_added ? NIM_MODIFY : NIM_ADD, ref data);
        _added = true;
    }

    public void Hide()
    {
        if (!_added) return;
        var data = NewData("");
        Shell_NotifyIcon(NIM_DELETE, ref data);
        _added = false;
    }

    private NOTIFYICONDATA NewData(string tooltip) => new()
    {
        cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATA>(), hWnd = _source.Handle, uID = 1,
        uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP, uCallbackMessage = WM_TRAY, hIcon = _icon,
        szTip = tooltip.Length > 120 ? tooltip[..120] : tooltip
    };

    private nint WndProc(nint hwnd, int msg, nint wParam, nint lParam, ref bool handled)
    {
        if (msg != WM_TRAY) return 0;
        var mouse = (int)(lParam & 0xFFFF);
        if (mouse == WM_LBUTTONUP) OpenRequested?.Invoke();
        else if (mouse == WM_RBUTTONUP) ShowMenu();
        handled = true;
        return 0;
    }

    private void ShowMenu()
    {
        var menu = CreatePopupMenu();
        AppendMenu(menu, MF_STRING, IdOpen, "Abrir Empi Launcher");
        AppendMenu(menu, MF_STRING | (_canStop ? 0u : MF_GRAYED), IdStop, "Detener Minecraft");
        AppendMenu(menu, MF_SEPARATOR, 0, null);
        AppendMenu(menu, MF_STRING | (_canExit ? 0u : MF_GRAYED), IdExit, "Salir");
        GetCursorPos(out var point);
        SetForegroundWindow(_source.Handle);   // without this the menu does not close when the player clicks elsewhere
        var choice = TrackPopupMenuEx(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, point.X, point.Y, _source.Handle, 0);
        DestroyMenu(menu);
        switch (choice)
        {
            case IdOpen: OpenRequested?.Invoke(); break;
            case IdStop: StopRequested?.Invoke(); break;
            case IdExit: ExitRequested?.Invoke(); break;
        }
    }

    public void Dispose()
    {
        Hide();
        _source.Dispose();
        if (_icon != 0) { DestroyIcon(_icon); _icon = 0; }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATA
    {
        public uint cbSize; public nint hWnd; public uint uID, uFlags, uCallbackMessage; public nint hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
        public uint dwState, dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
        public uint uVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public nint hBalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern bool Shell_NotifyIcon(uint message, ref NOTIFYICONDATA data);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern uint ExtractIconEx(string file, int index, nint[] large, nint[] small, uint count);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(nint icon);
    [DllImport("user32.dll")] private static extern nint CreatePopupMenu();
    [DllImport("user32.dll")] private static extern bool DestroyMenu(nint menu);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(nint menu, uint flags, nuint id, string? text);
    [DllImport("user32.dll")] private static extern int TrackPopupMenuEx(nint menu, uint flags, int x, int y, nint hwnd, nint parameters);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint hwnd);
}
