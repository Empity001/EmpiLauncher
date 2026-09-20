# Protocolo entre la interfaz nativa (C#) y el motor (Node)

La interfaz no conoce helios-core ni ningún módulo del launcher clásico. Pide acciones al motor y el motor las ejecuta y
responde. Todo lo que puede tardar avisa con eventos, no con una respuesta que se hace esperar.

## Transporte

- **Named pipe** de Windows, un cliente a la vez. Nombre: `empi-engine-<pid de la interfaz>-<8 hex al azar>`.
- **NDJSON**: un objeto JSON por línea, UTF-8, `\n` como separador. Una línea de más de 8 MB cierra la conexión.
- La interfaz arranca el motor con `--pipe <nombre> --token <secreto>`; el motor escribe `ENGINE_READY <nombre>` en stdout cuando
  escucha. La primera petición de una conexión debe ser `engine.hello` con el token; cualquier otra cosa, o un token
  distinto, cierra el pipe. Si la interfaz se desconecta, el motor termina a los 2 s salvo que algo lo mantenga vivo
  (Minecraft en marcha, ventana de inicio de sesión abierta).
- **Los tokens de cuenta nunca cruzan el pipe.** La interfaz ve nombres, uuid, tipo y fecha de caducidad.

Argumentos del motor: `--pipe`, `--token`, `--user-data <carpeta>`, `--data-dir <carpeta>`, `--electron <electron.exe>`,
`--app-version <x.y.z>`. `--user-data` aísla la configuración y las cuentas; **`--data-dir` aísla los archivos del juego**
(`common/` e `instances/`). Sin `--data-dir` el motor usa la instalación real: el desarrollo y las pruebas siempre lo pasan.

## Mensajes

```
UI -> motor   {"id":1,"method":"distro.load","params":{...}}
motor -> UI   {"id":1,"ok":true,"result":{...}}
motor -> UI   {"id":1,"ok":false,"error":{"code":"no_server","message":"...","title":"..."}}    title solo en errores para leer
motor -> UI   {"event":"game.progress","data":{...}}                                               sin id: iniciativa del motor
```

Códigos de error comunes: `unknown_method`, `bad_json`, `busy`, `no_server`, `no_account`, `bad_key`, `bad_path`, `no_mod`,
`cancelled`, `auth_failed`, `running`, `no_request`, `internal`.

## Métodos

### Motor y configuración
| Método | Parámetros | Resultado |
|---|---|---|
| `engine.hello` | `{token, client}` | `{engine, protocol, node, pid, uptimeMs}` |
| `engine.ping` | | `{t}` |
| `engine.memory` | | `{rssMB, heapUsedMB, externalMB}` |
| `engine.shutdown` | | `{bye:true}` |
| `config.get` | | ajustes, directorios y cuentas (`settings`, `firstLaunch`, `launcherDirectory`, `commonDirectory`, `instanceDirectory`, `accounts`) |
| `config.set` | `{key, value}` | `{key, value}`. Claves: `selectedServer gameWidth gameHeight fullscreen autoConnect launchDetached allowPrerelease language performanceMode dataDirectory` |
| `config.validate` | `{key, value}` | `{valid}` (`gameWidth`, `gameHeight`) |
| `config.server.get` / `.set` | `{serverId[, key, value]}` | ajustes por modpack (`minRAM maxRAM javaExecutable jvmOptions`) |

### Modpacks
| Método | Parámetros | Resultado |
|---|---|---|
| `distro.load` | `{refresh?}` | `{tookMs, selectedServer, mainServer, servers[]}`. Sincroniza la configuración de mods y de Java con el índice, como el launcher clásico |
| `distro.select` | `{id}` | `{selectedServer}` |
| `distro.theme` | `{id}` | `{source: remote\|local\|none, theme}` (acento del modpack) |
| `pack.status` | `{id?}` | `{serverId, installed, installedVersion, remoteVersion, needsUpdate, modified, differences[], action: play\|update\|restore}` |

### Jugar
| Método | Parámetros | Resultado |
|---|---|---|
| `game.start` | `{mode: auto\|play\|update\|restore}` | `{started, mode}` o `{started:false, reason:"modified", differences}`. Vuelve en cuanto acepta; lo demás son eventos |
| `game.stop` | | `{stopped}` |
| `game.status` | | `{phase, mode, serverId, pid, pendingJava}` (para retomar tras reconectar) |
| `java.install` | | `{started}`: descarga e instala el JDK que pidió `game.needJava` y sigue con el arranque |
| `java.dismiss` | | `{dismissed}` |
| `discord.navigation` | `{id?}` | `{ok}` |

