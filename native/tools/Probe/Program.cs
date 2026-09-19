// probe: launches a program and reports what it costs on this machine. Every number is measured, none is typical.
//   probe <exe> [--arg value]... [--env KEY=VALUE]... [--tree] [--settle 10] [--sample 8] [--label name] [--minimize] [--trim]
//   probe --attach <pid> [--tree] [--sample 8] [--label name]          (measure something that is already running)
// --tree adds the child processes (an Electron app, or a native UI with its engine). --trim empties every working set first.
// Memory is reported three ways: working set, private working set (what Task Manager shows as "Memory") and commit.
using System.Diagnostics;
using System.Runtime.InteropServices;

var options = new Dictionary<string, string>();
var envs = new List<string>();
var programArgs = new List<string>();   // repeated --arg, one program argument each, quoted by .NET (paths here contain spaces)
string? exe = null;
for (var i = 0; i < args.Length; i++)
{
    var a = args[i];
    if (a == "--env") envs.Add(args[++i]);
    else if (a == "--arg") programArgs.Add(args[++i]);
    else if (a is "--tree" or "--minimize" or "--trim") options[a] = "1";
    else if (a.StartsWith("--")) options[a] = args[++i];
    else exe ??= a;
}
var tree = options.ContainsKey("--tree");
var settle = int.Parse(options.GetValueOrDefault("--settle", "10"));
var sample = int.Parse(options.GetValueOrDefault("--sample", "8"));

Process root;
double? firstWindow = null;
var label = options.GetValueOrDefault("--label", exe != null ? Path.GetFileNameWithoutExtension(exe) : "attached");
if (options.TryGetValue("--attach", out var attach))
{
    root = Process.GetProcessById(int.Parse(attach));
}
else
{
    if (exe == null) { Console.Error.WriteLine("usage: probe <exe> [--args ...] [--tree] [--settle N] [--sample N] [--label x] [--minimize]"); return 2; }
    var info = new ProcessStartInfo(exe) { UseShellExecute = false };
    foreach (var pa in programArgs) info.ArgumentList.Add(pa);
    foreach (var e in envs) { var eq = e.IndexOf('='); info.Environment[e[..eq]] = e[(eq + 1)..]; }
    var sw = Stopwatch.StartNew();
    root = Process.Start(info)!;
    while (sw.Elapsed.TotalSeconds < 30 && !root.HasExited)
    {
        root.Refresh();
        if (root.MainWindowHandle != 0) { firstWindow = sw.Elapsed.TotalMilliseconds; break; }
        Thread.Sleep(20);
    }
    if (root.HasExited) { Console.WriteLine($"{label}: exited early (code {root.ExitCode})"); return 1; }
    Thread.Sleep(settle * 1000);
}

Snapshot Take()
{
    var ids = tree ? Tree.Descendants(root.Id) : new List<int> { root.Id };
    double ws = 0, priv = 0, commit = 0, cpu = 0; var alive = 0;
    foreach (var id in ids)
    {
        // Sandboxed Chromium children refuse PROCESS_ALL_ACCESS (what Process.Handle asks for), so ask for the least that works.
        var h = OpenProcess(0x1000 | 0x0010, false, (uint)id); // QUERY_LIMITED_INFORMATION | VM_READ
        if (h == 0) h = OpenProcess(0x1000, false, (uint)id);
        if (h == 0) { Console.Error.WriteLine($"  (could not open pid {id})"); continue; }
        try
        {
            var c = new PMC_EX2 { cb = (uint)Marshal.SizeOf<PMC_EX2>() };
            if (!GetProcessMemoryInfo(h, ref c, c.cb)) { Console.Error.WriteLine($"  (no memory info for pid {id})"); continue; }
            ws += c.WorkingSetSize / 1048576.0; priv += c.PrivateWorkingSetSize / 1048576.0; commit += c.PrivateUsage / 1048576.0;
            if (GetProcessTimes(h, out _, out _, out var kernel, out var user)) cpu += (kernel + user) / 1e7;
            alive++;
        }
        finally { CloseHandle(h); }
    }
    return new Snapshot(ws, priv, commit, cpu, alive, DateTime.UtcNow);
}

