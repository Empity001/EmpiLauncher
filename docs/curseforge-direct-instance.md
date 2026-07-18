# Instancias en CurseForge y Modrinth

## Perfil inicial

- Minecraft: 1.20.1
- Modloader: Forge 47.4.10 (recommended)
- Version del perfil: 1.0.0
- Mods: ninguno en este primer perfil de integracion

La configuracion vive en `packs/forge-1.20.1`. El instalador coloca los archivos
compartidos de Minecraft y Forge en `%USERPROFILE%\curseforge\minecraft\Install`
y crea el perfil en `%USERPROFILE%\curseforge\minecraft\Instances`.

## Prueba de CurseForge en Windows

1. Ejecuta `npm run dev`.
2. Elige `CurseForge` y pulsa `Crear instancia`.
3. Sigue el porcentaje de Java, Minecraft, Forge y la creacion del perfil.
4. Abre CurseForge. Si ya estaba abierto, reinicialo para que vuelva a leer la
   carpeta de instancias.
5. En `My Modpacks` debe aparecer `EmpiLauncher Forge 1.20.1`.

El primer proceso puede tardar varios minutos. Las reparaciones posteriores
conservan mundos, mods, configuracion, capturas y opciones de la instancia.

## Prueba de Modrinth en Windows

1. Ejecuta `npm run dev` y elige `Modrinth`.
2. Pulsa `Crear en Modrinth`.
3. Confirma la creacion en la ventana de Modrinth App.
4. Vuelve a EmpiLauncher. El marcador se busca automaticamente cada dos
   segundos.
5. Si Modrinth usa una carpeta personalizada, pulsa `Buscar carpeta` y elige la
   instancia o su carpeta `profiles`.

Modrinth registra oficialmente la extension `.mrpack`; EmpiLauncher utiliza ese
flujo para que Modrinth instale Minecraft y Forge con sus propios mecanismos.
Despues de la primera creacion, la ruta queda guardada en la configuracion local
de EmpiLauncher.

## Protecciones

EmpiLauncher guarda un marcador en `.empilauncher/instance.json`. Si encuentra
una carpeta con el mismo nombre sin ese marcador, la considera ajena y no la
modifica. Las instancias nuevas se preparan en una carpeta temporal y solo se
mueven a su nombre final cuando todos los metadatos estan completos.

El marcador tambien enumera los archivos gestionados. Al actualizar, se
comparan por contenido: los iguales no se reescriben, los modificados se
reemplazan y solo se eliminan archivos antiguos que figuraban en esa lista.
Mundos, opciones y contenido agregado por la persona quedan fuera de ese ciclo.

## Compatibilidad

CurseForge no publica una API para crear perfiles locales. Esta integracion
escribe el formato `minecraftinstance.json` que usa la aplicacion de Windows, por
lo que una actualizacion futura de CurseForge podria requerir adaptar el
generador de metadatos.

Modrinth puede guardar sus perfiles en una carpeta personalizada. EmpiLauncher
detecta las rutas predeterminadas actuales y antiguas, y ofrece seleccion manual
para los casos personalizados.