### Ajustes
| Método | Resultado |
|---|---|
| `system.memory` | `{totalGB, freeGB}` |
| `settings.java` `{serverId?}` | `{minRAMGb, maxRAMGb, absoluteMinGb, absoluteMaxGb, totalGB, freeGB, javaExecutable, jvmOptions[], suggestedMajor, supported}` |
| `settings.java.set` | cualquiera de `{minRAMGb, maxRAMGb, javaExecutable, jvmOptions}`; devuelve `settings.java`. El motor impide un máximo menor que el mínimo |
| `java.details` `{path?}` | `{valid, version, vendor, path}` (lanza java, por eso va aparte) |
| `mods.list` | `{required[], optional[], dropins:{dir, mods[]}, shaders:{dir, packs[], selected}}`; cada nodo lleva `path[]` |
| `mods.set` `{path[], enabled}` | `{path, enabled}` |
| `dropins.toggle` / `dropins.add` / `dropins.resolve` | activar (renombra a `.disabled`), añadir archivos (los mueve) y resolver una ruta validada para que la interfaz la mande a la papelera |
| `shaders.select` / `shaders.add` | |
| `screenshots.dir` | `{dir}` (la galería lee los archivos directamente) |

### Cuentas
| Método | Resultado |
|---|---|
| `account.list` / `account.select` `{uuid}` | `{selected, accounts[]}`. Cada cuenta: `{uuid, displayName, username, type: microsoft\|mojang\|offline, expiresAt, offlineId?}`. El jugador sin conexión aparece aquí como una cuenta más (`type:"offline"`, con su `offlineId` de 12 dígitos); elegirlo lo activa y elegir una cuenta Microsoft lo desactiva. `selected` es `null` mientras nadie ha iniciado sesión (ver `account.signout`): la pantalla de inicio de sesión del launcher se muestra siempre que es `null` |
| `account.signout` | «Cerrar sesión»: deja a nadie en uso **sin borrar ninguna cuenta** ni abrir ventana alguna (`config.json` conserva las cuentas con `selectedAccount: null`; el jugador sin conexión queda guardado pero inactivo). Devuelve `{selected:null, accounts[]}`. Sigue así al reiniciar hasta que se elija una cuenta con `account.select`, se añada otra o se cree el jugador sin conexión |
| `auth.microsoft.login` | Abre la ventana de Microsoft (ayudante Electron), canjea el código y guarda la cuenta. `{selected, accounts[]}`. Error `cancelled` si se cierra la ventana; `auth_failed` con `title` si Microsoft o Xbox lo rechazan. La cuenta nueva pasa a ser la que juega |
| `account.remove` `{uuid}` | Elimina una cuenta guardada (la pantalla de inicio de sesión: «Eliminar sesión»). Cuentas Microsoft: abre la ventana de cierre de sesión primero; **cerrarla con la X cuenta como terminar** y la cuenta se quita igualmente, solo el botón Cancelar del launcher (`auth.cancel`) la conserva y da error `cancelled`. El jugador sin conexión se quita sin ventana. Con nadie en uso, borrar una cuenta no deja a otra en uso |
| `auth.cancel` | Cierra la ventana de inicio de sesión si está abierta |
| `auth.validate` | Renueva la sesión guardada. `{valid}`; si no se puede renovar, quita la cuenta, no deja ninguna otra en uso (el launcher muestra entonces la pantalla de inicio de sesión) y devuelve `{valid:false, removed:<nombre>}`. Sin nadie en uso devuelve `{valid:false, none:true}`. Con el jugador sin conexión en uso devuelve `{valid:true, offline:true}` y **sin red** `{valid:true, skipped:"offline"}`: no tener internet nunca borra una cuenta |
| `offline.preview` `{name}` | `{valid, reason?, name, id, uuid}`: en qué se convertiría un nombre (o por qué no vale). La regla vive solo en el motor (`engine/src/lib/offline.js`) |
| `offline.set` `{name}` | Crea el jugador sin conexión o lo renombra, y lo deja en uso. Devuelve `{selected, accounts[]}`. Error `bad_name` con la razón en `message` |

**Jugar sin conexión** (sin cuenta, solo un nombre; la skin es opcional, ver abajo). El nombre (3 a 16 de `a-z A-Z 0-9 _`) se pasa a minúsculas y cada
carácter tiene un valor fijo (`a-z` = 1..26, `0-9` = 27..36, `_` = 37); los valores se combinan con FNV-1a de 64 bits y el resultado
se reduce a 12 dígitos (`mod 10^12`, ceros a la izquierda). Mismo nombre, mismo id, siempre. El juego recibe
`--username <nombre> --uuid 00000000000030008000<12 dígitos> --accessToken offline --userType legacy`. El jugador se guarda en
`native-offline.json` junto a la configuración, nunca en `config.json`: el launcher clásico no debe encontrarse un tipo de cuenta que no conoce.

