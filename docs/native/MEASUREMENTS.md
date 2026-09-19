# Mediciones del launcher nativo (híbrido)

Todas las cifras de este documento se midieron en la máquina del autor (Windows 11 Pro, 18/09/2026) con
`native/tools/Probe` (`probe.exe`, lee memoria con `GetProcessMemoryInfo` y CPU con `GetProcessTimes` sobre todo el
árbol de procesos). Nada procede de cifras típicas de Internet. Lo que no se midió está marcado como **estimado** o
**pendiente**.

Definiciones:

- **Working set (WS)**: memoria física residente ahora mismo. Incluye páginas compartidas (DLL del sistema, runtime).
- **Private WS**: la parte del WS que no comparte nadie. Es la cifra "Memoria" del Administrador de tareas.
- **Commit**: memoria privada comprometida (bytes privados). No baja al recortar el working set.
- **Recorte** (`EmptyWorkingSet`): devuelve al sistema las páginas residentes. Baja WS y private WS al instante, no baja el commit
  y las páginas vuelven a entrar cuando algo las toca.

## 1. Sondas vacías: coste base de cada framework de UI (medido)

Una ventana vacía por framework, sin motor, mismo equipo, dos rondas. Sin recorte.

| Framework | Primera ventana | WS | Private WS | Commit | CPU en reposo |
|---|---|---|---|---|---|
| WinForms | 357 a 400 ms | 46,7 MB | 7,8 MB | 11,3 MB | 0,6 a 0,8 % |
| WPF (.NET 10) | 754 a 795 ms | 113 a 114 MB | 49 MB | 68 a 70 MB | 0,0 % |
| Avalonia | 629 a 857 ms | 160 a 165 MB | 79 a 91 MB | 114 a 118 MB | 0,4 a 0,6 % |

Con recorte en reposo (WPF y Avalonia): unos 10 MB de private WS los dos.

Decisión: **WPF**. WinForms es el más ligero pero no resuelve bien tarjetas con esquinas redondeadas, degradados, opacidad
animada ni el visor de imágenes animadas sin dibujarlo a mano. Avalonia cuesta más que WPF en todo y añade una dependencia.
WinUI 3 **no se midió** (queda como estimación no verificada).

## 2. Launcher clásico (Electron) con la misma sonda (medido)

`electron.exe` sobre la carpeta del launcher, datos de usuario aislados, ventana en la pantalla de inicio, 14 s de espera y
8 s de muestreo. 4 procesos (principal, GPU, utilidad, renderizador).

| Configuración | WS | Private WS | Commit | CPU |
|---|---|---|---|---|
| Electron, GPU activa | 489 MB | 228 MB | 344 MB | 1,4 % |
| Electron, GPU desactivada (modo rendimiento) | 421 MB | 132 MB | 207 MB | 0,0 % |

Con recorte externo de todos los procesos (solo para tener una comparación en igualdad de condiciones):
GPU desactivada 4,2 MB WS / 1,9 MB private WS / 207 MB commit; GPU activa 105 MB WS / 63 MB private WS / 282 MB commit.

**Cómo leer esa última fila.** Recortar un Electron quieto produce cifras casi cero porque nada vuelve a tocar las páginas. Es
una cifra de "residente ahora", no de "lo que necesita". Por eso **el commit y el private WS sin recortar** son las cifras que
se comparan para decidir; el recorte es una mejora cosmética del Administrador de tareas más un poco de RAM física libre para el juego.

## 3. UI nativa (WPF) + motor Node conectado (medido)

`EmpiLauncher.App.exe` con el motor arrancado, `config.get` y `distro.load` ya hechos (índice real de EmpiPacks).
El prototipo recorta su propia memoria y la del motor tras 4 s sin uso.

| Configuración | Momento | WS | Private WS | Commit | Procesos | CPU |
|---|---|---|---|---|---|---|
| UI + motor en Node.js | 2 s tras abrir (antes del recorte) | 214 MB | 86 MB | 140 MB | 3 (UI, node, conhost) | 0,0 % |
| UI + motor en Node.js | reposo, tras el recorte | 42 MB | 12,9 MB | 135 MB | 3 | 0,0 a 4,5 % (varía entre pasadas) |
| UI + motor en Electron-como-Node | 2 s tras abrir | 188 MB | 81 MB | 137 MB | 2 (UI, electron.exe) | 0,0 % |
| UI + motor en Electron-como-Node | reposo, tras el recorte | 41 MB | 12,4 MB | 142 MB | 2 | 0,0 % |

Primera ventana visible: 436 a 508 ms.
Con la ventana minimizada el WS no baja más: 64 MB WS / 25,5 MB private WS en la primera pasada (sin diferencia relevante).

### Comparación honesta con el launcher clásico

| Métrica | Clásico (GPU off) | Clásico (GPU on) | Nativo + motor Node | Ahorro frente a GPU off |
|---|---|---|---|---|
| Private WS sin recortar | 132 MB | 228 MB | 81 a 86 MB | 35 a 39 % |
| Commit | 207 MB | 344 MB | 135 a 142 MB | 31 a 35 % |
| Procesos | 4 | 4 | 2 o 3 | |
| Chromium/GPU permanente | sí | sí | **no** | |

Conclusiones que sostiene la medición:

1. El ahorro medido de memoria en reposo es de **alrededor de un tercio** frente al modo rendimiento actual y de **más de la mitad**
   frente a la GPU activa. No es el orden de magnitud que sugieren las cifras recortadas (13 MB contra 132 MB), que no son comparables.
2. La mayor parte del coste que queda es el **motor** (V8 con helios-core cargado) más el runtime de .NET, no la UI.
3. Lo que el nativo elimina de verdad es **el proceso de GPU y el renderizador de Chromium permanentes**, es decir, el CPU/GPU
   que se paga al animar y el coste de memoria que crece con imágenes animadas y capas compuestas. Eso no aparece en una
   medición de reposo y **queda pendiente de medir con animaciones** (sección 5).
4. Ejecutar el motor sobre `electron.exe` con `ELECTRON_RUN_AS_NODE=1` cuesta lo mismo que sobre `node.exe` (81 contra 86 MB
   antes del recorte, 12,4 contra 12,9 después): **no hace falta distribuir un Node aparte**, el Electron que ya se distribuye para
   el login sirve. El motor no carga Chromium en ese modo.

## 4. Lo que no cambia el resultado pero conviene saber

- La cifra de reposo del nativo depende de que el recorte se aplique (a los 4 s sin actividad). Sin él, los 86 MB antes del
  recorte son la cifra real mientras se usa la ventana.
- El CPU de reposo varió entre 0,0 % y 4,5 % de un núcleo entre pasadas idénticas. No se investigó la causa (sospecha: páginas
  que vuelven a entrar tras el recorte). Se vigilará al medir con operaciones reales.
- El launcher clásico conectó Discord RPC durante la medición (comportamiento normal suyo).

## 5. Pendiente de medir

| Medición pedida | Estado |
|---|---|
| RAM en Settings nativo | Pendiente: la pantalla se migra en el paso 6 |
| CPU con animaciones (campo vivo, GIF/APNG/WebP) | Pendiente: paso 9 |
| Consumo del motor durante operaciones (verificar, descargar, instalar Java) | Pendiente: paso 5 |
| Con el login Electron abierto | Pendiente: paso 7 (se medirá el auxiliar real) |
| Al arrancar Minecraft | Pendiente: paso 5 |
| Nativo + motor bajo memoria escasa | Pendiente |

Este documento se actualiza cada vez que se mide algo nuevo. Cifras **estimadas**: ninguna se usa como dato de decisión.
