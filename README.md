# EmpiLauncher

Gestor personal de proyectos, series e instancias de Minecraft. EmpiLauncher
prepara y mantiene modpacks; la cuenta y el arranque del juego permanecen en el
launcher que cada persona ya utiliza.

## Estado

`launcher-pack-bridge-01`: CurseForge, Modrinth y carpeta portable; progreso
azul para Minecraft/Forge y lima para el modpack; catalogo remoto con descarga
verificada y paquete local de respaldo.

En CurseForge, EmpiLauncher crea directamente la instancia en
`%USERPROFILE%\curseforge\minecraft\Instances\EmpiLauncher Forge 1.20.1` e
instala Java 17, Minecraft, Forge, librerias y recursos compartidos cuando
hacen falta.

En Modrinth, EmpiLauncher genera un `.mrpack` local y lo abre con Modrinth App,
que se encarga de registrar e instalar la instancia. Cuando Modrinth termina,
EmpiLauncher encuentra su marcador y recuerda la ruta exacta. Las siguientes
actualizaciones comparan archivos y solo modifican los que pertenecen al
paquete.

La opcion Otra ubicacion crea una raiz portable en la carpeta elegida. Incluye
Minecraft, Forge y los archivos del modpack, y queda recordada para reparar o
actualizar sin volver a buscarla.

EmpiLauncher consulta el catalogo publico de `Empity001/EmpiPacks` al abrir. Si
encuentra una version mas nueva, descarga su `.empipack`, comprueba el SHA-256 y
lo extrae en la cache local. Ante cualquier fallo conserva el paquete incluido.

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
