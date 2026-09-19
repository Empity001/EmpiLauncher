# Launcher híbrido: interfaz nativa de Windows + motor sin Chromium

Objetivo: gastar la menor RAM y CPU posible sin reescribir lo delicado, conservando lo que hoy funciona. El launcher clásico
(Electron) no se toca: sirve de referencia, de comparación y de vuelta atrás. Todo lo nuevo vive en carpetas nuevas.

## Arquitectura

```
┌──────────────────────────┐   pipe local, JSON por línea    ┌───────────────────────────────┐
│ Interfaz nativa (C#, WPF)│ ──────────────────────────────▶ │ Motor (Node, sin Chromium)    │
│ pantallas, estados,      │ ◀────────────────────────────── │ helios-core, processbuilder,  │
│ bandeja, avisos, campo   │      eventos de progreso        │ packintegrity, authmanager,   │
└──────────────────────────┘                                 │ Discord, descargas, Java...   │
                                                             └──────────────┬────────────────┘
                                                                            │ solo mientras hace falta
                                                             ┌──────────────▼────────────────┐
                                                             │ Ayudante Electron: ventana de │
                                                             │ inicio/cierre de sesión Microsoft
                                                             └───────────────────────────────┘
```

- `native/`: solución C# (`EmpiLauncher.Ipc` con el cliente del pipe y los contratos; `EmpiLauncher.App` con la interfaz WPF).
- `engine/`: el motor. Reutiliza los módulos del launcher clásico (`configmanager`, `distromanager`, `processbuilder`,
  `packintegrity`, `authmanager`, `dropinmodutil`, `discordwrapper`, helios-core) detrás de un sustituto de `electron` y
  `@electron/remote` (`engine/src/shim`). **No se portó ni una línea de helios-core.**
- `engine/auth-helper/`: la ventana de Microsoft del launcher clásico, como aplicación Electron mínima que vive solo mientras se
  inicia o cierra sesión.
- Protocolo completo: [PROTOCOL.md](PROTOCOL.md). Mediciones: [MEASUREMENTS.md](MEASUREMENTS.md).

Reglas que se cumplen: la interfaz no conoce helios-core; los tokens de cuenta nunca cruzan el pipe; el motor puede correr sobre
Node.js o sobre el Electron que ya se distribuye (`ELECTRON_RUN_AS_NODE=1`, sin cargar Chromium); un launcher, no dos ediciones:
el "modo ligero" es una condición (`performanceMode` y el `FieldGovernor`) del mismo launcher.

## Estado de los 12 pasos

| Paso | Estado |
|---|---|
| 1. Medir C# real | Hecho: [MEASUREMENTS.md](MEASUREMENTS.md) |
| 2. Prototipo C# mínimo | Hecho (WPF, WinForms, Avalonia en `native/prototypes`) |
| 3. Confirmar C# + Node | Hecho. Decisión: WPF + motor Node. El ahorro de commit medido es de ~28 % frente al clásico en modo rendimiento y >55 % frente a GPU activa; el de private WS recortado es mayor pero engañoso (ver mediciones) |
| 4. IPC C# ↔ Node | Hecho: pipe con token, NDJSON, probado desde Node (`engine/test/smoke.mjs`) y desde C# |
| 5. Integrar helios-core sin reescribir | Hecho: jugar, actualizar, restaurar, detener, Java, Discord (`handlers/game.js`); probado con actualización real, y ciclo de vida con proceso de sustitución. **Falta** una pasada completa con cuenta real |
| 6. Ajustes | Hecho: cuenta, Minecraft, Mods (opcionales, propios, shaders), Java (RAM, ruta, JVM), Capturas (con visor), Acerca |
| 7. Inicio de sesión | Hecho: ventana Microsoft a demanda (helper Electron), canje del código en el motor, cierre de sesión, renovación al arrancar. **Falta** que el autor inicie sesión de verdad una vez (yo no introduzco credenciales) |
| 8. Pantalla principal | Hecho: rail de versiones, hero, estado del pack, jugadores, progreso, dock, logo y fondo del modpack (`art.get`) |
| 9. Campo vivo adaptativo | Hecho: `LivingField` (una sola rejilla, olas al clic, contorno al pasar el ratón) + `FieldGovernor` + ajuste Automático / Siempre / Apagado, medido |
| 10. Bandeja, actualizaciones | Hecho: bandeja, aviso de versión nueva, descarga con sha512, instalación silenciosa y reapertura (`update.install`) |
| 11. Empaquetado y Publisher | Hecho: instalador NSIS propio, `latest.yml` único, el clásico se actualiza al nativo, Publisher con "Nativo / Clásico" (abajo) |
| 12. Pruebas completas | Pruebas automáticas del motor, del instalador y de la interfaz hechas (abajo); lo que necesita cuenta real o una desconexión real está listado |
| Extra: jugar sin conexión | Hecho: jugador sin cuenta con id determinista de 12 dígitos y skin opcional por id de NameMC ([PROTOCOL.md](PROTOCOL.md), "Jugar sin conexión"). La skin está comprobada con el authlib real de nueve versiones (1.8.9 a 1.21.11), **no dentro de una partida** |
| Extra: pestaña Launcher | Hecho: versión y **notas de todas las versiones hasta la última**, ajustes del launcher, fondo vivo y su color con un selector de color propio. Ondas de clic que cruzan la ventana, presentes también durante descargas y actualizaciones; mezcla de color cuando se cruzan dos. El mismo comportamiento y selector están en el Publisher (`life.js`, `picker.js`) |

