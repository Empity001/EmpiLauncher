@echo off
cd /d "%~dp0"
start "" http://localhost:4848
node server.js
