@echo off
rem Abre el Publisher. Se cierra solo cuando cierras su pagina; no hace falta hacer nada mas.
rem (No cierres la ventanita minimizada "Empi Publisher": si lo haces, se detiene.)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir esto.
  pause
  exit /b 1
)
start "Empi Publisher" /min cmd /c "node server.js || notepad "%USERPROFILE%\.empilauncher-publisher.log""