if (options.ContainsKey("--trim"))
{
    // Same trick the native launcher applies to itself when idle, applied from outside so Electron can be compared on equal terms.
    foreach (var id in Tree.Descendants(root.Id))
    {
        var h = OpenProcess(0x0100 | 0x1000, false, (uint)id); // SET_QUOTA | QUERY_LIMITED_INFORMATION
        if (h != 0) { EmptyWorkingSet(h); CloseHandle(h); }
    }
    Thread.Sleep(3000);
}

var a0 = Take();
Thread.Sleep(sample * 1000);
var b0 = Take();
var cpuPct = (b0.Cpu - a0.Cpu) / (b0.At - a0.At).TotalSeconds * 100;
Console.WriteLine($"{label,-28} first window {(firstWindow?.ToString("N0") ?? "-"),5} ms | working set {b0.Ws,6:N1} MB | private WS {b0.Priv,6:N1} MB | commit {b0.Commit,6:N1} MB | procs {b0.Procs} | CPU {cpuPct,4:N1} % of one core");

if (options.ContainsKey("--minimize") && root.MainWindowHandle != 0)
{
    ShowWindow(root.MainWindowHandle, 6);
    Thread.Sleep(5000);
    var m = Take();
    Console.WriteLine($"{"",-28} minimized: working set {m.Ws,6:N1} MB | private WS {m.Priv,6:N1} MB");
}

if (!options.ContainsKey("--attach"))
{
    foreach (var id in Tree.Descendants(root.Id).AsEnumerable().Reverse()) { try { Process.GetProcessById(id).Kill(); } catch { } }
}
return 0;

[DllImport("psapi.dll")] static extern bool GetProcessMemoryInfo(nint process, ref PMC_EX2 counters, uint size);
[DllImport("user32.dll")] static extern bool ShowWindow(nint hWnd, int cmd);
[DllImport("psapi.dll")] static extern bool EmptyWorkingSet(nint h);
[DllImport("kernel32.dll")] static extern nint OpenProcess(uint access, bool inherit, uint pid);
[DllImport("kernel32.dll")] static extern bool CloseHandle(nint h);
[DllImport("kernel32.dll")] static extern bool GetProcessTimes(nint h, out long creation, out long exit, out long kernel, out long user);

record Snapshot(double Ws, double Priv, double Commit, double Cpu, int Procs, DateTime At);

[StructLayout(LayoutKind.Sequential)]
struct PMC_EX2
{
    public uint cb, PageFaultCount;
    public nuint PeakWorkingSetSize, WorkingSetSize, QuotaPeakPagedPoolUsage, QuotaPagedPoolUsage, QuotaPeakNonPagedPoolUsage, QuotaNonPagedPoolUsage;
    public nuint PagefileUsage, PeakPagefileUsage, PrivateUsage, PrivateWorkingSetSize;
    public ulong SharedCommitUsage;
}

static class Tree
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32
    {
        public uint dwSize, cntUsage, th32ProcessID; public nuint th32DefaultHeapID; public uint th32ModuleID, cntThreads, th32ParentProcessID; public int pcPriClassBase; public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern nint CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32First(nint snap, ref PROCESSENTRY32 e);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32Next(nint snap, ref PROCESSENTRY32 e);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(nint h);

    public static List<int> Descendants(int rootPid)
    {
        var parents = new Dictionary<int, int>();
        var snap = CreateToolhelp32Snapshot(2, 0);
        var e = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf<PROCESSENTRY32>() };
        if (Process32First(snap, ref e)) do parents[(int)e.th32ProcessID] = (int)e.th32ParentProcessID; while (Process32Next(snap, ref e));
        CloseHandle(snap);
        var result = new List<int> { rootPid };
        for (var i = 0; i < result.Count; i++)
            foreach (var (pid, parent) in parents) if (parent == result[i] && !result.Contains(pid)) result.Add(pid);
        return result;
    }
}
