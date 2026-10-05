#!/usr/bin/env bash
# Abre el Publisher como app (equivalente a Publicar.bat). Se cierra solo al cerrar su ventana.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
ELECTRON="../../node_modules/.bin/electron"
if [ ! -x "$ELECTRON" ]; then
  echo "Faltan las dependencias del launcher. Corre 'npm ci' una vez en la carpeta del launcher." >&2
  exit 1
fi
exec "$ELECTRON" app "$@"
