#!/usr/bin/env bash
# Abre el Publisher como app (equivalente a Publicar.bat). Se cierra solo al cerrar su ventana.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
# gh, java y node viven en linuxbrew, que el menu de apps no pone en el PATH
for d in /home/linuxbrew/.linuxbrew/bin "$HOME/.linuxbrew/bin" "$HOME/.local/bin"; do [ -d "$d" ] && PATH="$PATH:$d"; done
export PATH
# el binario directo: ".bin/electron" es un script que pide "node" en el PATH y desde el menu de apps no lo hay
ELECTRON="../../node_modules/electron/dist/electron"
if [ ! -x "$ELECTRON" ]; then
  echo "Faltan las dependencias del launcher. Corre 'npm ci' una vez en la carpeta del launcher." >&2
  exit 1
fi
# en Wayland, que hable Wayland (XWayland sin XAUTHORITY, como en el menu de apps, no abre)
FLAGS=()
[ -n "$WAYLAND_DISPLAY" ] && FLAGS+=(--ozone-platform=wayland)
exec "$ELECTRON" "${FLAGS[@]}" app "$@"