## Pruebas

| Prueba | Qué cubre |
|---|---|
| `node engine/test/smoke.mjs` | protocolo, configuración, índice real, jugar sin cuenta, Ajustes (RAM, mods, mods propios, shaders), actualizaciones contra un servidor local |
| `node engine/test/repair.mjs [--probe ...]` | actualización real: verificación, receptor de helios-core, descarga, progreso; en Node y en Electron-como-Node (`ENGINE_NODE`, `ELECTRON_RUN_AS_NODE=1`) |
| `node engine/test/lifecycle.mjs` | arranque detectado, parada, caída del juego, con un proceso de sustitución |
| `node engine/test/auth.mjs [--probe ...]` | la ventana de Microsoft se abre como proceso aparte, se mide, se cancela y desaparece |
| `node engine/test/art.mjs` | arte del modpack: tamaños, transparencia, WebP animado enorme, límites de descarga |
| `node engine/test/classpath.mjs` | qué jars de NeoForge / Minecraft quedan fuera del classpath (FML 10) |
| `node engine/test/update.mjs` | `update.install`: descarga, sha512 falso, nombre con ruta, sin huella, cancelar, no con el juego abierto; `update.changelog`: todas las versiones nuevas, en orden, sin borradores |
| `node engine/test/skin.mjs` | skins: lectura del id o enlace de NameMC, descarga y comprobaciones (tamaño, PNG, página anti-bots), modelo fino o normal, vista previa con contenido, servidor local (firma, dominio, 204/404) y cómo vive la skin en la lista de cuentas |
| `node engine/test/skin-java.mjs [versiones]` | opcional (JDK + internet): el authlib real de nueve versiones de Minecraft (1.8.9 a 1.21.11) con el agente y nuestro servidor devuelve la skin, con su modelo, y solo para nuestro UUID |
| `node engine/test/javascan.mjs` | la búsqueda de Java nunca deja el lanzamiento esperando: primero los sitios baratos del propio disco (el Java que instaló el launcher, JAVA_HOME, Program Files), un Java que no responde se salta, la búsqueda completa tiene un límite y, si se rinde, se ofrece instalar Java; incluye una comprobación con el JDK real de la máquina |
| `node engine/test/offline.mjs` | la regla del id sin conexión (fija, sin mayúsculas, 12 dígitos) y cómo convive con las cuentas Microsoft; sin red no se borra una sesión |
| `node native/build/test/migration.mjs` | el instalador contra un "launcher clásico" de mentira (registro, carpeta y accesos propios): lo cierra, lo desinstala con el protocolo de electron-builder, instala en la misma carpeta, conserva accesos y datos, `--force-run`, nativo → nativo, desinstalar, carpeta ajena |
| `node engine/test/ram.mjs` | la memoria que fija el autor de un modpack (`javaOptions.ram`, mínima y máxima): el jugador nuevo empieza ahí, quien ya tenía el modpack la recibe una vez cuando el autor la cambia, lo que el jugador toque después es suyo, nunca más de lo que da el equipo ni menos de 512 MB, y un modpack con solo los números del spec no cambia |
| `node --test "tools/publisher/test/*.test.js"` | Publisher: activar/desactivar modpacks, banderas, lectura de lo que dejó la compilación del launcher, memoria por modpack (redondeo a 512 MB, errores con motivo, no se pierde al cambiar de Java) y la carpeta `files` (shaders, resource packs, configs; rutas que se escapan, archivos de Apariencia) |
| `dotnet run -c Release --project native/tools/MotionCheck` | las animaciones con el reloj real: un botón ya se mueve a los 50 ms, cambiar de idea a mitad continúa desde donde estaba, un interruptor creado encendido no se desliza, lo que espera su turno no parpadea, las curvas son las de CSS (`native/tools/MotionCheck/README.md`) |
| `native/tools/shot.ps1` | maneja la interfaz por UI Automation y guarda capturas (y mide con `-Probe`); también `burst` (varias capturas seguidas para ver una animación a medias), `wheel` y `range` |

