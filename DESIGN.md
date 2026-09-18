---
name: Empi Publisher
description: Un taller oscuro y en calma donde el autor prepara y publica modpacks sin miedo a equivocarse.
colors:
  creeper-green: "#6fbf3c"
  creeper-green-bright: "#86d654"
  creeper-ink: "#0c1804"
  creeper-tint: "rgb(111 191 60 / .11)"
  creeper-line: "rgb(111 191 60 / .45)"
  moss-charcoal-well: "#0a0d0a"
  moss-charcoal-deep: "#0e110e"
  moss-charcoal: "#151915"
  moss-charcoal-raised: "#1b201b"
  moss-charcoal-lifted: "#232a23"
  moss-line: "#262d26"
  moss-line-strong: "#354035"
  bone-white: "#e6ece6"
  sage-mist: "#a3b09b"
  sage-dim: "#7f8e77"
  ember-red: "#ef7563"
  ember-tint: "rgb(239 117 99 / .1)"
  lantern-amber: "#e0b040"
typography:
  headline:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  code:
    fontFamily: "'Cascadia Mono', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xs: "5px"
  sm: "7px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  full: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-default:
    backgroundColor: "{colors.moss-charcoal-raised}"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-default-hover:
    backgroundColor: "{colors.moss-charcoal-lifted}"
  button-primary:
    backgroundColor: "{colors.creeper-green}"
    textColor: "{colors.creeper-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.creeper-green-bright}"
  button-danger:
    backgroundColor: "{colors.moss-charcoal-raised}"
    textColor: "{colors.ember-red}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.moss-charcoal-deep}"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
    height: "36px"
  pack-row-active:
    backgroundColor: "{colors.creeper-tint}"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  badge-free:
    textColor: "{colors.lantern-amber}"
    rounded: "{rounded.full}"
    padding: "2px 9px"
---

# Design System: Empi Publisher

Este documento recoge el sistema visual de **Empi Publisher** (`tools/publisher`), la herramienta del autor. El launcher que usan los jugadores tiene su propia hoja de estilos heredada y no está descrito aquí.

## Overview

**Creative North Star: "El taller ordenado"**

Un banco de trabajo oscuro y en calma. El autor trabaja solo, a ratos largos, y lo que hace al final (pulsar Enviar) llega a otras personas: por eso la interfaz debe transmitir serenidad y precisión, no prisa. Cada herramienta está en su sitio, nada compite por la atención y siempre se ve qué está pasando: los pasos, el progreso y el detalle técnico están a un clic, nunca ocultos.

El sistema es plano y se construye por capas de tono, no por adornos. Todos los neutros se inclinan hacia el verde del acento (nada de gris puro ni negro puro), y el verde solo aparece cuando algo avanza, está seleccionado o salió bien. Las fuentes son las del sistema operativo: no hay nada que descargar, en línea con el principio de gastar lo mínimo de la máquina.

**Key Characteristics:**
- Tono sereno y preciso; controles silenciosos, con un único elemento que destaca: el siguiente paso.
- Profundidad por tono (plano por capas), con líneas finas para separar; solo el panel de progreso lleva sombra.
- Un acento verde reservado a la acción, la selección y el éxito.
- Iconos dibujados con un solo trazo (rejilla de 24 px, 1,75 de grosor, extremos redondos); nunca emoji.
- Movimiento corto (120–220 ms) y solo para comunicar un cambio de estado.

## Colors

Un solo verde vivo sobre una familia de carbones con un toque de musgo. Ámbar y rojo existen solo para avisar.

