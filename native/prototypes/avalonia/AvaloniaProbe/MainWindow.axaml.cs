using System;
using System.Runtime.InteropServices;
using Avalonia.Controls;
using Avalonia.Threading;

namespace AvaloniaProbe;

public partial class MainWindow : Window
{
    [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(nint process);

    public MainWindow()
    {
        InitializeComponent();
        if (Environment.GetEnvironmentVariable("PROBE_TRIM") == "1")
        {
            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            timer.Tick += (_, _) => { timer.Stop(); GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect(); EmptyWorkingSet(System.Diagnostics.Process.GetCurrentProcess().Handle); };
            timer.Start();
        }
    }
}