**Skin del jugador sin conexión** (opcional). Se elige por el id de NameMC (`96cab59a8709ce31`, o el enlace `namemc.com/skin/…`). NameMC no ofrece API y su web (búsqueda incluida) está tras una comprobación anti-bots, así que **el launcher no busca en NameMC**: el jugador pega el id o el enlace (o se recoge del portapapeles si es uno) y el motor baja esa sola imagen de `s.namemc.com/i/<id>.png`, que sí se sirve sin protección.

| Método | Resultado |
|---|---|
| `skin.parse` `{input}` | `{valid, id?, reason?}`. Sin red: entiende el id, el enlace de la skin y el de la imagen |
| `skin.fetch` `{input}` | `{id, model, front, head}`. Baja la imagen (una vez, ≤ 64 KB, PNG de 64×64 o 64×32), la comprueba, detecta el modelo (fino/Alex por el cuarto píxel del brazo) y dibuja la vista frontal (96×192) y la cabeza (64×64). No cambia nada. Errores `bad_skin`, `skin_failed` |
| `skin.set` `{id, model?}` | La lista de cuentas con la skin puesta al jugador sin conexión (error `no_offline` si no hay). La primera vez baja también el componente que la muestra |
| `skin.clear` | La lista de cuentas sin skin |

Cómo la ve el juego: al lanzar, el motor arranca un servidor de skins **solo en 127.0.0.1 y solo mientras dura la partida** (`lib/skinserver.js`, protocolo Yggdrasil según la especificación de authlib-injector, perfiles firmados con una clave que se crea en cada partida) y añade `-javaagent:authlib-injector-1.2.8.jar=<url local>`. El agente es un jar de 350 KB (AGPL-3.0), se baja al elegir la primera skin (no se distribuye) y solo se acepta el archivo con el sha256 fijado en el código (`9c7f4343…7b10`, el que lista GitHub para la 1.2.8). Si algo falla el juego arranca igual con la skin por defecto y se avisa (`game.notice`). Comprobado con el authlib real que trae cada versión (`engine/test/skin-java.mjs`, 91 comprobaciones): **1.8.9, 1.12.2, 1.16.5, 1.18.2, 1.19.4, 1.20.1, 1.20.4, 1.21.1 y 1.21.11** reciben la textura, con el modelo correcto, firmada (donde la versión la comprueba) y solo para nuestro UUID. El agente en sí soporta desde la 1.7 hasta las más nuevas, pero solo esas nueve están verificadas; Forge, NeoForge y Fabric no cambian esta parte. **No comprobado dentro de una partida real** (ver PLAN.md).

### Preferencias, arte, estado del servidor y actualizaciones
| Método | Resultado |
|---|---|
| `ui.get` / `ui.set` `{key, value}` | Preferencias que solo tiene la interfaz nativa (`native-ui.json`). Hoy: `fieldMode: auto\|always\|off` (el campo de puntos vivo) `dotColor: #rrggbb` (el color de los puntos y de las ondas; gris `#64635f` por defecto) y `dotOpacity: 0.1 a 1` (cuánto se ve todo el fondo; 1 por defecto, se guarda con dos decimales) |
| `art.get` `{id}` | `{serverId, banner, background}`: rutas de imágenes pequeñas ya listas (logo PNG ≤ 900 px con transparencia, fondo JPEG ≤ 1280 px) en la caché del launcher. Las remotas solo se bajan hasta 8 MB; un WebP animado enorme se reduce a su primer fotograma |
| `server.status` `{id?}` | `{online, players?:{online,max}}` |
| `update.check` | `{available, current, version?, releaseDate?, installer?, sha512?, size?, page?, reason?}`. Un solo canal: el `latest.yml` de la última release de GitHub (el mismo que lee el launcher clásico, por eso el clásico se actualiza al nativo). `reason`: `no_channel`, `bad_channel`, `offline` |
| `update.install` | Descarga el instalador de la versión publicada, comprueba su sha512 y lo lanza en silencio (`/S --updated --force-run`). `{launched, file, version}`. Errores: `no_update bad_channel bad_checksum download_failed install_failed cancelled busy game_running`. No se instala nada sin huella, con un nombre que no sea un archivo, ni con Minecraft abierto |
| `update.cancel` | Corta la descarga en curso (`update.install` responde `cancelled`) |
| `update.changelog` | `{current, entries:[{version, name, date, body, url}], reason?}`: las notas de **todas** las versiones más nuevas que la instalada, de la más reciente a la más antigua (no solo la última). Sale de la lista pública de releases de GitHub, se pide como mucho cada 10 min; deja fuera borradores y, salvo que se permitan, las versiones de prueba |

