; Installer of the native Empi Launcher. Built by native/build/build.mjs, which passes:
;   /DVERSION  /DSTAGE (folder with everything to install)  /DOUTFILE  /DAPP_GUID  /DICON  /DESTIMATED_KB
;
; It is written to be started by the classic (Electron) launcher's auto-update as well as by a person:
;   electron-updater runs   <installer> --updated /S --force-run /D=<folder of the classic install>
; and what that has to achieve is: the classic launcher disappears, the native one takes its place (same folder, same
; "Empi Launcher.exe" name, same shortcuts, same entry in Apps) and starts. Accounts, settings and game files live in the
; user's data folders, not here, so removing the old program never touches them.
;
; The same protocol is what this installer's own uninstaller answers, so native -> native updates use the same path.
Unicode true
SetCompressor /SOLID /FINAL lzma
SetCompressorDictSize 32

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!insertmacro GetParameters
!insertmacro GetOptions
!insertmacro GetParent

!ifndef APP_GUID
  !define APP_GUID "92d6aedd-bdac-570e-bceb-809ff607ae5b"
!endif
!define APP_NAME "Empi Launcher"
!ifndef SHORTCUT_NAME
  !define SHORTCUT_NAME "${APP_NAME}"   ; tests build with another name so they never touch a real shortcut
!endif
!define APP_EXE "Empi Launcher.exe"
!define UNINSTALL_EXE "Uninstall Empi Launcher.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
!define INSTALL_KEY "Software\${APP_GUID}"
!ifndef FALLBACK_DIR
  !define FALLBACK_DIR "$LOCALAPPDATA\Programs\${APP_NAME}"   ; where a folder this person cannot write to is swapped for (tests point it elsewhere)
!endif

Name "${APP_NAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "${INSTALL_KEY}" "InstallLocation"
RequestExecutionLevel user
ManifestDPIAware true
BrandingText "Empi Launcher ${VERSION}"
ShowInstDetails nevershow
ShowUninstDetails nevershow

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "Instalador de ${APP_NAME}"
VIAddVersionKey "CompanyName" "Empity"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Empity"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Iniciar ${APP_NAME}"

!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Var IsUpdated
Var ForceRun
Var HadDesktop
Var HadStart
Var OldUninstaller
Var OldDir
Var OldMachine
Var FellBack

; Stops whatever runs from a folder (the launcher, its engine, the sign-in window) so its files can be replaced. It goes by the
; program's path, never by name: an unrelated Electron app (another launcher, an editor) must not be touched. The uninstaller
; itself is spared because it can be running from that very folder.
!macro CloseAppsIn DIR
  FileOpen $9 "$TEMP\empi-close.ps1" w
  FileWrite $9 "param([string]$$dir)$\r$\n"
  FileWrite $9 "$$prefix = $$dir.TrimEnd('\') + '\'$\r$\n"
  FileWrite $9 "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$prefix, [StringComparison]::OrdinalIgnoreCase) -and $$_.Name -notlike 'Uninstall*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }$\r$\n"
  FileClose $9
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\empi-close.ps1" -dir "${DIR}"'
  Pop $9
  Delete "$TEMP\empi-close.ps1"
!macroend

; $INSTDIR must end in "\Empi Launcher": the uninstaller deletes the whole folder, so a folder someone else owns
; (Documents, Desktop) can never end up being it. Choosing "C:\Games" installs into "C:\Games\Empi Launcher".
!macro EnsureAppFolder
  StrCpy $R8 $INSTDIR "" -14
  ${If} $R8 != "\${APP_NAME}"
    StrCpy $INSTDIR "$INSTDIR\${APP_NAME}"
  ${EndIf}
!macroend

; This installer runs as the person, never as administrator, so it cannot write to Program Files: the place where a classic launcher
; installed "for all users" lives, and where the updater points this installer to. Instead of failing on every single file (and
; leaving nothing installed once the old program has been removed) such a folder is swapped for the per-user one.
Function EnsureWritableFolder
  Push $0
  StrCpy $FellBack 0
  ClearErrors
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\.empi-write-test" w
  ${If} ${Errors}
    StrCpy $INSTDIR "${FALLBACK_DIR}"
    StrCpy $FellBack 1
  ${Else}
    FileClose $0
    Delete "$INSTDIR\.empi-write-test"
  ${EndIf}
  Pop $0
FunctionEnd

Function .onInit
  ; a second copy of the installer must not fight the first over the same files
  System::Call 'kernel32::CreateMutex(i 0, i 0, t "EmpiLauncherSetup-${APP_GUID}") i .r1 ?e'
  Pop $R0
  ${If} $R0 = 183
    MessageBox MB_OK|MB_ICONEXCLAMATION "El instalador de ${APP_NAME} ya se está ejecutando." /SD IDOK
    Abort
  ${EndIf}

  StrCpy $IsUpdated 0
  StrCpy $ForceRun 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    StrCpy $IsUpdated 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "--force-run" $R1
  ${IfNot} ${Errors}
    StrCpy $ForceRun 1
  ${EndIf}
  ClearErrors
  !insertmacro EnsureAppFolder
  Call EnsureWritableFolder
FunctionEnd

Function DirectoryLeave
  !insertmacro EnsureAppFolder
  Call EnsureWritableFolder
  ${If} $FellBack = 1
    ; stay on the page so the person sees the folder that will really be used
    MessageBox MB_OK|MB_ICONINFORMATION "Esa carpeta necesita permisos de administrador. ${APP_NAME} se instala solo para tu usuario, en:$\r$\n$\r$\n$INSTDIR" /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

