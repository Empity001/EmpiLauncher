# EmpiLauncher en Linux

Probado en Fedora Atomic (GNOME, Wayland), .NET 10, Node 22 y Electron 39.

## Qué es

El launcher de Linux es la **misma arquitectura que el de Windows**: una interfaz nativa (aquí Avalonia, allá WPF) que habla con el
**motor** (`engine/`, Node) por un socket local. El motor es el mismo código: descarga modpacks, instala Java, inicia sesión, lanza
Minecraft. La interfaz de Linux vive en `native/src/EmpiLauncher.Linux`.

| Pieza | Linux | Nota |
|---|---|---|
| **Launcher** | Avalonia (nativo) | Inicio de sesión, modpacks y perfiles, Jugar, avisos, ajustes, capturas, los 11 estilos de fondo, actualización automática |
| **Motor** | Node (incluido en el paquete) | Socket Unix en `$XDG_RUNTIME_DIR`; el de Windows usa una tubería con nombre |
| **Ventana de Microsoft** | Electron (incluido) | Solo se abre al iniciar o cerrar sesión |
| **Publisher** | Ventana propia (Electron) | `tools/publisher/Publicar.sh` |
| **Nebula** | Sí | Con su `.env` de Linux |

## Instalar y actualizar

Del Release de GitHub: `Empi-Launcher-<versión>-linux-x64.tar.gz`. Se extrae y se corre `./instalar.sh` (copia el programa a
`~/.local/share/empi-launcher` y crea el acceso en el menú). **Se actualiza solo**: el launcher lee `latest-linux.yml`
del Release más nuevo que lo tenga, baja el `.tar.gz`, comprueba su sha512, intercambia la carpeta y se reabre.
(`engine/src/handlers/update.js`; solo reemplaza una carpeta que tenga la marca `.empi-install`, nunca un checkout de desarrollo.)

## Compilar (desarrollo)

```bash
npm ci                                  # los node_modules de Windows no sirven
node node_modules/electron/install.js   # baja el binario de Electron (ver abajo si queda a medias)
brew install dotnet                     # el SDK de .NET 10
node native/build/build-linux.mjs       # -> dist/Empi-Launcher-<v>-linux-x64.tar.gz y dist/latest-linux.yml
```

- Correr desde el código: `cd native/src/EmpiLauncher.Linux && dotnet run` (el motor sale de la raíz del repo; usa `node` del sistema y
  una carpeta de datos aislada en `~/.local/state/empilauncher/dev-userdata`, a menos que pongas `EMPI_USER_DATA=shared`).
- `build-linux.mjs` baja el Node oficial de nodejs.org (verifica su sha256), lo guarda en `~/.cache/empi-build` y lo mete al paquete:
  `sharp` (la librería de imágenes del motor) **se cae dentro de Electron-como-Node en Linux**, por eso el motor corre con Node.
- Si `node node_modules/electron/install.js` termina sin crear `node_modules/electron/dist/electron` (pasa con Node 26:
  `extract-zip` falla en silencio), descomprime a mano el zip de `~/.cache/electron/*/electron-v*-linux-x64.zip` en `node_modules/electron/dist`
  y escribe `electron` en `node_modules/electron/path.txt`.

### Variables solo de desarrollo

`EMPI_USER_DATA` (carpeta aislada), `EMPI_STYLE` y `EMPI_ALL_STYLES=1` (probar un estilo aunque no esté publicado), `EMPI_FIELD=on|off`,
`EMPI_AUTO_OFFLINE=<nombre>`, `EMPI_AUTO_PLAY=1` + `EMPI_SELECT=<id>`, `EMPI_SCREEN=settings:<pestaña>|notices`, `EMPI_ENGINE_LOG=1`,
`EMPI_SHOT=<ruta.png>` (+ `EMPI_SHOT_DELAY`, `EMPI_SHOT_EXIT=1`, `EMPI_SHOT_EVERY`/`EMPI_SHOT_COUNT`: la ventana se guarda en una imagen; en
Wayland no se puede capturar el escritorio), `EMPI_UPDATE_URL` (un canal de actualización de prueba).

## Estilos (los fondos)

Los 11 estilos del launcher están portados: Default, Celestial, Oleaje, Térmico, Core, Shell, Minimal, Remember, Punk, Words y Explorer.
Se ofrecen los mismos que en Windows: el Default y los que el Publisher ("Pendientes") marcó con `releasedIn` en
`native/src/EmpiLauncher.App/Styles/styles.json` (el de Linux incluye ese mismo archivo). Los dos con shader (Oleaje, Térmico) están portados de HLSL a SkSL (`Views/Fields/Shaders.g.cs`).
Los colores, radios y fuentes de cada estilo salen de sus `*.tokens.xaml` (`Styles/StyleTokens.g.cs`, generado).