### Perfiles

Un modpack puede publicar `profiles` en su entrada del índice: la lista de **otros modpacks del mismo índice** que son sus perfiles (él mismo va
primero: `{list: [{id, name, description?, recommendedBelowGb?}]}`), y cada uno de esos dice `profileOf: <id del modpack>`. No se mezcla nada:
cada perfil es un modpack normal del índice, con su carpeta de juego, sus mods, su memoria y su Java, y puede ser de otra versión de Minecraft y de otro
loader. Elegir un perfil es elegir ese modpack (`distro.select`), así que el motor no sabe de perfiles más allá de describirlos.

En `distro.load`, cada modpack lleva `profiles` (`null` si no tiene) y `profileOf` (`null` si se muestra por su cuenta):
`profiles: {machineGb, recommended, list: [{id, name, description, recommendedBelowGb, minecraftVersion, version, ram: {minimumMb, maximumMb}|null, self}]}`.
El motor solo devuelve lo que se sostiene: un perfil que ya no está en el índice (desactivado) se omite, con menos de dos no hay perfiles, y un `profileOf`
cuyo anfitrión no existe o no lo lista se ignora (ese modpack se muestra normal). La interfaz no lista aparte los modpacks con `profileOf` y los enseña
dentro de su anfitrión, con la memoria de cada uno (`ram`) tal como la fijó su autor en su propia ficha. Los launchers que no conocen los perfiles ignoran
los dos campos y muestran todos los modpacks como siempre.

### Avisos, mantenimiento, agenda y versión mínima

Todo sale de un solo archivo, `avisos.json`, que vive junto a `distribution.json` en EmpiPacks y se publica **por su cuenta** (el botón «Publicar avisos» del
Publisher no toca ningún modpack ni el launcher). El motor lo pide con una petición condicional (ETag) y **valida todo**: solo pasan textos, fechas, enlaces
`https` y la ruta de una imagen dentro de `avisos/`; lo demás se descarta, así que un `avisos.json` torcido no puede ejecutar nada ni salirse de su carpeta.
Los launchers anteriores a la 3.5.0 (la primera que trae avisos; la 3.4.0 ya publicada no sabe de él) no lo leen.

```json
{ "version": 1, "generatedAt": "…",
  "launcher": { "minVersion": "3.5.0", "novedades": "https://…" },
  "notices": [{ "id": "…", "title": "…", "severity": "info|important|critical", "targets": ["*" | "<id de modpack>"],
                "page": "avisos/<id>-<hash>.webp", "pageHash": "…", "summary": "…", "publishedAt": "…", "expiresAt": "…",
                "button": { "label": "…", "url": "https://…" } }],
  "modpacks": { "<id>": { "maintenance": { "active": true, "message": "…", "until": "…", "allow": ["<uuid de 32 hex>"] },
                          "schedule": { "from": "…", "until": "…" }, "novedades": "https://…" } } }
```

Cada aviso es **una página de periódico** que el autor armó pieza por pieza en el Publisher y que se exporta a una imagen; el launcher la muestra tal cual
(nunca interpreta HTML). El motor baja la imagen una sola vez (por `pageHash`) a `notices-cache`.

