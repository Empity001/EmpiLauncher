<p align="center"><img src="./app/assets/images/SealCircle.png" width="150px" height="150px" alt="EmpiLauncher"></p>

<h1 align="center">EmpiLauncher</h1>

<p align="center">Unite a servidores modeados sin preocuparte por instalar Java, Forge u otros mods. Nosotros nos encargamos.</p>

## Funciones

* Gestion de cuentas.
  * Login con Microsoft (OAuth 2.0).
  * Las credenciales nunca se guardan; se envian directo a Microsoft/Mojang.
* Gestion eficiente de archivos.
  * Recibi las actualizaciones del modpack apenas se publican.
  * Los archivos se validan antes de iniciar; los corruptos o incorrectos se vuelven a descargar.
* **Validacion automatica de Java.**
  * Si tenes una version incompatible (o ninguna), el launcher instala la correcta por vos.
* Panel de ajustes, incluido control de memoria/Java.
* Actualizaciones automaticas del propio launcher.
* Estado de los servicios de Mojang.

## Descargas

Ultima version disponible en [GitHub Releases](https://github.com/Empity001/EmpiLauncher/releases).

| Plataforma | Archivo |
| ---------- | ------- |
| Windows x64 | `Empi-Launcher-setup-VERSION.exe` |

## Consola

Para abrir la consola de desarrollo:

```console
ctrl + shift + i
```

No pegues nada en la consola salvo que sepas exactamente que hace.

## Desarrollo

### Requisitos

* [Node.js][nodejs] v22 o superior.

**Clonar e instalar dependencias**

```console
> git clone https://github.com/Empity001/EmpiLauncher.git
> cd EmpiLauncher
> npm install
```

> No reutilices una carpeta `node_modules` de una version anterior. Corre
> `npm install` despues de clonar; asi se instala tambien `sharp`, que arma la
> cache animada de bajo consumo. Si no esta disponible, los fondos y banners
> siguen funcionando como respaldo, pero sin la reduccion persistente de RAM.

**Correr en modo desarrollo**

```console
> npm start
```

**Compilar el instalador**

```console
> npm run dist        # plataforma actual
> npm run dist:win    # Windows x64
```

**Publicar un release (compila y sube directo a GitHub Releases)**

```console
> npm run release:win
```

### Notas de arquitectura

* [`docs/distro.md`](docs/distro.md) explica el formato de `distribution.json`.
* [`docs/MicrosoftAuth.md`](docs/MicrosoftAuth.md) explica como configurar el
  login de Microsoft (Client ID de Azure).
* [`docs/OPTIMIZACION.md`](docs/OPTIMIZACION.md) documenta las optimizaciones
  de RAM/CPU ya implementadas (modo de ahorro automatico, decodificacion de
  animaciones, etc.).

---

Basado originalmente en [Helios Launcher](https://github.com/dscalzi/HeliosLauncher)
(MIT License, ver [`LICENSE.txt`](LICENSE.txt)), reescrito y personalizado para EmpiLauncher.

[nodejs]: https://nodejs.org/en/ 'Node.js'
