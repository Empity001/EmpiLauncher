# EmpiLauncher

Gestor personal de proyectos, series e instancias de Minecraft. EmpiLauncher
prepara y mantiene modpacks; la cuenta y el arranque del juego permanecen en el
launcher que cada persona ya utiliza.

## Estado

`launcher-curseforge-bridge-01`: primer puente para CurseForge en Windows y
paquete reproducible de Minecraft 1.20.1 con Forge 47.4.10.

El hito detecta CurseForge Standalone u Overwolf, genera un ZIP compatible en la
carpeta de Descargas y permite abrir CurseForge y localizar el archivo. La
confirmacion final de importacion se realiza dentro de CurseForge, que no ofrece
una interfaz publica para importar perfiles locales silenciosamente.

## Desarrollo

Requisitos:

- Node.js 22 o superior.
- Windows 10/11 x64 como plataforma objetivo inicial.

```bash
npm install
npm run dev
```

Comprobaciones:

```bash
npm run check
```

El instalador de Windows se genera con `npm run dist`. Consulta
[`docs/curseforge-bridge.md`](docs/curseforge-bridge.md) para probar el flujo y
conocer la estructura del paquete.
