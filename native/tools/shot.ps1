# Drives the native launcher through UI Automation and saves window screenshots. A development build draws them itself (EMPI_TEST_SNAP, see
# MainWindow.WatchTestRequests), which works with the window covered or the screen off; otherwise PrintWindow is used.
#   shot.ps1 -Exe <EmpiLauncher.App.exe> -OutDir <folder> -Steps "wait:6;shot:home;click:Ajustes;wait:1;shot:settings;click:Java;wait:2;shot:java"
# Steps: wait:<seconds> | shot:<name> | click:<automation name> | size:<w>x<h> | key:<text to type> | front (keeps the window above everything else) | popups:<name>
param(
    [Parameter(Mandatory)] [string] $Exe,
    [Parameter(Mandatory)] [string] $OutDir,
    [Parameter(Mandatory)] [string] $Steps,
    [int] $LiveSeconds = 0,
    # Optional: after the steps, wait $ProbeSettle seconds and measure the app's process tree with native/tools/Probe.
    [string] $Probe = '',
    [string] $ProbeLabel = 'native',
    [int] $ProbeSettle = 7
)

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Win {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr l);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hgt, bool repaint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    [StructLayout(LayoutKind.Sequential)] public struct PT { public int X, Y; }
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(PT p);
}
'@

New-Item -ItemType Directory -Force $OutDir | Out-Null
$env:EMPI_TEST_SNAP = (Resolve-Path $OutDir).Path
$proc = Start-Process -FilePath $Exe -PassThru
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) { $proc.Refresh(); if ($proc.MainWindowHandle -ne 0) { break }; Start-Sleep -Milliseconds 100 }
if ($proc.MainWindowHandle -eq 0) { Write-Error 'no window'; exit 1 }
$hwnd = $proc.MainWindowHandle
$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)

# Asks the app for something through EMPI_TEST_SNAP: a picture (no command) or a background click ("burst x y"). False if the app never answered.
function Ask-App([string] $name, [string] $command) {
    $req = Join-Path $env:EMPI_TEST_SNAP "$name.req"; $png = Join-Path $env:EMPI_TEST_SNAP "$name.png"
    $picture = -not $command -or $command.StartsWith('snap')
    if ($picture -and (Test-Path $png)) { [IO.File]::Delete($png) }
    Set-Content -Path $req -Value $command -Encoding ascii
    $deadline = (Get-Date).AddSeconds(6)
    while ((Get-Date) -lt $deadline) { if (-not $picture) { if (-not (Test-Path $req)) { return $true } } elseif (Test-Path $png) { return $true }; Start-Sleep -Milliseconds 50 }
    if (Test-Path $req) { [IO.File]::Delete($req) }
    return $false
}

function Save-Shot([string] $name) {
    if (Ask-App $name '') { Write-Host "shot $(Join-Path $OutDir "$name.png") (drawn by the app)"; return }
    $r = New-Object Win+RECT
    [void][Win]::GetWindowRect($hwnd, [ref]$r)
    $w = $r.R - $r.L; $h = $r.B - $r.T
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $dc = $g.GetHdc()
    [void][Win]::PrintWindow($hwnd, $dc, 2)
    $g.ReleaseHdc($dc); $g.Dispose()
    $path = Join-Path $OutDir "$name.png"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    Write-Host "shot $path ($w x $h)"
}

function Click-Named([string] $name) {
    $cond = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $name
    # A button's label is also a text element with the same name: the button is what a click means, so it is looked for first.
    $isButton = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty), ([System.Windows.Automation.ControlType]::Button)
    $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.AndCondition $cond, $isButton))
    if ($null -eq $el) { $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond) }
    if ($null -eq $el) {
        # a popup is a window of its own: look for it among everything this program has on screen
        $mine = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ProcessIdProperty), $proc.Id
        $el = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.AndCondition $cond, $mine))
    }
    if ($null -eq $el) { Write-Host "click: '$name' not found"; return }
    $pattern = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke(); return }
    if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) { $pattern.Select(); return }
    if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) { $pattern.Toggle(); return }
    Write-Host "click: '$name' has no usable pattern"
}

