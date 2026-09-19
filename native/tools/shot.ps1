# Drives the native launcher through UI Automation and saves window screenshots (PrintWindow: works even if another window is on top).
#   shot.ps1 -Exe <EmpiLauncher.App.exe> -OutDir <folder> -Steps "wait:6;shot:home;click:Ajustes;wait:1;shot:settings;click:Java;wait:2;shot:java"
# Steps: wait:<seconds> | shot:<name> | click:<automation name> | size:<w>x<h> | key:<text to type>
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
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hgt, bool repaint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@

New-Item -ItemType Directory -Force $OutDir | Out-Null
$proc = Start-Process -FilePath $Exe -PassThru
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) { $proc.Refresh(); if ($proc.MainWindowHandle -ne 0) { break }; Start-Sleep -Milliseconds 100 }
if ($proc.MainWindowHandle -eq 0) { Write-Error 'no window'; exit 1 }
$hwnd = $proc.MainWindowHandle
$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)

function Save-Shot([string] $name) {
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
    $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
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
        'click' { Click-Named $arg }
        # type:<automation name>=<text>  sets the text of a text box through UI Automation (raises TextChanged like typing does)
        'type'  {
            $name, $text = $arg.Split('=', 2)
            $cond = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $name
            $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
            $pattern = $null
            if ($null -ne $el -and $el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { $pattern.SetValue($text) } else { Write-Host "type: '$name' not found or not a text box" }
        }
        'size'  { $wh = $arg.Split('x'); [void][Win]::MoveWindow($hwnd, 40, 40, [int]$wh[0], [int]$wh[1], $true) }
        # tap:x,y  a real left click at x,y inside the window (unlike click:, which goes through UI Automation and raises no mouse events)
        'tap'   {
            $xy = $arg.Split(','); $r = New-Object Win+RECT; [void][Win]::GetWindowRect($hwnd, [ref]$r)
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
