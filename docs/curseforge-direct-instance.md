# Instancia directa de CurseForge

## Perfil inicial

- Minecraft: 1.20.1
- Modloader: Forge 47.4.10 (recommended)
- Version del perfil: 1.0.0
- Mods: ninguno en este primer perfil de integracion

La configuracion vive en `packs/forge-1.20.1`. El instalador coloca los archivos
compartidos de Minecraft y Forge en `%USERPROFILE%\curseforge\minecraft\Install`
y crea el perfil en `%USERPROFILE%\curseforge\minecraft\Instances`.

## Prueba en Windows

1. Ejecuta `npm run dev`.
2. Pulsa `Crear instancia`.
3. Espera a que terminen Java, Minecraft, Forge y la creacion del perfil.
4. Abre CurseForge. Si ya estaba abierto, reinicialo para que vuelva a leer la
   carpeta de instancias.
5. En `My Modpacks` debe aparecer `EmpiLauncher Forge 1.20.1`.

El primer proceso puede tardar varios minutos. Las reparaciones posteriores
conservan mundos, mods, configuracion, capturas y opciones de la instancia.

## Protecciones

EmpiLauncher guarda un marcador en `.empilauncher/instance.json`. Si encuentra
una carpeta con el mismo nombre sin ese marcador, la considera ajena y no la
modifica. Las instancias nuevas se preparan en una carpeta temporal y solo se
mueven a su nombre final cuando todos los metadatos estan completos.

## Compatibilidad

CurseForge no publica una API para crear perfiles locales. Esta integracion
escribe el formato `minecraftinstance.json` que usa la aplicacion de Windows, por
lo que una actualizacion futura de CurseForge podria requerir adaptar el
generador de metadatos.
