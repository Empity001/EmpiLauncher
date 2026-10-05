#!/usr/bin/env bash
# Instala Empi Launcher para tu usuario (sin permisos de administrador): copia el programa a ~/.local/share/empi-launcher
# y crea el acceso en el menú de aplicaciones. Para quitarlo: borra esa carpeta y ~/.local/share/applications/empi-launcher.desktop.
set -e
AQUI="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
DESTINO="${XDG_DATA_HOME:-$HOME/.local/share}/empi-launcher"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

if [ "$AQUI" != "$DESTINO" ]; then
  mkdir -p "$DESTINO"
  # lo viejo se reemplaza por completo: así no queda nada de la versión anterior
  rm -rf "$DESTINO.nuevo" && mkdir "$DESTINO.nuevo"
  cp -a "$AQUI"/. "$DESTINO.nuevo"/
  rm -rf "$DESTINO.viejo"
  [ -d "$DESTINO" ] && mv "$DESTINO" "$DESTINO.viejo"
  mv "$DESTINO.nuevo" "$DESTINO"
  rm -rf "$DESTINO.viejo"
fi

mkdir -p "$APPS"
cat > "$APPS/empi-launcher.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Empi Launcher
Comment=El repertorio de la Empidad
Exec="$DESTINO/EmpiLauncher"
Icon=$DESTINO/empi-launcher.png
Terminal=false
Categories=Game;
StartupWMClass=EmpiLauncher
DESK
update-desktop-database "$APPS" 2>/dev/null || true
echo "Listo: busca 'Empi Launcher' en tus aplicaciones."
