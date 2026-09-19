# Measures one executable: time to its first window, memory once it settles, idle CPU, and memory when minimized.
#   powershell -File native\tools\measure.ps1 -Exe <path> [-Label name] [-Settle 8] [-Sample 8] [-ArgList a,b] [-Tree]
# -Tree also counts child processes (Electron, Node sidecars). Numbers are for this machine; they are measurements, not estimates.
param(
    [Parameter(Mandatory)] [string] $Exe,
    [string] $Label = ([IO.Path]::GetFileNameWithoutExtension($Exe)),
    [int] $Settle = 8,
    [int] $Sample = 8,
    [string[]] $ArgList = @(),
    [switch] $Tree
)

function Get-Ids([int] $RootPid) {
    if (-not $Tree) { return @($RootPid) }
    $all = Get-CimInstance Win32_Process
    $ids = @($RootPid); $i = 0
    while ($i -lt $ids.Count) { $ids += ($all | Where-Object { $_.ParentProcessId -eq $ids[$i] }).ProcessId; $i++ }
    $ids | Select-Object -Unique
}
function Read-Ids([int[]] $Ids) {
    $ws = 0; $commit = 0; $cpu = 0.0; $n = 0
    foreach ($id in $Ids) {
        $p = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($p) { $ws += $p.WorkingSet64; $commit += $p.PrivateMemorySize64; $cpu += $p.TotalProcessorTime.TotalSeconds; $n++ }
    }
    [pscustomobject]@{ WsMB = $ws / 1MB; CommitMB = $commit / 1MB; Cpu = $cpu; Procs = $n }
}
# "Memory" in Task Manager is the private working set
function Get-PrivateWs([int[]] $Ids) {
    $sum = 0.0
    foreach ($id in $Ids) {
        try {
            $name = (Get-Process -Id $id -ErrorAction Stop).ProcessName
            $c = Get-Counter -Counter ("\Process({0}*)\ID Process" -f $name) -ErrorAction Stop
            $inst = $c.CounterSamples | Where-Object { [int]$_.CookedValue -eq $id } | Select-Object -First 1
            if ($inst) {
                $path = $inst.Path -replace '\\id process$', '\working set - private'
                $sum += (Get-Counter -Counter $path -ErrorAction Stop).CounterSamples[0].CookedValue
            }
        } catch { }
    }
    [math]::Round($sum / 1MB, 1)
}

$sw = [Diagnostics.Stopwatch]::StartNew()
if ($ArgList.Count -gt 0) { $proc = Start-Process -FilePath $Exe -ArgumentList $ArgList -PassThru } else { $proc = Start-Process -FilePath $Exe -PassThru }
if (-not $proc) { "$Label : could not start"; return }
$firstWindow = $null
while ($sw.Elapsed.TotalSeconds -lt 30) {
    $proc.Refresh()
    if ($proc.HasExited) { break }
    if ($proc.MainWindowHandle -ne 0) { $firstWindow = $sw.Elapsed.TotalMilliseconds; break }
    Start-Sleep -Milliseconds 25
}
if ($proc.HasExited) { "$Label : exited early (code $($proc.ExitCode))"; return }

Start-Sleep -Seconds $Settle
$a = Read-Ids (Get-Ids $proc.Id); $t0 = Get-Date
Start-Sleep -Seconds $Sample
$ids = Get-Ids $proc.Id
$b = Read-Ids $ids; $wall = ((Get-Date) - $t0).TotalSeconds
$cpuPct = ($b.Cpu - $a.Cpu) / $wall * 100
$privOpen = Get-PrivateWs $ids
'{0,-26} first window {1,5:N0} ms | working set {2,6:N1} MB | private WS {3,6} MB | commit {4,6:N1} MB | procs {5} | idle CPU {6,4:N1} %' -f $Label, $firstWindow, $b.WsMB, $privOpen, $b.CommitMB, $b.Procs, $cpuPct

# a launcher spends most of its life minimized or in the tray
Add-Type -Namespace Win -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);' -ErrorAction SilentlyContinue
$proc.Refresh(); [void][Win.U]::ShowWindow($proc.MainWindowHandle, 6)
Start-Sleep -Seconds 5
$ids = Get-Ids $proc.Id
$mini = Read-Ids $ids
'{0,-26} minimized: working set {1,6:N1} MB | private WS {2,6} MB' -f '', $mini.WsMB, (Get-PrivateWs $ids)

foreach ($id in (Get-Ids $proc.Id)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
