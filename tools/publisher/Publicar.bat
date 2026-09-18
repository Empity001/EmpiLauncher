@echo off
rem Abre el Publisher. Se cierra solo cuando cierras su pagina; no hace falta hacer nada mas.
cd /d "%~dp0"
start "Empi Publisher" /min cmd /c node server.js
