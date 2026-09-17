# Optimización de Empi Launcher

## Fondos y banners

Los fondos y banners conservan su archivo original y su comportamiento normal:
GIF, WebP animado, APNG y AVIF se reproducen completos; PNG, JPEG, WebP y AVIF
estáticos se muestran sin alteraciones.

Para evitar que Chromium conserve cientos de fotogramas de alta resolución en
RAM, el launcher usa `ImageDecoder` cuando detecta una animación compatible:

- conserva el archivo original en la caché de medios;
- crea una copia animada ajustada al tamaño máximo visible, conservando todos
  los fotogramas, tiempos, bucles y transparencia;
- decodifica y dibuja un fotograma a la vez;
- libera cada fotograma inmediatamente después de mostrarlo;
- pausa la decodificación cuando la ventana o la vista del launcher no está
  visible;
- vuelve automáticamente a la reproducción nativa si el formato no admite este
  método.

La caché persistente se guarda en:

`<directorio de datos>/.empi-cache/landing-media/v1`

Las copias animadas optimizadas se guardan en:

`<directorio de datos>/.empi-cache/landing-animation/v1`

Esta segunda caché se limita a 16 archivos o 256 MB. Se genera una sola vez en
segundo plano y se invalida automáticamente cuando cambia el archivo del
modpack. Ninguna de las dos cachés convierte la animación a una imagen estática.

La caché de medios usa exactamente la URL `artifact.url` y el tamaño publicados
por cada versión en `distribution.json`. Se guarda fuera de `instances`, por lo
que no modifica los archivos distribuidos, sus versiones ni su comprobación de
integridad.

`sharp` solo se utiliza para crear la copia animada reducida en segundo plano.
El instalador lo incluye. Si falta en una copia de desarrollo antigua, los
archivos originales siguen reproduciéndose y la interfaz no queda vacía; al
ejecutar `npm install` vuelve a estar disponible la reducción persistente de RAM.

## Modo de optimización absoluta (menos de 6 GB de RAM)

Al iniciar, el launcher revisa la RAM total del equipo con `os.totalmem()`. Si
es menor a 6 GB, activa automáticamente un modo de optimización absoluta:

- **desactiva la aceleración de GPU** (igual que `EMPILAUNCHER_DISABLE_GPU=1`,
  ver más abajo). En pruebas reales esto resultó ser, con diferencia, el
  mayor consumidor de RAM del launcher — muy por encima de fondos, banners y
  animaciones. Solo puede decidirse al iniciar el proceso, antes de crear la
  ventana; no se puede cambiar mientras el launcher está corriendo;
- no se descarga, decodifica ni muestra ningún fondo ni banner (ni su
  `theme.json` de color), evitando por completo el trabajo de `ImageDecoder`
  y los reproductores de animación descritos arriba;
- no se restaura el último fondo/banner guardado de la sesión anterior;
- se desactivan todas las animaciones y transiciones CSS del launcher;
- el resto de la interfaz (rail de versiones, botón de juego, barra de
  progreso, ajustes) sigue funcionando con normalidad.

### Botón "Ahorro de RAM"

Junto a **Estado de Mojang**, en la pantalla principal, hay un botón que
activa o desactiva el modo manualmente. La preferencia se guarda en
`config.json` (`settings.launcher.performanceMode`: `auto` | `on` | `off`) y
persiste entre reinicios.

El botón aplica la parte de fondos/animaciones **al instante**, sin
reiniciar. La parte de GPU (el ahorro más grande) queda pendiente hasta el
próximo reinicio del launcher —el botón lo indica mostrando "REINICIAR"
brevemente cuando corresponde—.

Puede forzarse además con la variable de entorno
`EMPILAUNCHER_FORCE_PERFORMANCE_MODE` (tiene prioridad sobre el botón): `1`
lo activa sin importar la RAM disponible ni la preferencia guardada, `0` lo
desactiva aunque el equipo tenga menos de 6 GB.

## Opción de compatibilidad gráfica

- `EMPILAUNCHER_DISABLE_GPU=1`: desactiva la aceleración gráfica para equipos
  con controladores problemáticos, o para forzarla apagada sin importar el
  modo de optimización absoluta. Reduce memoria privada de forma notable
  (en pruebas reales, de ~1 GB a ~100 MB en un equipo con más de 6 GB de
  RAM), a costa de más trabajo de CPU al dibujar la interfaz.
- `EMPILAUNCHER_DISABLE_GPU=0`: fuerza la aceleración de GPU encendida
  incluso con el modo de optimización absoluta activo.

## Comportamiento de las comprobaciones

- El índice remoto del modpack se consulta cada cinco minutos y al volver a la
  ventana, con una protección de 30 segundos contra solicitudes repetidas.
- El contenido local se verifica antes de jugar, al cambiar de versión y al
  volver al launcher. Una respuesta remota sin cambios ya no provoca un
  recorrido completo de todos los archivos cada minuto.
- Las consultas periódicas de estado y actualizaciones se omiten mientras la
  ventana está oculta.

## Capturas por versión

La pestaña **Capturas** lee directamente:

`<directorio de datos>/instances/<id de versión>/screenshots`

No mueve, renombra ni modifica las capturas ni ningún archivo distribuido por
EmpiPacks. Para evitar que una colección de imágenes grandes llene la RAM:

- crea miniaturas WebP pequeñas en la caché propia del launcher;
- carga una miniatura únicamente cuando va a entrar en pantalla;
- genera como máximo dos miniaturas a la vez;
- muestra sólo un original a la vez en la previsualización;
- libera la galería completa al cambiar de pestaña u ocultar el launcher.

Los formatos habituales de Minecraft y del launcher están incluidos: PNG,
JPEG, WebP, GIF, APNG, AVIF, BMP, TIFF y HEIF/HEIC. Los formatos que Chromium
no muestra directamente se convierten sólo para su previsualización en caché;
el original permanece intacto.

## Segundo plano

El botón de cerrar envía Empi Launcher a la bandeja del sistema. Discord Rich
Presence permanece conectado, mientras que fondos, banners, miniaturas,
animaciones CSS y comprobaciones visuales quedan pausados o descargados de
memoria. El menú del icono de bandeja permite abrir el launcher o salir de
forma completa.