Todas las pruebas usan carpetas temporales (`--user-data` y `--data-dir`): ninguna toca la instalación real.

## Diseño

Sigue [DESIGN.md](../../DESIGN.md) (banco de pruebas de medios tonos): negro y papel, **un** acento (el del modpack, rosa
eléctrico si no trae), módulos, teselas, pastillas y dock. En WPF: `Themes/Theme.xaml` (tokens), `Themes/Controls.xaml`
(botones en pastilla, interruptores, deslizadores, pestañas, barras), Doto como TTF (`Assets/Fonts`, convertido del woff2 con la
misma licencia OFL; su instancia por defecto es "Doto Black", que es lo que WPF ve).

Reglas aprendidas al construirla: WPF dibuja una elipse si el radio de esquina supera la mitad del alto (por eso
`PillRadiusConverter`); `InvariantGlobalization` rompe el texto de WPF; el texto de Doto va en escala de grises para que
ClearType no ponga franjas de color en cada punto.

Estático por defecto: los módulos no se animan en reposo. Solo el campo de puntos se mueve, y solo cuando el gobernador lo permite.

## Imágenes animadas del modpack (banner y fondo: GIF, APNG, WebP)

El motor ya entrega, por modpack, la ruta local o la URL de banner, fondo y sus vistas previas. La propuesta, por costes:

1. **Fotograma fijo por defecto.** WPF decodifica el primero (`BitmapDecoder`, `DecodePixelWidth` al tamaño con el que se dibuja).
2. **Animar solo lo que el gobernador permita**, con la misma regla que el campo. Para no tener todos los fotogramas en memoria,
   el motor pre-renderiza la animación a una tira de fotogramas pequeños con sus tiempos (el clásico ya lo hace con `sharp` y un
   lienzo, con cachés acotadas) y la interfaz los reproduce con un temporizador de pocos fotogramas por segundo.
3. Cualquier animación cara **degrada a estática**: modo de rendimiento, poca memoria, operación en curso.

No se implementó todavía; no hay medición que la respalde y es lo primero que conviene medir con un modpack real.

## Inicio de sesión: qué se conserva y qué se puede cambiar después

Se conserva la ventana de Microsoft del clásico (URL, detección de la redirección, `AZURE_CLIENT_ID`), porque funciona. Solo
cambia cuándo existe: el ayudante arranca al pulsar "Añadir cuenta" y se cierra al terminar (medido en MEASUREMENTS.md, sección 5).
Quitar Electron por completo exigiría otro método (navegador del sistema con redirección local, o código de dispositivo), que
depende de cómo esté registrada la aplicación de Azure. Queda para más adelante; no bloquea nada.

## Empaquetado, publicación y paso del clásico al nativo (paso 11, hecho)

`node native/build/build.mjs [--version 3.0.0]` (el Publisher lo llama al compilar "Nativo") deja en `dist/` los mismos tres
archivos que dejaba electron-builder: `Empi-Launcher-setup-<v>.exe`, su `.blockmap` y `latest.yml`. Medido en esta máquina:

| Parte | Tamaño |
|---|---|
| Interfaz WPF autocontenida (no exige instalar .NET) | ~130 MB sin comprimir |
| Electron una sola vez (`runtime\`, sin `default_app.asar` y solo los idiomas en-US / es / es-419): motor con `ELECTRON_RUN_AS_NODE` y ventana de inicio de sesión | ~284 MB |
| Motor + módulos del clásico + solo los 99 paquetes que hacen falta (se recorren los `require` y sus dependencias) | ~30 MB |
| **Instalador** (NSIS, LZMA sólido; el clásico pesaba 115 MB) | **134 MB**, unos 3,5 min en comprimir |

- **Una sola vía de actualización.** El canal es el `latest.yml` de la última release, el mismo que lee electron-updater del
  launcher clásico. Un jugador que aún tiene el clásico recibe el instalador nativo como cualquier actualización; el nativo lo
  ejecuta con `--updated /S --force-run`, igual que hacía electron-updater. (Ya no existe `latest-native.yml`.) El nativo lee ese mismo
  archivo (`update.check`) y se actualiza a sí mismo con `update.install`: descarga, sha512, instalador silencioso, reapertura.
- **El instalador quita el viejo** (`native/build/installer.nsi`): cierra lo que corre desde la carpeta (por ruta, nunca por nombre: no
  toca otras apps Electron), lee la clave de desinstalación del clásico (`92d6aedd-…`, la misma que usará el nativo: una sola entrada en
  "Aplicaciones"), ejecuta su desinstalador en silencio y en el sitio (`/S /KEEP_APP_DATA /currentuser --updated _?=<carpeta>`, el mismo
  protocolo de electron-builder), instala en la misma carpeta con el mismo `Empi Launcher.exe` (los accesos y anclajes a la barra
  siguen valiendo), deja los accesos directos que ya había (el del menú Inicio siempre; el del escritorio solo si estaba o es
  primera instalación) y arranca el launcher nuevo. Nativo → nativo usa exactamente el mismo camino.
- **Datos intactos.** Cuentas, ajustes y juego viven en `%APPDATA%` (`Empi Launcher` y `.EmpiLauncher`), no en la carpeta del
  programa: ni el desinstalador viejo ni el nuevo los tocan. La instalación nativa usa esos mismos datos (`EMPI_USER_DATA=shared`
  por defecto cuando está instalada; en desarrollo va aislada). Lo propio del nativo (`native-ui.json`, `native-offline.json`,
  `art-cache`, `updates`) va en archivos aparte para que el clásico nunca se encuentre algo que no conoce.
- **Seguridad de carpeta.** La carpeta de instalación siempre acaba en `Empi Launcher` (si se elige otra, se añade); el desinstalador
  se niega a borrar cualquier otra. Así no puede llevarse por delante "Documentos".
- **Firma de código (pendiente, del autor).** Los binarios no están firmados. Con Smart App Control activado en Windows 11 el
  sistema puede bloquear un instalador o un `.dll` sin reputación (pasó en esta máquina con una DLL recién compilada). Con SmartScreen
  normal basta "Ejecutar de todos modos", y las descargas que hace el propio launcher no llevan la marca de la web. La solución
  de fondo es un certificado de firma; no se toca ninguna configuración de seguridad del sistema.
- **Publisher.** La pestaña Launcher tiene "Instalador: Nativo / Clásico" (por defecto Nativo), avisa de que esa versión sustituirá el
  launcher viejo de los jugadores y muestra los pasos reales de `build.mjs`. El clásico sigue compilándose con electron-builder como
  vuelta atrás. **Primera versión nativa**: elige "Mayor" (3.0.0) para que se note el cambio; cualquier número mayor que el publicado la ofrece.

## Lo que no se ha podido comprobar (y por qué)

- Jugar de punta a punta con una cuenta real: hace falta iniciar sesión, algo que se deja al autor.
- Jugar sin conexión con el juego abierto de verdad y **sin red de verdad**: la regla, las cuentas, los argumentos (`--userType legacy`) y
  el "sin red no se borra la sesión" están probados; lanzar Minecraft como jugador sin conexión y cortar internet no se hizo aquí
  (el juego de pruebas comparte carpeta con la sesión real del autor y no se toca) ni se puede cortar la red del equipo.
- El instalador contra el **launcher clásico real**: se probó con un clásico de mentira que habla el mismo protocolo de desinstalación
  (`migration.mjs`, 25 comprobaciones), no ejecutando el instalador real 2.6.2 (habría tocado la instalación del autor). El instalador
  completo (134 MB) se instaló en una carpeta de prueba con su propia identidad de registro.
- Cómo se comporta el consumo justo al arrancar Minecraft: mismo motivo, más Java 25 en el equipo de pruebas.
- Descargas completas (1,2 GB) y la instalación de Java: se probó el inicio de la descarga real y el resto es el mismo código del clásico.
- Aceleración de GPU de otros fabricantes: solo hay una máquina.

## Riesgos y cómo se limitan

| Riesgo | Cómo se limita |
|---|---|
| Que el motor se desvíe del clásico | Reutiliza sus módulos; las únicas copias (`packstate.js`, `distrosync.js`) son la lógica de landing.js y uibinder.js sin interfaz y se quitan cuando el clásico se retire |
| Romper la instalación real al probar | El motor y las pruebas aíslan `--user-data` y `--data-dir`; la interfaz de desarrollo usa una carpeta propia salvo `EMPI_USER_DATA=shared` |
| Perder tokens | No cruzan el pipe; se quedan en el motor y en `config.json`, como hoy |
| Que el motor muera con Minecraft en marcha | Mientras el juego corre el motor se mantiene vivo aunque la interfaz cierre; la interfaz avisa si el motor se cae |
| Que "Comprobando Java..." se quede colgado (el "Checking system info.." del clásico) | helios-core no pone límite de tiempo a nada al buscar Java (PowerShell por cada unidad, incluidas las de red desconectadas; el registro; `java -version` de cada candidato). El motor busca primero en sitios baratos, con límite por candidato y límite total, y si se rinde ofrece instalar Java (`engine/src/lib/javascan.js`). El launcher clásico conserva el defecto |
| Consumo que crece sin que nadie lo vea | La pestaña Acerca muestra el consumo de la interfaz y del motor en vivo |