### Primary
- **Verde Creeper** (#6fbf3c, oklch(72.7% 0.182 136)): la acción que hace avanzar el trabajo (Compilar, Enviar, Guardar, Crear), la selección actual (pestaña activa, modpack elegido) y el éxito. Va relleno solo en botones; en los demás sitios aparece como línea (`creeper-line`) o tinte (`creeper-tint`).
- **Verde Creeper Vivo** (#86d654): el estado hover del botón primario, el icono de "todo listo" y las marcas de paso completado.
- **Tinta Creeper** (#0c1804): el texto sobre el verde (8,01:1 de contraste).

### Neutral
- **Carbón Musgo Profundo** (#0e110e): el lienzo de la aplicación y el fondo de los campos de texto.
- **Carbón Musgo** (#151915): la barra superior, el pie de pasos y el panel de progreso (primer nivel elevado).
- **Carbón Musgo Elevado** (#1b201b): filas al pasar el ratón y botones por defecto.
- **Carbón Musgo Alzado** (#232a23): el control seleccionado dentro de un grupo y el estado pulsado.
- **Pozo de Musgo** (#0a0d0a): los pozos de lectura (detalle técnico, comando que se va a ejecutar); es más oscuro que el lienzo a propósito.
- **Línea Musgo** (#262d26) y **Línea Musgo Fuerte** (#354035): divisores de una sola línea y contornos de controles.
- **Blanco Hueso** (#e6ece6): texto principal (14,81:1 sobre Carbón Musgo).
- **Bruma de Salvia** (#a3b09b): texto secundario y descripciones (7,82:1).
- **Salvia Apagada** (#7f8e77): marcadores de posición, pesos, tamaños y metadatos discretos (5,11:1; 4,76:1 sobre el nivel elevado).

### Semantic
- **Rojo Brasa** (#ef7563): errores, cancelar y acciones destructivas. Con su tinte para avisos de error.
- **Ámbar Farol** (#e0b040): avisos y todo lo que sea "Libre" en la protección de archivos (la excepción que conviene ver).

### Named Rules
**The Green Means Go Rule.** Verde Creeper es para lo que mueve el trabajo hacia delante, para la selección actual y para el éxito. Nunca decora, nunca marca un estado inactivo.

**The Tinted Neutral Rule.** Ningún neutro es gris puro: todos se inclinan al matiz del acento (oklch ~145). Un gris frío en este sistema es un error.

## Typography

**Cuerpo y títulos:** Segoe UI Variable Text (con Segoe UI y la fuente del sistema como respaldo)
**Código y rutas:** Cascadia Mono (con Consolas)

**Character:** una sola familia del sistema que hace todo el trabajo; el peso 600 marca la jerarquía y la fuente monoespaciada se reserva para lo que de verdad es código, dato o ruta.

### Hierarchy
- **Headline** (600, 20px, 1,25, -0,01em): el nombre del modpack o de la pantalla (una vez por pantalla).
- **Title** (600, 16px, 1,5): el encabezado de una sección dentro de una pantalla.
- **Body** (400, 14px, 1,5): el texto de trabajo. Los párrafos de explicación no pasan de unos 62 caracteres de ancho.
- **Label** (400, 13px): etiquetas de campos y descripciones bajo un título, en Bruma de Salvia.
- **Caption** (400, 12px): ayudas, tamaños, contadores y pistas; con cifras tabulares donde hay números.
- **Code** (400, 12px, 1,55): detalle técnico, comando previsto y rutas de reglas.

### Named Rules
**The System Font Rule.** No se carga ninguna fuente. Lo que pide el sistema ya está instalado y no cuesta nada.

**The Tabular Numbers Rule.** Versiones, tamaños, contadores y tiempos usan cifras tabulares para que no salten al cambiar.

## Layout

Dos estructuras. El **espacio de trabajo de modpacks** es una lista a la izquierda (290 px, fija al hacer scroll) y el contenido a la derecha, con 40 px entre columnas y un ancho máximo de 1240 px. Las **pantallas de una sola tarea** (Launcher) van en una columna de 760 px. Arriba, una barra fija de 52 px; abajo, el pie de pasos fijo, cuya altura se mide y se reserva para que nada quede tapado.

Las secciones se separan con líneas finas y 24 px de aire, no con cajas: sin tarjetas dentro de tarjetas. Los formularios usan una rejilla de dos columnas (máximo 820 px) con 20 px de separación vertical y 24 px horizontal. El ritmo de espaciado es 4, 8, 12, 16, 24, 40; los grupos afines van juntos y los distintos, separados con generosidad.

En pantallas de hasta 900 px la lista de modpacks se vuelve una tira horizontal, las columnas pasan a una, la barra de estado se oculta y el pie de pasos se reduce a los dos botones (Compilar y Enviar). A partir de 520 px desaparece el nombre junto al logo.

## Elevation & Depth

Sistema plano por capas de tono. Los niveles son: lienzo (Carbón Musgo Profundo) → superficies fijas (Carbón Musgo) → hover y botones (Elevado) → seleccionado (Alzado), con una línea de una sola capa entre ellos. No hay sombras en tarjetas ni botones.

### Shadow Vocabulary
- **Panel de progreso** (`box-shadow: -16px 0 40px rgb(0 0 0 / .45)`): la única sombra del sistema, para separar del resto el panel lateral que aparece encima cuando hay una tarea en marcha.
- **Anillo de selección** (`box-shadow: inset 0 0 0 1px rgb(111 191 60 / .45)`): no es sombra de profundidad sino un contorno interno que marca el elemento elegido dentro de un grupo.
- **Telón de diálogos** (`rgb(0 0 0 / .6)`): oscurece lo que hay detrás mientras un diálogo pide atención.

### Named Rules
**The Flat-By-Tone Rule.** La profundidad se expresa cambiando de tono, nunca añadiendo sombra. Si algo necesita destacar, sube de nivel de tono o gana una línea.

## Shapes

Esquinas suaves y discretas, en escala corta: 7 px para controles (botones, campos), 10 px para filas y contenedores, 12 px para iconos de modpack y 14 px para diálogos. Los distintivos, píldoras de estado y marcadores de paso son totalmente redondos (999 px y círculo). Los segmentos internos de un grupo usan 5 px. Los bordes son siempre de 1 px, sin biseles ni recortes decorativos.

## Components

### Buttons
- **Shape:** esquinas suaves (7 px), 36 px de alto en tamaño normal; el tamaño grande (11 px 22 px, 15 px de texto) solo en el pie de pasos.
- **Default:** fondo Carbón Musgo Elevado, contorno fuerte, texto Blanco Hueso; en hover sube a Alzado. Al pulsar se encoge un 2% (`scale(.98)`) en 120 ms.
- **Primary:** relleno Verde Creeper con Tinta Creeper; hover a Verde Creeper Vivo. Un botón primario es la respuesta a "¿qué hago ahora?".
- **Danger:** texto y contorno en Rojo Brasa; hover con su tinte.
- **Disabled:** 40% de opacidad y cursor de no permitido.

### Inputs / Fields
- **Style:** fondo Carbón Musgo Profundo, contorno fuerte de 1 px, 7 px de esquina, 36 px de alto; las listas desplegables llevan una flecha dibujada.
- **Focus:** anillo de 2 px en Verde Creeper hacia dentro del campo.
- **Placeholder:** Salvia Apagada.

### Navigation
- **Pestañas superiores:** texto en Bruma de Salvia; la activa pasa a Blanco Hueso y lleva una línea de 2 px en Verde Creeper bajo el texto.
- **Subpestañas del modpack:** mismo patrón, con línea inferior en el divisor.
- **Lista de modpacks:** filas de 10 px de esquina con icono de 40 px; la elegida lleva tinte y línea de Creeper.

### Pipeline Footer (pasos Editar → Compilar → Enviar)
El corazón del producto. Tres pasos conectados con marcadores redondos (número o marca de completado) y una pista de una línea bajo cada botón. El siguiente paso posible lleva el botón primario; los completados, marca verde; los no disponibles, apagados.

### Activity Drawer
Panel lateral de 520 px que aparece al ejecutar algo: título, tiempo transcurrido, lista de pasos con estado (marca, círculo girando, cruz), un aviso final (verde o rojo) y el "Detalle técnico" en un pozo de código plegable. Entra con un deslizamiento de 220 ms.

### Protection Explorer (signature)
Un explorador de archivos donde cada fila (carpeta o archivo) muestra su estado y un control de tres botones: Heredar, Protegido, Libre. Protegido es neutro con candado; Libre lleva ámbar con candado abierto, porque es la excepción que hay que ver. Las columnas están alineadas en todas las filas.

### Badges and Status Pills
Píldoras de 999 px con icono de 13 px. "Todo listo" lleva la marca verde; los avisos de la barra superior van en Rojo Brasa.

### Dialogs and Toast
Diálogos con 14 px de esquina que aparecen con un ligero ascenso de 200 ms; el aviso breve (toast) sube desde abajo, sobre el pie de pasos.

## Do's and Don'ts

### Do:
- **Do** reservar Verde Creeper para la acción que hace avanzar el trabajo, la selección actual y el éxito.
- **Do** mantener todo texto en al menos 4,5:1 sobre su fondo; Salvia Apagada solo para marcadores, tamaños y metadatos.
- **Do** dibujar los iconos con el mismo trazo (rejilla de 24 px, grosor 1,75) y darles nombre accesible cuando son botones.
- **Do** mostrar el progreso paso a paso y dejar el detalle técnico a un clic.
- **Do** separar secciones con líneas finas y aire (24 px), y alinear en columnas todo lo que se compara (tamaños, estados, controles).
- **Do** respetar `prefers-reduced-motion` y limitar el movimiento a 120–220 ms con la curva `cubic-bezier(.16, 1, .3, 1)`.

### Don't:
- **Don't** usar emoji como iconos ni mezclar familias de iconos.
- **Don't** añadir sombras a tarjetas o botones para dar profundidad; sube de tono en su lugar.
- **Don't** anidar tarjetas ni envolver cada sección en una caja.
- **Don't** usar gris o negro puros: todo neutro se inclina al verde del acento.
- **Don't** poner rojo o ámbar como decoración; existen para avisar.
- **Don't** cargar fuentes externas ni recursos que cuesten memoria o red.
