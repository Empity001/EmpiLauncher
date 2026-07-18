# EmpiLauncher

Launcher personal de Minecraft para proyectos, series y versiones gestionadas.

## Estado

`launcher-microsoft-auth-01`: autenticacion de Microsoft mediante OAuth 2.0 con
PKCE, verificacion de licencia y perfil de Minecraft Java, y sesion cifrada con
el almacenamiento seguro del sistema operativo.

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

El instalador de Windows se genera con `npm run dist`. Consulta
[`docs/microsoft-auth.md`](docs/microsoft-auth.md) para registrar la aplicacion y
agregar el identificador publico a `launcher.config.json`. Los tokens nunca se
exponen a la interfaz ni se guardan sin cifrar.
