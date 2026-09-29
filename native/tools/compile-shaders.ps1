# Compiles the pixel shaders of the styles (native/src/EmpiLauncher.App/Styles/Shaders/*.hlsl) into the bytecode WPF loads (*.ps, ps_3_0).
#   powershell -File native/tools/compile-shaders.ps1
# Uses d3dcompiler_47.dll, which Windows itself carries (System32), so no SDK is needed. The .ps files are committed: building the launcher
# never needs this, only changing a shader does.
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Hlsl {
    [ComImport, Guid("8BA5FB08-5195-40e2-AC58-0D989C3A0102"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IBlob { [PreserveSig] IntPtr GetBufferPointer(); [PreserveSig] IntPtr GetBufferSize(); }
    [DllImport("d3dcompiler_47.dll", CharSet = CharSet.Ansi)]
    static extern int D3DCompile(byte[] src, IntPtr size, string name, IntPtr defines, IntPtr include, string entry, string target, uint flags1, uint flags2, out IBlob code, out IBlob errors);
    public static byte[] Compile(string source, string name, out string errors) {
        var bytes = System.Text.Encoding.UTF8.GetBytes(source);
        IBlob code, err;
        var hr = D3DCompile(bytes, (IntPtr)bytes.Length, name, IntPtr.Zero, IntPtr.Zero, "main", "ps_3_0", 1u << 15, 0, out code, out err);
        errors = err == null ? "" : Marshal.PtrToStringAnsi(err.GetBufferPointer(), (int)err.GetBufferSize());
        if (hr < 0 || code == null) return null;
        var result = new byte[(int)code.GetBufferSize()];
        Marshal.Copy(code.GetBufferPointer(), result, 0, result.Length);
        return result;
    }
}
'@
$dir = Join-Path $PSScriptRoot '..\src\EmpiLauncher.App\Styles\Shaders'
$failed = $false
foreach ($file in Get-ChildItem $dir -Filter *.hlsl) {
    $errors = ''
    $code = [Hlsl]::Compile([IO.File]::ReadAllText($file.FullName), $file.Name, [ref]$errors)
    if ($null -eq $code) { Write-Host "$($file.Name): FAILED`n$errors"; $failed = $true; continue }
    [IO.File]::WriteAllBytes([IO.Path]::ChangeExtension($file.FullName, '.ps'), $code)
    Write-Host "$($file.Name): $($code.Length) bytes$(if ($errors) { "`n$errors" })"
}
if ($failed) { exit 1 }
