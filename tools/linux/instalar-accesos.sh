#!/usr/bin/env bash
# Crea los accesos de Empi Launcher y Empi Publisher en el menu de aplicaciones (GNOME/KDE), sin permisos de administrador.
set -e
REPO="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON="$REPO/build/icon.png"
mkdir -p "$APPS"

APPIMAGE="$(ls -t "$REPO"/dist/Empi-Launcher-*.AppImage 2>/dev/null | head -n 1 || true)"
if [ -x "$REPO/dist/linux-stage/EmpiLauncher" ]; then
  LAUNCHER_EXEC="\"$REPO/dist/linux-stage/EmpiLauncher\""   # el launcher nativo de Linux (native/build/build-linux.mjs)
elif [ -n "$APPIMAGE" ]; then
  LAUNCHER_EXEC="\"$APPIMAGE\""
elif [ -x "$REPO/dist/linux-unpacked/empilauncher" ]; then
  LAUNCHER_EXEC="\"$REPO/dist/linux-unpacked/empilauncher\""
else
  LAUNCHER_EXEC="\"$REPO/node_modules/.bin/electron\" \"$REPO\""
fi

cat > "$APPS/empi-launcher.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Empi Launcher
Comment=El repertorio de la Empidad
Exec=$LAUNCHER_EXEC
Icon=$ICON
Terminal=false
Categories=Game;
StartupWMClass=Empi Launcher
DESK

cat > "$APPS/empi-publisher.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Empi Publisher
Comment=Crea modpacks y publica el launcher sin escribir comandos
Exec="$REPO/tools/publisher/Publicar.sh"
Icon=$ICON
Terminal=false
Categories=Development;
StartupWMClass=Empi Publisher
DESK

update-desktop-database "$APPS" 2>/dev/null || true
echo "Listo: busca 'Empi Launcher' y 'Empi Publisher' en tus aplicaciones."
