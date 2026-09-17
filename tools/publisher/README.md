# EmpiLauncher Publisher

Pagina local (sin terminal, sin PowerShell) para publicar actualizaciones del
launcher y de EmpiPacks con un click.

## Uso

Doble click en **`Publicar.bat`**. Se abre `http://localhost:4848` en el
navegador solo.

La primera vez, entra a **Configuracion** (arriba a la derecha) y revisa que
las rutas sean correctas - ya vienen con valores por defecto basados en donde
esta esta carpeta y donde encontre tu clon de EmpiPacks, pero confirmalos.

### Publicar Launcher

Compila el instalador con `electron-builder` y lo sube directo a GitHub
Releases (usa la configuracion que ya tenia `electron-builder.yml`). Si
tildas "Subir de version", sube el numero de version en `package.json`,
crea el commit y lo empuja a GitHub despues de publicar.

### Publicar EmpiPacks

1. Si configuraste un comando de Nebula, lo corre primero.
2. Busca archivos de mas del limite configurado (40MB por defecto) y los
   sube como asset de un Release en vez de al repositorio - asi el repo no
   crece sin limite y nunca te vas a topar con el limite de 100MB de GitHub
   por archivo. Los archivos ya subidos que no cambiaron no se vuelven a
   subir (usa un hash local para saberlo).
3. Actualiza las URLs correspondientes dentro de `distribution.json` para
   que apunten al Release en vez de al repo.
4. Sube todo lo demas (los cambios normales) al repositorio con un commit y
   push.

## Requisitos

- Node.js (ya lo tenes, es lo mismo que usa el launcher).
- `gh` (GitHub CLI) instalado y logueado - ya lo estaba usando para esta
  sesion.
- Git configurado con acceso de push a ambos repos.

No hace falta `npm install`: esta herramienta no tiene dependencias, solo usa
lo que ya viene con Node.
