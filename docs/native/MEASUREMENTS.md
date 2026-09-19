# Mediciones del launcher nativo (híbrido)

Todas las cifras de este documento se midieron en la máquina del autor (Windows 11 Pro, 18/09/2026) con
`native/tools/Probe` (`probe.exe`: memoria con `GetProcessMemoryInfo`, CPU con `GetProcessTimes`, sobre todo el árbol de
procesos). Nada procede de cifras típicas de Internet. Lo que no se midió está marcado **pendiente**; no se usó ninguna cifra
estimada para decidir.

Definiciones:

- **Working set (WS)**: memoria física residente ahora mismo. Incluye páginas compartidas (DLL del sistema, runtime).
- **Private WS**: la parte del WS que no comparte nadie. Es la cifra "Memoria" del Administrador de tareas.
- **Commit**: memoria privada comprometida (bytes privados). No baja al recortar el working set.
- **Recorte** (`EmptyWorkingSet`): devuelve al sistema las páginas residentes. Baja WS y private WS al instante, no baja el commit,
  y las páginas vuelven a entrar cuando algo las toca.

**Condiciones de la máquina.** Equipo con 15,2 GB de RAM. Durante las mediciones la memoria libre estuvo entre 0,3 y 3,4 GB
(el equipo estaba en uso), así que Windows ya recortaba memoria por su cuenta: las cifras sin recortar de todos los casos
pueden estar por debajo de lo que darían con memoria de sobra. La CPU de reposo varió hasta 1,7 puntos entre pasadas idénticas;
por eso donde hay diferencia pequeña se dan los dos valores.

## 1. Sondas vacías: coste base de cada framework de UI

Una ventana vacía por framework, sin motor, dos rondas. Sin recorte.

| Framework | Primera ventana | WS | Private WS | Commit | CPU en reposo |
|---|---|---|---|---|---|
| WinForms | 357 a 400 ms | 46,7 MB | 7,8 MB | 11,3 MB | 0,6 a 0,8 % |
| WPF (.NET 10) | 754 a 795 ms | 113 a 114 MB | 49 MB | 68 a 70 MB | 0,0 % |
| Avalonia | 629 a 857 ms | 160 a 165 MB | 79 a 91 MB | 114 a 118 MB | 0,4 a 0,6 % |

Con recorte en reposo (WPF y Avalonia): unos 10 MB de private WS los dos.

Decisión: **WPF**. WinForms es el más ligero pero no resuelve bien tarjetas con esquinas redondeadas, degradados, opacidad
ni el visor de capturas sin dibujarlo a mano. Avalonia cuesta más que WPF en todo y añade una dependencia. WinUI 3 **no se midió**.

## 2. Launcher clásico (Electron), misma sonda

`electron.exe` sobre la carpeta del launcher, datos aislados, pantalla de inicio, 14 s de espera y 8 s de muestreo. 4 procesos.

| Configuración | WS | Private WS | Commit | CPU |
|---|---|---|---|---|
| Electron, GPU activa | 489 MB | 228 MB | 344 MB | 1,4 % |
| Electron, GPU desactivada (modo rendimiento) | 421 MB | 132 MB | 207 MB | 0,0 % |

Con recorte externo de todos los procesos (solo para comparar en igualdad de condiciones): GPU desactivada 4,2 MB WS /
1,9 MB private WS / 207 MB commit; GPU activa 105 MB WS / 63 MB private WS / 282 MB commit.

**Cómo leer esa última fila.** Recortar un Electron quieto da cifras casi cero porque nada vuelve a tocar las páginas: es
"residente ahora", no "lo que necesita". Por eso **el commit y el private WS sin recortar** son lo que se compara para decidir.

## 3. Interfaz nativa + motor Node, versión final de esta fase

`EmpiLauncher.App` con el motor conectado, `config.get`, `distro.load` y `pack.status` hechos (índice real de EmpiPacks),
tema completo, tipografía Doto, campo de puntos apagado (imagen fija). El recorte de memoria de la interfaz y del motor se
programa a los 4 s sin actividad y tras cada cambio de pantalla.

| Situación | WS | Private WS | Commit | Procesos | CPU |
|---|---|---|---|---|---|
| Inicio, tras el recorte | 45,9 MB | 24,7 MB | 148,6 MB | 3 (UI, node, conhost) | 0,0 % |
| Ajustes, pestaña Mods (63 mods obligatorios, 15 opcionales) | 53,7 MB | 20,9 MB | 154,8 MB | 3 | 0,4 % |
| Ajustes, pestaña Java | 52,8 MB | 19,6 MB | 153,4 MB | 3 | 0,6 % |

El prototipo anterior (sin tema, sin Doto, una sola pantalla mínima) daba 12,9 MB de private WS tras el recorte y 86 MB antes:
la aplicación real pesa más que el prototipo, y esa es la cifra a comparar.

Motor en Electron-como-Node en lugar de Node.js (prototipo, misma carga): 81 MB de private WS antes del recorte y 12,4 MB
después, frente a 86 y 12,9 MB con Node. **No hace falta distribuir un Node aparte**: el Electron que se distribuye para el inicio
de sesión sirve, y sin Chromium cargado el coste es el mismo.

### Comparación con el launcher clásico

| Métrica | Clásico, GPU off | Clásico, GPU on | Nativo + motor (inicio, sin recorte, prototipo) | Nativo + motor (versión final, recortado) |
|---|---|---|---|---|
| Private WS | 132 MB | 228 MB | 81 a 86 MB | 24,7 MB |
| Commit | 207 MB | 344 MB | 135 a 142 MB | 148,6 MB |
| Procesos | 4 | 4 | 2 o 3 | 3 |
| Chromium y proceso de GPU permanentes | sí | sí | **no** | **no** |

