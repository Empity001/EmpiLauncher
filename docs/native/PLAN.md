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
| 8. Pantalla principal | Hecho: rail de versiones, hero, estado del pack, jugadores, progreso, dock. **Falta** arte del modpack (banner y fondo) |
| 9. Campo vivo adaptativo | Hecho: `LivingField` + `FieldGovernor`, medido |
| 10. Bandeja, actualizaciones | Bandeja y aviso de versión nueva: hechos. **Falta** descargar e instalar (depende del paquete nativo, paso 11) |
| 11. Empaquetado y Publisher | Diseñado abajo; **no implementado** |
| 12. Pruebas completas | Pruebas automáticas del motor y de la interfaz hechas (abajo); lo que necesita cuenta real está listado |

## Pruebas

| Prueba | Qué cubre |
|---|---|
| `node engine/test/smoke.mjs` | protocolo, configuración, índice real, jugar sin cuenta, Ajustes (RAM, mods, mods propios, shaders), actualizaciones contra un servidor local |
| `node engine/test/repair.mjs [--probe ...]` | actualización real: verificación, receptor de helios-core, descarga, progreso; en Node y en Electron-como-Node (`ENGINE_NODE`, `ELECTRON_RUN_AS_NODE=1`) |
| `node engine/test/lifecycle.mjs` | arranque detectado, parada, caída del juego, con un proceso de sustitución |
| `node engine/test/auth.mjs [--probe ...]` | la ventana de Microsoft se abre como proceso aparte, se mide, se cancela y desaparece |
| `native/tools/shot.ps1` | maneja la interfaz por UI Automation y guarda capturas (y mide con `-Probe`) |

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

## Empaquetado y Publisher (paso 11, diseñado)

Hoy el Publisher construye el launcher con electron-builder y sube el `.exe`, el `.blockmap` y `latest.yml` a una release de
GitHub; el launcher clásico se actualiza con electron-updater. El nativo necesita su propio camino, sin sustituir todavía el
del clásico:

- **Qué se empaqueta**: la interfaz WPF autocontenida (140 MB sin comprimir), el motor (`engine/`, 11 MB de dependencias) y el
  Electron ya distribuido (motor con `ELECTRON_RUN_AS_NODE` y ayudante de inicio de sesión: un solo runtime). El .NET puede ir
  autocontenido (sin requisitos) o dependiente del framework (0,6 MB, pero exige el Runtime).
- **Instalador**: NSIS (o WiX) con las mismas opciones que hoy (`oneClick: false`, elegir carpeta, accesos directos).
  El Publisher puede seguir invocando electron-builder para el instalador si la carpeta de la aplicación nativa se pasa como
  `extraResources`; alternativa: un script `dotnet publish` + NSIS propio. Decisión pendiente, no urgente.
- **Versiones y actualización**: fichero de canal propio, `latest-native.yml` (mismo formato que `latest.yml`), para que el clásico
  y el nativo no se ofrezcan instaladores el uno al otro mientras convivan. El motor ya lo lee (`update.check`) y la interfaz
  muestra el aviso; falta descargar (con sha512, ya está en el fichero) y lanzar el instalador.
- **Datos**: el nativo usa la misma carpeta de datos y la misma configuración que el clásico (`EMPI_USER_DATA=shared`), así que
  las cuentas y las instalaciones se conservan. En desarrollo va siempre aislado.

## Lo que no se ha podido comprobar (y por qué)

- Jugar de punta a punta con una cuenta real: hace falta iniciar sesión, algo que se deja al autor.
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
| Consumo que crece sin que nadie lo vea | La pestaña Acerca muestra el consumo de la interfaz y del motor en vivo |
