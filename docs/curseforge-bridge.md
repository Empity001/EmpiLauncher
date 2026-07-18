# Puente de CurseForge

## Paquete inicial

- Minecraft: 1.20.1
- Modloader: Forge 47.4.10 (recommended)
- Version del paquete: 1.0.0
- Mods: ninguno en este primer paquete de integracion

La fuente vive en `packs/forge-1.20.1`. El ZIP generado contiene directamente
`manifest.json` y la carpeta `overrides`, como espera la importacion de perfiles
de CurseForge.

## Prueba en Windows

1. Ejecuta `npm run dev`.
2. Pulsa `Preparar para CurseForge`.
3. Pulsa `Mostrar ZIP` para abrir la carpeta de salida.
4. Abre CurseForge y entra a Minecraft.
5. Usa `Import`, elige `Import Profile .zip` y selecciona el archivo generado.

CurseForge debe crear un perfil nuevo llamado `EmpiLauncher Forge 1.20.1` e
instalar Minecraft 1.20.1 con Forge 47.4.10. El inicio de sesion se realiza en
CurseForge o en el launcher de Minecraft configurado por la persona.

## Limite deliberado

CurseForge documenta la importacion mediante su selector de archivos, pero no
una API publica para completar silenciosamente una importacion local. Por eso
EmpiLauncher prepara y localiza el ZIP sin modificar archivos internos privados
de CurseForge.