Lo que sostiene la medición:

1. El ahorro de **commit** frente al modo rendimiento del clásico es de alrededor de **un 28 %** (207 contra 149 MB) y de más de la
   mitad frente a la GPU activa. No es el orden de magnitud que sugiere el private WS recortado (24,7 contra 132 MB): ese número
   es real en el Administrador de tareas, pero parte de él vuelve si se usa la pantalla.
2. Lo que queda es sobre todo el **motor** (V8 con helios-core) y el runtime de .NET, no la UI.
3. Lo que el nativo elimina de verdad es el **proceso de GPU y el renderizador de Chromium permanentes**: el CPU y la GPU que se
   pagan al animar, y el coste que crece con imágenes animadas y capas compuestas.

## 4. El motor mientras trabaja

Actualización real del modpack PanolisSMP contra una carpeta vacía (5.049 archivos, 1.268 MB), motor + proceso receptor de
helios-core, a 2 a 3 MB/s de descarga (`engine/test/repair.mjs --probe`).

| Runtime del motor | WS | Private WS | Commit | Procesos | CPU |
|---|---|---|---|---|---|
| Node.js | 232,9 MB | 142,3 MB | 224,7 MB | 2 | 12,1 % |
| Electron-como-Node | 181,0 MB | 108,5 MB | 192,7 MB | 2 | 10,1 % |

Es el mismo trabajo que hace hoy el launcher clásico dentro de su renderizador; aquí lo paga solo el motor y solo mientras
dura. Al terminar, la interfaz recorta al motor.

## 5. Ventana de inicio de sesión de Microsoft abierta

`engine/test/auth.mjs --probe`: la ventana del ayudante Electron con la página de Microsoft cargada, sin introducir credenciales.

| WS | Private WS | Commit | Procesos | CPU | Al cancelar |
|---|---|---|---|---|---|
| 378,1 MB | 119,0 MB | 185,4 MB | 5 | 4,3 % | los 5 procesos desaparecen (comprobado) |

Es coste transitorio de unos segundos por cada inicio o cierre de sesión. En el launcher clásico ese Chromium ya está abierto siempre.

## 6. Campo de puntos (decoración adaptativa)

Interfaz + motor, ventana en primer plano, 8 s de muestreo. `EMPI_FIELD=on|off` fuerza el estado solo para medir.

| Versión | Private WS | CPU |
|---|---|---|
| Campo apagado (imagen fija) | 23,2 a 24,0 MB | 0,3 a 1,7 % |
| Primera versión: 8 fotogramas/s, rejilla de 17 px | 45,4 MB | 3,7 a 5,1 % |
| Versión final: 6 fotogramas/s, rejilla de 22 px, bordes sin suavizar | 37,6 a 38,1 MB | 3,0 a 3,4 % |

Encender el campo cuesta alrededor de **+14 MB de private WS y +1,3 a 3 puntos de CPU** mientras se mueve. Por eso lo decide el
`FieldGovernor` (`native/src/EmpiLauncher.App/Services/FieldGovernor.cs`): queda quieto, con una imagen fija, cuando hay una
operación en curso, Minecraft está en marcha, la ventana no está a la vista, Windows tiene las animaciones desactivadas, el modo de
rendimiento está activo (o en automático con menos de 6 GB), el dibujo es por software o quedan menos de 800 MB libres.
Con el gobernador decidiendo solo (sin `EMPI_FIELD`) y la ventana en primer plano, el campo se movió (5,1 % de CPU, 45,1 MB de
private WS en la versión de 8 fotogramas/s): en ese momento había memoria libre suficiente. **Pendiente** comprobar, con una
cifra, que se apaga al empezar una descarga y al arrancar Minecraft; la regla está escrita y se comprueba en cada cambio de
estado del juego, pero no se midió el efecto.

## 7. Tamaño en disco (paquete)

| Pieza | Tamaño | Nota |
|---|---|---|
| Interfaz WPF, dependiente del framework | 0,6 MB (7 archivos) | requiere .NET 10 Desktop Runtime instalado |
| Interfaz WPF, autocontenida | 140,0 MB (402 archivos) | sin requisitos; sin comprimir |
| Dependencias del motor (89 paquetes, sin Electron) | 11,0 MB | incluye 2,3 MB de tipos que no hacen falta |
| Runtime Electron (`electron.exe` + recursos) | 326 MB en carpeta, `electron.exe` 201 MB | sirve a la vez de motor y de ventana de inicio de sesión; se pueden quitar idiomas |
| Launcher clásico actual (instalado) | mismo Electron + su aplicación | punto de comparación |

En disco el nativo pesa **más** que el clásico (el .NET autocontenido se suma al Electron); en RAM, menos. La prioridad
declarada es la RAM.

## 8. Pendiente de medir

| Medición pedida | Estado |
|---|---|
| Al arrancar Minecraft de verdad | **Pendiente.** Necesita una cuenta iniciada y Java 25 en el equipo de pruebas; la lógica de arranque, detección, parada y caída sí está probada con un proceso de sustitución (`engine/test/lifecycle.mjs`) |
| Descarga completa hasta el final e instalación de Java | **Pendiente.** Se probó la actualización real durante 10 s (verificación, 5.049 archivos pendientes, transferencia); no se dejó terminar 1,2 GB |
| Animaciones de imagen de los modpacks (GIF, APNG, WebP) | **Pendiente.** El motor ya entrega las rutas de banner y fondo; falta decidir cómo se dibujan (ver PLAN.md) |
| WinUI 3 | No medido |
| Ahorro real con GPU de otro fabricante o sin GPU | No medido |
