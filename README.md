# EmpiLauncher

Gestor personal de proyectos, series e instancias de Minecraft. EmpiLauncher
prepara y mantiene modpacks; la cuenta y el arranque del juego permanecen en el
launcher que cada persona ya utiliza.

## Estado

`launcher-multi-launcher-01`: selector inicial para CurseForge y Modrinth,
rutas recordadas por launcher, progreso porcentual y actualizaciones de archivos
gestionados.

En CurseForge, EmpiLauncher crea directamente la instancia en
`%USERPROFILE%\curseforge\minecraft\Instances\EmpiLauncher Forge 1.20.1` e
instala Java 17, Minecraft, Forge, librerias y recursos compartidos cuando
hacen falta.

En Modrinth, EmpiLauncher genera un `.mrpack` local y lo abre con Modrinth App,
que se encarga de registrar e instalar la instancia. Cuando Modrinth termina,
EmpiLauncher encuentra su marcador y recuerda la ruta exacta. Las siguientes
actualizaciones comparan archivos y solo modifican los que pertenecen al
paquete.

La cuenta de Minecraft y el inicio del juego siguen perteneciendo a
CurseForge/Minecraft Launcher. EmpiLauncher no guarda credenciales.

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
[`docs/curseforge-direct-instance.md`](docs/curseforge-direct-instance.md) para
probar ambos flujos y conocer sus limites.
