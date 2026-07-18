# EmpiLauncher

Launcher personal de Minecraft para proyectos, series y versiones gestionadas.

## Estado

`launcher-premium-foundation-01`: base de Electron, React y TypeScript con un
puente IPC aislado. La autenticacion de Microsoft y el lanzamiento de Minecraft
son los siguientes hitos.

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
npm run lint
npm run build
```

El instalador de Windows se genera con `npm run dist`. El registro de Microsoft
se conectara mediante `EMPILAUNCHER_MICROSOFT_CLIENT_ID`; el identificador es
publico, pero los tokens y secretos nunca deben incluirse en el repositorio.