| Método | Parámetros | Respuesta |
|---|---|---|
| `notices.get` | | La última lectura, sin red: `{online, fetchedAt, serverNow, launcher:{minVersion, blocked, message, novedades}, notices[], modpacks:{<id>:{access, novedades}}}`. Cada aviso: `{id, title, severity, general, targets, summary, button, publishedAt, expiresAt, image, state}` (`image` es un archivo local; `state`: `unread read later closed`) |
| `notices.refresh` | | Igual, pero antes pregunta a EmpiPacks. Sin red no falla: se queda la última lectura y **lo que estaba bloqueado sigue bloqueado** hasta la próxima lectura con internet |
| `notices.mark` | `{id, state}` | La vista con el estado nuevo. Un aviso editado (otro `pageHash` o título) vuelve a estar sin leer. «Recordar más tarde» (`later`) cuenta como sin leer y vuelve en el próximo arranque. **Cerrar (`closed`) lo pasa a «ya leídos»**: su página se guarda en `notices-archive/` como un WebP a 675 px de ancho y calidad 40 (unos 15-26 KB, un tercio del original; el texto se sigue leyendo), y la página original se borra. Aparece en `archive: [{id, title, severity, general, targets, summary, button, publishedAt, closedAt, image}]`, la más reciente primero, hasta 100 (las más viejas se van). Sigue ahí aunque el autor quite el aviso de `avisos.json`; si el autor lo **edita**, es un aviso nuevo y la copia vieja se borra. Un aviso cerrado no se vuelve a descargar |
| `notices.forget` | `{id}` | La vista sin ese aviso en «ya leídos» (y sin su archivo). Un `id` que no está no es un error |
| `report.build` | `{serverId?}` | `{text}`: el informe de fallo (versiones, Java, memoria, mods y el final del registro). **Se queda en el equipo**: no se envía a ningún sitio, y `redact()` quita tokens, JWT, nombre y UUID del jugador, correos, el nombre de usuario de las rutas y cadenas largas opacas |
| `pack.uninstall.preview` | `{id}` | `{installed, gameBytes, savesBytes, screenshotsBytes}`: lo que liberaría «quitar de mi PC» |
| `pack.uninstall` | `{id, includePersonal?}` | `{freedBytes}`. Borra los archivos del juego; `saves` y `screenshots` se quedan salvo `includePersonal:true`. Error `busy` con Minecraft en uso. Con solo mundos y capturas en la carpeta, `pack.status` ya no cuenta el modpack como instalado |

**Acceso de cada modpack** (`modpacks[<id>].access`): `{state, message, until, from, allowed, minVersion}` con `state` = `ok`, `maintenance` (bloquea **jugar y actualizar**;
`until` la termina sola; `allowed` es `true` si la cuenta en uso es Microsoft y su UUID está en `allow`: el jugador sin conexión nunca entra, y quien ya está dentro no
se saca), `upcoming` (`from` aún no llegó), `retired` (`schedule.until` ya pasó) o `launcher` (la versión instalada es menor que `minVersion`: el launcher entero se
bloquea, no solo un modpack). La hora es la del **servidor** (cabecera `Date` de GitHub) más un reloj monotónico, así que adelantar el reloj del PC no acorta nada; sin red se
queda congelada en la última lectura. `game.start` responde con el error `blocked` (con `message`) cuando `access` bloquea; la interfaz ya no deja pulsar el botón, esto es
la última barrera.

## Eventos

| Evento | Datos |
|---|---|
| `game.state` | `{phase: idle\|launching\|updating\|restoring\|running\|stopping, mode, serverId, pid}` |
| `game.progress` | Solo los campos que cambian; `null` borra uno: `{stage, text, percent, received, total, bytesPerSecond, pendingFiles}`. Etapas: `refresh protect clean verify download restore-personal prepare launch launched java-scan java-download java-extract java-installed stop` |
| `game.failure` | `{code, title, message}`. Códigos: `distribution no_account protect clean verify download restore-personal metadata launch launchwrapper java blocked unhandled` |
| `game.needJava` | `{serverId, suggestedMajor, distribution}` |
| `game.done` | `{mode: update\|restore, changed}` |
| `game.exit` | `{code, signal, stopped}`. Con `code` distinto de 0 y sin que el jugador lo detuviera, la interfaz ofrece el informe de fallo (`report.build`) |
| `game.notice` | `{level, text}` |
| `pack.status` | igual que el método |
| `distro.refreshed` | igual que `distro.load` sin `tookMs` |
| `config.changed` | `{serverId, key, value}` (por ejemplo el Java elegido tras una instalación) |
| `auth.progress` | `{stage: window\|exchange\|logout}` |
| `update.progress` | `{stage: download\|ready, received, total, bytesPerSecond?}` mientras `update.install` baja el instalador |
| `engine.busy` | otro cliente ya está conectado |

Los eventos de progreso se limitan en el motor: el porcentaje solo cuando cambia su parte entera y los bytes como mucho
cada 100 ms, igual que el launcher clásico.

## Lo que el motor hace y la interfaz no sabe

Descargar, verificar, reparar, instalar Java, decidir qué modpack necesita actualizar o restaurar, proteger los archivos
personales del jugador, construir los argumentos de Java y lanzar Minecraft con Forge, NeoForge o Fabric, mantener Discord RPC
y renovar las sesiones. Todo eso es el código del launcher clásico (helios-core, `processbuilder`, `packintegrity`,
`authmanager`) ejecutado detrás de este protocolo.
