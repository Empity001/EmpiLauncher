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

## Avisos: publicar sin tocar modpacks ni launcher

La pestaña **Avisos** controla lo que ven los jugadores, **sin compilar ni enviar nada más**: tiene su propio botón **Publicar avisos**, que solo sube
`avisos.json` y su carpeta `avisos/` (un `git commit --only`, así que un modpack compilado y aún sin enviar no se cuela). Lo lee el launcher 3.4.0 en adelante.

- **Avisos**: cada uno es *una página de periódico* que armas pieza por pieza en un lienzo (titulares, texto en una o dos columnas, imágenes, cajas, etiquetas y líneas) y que se exporta a una imagen WebP
  (~40–95 KB); el launcher la muestra tal cual. Eliges gravedad (información / importante / crítico), **dónde se ve** (todos los modpacks, o los que marques: el perfil «Lite»
  es otro modpack y se marca aparte), cuándo caduca y un botón opcional con enlace `https`. Un aviso que editas vuelve a salir como no leído.
- **Modpacks**: por cada uno, **mantenimiento** (bloquea jugar y actualizar, con mensaje, hora de fin automática y lista de cuentas Microsoft que sí pasan, por UUID; escribes el nombre y el Publisher
  busca su UUID), **agenda** (*desde* = «próximamente», *hasta* = «retirado»: botón de cristal roto y papelera) y **enlace de novedades**.
- **Launcher**: **versión mínima** (por debajo, el launcher entero pide actualizar y no deja jugar) y enlace de novedades general.

Lo que escribes se guarda en `~/.empilauncher-publisher-avisos/` (borradores e imágenes; nada de eso sube hasta «Publicar avisos»). Antes de publicar, el Publisher valida el
documento con la misma función que usa el launcher, y si nada cambió no crea un commit vacío.

## Requisitos

- Node.js, Git y `gh` (GitHub CLI) con sesión iniciada (`gh auth login`).
- Nebula instalado (`npm install` una vez en su carpeta) y su `.env` con `JAVA_EXECUTABLE`, `ROOT` y `BASE_URL`.

Los avisos de la barra superior te dicen si falta algo. Las rutas se pueden cambiar en ⚙ Ajustes
(se guardan en `~/.empilauncher-publisher.json`). No hace falta `npm install` aquí: no tiene dependencias.

## Seguridad y consumo

- Solo escucha en `127.0.0.1` y rechaza peticiones que no vengan de su propia página.
- Una sola tarea larga a la vez, con botón **Cancelar** que mata también los procesos hijos.
- Nebula solo se recompila cuando cambia su código (antes `npm start` lo recompilaba siempre).

## Ficha de cada modpack

- **Ajustes**: nombre, versión, IP, Java, opciones, **Memoria** y Discord (Rich Presence). En **Memoria** pones la RAM
  mínima y máxima (en GB, de 0,5 en 0,5) con la que empieza un jugador que abre el modpack; se guarda en
  `servermeta.json` (`javaOptions.ram`, con `recommended` igual a la máxima para los launchers antiguos). Cada jugador
  puede cambiarla luego en Ajustes › Java, y si cambias los números aquí la reciben una sola vez al actualizar.
  Nunca se pasa de lo que el equipo del jugador puede dar.
- **Apariencia**: icono, color de acento, fondo y banner (con su vista previa ligera opcional). Las imágenes van
  a la carpeta `files` con los nombres que busca el launcher; si pesan más de 40 MB, **Enviar** las sube solas a un Release.
- **Protección**: un explorador de los archivos del modpack donde marcas cada carpeta o archivo como
  **Protegido** (el launcher lo restaura si falta o cambia) o **Libre** (se entrega una vez y el jugador puede
  cambiarlo). Gana la regla más concreta: por ejemplo `mods/` libre y `mods/sodium-*` protegido. Las reglas se
  guardan en `servermeta.json` (`protection`) y se ven también en la lista "Reglas". "Volver a entregar" hace que
  todos reciban de nuevo los archivos libres. Los jugadores con un launcher anterior a esta función siguen viendo todo
  como protegido.
- **Mods**: arrastra los `.jar` a Obligatorios / Opcional activado / Opcional apagado.
- **Perfiles**: un modpack puede tener como perfiles **otras versiones tuyas** (por ejemplo «PanolisSMP Lite» dentro de PanolisSMP). En el launcher
  esa versión deja de salir en la lista por su cuenta y aparece dentro del modpack, en un desplegable pequeño junto a su nombre. Pulsas
  **Añadir perfil**, eliges cualquiera de tus versiones (de cualquier versión de Minecraft y de cualquier loader) y ya. Cada perfil tiene un nombre en el
  launcher, una descripción y, si quieres, «recomendarlo si el equipo tiene menos de N GB». **Nada más se toca**: la versión sigue publicada y se sigue
  editando en su propia ficha (mods, archivos, memoria, Java…), y la memoria que ve el jugador en el perfil es la que fijaste allí. Al ser otra versión, cada
  perfil tiene su propia carpeta de juego (sus mundos y ajustes). Se guarda en `servermeta.json` (`profiles`); al compilar, el modpack lista a sus perfiles y
  cada uno dice `profileOf` en `distribution.json`. Una versión solo puede ser perfil de un modpack, y un perfil no puede tener perfiles. En la lista de
  modpacks, los que son perfil de otro lo dicen.
- **Archivos**: todo lo que no es un mod y se copia al Minecraft de cada jugador. Tres columnas con su propio sitio
  (**Shaders** `.zip` en `shaderpacks`, **Resource packs** `.zip` en `resourcepacks` y **Configuraciones** en `config`),
  cada una con arrastrar y soltar, el **+** y quitar; debajo, **Otros archivos** (`options.txt`, `servers.dat`, datapacks…).
  El fondo, el banner y el color siguen en Apariencia. El botón de arriba abre la carpeta `files` en el Explorador.
- **Ajustes del Publisher** (⚙): además del color de los puntos del fondo, su **intensidad** (10 a 100 %). Se guarda en
  el navegador, como el color.
