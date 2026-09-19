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
| `account.list` / `account.select` `{uuid}` | `{selected, accounts[]}` |
| `auth.microsoft.login` | Abre la ventana de Microsoft (ayudante Electron), canjea el código y guarda la cuenta. `{selected, accounts[]}`. Error `cancelled` si se cierra la ventana; `auth_failed` con `title` si Microsoft o Xbox lo rechazan |
| `account.remove` `{uuid}` | Cuentas Microsoft: abre la ventana de cierre de sesión primero. Error `cancelled` si se cierra antes de terminar |
| `auth.cancel` | Cierra la ventana de inicio de sesión si está abierta |
| `auth.validate` | Renueva la sesión guardada. `{valid}`; si no se puede renovar, quita la cuenta y devuelve `{valid:false, removed:<nombre>}` |

## Eventos

| Evento | Datos |
|---|---|
| `game.state` | `{phase: idle\|launching\|updating\|restoring\|running\|stopping, mode, serverId, pid}` |
| `game.progress` | Solo los campos que cambian; `null` borra uno: `{stage, text, percent, received, total, bytesPerSecond, pendingFiles}`. Etapas: `refresh protect clean verify download restore-personal prepare launch launched java-scan java-download java-extract java-installed stop` |
| `game.failure` | `{code, title, message}`. Códigos: `distribution no_account protect clean verify download restore-personal metadata launch launchwrapper java unhandled` |
| `game.needJava` | `{serverId, suggestedMajor, distribution}` |
| `game.done` | `{mode: update\|restore, changed}` |
| `game.exit` | `{code, signal, stopped}` |
| `game.notice` | `{level, text}` |
| `pack.status` | igual que el método |
| `distro.refreshed` | igual que `distro.load` sin `tookMs` |
| `config.changed` | `{serverId, key, value}` (por ejemplo el Java elegido tras una instalación) |
| `auth.progress` | `{stage: window\|exchange\|logout}` |
| `engine.busy` | otro cliente ya está conectado |

Los eventos de progreso se limitan en el motor: el porcentaje solo cuando cambia su parte entera y los bytes como mucho
cada 100 ms, igual que el launcher clásico.

## Lo que el motor hace y la interfaz no sabe

Descargar, verificar, reparar, instalar Java, decidir qué modpack necesita actualizar o restaurar, proteger los archivos
personales del jugador, construir los argumentos de Java y lanzar Minecraft con Forge, NeoForge o Fabric, mantener Discord RPC
y renovar las sesiones. Todo eso es el código del launcher clásico (helios-core, `processbuilder`, `packintegrity`,
`authmanager`) ejecutado detrás de este protocolo.
