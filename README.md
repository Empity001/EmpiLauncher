# EmpiLauncher

Gestor personal de proyectos, series e instancias de Minecraft. EmpiLauncher
prepara y mantiene modpacks; la cuenta y el arranque del juego permanecen en el
launcher que cada persona ya utiliza.

## Estado

`launcher-curseforge-direct-instance-02`: instalacion directa para CurseForge en
Windows, con Minecraft 1.20.1, Forge 47.4.10 y descarga compatible de Java 17.

EmpiLauncher crea la instancia en
`%USERPROFILE%\curseforge\minecraft\Instances\EmpiLauncher Forge 1.20.1` e
instala Java 17, Minecraft, Forge, librerias y recursos compartidos cuando
hacen falta. No genera un ZIP ni requiere usar `Import`.

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
probar el flujo y conocer sus limites.