; Sets $OldUninstaller, $OldDir and $OldMachine from what the classic launcher (or a previous native one) registered.
Function FindPrevious
  StrCpy $OldUninstaller ""
  StrCpy $OldDir ""
  StrCpy $OldMachine 0
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "UninstallString"
  ReadRegStr $OldDir HKCU "${INSTALL_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "${UNINSTALL_KEY}" "UninstallString"
    ReadRegStr $OldDir HKLM "${INSTALL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $OldMachine 1
    ${EndIf}
  ${EndIf}
  ${If} $0 == ""
    Return
  ${EndIf}

  ; The command is  "C:\...\Uninstall Empi Launcher.exe" /currentuser  : the program is the first quoted piece.
  StrCpy $1 $0 1
  ${If} $1 == '"'
    StrCpy $0 $0 "" 1
    StrCpy $2 0
    ${Do}
      StrCpy $3 $0 1 $2
      ${If} $3 == '"'
      ${OrIf} $3 == ""
        ${Break}
      ${EndIf}
      IntOp $2 $2 + 1
    ${Loop}
    StrCpy $OldUninstaller $0 $2
  ${Else}
    StrCpy $OldUninstaller $0
  ${EndIf}
  ${If} $OldDir == ""
    ${GetParent} $OldUninstaller $OldDir
  ${EndIf}
FunctionEnd

; Removes the program that is registered (the classic Electron launcher, or an earlier native one), the way electron-builder's own
; installer does it: run its uninstaller silently, in place (_?=), and wait for it. App data is kept.
Function RemovePrevious
  ${If} $OldUninstaller == ""
    Return
  ${EndIf}

  DetailPrint "Cerrando ${APP_NAME}..."
  ${If} $OldDir != ""
    !insertmacro CloseAppsIn "$OldDir"
  ${EndIf}

  ${If} ${FileExists} "$OldUninstaller"
    DetailPrint "Quitando la versión anterior..."
    StrCpy $4 "/currentuser"
    ${If} $OldMachine = 1
      StrCpy $4 "/allusers"
    ${EndIf}
    InitPluginsDir
    ; The uninstaller runs from a copy: it is about to delete the folder it lives in.
    CopyFiles /SILENT "$OldUninstaller" "$PLUGINSDIR\old-uninstaller.exe"
    ExecWait '"$PLUGINSDIR\old-uninstaller.exe" /S /KEEP_APP_DATA $4 --updated _?=$OldDir' $R0
    ${If} $R0 != 0
      DetailPrint "El desinstalador anterior terminó con el código $R0; se continúa."
    ${EndIf}
    Delete "$OldUninstaller"
    Delete "$OldDir\uninstallerIcon.ico"
    RMDir "$OldDir"
  ${EndIf}
  ; whatever the old uninstaller left of its registration must not point at a program that is gone
  ${If} $OldMachine = 0
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
    DeleteRegKey HKCU "${INSTALL_KEY}"
  ${EndIf}
FunctionEnd

Section "Instalar"
  SetShellVarContext current
  Call EnsureWritableFolder

  ; Shortcuts the person already has stay; a first install gets both. (The old uninstaller removes them, so look before.)
  Call FindPrevious
  ${If} $OldUninstaller == ""
    StrCpy $HadDesktop 1
    StrCpy $HadStart 1
  ${Else}
    StrCpy $HadDesktop 0
    StrCpy $HadStart 0
    ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      StrCpy $HadDesktop 1
    ${EndIf}
    ${If} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
      StrCpy $HadStart 1
    ${EndIf}
    ; a classic launcher installed for all users keeps its shortcuts in the shared folders
    SetShellVarContext all
    ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      StrCpy $HadDesktop 1
    ${EndIf}
    ${If} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
      StrCpy $HadStart 1
    ${EndIf}
    SetShellVarContext current
  ${EndIf}

  Call RemovePrevious

  ; A copy that was not the registered one (a leftover folder, another location) still has to be stopped before its files are replaced.
  ${If} $INSTDIR != $OldDir
    !insertmacro CloseAppsIn "$INSTDIR"
  ${EndIf}

  DetailPrint "Instalando ${APP_NAME} ${VERSION}..."
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*.*"

  WriteUninstaller "$INSTDIR\${UNINSTALL_EXE}"

  WriteRegStr HKCU "${INSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${INSTALL_KEY}" "ShortcutName" "${SHORTCUT_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME} ${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Empity"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\${UNINSTALL_EXE}" /currentuser'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\${UNINSTALL_EXE}" /currentuser /S'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "https://github.com/Empity001/EmpiLauncher"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Comments" "El repertorio de la Empidad"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${ESTIMATED_KB}
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  ; The Start menu entry always exists (it is how the launcher is found); the desktop one only if it was there or this is a first install.
  CreateShortcut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  ${If} $HadDesktop = 1
    CreateShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  ${EndIf}
SectionEnd

; Started by the classic launcher's auto-update (or told to): it has just closed, so the person expects to land in the new one.
Function .onInstSuccess
  ${If} ${Silent}
    ${If} $ForceRun = 1
    ${OrIf} $IsUpdated = 1
      SetOutPath "$INSTDIR"
      Exec '"$INSTDIR\${APP_EXE}"'
    ${EndIf}
  ${EndIf}
FunctionEnd

Section "Uninstall"
  SetShellVarContext current

  ; Only ever delete a folder that is ours by name (see EnsureAppFolder). Data is elsewhere and stays.
  StrCpy $R8 $INSTDIR "" -14
  ${If} $R8 != "\${APP_NAME}"
    MessageBox MB_OK|MB_ICONSTOP "La carpeta $INSTDIR no parece la de ${APP_NAME}; no se borra nada." /SD IDOK
    Abort
  ${EndIf}

  !insertmacro CloseAppsIn "$INSTDIR"

  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "${INSTALL_KEY}"
SectionEnd
