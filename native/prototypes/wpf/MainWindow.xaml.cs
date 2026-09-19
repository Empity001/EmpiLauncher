using System.Runtime.InteropServices;
namespace WpfProbe;
public partial class MainWindow : System.Windows.Window
{
    [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(nint process);
    public MainWindow()
    {
        InitializeComponent();
        // after the first frames are on screen, give back what start-up touched (a tray-resident app does this whenever it goes idle)
        if (Environment.GetEnvironmentVariable("PROBE_TRIM") == "1")
        {
            var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            timer.Tick += (_, _) => { timer.Stop(); GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect(); EmptyWorkingSet(System.Diagnostics.Process.GetCurrentProcess().Handle); };
            timer.Start();
        }
    }
}
