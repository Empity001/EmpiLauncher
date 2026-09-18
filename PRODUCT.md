# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos públicos, en el mismo repositorio:

- **Jugadores** (usan EmpiLauncher): sobre todo la comunidad del servidor PanolisSMP (con whitelist), amigos y conocidos del autor, y abierto a que lo pruebe más gente. Juegan en Windows, entran con su cuenta de Microsoft, eligen un modpack y pulsan Jugar. No deberían tener que saber qué es Java, un loader o un hash.
- **El autor** (Empity001, usa Empi Publisher): crea y mantiene los modpacks y publica las versiones del launcher. Habla español y no se siente cómodo con la terminal ni con PowerShell; quiere una herramienta visual, intuitiva, donde los comandos ocurren por detrás.

## Product Purpose

**EmpiLauncher** es un launcher de Minecraft propio (fork de HeliosLauncher sobre Electron) que descarga, instala y actualiza los modpacks que publica el autor, instala el Java que haga falta, gestiona el inicio de sesión y abre el juego. No crea modpacks: solo los descarga y los ejecuta.

**Empi Publisher** es la página local con la que el autor crea modpacks (Fabric, Forge o NeoForge), edita sus mods y ajustes, y publica los modpacks y las versiones del launcher siguiendo tres pasos: Editar, Compilar, Enviar. Existe para que publicar una actualización deje de ser "80 cosas diferentes" en GitHub.

El éxito es que un jugador abra el launcher y juegue sin fricción, y que el autor publique un cambio en pocos clics y sin miedo a romper nada.

## Positioning

Un launcher hecho para el servidor de una sola persona, donde el autor decide por modpack cómo se ve (icono, fondo, banner, color de acento) y qué archivos puede tocar el jugador (protegidos, que el launcher restaura, o libres, que se entregan una vez), y publica todo con un flujo guiado en lugar de comandos.

## Operating Context

- Los modpacks los genera **Nebula** (Node/TypeScript) en `C:\EmpiPacksRoot`. Se publican en el repositorio **EmpiPacks** de GitHub, servido por GitHub Pages en `https://empity001.github.io/EmpiPacks/` (`distribution.json`, `repo`, `servers`).
- Los archivos de más de 40 MB no caben en git: se suben como assets del Release `large-assets` de EmpiPacks y su URL se ajusta en `distribution.json`.
- Las versiones del launcher salen como GitHub Releases de `Empity001/EmpiLauncher` (instalador NSIS, `.blockmap` y `latest.yml` para la actualización automática con electron-updater).
- El autor trabaja en Windows 11 con ~15 GB de RAM. El código, Nebula y el clon de EmpiPacks viven en carpetas de OneDrive.
- Ya hay modpacks reales publicados (PanolisSMP y PanolisSMP Lite, Fabric, Minecraft 1.21.11) y uno de pruebas con NeoForge (Testeo).
- El autor guarda su propia guía de flujo en `Documents/GUIA_CLARA_EMPILAUNCHER_EMPIPACKS.md`.

## Capabilities and Constraints

Launcher (jugadores):
- Inicio de sesión de Microsoft con un registro de aplicación de Azure propio; puede requerir aprobación de Microsoft para cuentas ajenas (`docs/MicrosoftAuth.md`).
- Lista de modpacks con icono, etiquetas (Principal, Whitelist), fondo, banner y color de acento por modpack (`files/background.*`, `files/banner.*`, `files/theme.json`, `accent`).
- Modo "Ahorro de RAM" (se activa solo con poca memoria), pausa de animaciones cuando la ventana pierde el foco, bandeja del sistema y Discord Rich Presence.
- Java automático por modpack (`javaOptions`) y actualización automática del propio launcher.
- Protección por archivo: cada archivo es *protegido* (se restaura si falta o cambia) o *libre* (se entrega una vez y el jugador manda). Un launcher anterior a esta función trata todo como protegido.

Publisher (autor):
- Corre en `localhost:4848`, sin dependencias, y se cierra solo al cerrar la pestaña. Solo escucha en 127.0.0.1.
- Modpacks: Ajustes, Apariencia, Protección, Mods, Archivos; luego Compilar (local, no publica nada) y Enviar (sube archivos grandes y hace git push).
- Launcher: elegir versión (parche, menor, mayor o la misma), Compilar el instalador y Enviar el Release.
- Una tarea larga a la vez, con progreso paso a paso y botón Cancelar.

Restricciones técnicas:
- Electron 39 y Node ≥ 22; dependencias del launcher parcheadas con `patch-package` (NeoForge, protección de archivos).
- Fabric, Forge y NeoForge; NeoForge necesita publicar el jar de Minecraft parcheado que genera su instalador.
- GitHub rechaza archivos de más de 100 MB en git.
- Los mods de Forge/NeoForge 1.20.3+ se copian a la carpeta `mods` de la instancia; en Fabric y Forge antiguo los gestiona el launcher.

Terminología: modpack (en la lista del launcher aparece como versión), Compilar, Enviar, Protegido, Libre, EmpiPacks, Nebula.

Sin decidir: si EmpiLauncher se ofrece al público general o queda para la comunidad del servidor; qué pasa con la aprobación de Microsoft para más jugadores.

## Brand Commitments

- El producto se llama **EmpiLauncher** (en pantalla "Empi Launcher"). No debe quedar nada visible de Helios, ni en textos ni en imágenes.
- La interfaz está en español y tutea al usuario.

## Evidence on Hand

- Modpacks reales en `C:\EmpiPacksRoot\servers` y publicados en EmpiPacks; el launcher y el Publisher funcionando en la máquina del autor.
- La guía del autor (`GUIA_CLARA_EMPILAUNCHER_EMPIPACKS.md`).
- No hay testimonios, cifras de jugadores, métricas de uso ni casos de estudio: no se deben inventar.

## Product Principles

1. **Ligero con la máquina.** El launcher y el Publisher deben gastar lo mínimo de RAM y CPU; nada pesado en segundo plano (confirmado).
2. **El autor nunca necesita la terminal.** Todo lo que hace como autor se resuelve con clics y con el progreso a la vista; los comandos ocurren por detrás (petición reiterada del autor).
3. **El jugador solo pulsa Jugar.** Java, loader, mods y actualizaciones se resuelven solos (según la guía del autor).
4. **El autor decide qué es fijo.** Qué se restaura y qué puede tocar el jugador lo elige el autor, con reglas concretas por archivo o carpeta.
5. **Publicar es siempre un paso explícito.** Compilar prepara en local; nada llega a los jugadores hasta que el autor pulsa Enviar.