foreach ($step in $Steps.Split(';')) {
    $kind, $arg = $step.Split(':', 2)
    switch ($kind) {
        'wait'  { Start-Sleep -Milliseconds ([int]([double]$arg * 1000)) }
        'shot'  { Save-Shot $arg }
        # layer:<name>=<options>  a picture drawn by the app with pieces left out: "hide:PlayHost,AccessLayer", "bg:none", "only:Field"
        'layer' { $ln, $lo = $arg.Split('=', 2); if (Ask-App $ln "snap $lo") { Write-Host "layer $(Join-Path $OutDir "$ln.png")" } else { Write-Host "layer: the app did not answer" } }
        'click' { Click-Named $arg }
        # range:<automation name>=<value>  sets a slider through UI Automation (raises ValueChanged like dragging does)
        'range' {
            $name, $val = $arg.Split('=', 2)
            $cond = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $name
            $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
            $pattern = $null
            if ($null -ne $el -and $el.TryGetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern, [ref]$pattern)) { $pattern.SetValue([double]$val) } else { Write-Host "range: '$name' not found or not a slider" }
        }
        # wheel:<x>,<y>,<ticks>  turns the mouse wheel at x,y inside the window (negative ticks scroll down, 120 units per tick)
        'wheel' {
            $p = $arg.Split(','); $r = New-Object Win+RECT; [void][Win]::GetWindowRect($hwnd, [ref]$r)
            [void][Win]::SetCursorPos($r.L + [int]$p[0], $r.T + [int]$p[1]); Start-Sleep -Milliseconds 80
            for ($i = 0; $i -lt [math]::Abs([int]$p[2]); $i++) { [Win]::mouse_event(0x0800, 0, 0, [BitConverter]::ToUInt32([BitConverter]::GetBytes([int](120 * [math]::Sign([int]$p[2]))), 0), [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
        }
        # burst:<name>:<count>:<ms>  <count> shots <ms> apart (name-0, name-1, ...), to catch an animation part-way; each shot itself takes ~40-80 ms
        'burst' {
            $bn, $bc, $bm = $arg.Split(':')
            for ($i = 0; $i -lt [int]$bc; $i++) { Save-Shot "$bn-$i"; if ($i -lt [int]$bc - 1) { Start-Sleep -Milliseconds ([int]$bm) } }
        }
        # screen:<name>  what is on the screen where the window is (PrintWindow cannot see popups, which are windows of their own)
        'screen' {
            $r = New-Object Win+RECT; [void][Win]::GetWindowRect($hwnd, [ref]$r)
            $w = $r.R - $r.L; $h = $r.B - $r.T
            $bmp = New-Object System.Drawing.Bitmap $w, $h
            $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size); $g.Dispose()
            $path = Join-Path $OutDir "$arg.png"; $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
            Write-Host "screen $path ($w x $h)"
        }
        # type:<automation name>=<text>  sets the text of a text box through UI Automation (raises TextChanged like typing does)
        'type'  {
            $name, $text = $arg.Split('=', 2)
            $cond = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $name
            $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
            $pattern = $null
            if ($null -ne $el -and $el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { $pattern.SetValue($text) } else { Write-Host "type: '$name' not found or not a text box" }
        }
        # popups:<name>  the app's other windows (a popup is a window of its own that PrintWindow of the main one cannot see), one picture each: name-0, name-1...
        'popups' {
            $found = New-Object System.Collections.ArrayList
            $callback = [Win+EnumProc] { param($h, $l) $owner = [uint32]0; [void][Win]::GetWindowThreadProcessId($h, [ref]$owner); if ($owner -eq [uint32]$proc.Id -and $h -ne $hwnd -and [Win]::IsWindowVisible($h)) { [void]$found.Add($h) }; return $true }
            [void][Win]::EnumWindows($callback, [IntPtr]::Zero)
            $index = 0
            foreach ($h in $found) {
                $r = New-Object Win+RECT; [void][Win]::GetWindowRect($h, [ref]$r)
                $w = $r.R - $r.L; $hh = $r.B - $r.T
                if ($w -lt 20 -or $hh -lt 20) { continue }
                $bmp = New-Object System.Drawing.Bitmap $w, $hh
                $g = [System.Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc(); [void][Win]::PrintWindow($h, $dc, 2); $g.ReleaseHdc($dc); $g.Dispose()
                $path = Join-Path $OutDir "$arg-$index.png"; $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
                Write-Host "popup $path ($w x $hh)"; $index++
            }
            if ($index -eq 0) { Write-Host 'popups: none open' }
        }
        'front' { [void][Win]::SetWindowPos($hwnd, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0003) }   # HWND_TOPMOST, SWP_NOSIZE | SWP_NOMOVE
        'size'  { $wh = $arg.Split('x'); [void][Win]::MoveWindow($hwnd, 40, 40, [int]$wh[0], [int]$wh[1], $true) }
        # hit:x,y  a click on the background at x,y, handed to the app (no real mouse: works with the window covered)
        'hit'   { $xy = $arg.Split(','); if (-not (Ask-App "hit-$([guid]::NewGuid().ToString('N'))" "burst $($xy[0]) $($xy[1])")) { Write-Host 'hit: the app did not answer' } }
        # tap:x,y  a real left click at x,y inside the window (unlike click:, which goes through UI Automation and raises no mouse events).
        # Only if the launcher is what is there: with another window on top the click would land in that window.
        'tap'   {
            $xy = $arg.Split(','); $r = New-Object Win+RECT; [void][Win]::GetWindowRect($hwnd, [ref]$r)
            $pt = New-Object Win+PT; $pt.X = $r.L + [int]$xy[0]; $pt.Y = $r.T + [int]$xy[1]; $owner = [uint32]0
            [void][Win]::GetWindowThreadProcessId([Win]::WindowFromPoint($pt), [ref]$owner)
            if ($owner -ne [uint32]$proc.Id) { Write-Host 'tap: skipped, another window covers the launcher there'; break }
            [void][Win]::SetCursorPos($r.L + [int]$xy[0], $r.T + [int]$xy[1]); Start-Sleep -Milliseconds 60
            [Win]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 40; [Win]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
        }
        # move:x,y  puts the real mouse pointer at x,y inside the window (in small steps, so the app sees it moving)
        'move'  {
            $xy = $arg.Split(','); $r = New-Object Win+RECT; [void][Win]::GetWindowRect($hwnd, [ref]$r)
            $tx = $r.L + [int]$xy[0]; $ty = $r.T + [int]$xy[1]
            for ($i = 1; $i -le 8; $i++) { [void][Win]::SetCursorPos($tx - 24 + 6 * $i, $ty - 12 + 3 * $i); Start-Sleep -Milliseconds 40 }
        }
    }
}

if ($Probe -ne '') {
    Start-Sleep -Seconds $ProbeSettle
    & $Probe --attach $proc.Id --tree --sample 8 --label $ProbeLabel
}
if ($LiveSeconds -gt 0) { Start-Sleep -Seconds $LiveSeconds }
Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $proc.Id } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