También están: los efectos de Jugar (sello de mantenimiento/próximamente, cristal que se rompe al retirarse y los efectos propios de cada estilo),
el logo de apertura, la bandeja del sistema, el panel de depuración, el reporte de errores, el aviso de skin sin conexión, arrastrar mods,
el selector de color (del estilo y de los puntos), el banner y fondo animados, la pantalla de "versión bloqueada", los avisos con su globito y su
megáfono, el aviso emergente al abrir y la forma propia de los controles de cada estilo (botones XP de Explorer, pegatinas de Punk, lápiz de Remember,
hojas de Words, marcos de Core, hoja de foil de Celestial…). Es el mismo orden y los mismos textos que el de Windows.
Para probar un estado sin tocar los avisos publicados: `EMPI_ACCESS=maintenance|upcoming|retired`; `EMPI_FOLDS=open` abre todos los plegables de Ajustes
y `EMPI_SCROLL=<y>` baja la página para sacar una captura.

**Una sola lista de estilos:** `native/src/EmpiLauncher.App/Styles/styles.json` es la que usan los dos launchers (el de Linux la incluye tal cual), así que
un estilo que se sube desde el Publisher sale en los dos.

## Publicar desde el Publisher

En "Publicar el launcher" el instalador **Nativo · Linux** compila el `.tar.gz` (en Windows, el **Nativo · Windows**). Los estilos de Pendientes se
pueden subir con cualquiera de los dos. El Release se crea con los archivos de Linux sin marcarse como "el último" (los launchers de Windows leen
`latest.yml` del último Release y no se tocan); cuando después se publica la versión de Windows con el mismo número, se agrega a ese mismo Release y
ahí sí queda como el último. El actualizador de Linux busca entre los Releases recientes el de versión más alta que traiga `latest-linux.yml`.

## Nebula en Linux

- `npm ci` en la carpeta de Nebula (sus `node_modules` de Windows tampoco sirven).
- `.env`: `ROOT` apunta a una carpeta de Linux, `JAVA_EXECUTABLE` a un JDK 17+ (hace falta para Forge/NeoForge; Fabric no lo usa).
  El `.env` de Windows queda guardado como `.env.windows`.
- La raíz de Nebula (`ROOT`) necesita `servers/`, `repo/`, `distribution.json` y `meta/distrometa.json`. Se puede sembrar desde el
  clon de EmpiPacks (`distrometa.json` sale del `rss` y `discord` de `distribution.json`).
- **Ojo con los archivos grandes** (más de 40 MB): no están en git, viven en el Release `large-assets` de EmpiPacks. Si faltan en
  `ROOT/servers/...`, Nebula los da por borrados y **Compilar + Enviar publicaría el modpack sin ellos**. Se bajan con
  `gh release download large-assets -R Empity001/EmpiPacks -p <asset>`; el nombre del asset es la ruta con `/` cambiada por `__`.

## Publisher

`tools/publisher/Publicar.sh` abre una ventana (Electron) que levanta el mismo `server.js` de siempre. Al cerrar la ventana el
servidor se apaga solo; si hay una tarea en marcha te pregunta antes. La configuración va en `~/.empilauncher-publisher.json`.
En la pestaña **Launcher** el instalador **Linux** compila este paquete y lo sube **al Release de esa misma versión** (si no existe, avisa:
primero tiene que salir la de Windows, porque si no el Release "último" no traería el `latest.yml` de Windows y los launchers de Windows
dejarían de ver actualizaciones).

## Lo que NO se puede hacer desde Linux

- Compilar el instalador de **Windows** (el nativo necesita WPF + NSIS; el clásico necesita Wine). El Publisher los desactiva fuera de Windows.
- Probar el inicio de sesión de Microsoft de punta a punta (pide credenciales): la ventana, la cancelación y el cierre de sesión sí están probados.

## Pruebas

```bash
node --test "tools/publisher/test/*.test.js"      # 100 pruebas
EMPI_ENGINE_TEST=1 node engine/test/smoke.mjs     # motor
EMPI_ENGINE_TEST=1 node engine/test/update.mjs    # actualización (canal de Linux)
EMPI_ENGINE_TEST=1 node engine/test/auth.mjs      # la ventana de Microsoft (sin credenciales)
```
