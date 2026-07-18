import { readFile } from 'node:fs/promises'
import path from 'node:path'

const packDirectory = path.resolve('packs/forge-1.20.1')
const manifest = JSON.parse(
  await readFile(path.join(packDirectory, 'manifest.json'), 'utf8'),
)
const pack = JSON.parse(
  await readFile(path.join(packDirectory, 'pack.json'), 'utf8'),
)

const expectedLoader = `forge-${pack.loaderVersion}`
const primaryLoader = manifest.minecraft?.modLoaders?.find(
  (loader) => loader.primary,
)

if (manifest.manifestType !== 'minecraftModpack') {
  throw new Error('manifestType debe ser minecraftModpack')
}

if (manifest.manifestVersion !== 1) {
  throw new Error('manifestVersion debe ser 1')
}

if (manifest.minecraft?.version !== pack.minecraftVersion) {
  throw new Error('La version de Minecraft no coincide con pack.json')
}

if (primaryLoader?.id !== expectedLoader) {
  throw new Error(`El loader principal debe ser ${expectedLoader}`)
}

if (!Array.isArray(manifest.files)) {
  throw new Error('files debe ser un arreglo')
}

if (manifest.overrides !== 'overrides') {
  throw new Error('La carpeta overrides debe llamarse overrides')
}

console.log(
  `Pack valido: ${pack.name} | Minecraft ${pack.minecraftVersion} | ${pack.loader} ${pack.loaderVersion}`,
)
