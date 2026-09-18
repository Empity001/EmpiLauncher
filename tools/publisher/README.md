# Empi Publisher

Página local para crear modpacks y publicar el launcher **sin escribir comandos**:
tú eliges cosas en pantalla, ella lanza Nebula, git, gh y electron-builder por detrás.

## Abrirlo

Doble click en **`Publicar.bat`** (o en el acceso directo del escritorio).
Se abre `http://localhost:4848` y **se cierra solo** cuando cierras la pestaña, así que
no queda nada consumiendo recursos en segundo plano.

## Modpacks: Editar → Compilar → Enviar

1. **Editar**
   - **+ Nuevo**: nombre, versión de Minecraft, loader (Fabric / Forge / NeoForge) y su versión
     (te ofrece la lista real y marca la recomendada). Por detrás ejecuta
     `nebula generate server <nombre> <mc> --<loader> <versión>`.
   - En la ficha del modpack: **Ajustes** (nombre, versión del pack, IP, Java, whitelist…),
     **Mods** (arrastra los `.jar` a Obligatorios / Opcional activado / Opcional apagado) y
     **Archivos** (abre la carpeta `files` para configs, resource packs, shaders…).
2. **Compilar**: actualiza el clon de EmpiPacks, corre Nebula (`generate distro`; la primera vez
   con un Forge/NeoForge nuevo instala el loader en segundo plano, sin ventanas) y prepara todo
   en el repositorio local. No publica nada todavía. Si después cambias algo, el botón
   te avisa de que hay que compilar otra vez.
3. **Enviar**: sube a un Release los archivos de más de 40 MB (GitHub no admite más de 100 MB
   por archivo), ajusta sus enlaces en `distribution.json`, hace commit y push.
   GitHub Pages tarda 1–2 minutos en mostrar los cambios.

## Launcher: versión → Compilar → Enviar

1. Elige **parche / menor / mayor / la misma** y, si quieres, escribe qué cambia.
2. **Compilar** genera el instalador con `electron-builder` (sin publicar).
3. **Enviar** sube el código, crea el Release `vX.Y.Z` con el instalador, su `.blockmap` y
   `latest.yml` (lo que necesita la actualización automática) y borra los instaladores viejos de `dist/`.

## Requisitos

- Node.js, Git y `gh` (GitHub CLI) con sesión iniciada (`gh auth login`).
- Nebula instalado (`npm install` una vez en su carpeta) y su `.env` con `JAVA_EXECUTABLE`, `ROOT` y `BASE_URL`.

Los avisos de la barra superior te dicen si falta algo. Las rutas se pueden cambiar en ⚙ Ajustes
(se guardan en `~/.empilauncher-publisher.json`). No hace falta `npm install` aquí: no tiene dependencias.

## Seguridad y consumo

- Solo escucha en `127.0.0.1` y rechaza peticiones que no vengan de su propia página.
- Una sola tarea larga a la vez, con botón **Cancelar** que mata también los procesos hijos.
- Nebula solo se recompila cuando cambia su código (antes `npm start` lo recompilaba siempre).
