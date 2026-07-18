import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pack = JSON.parse(
  await readFile(new URL('../packs/forge-1.20.1/pack.json', import.meta.url), 'utf8'),
)

assert.equal(pack.id, 'empilauncher-forge-1.20.1')
assert.equal(pack.name, 'EmpiLauncher Forge 1.20.1')
assert.match(pack.version, /^\d+\.\d+\.\d+$/)
assert.equal(pack.minecraftVersion, '1.20.1')
assert.equal(pack.loader, 'Forge')
assert.equal(pack.loaderVersion, '47.4.10')

console.log(
  `Instancia validada: ${pack.name} v${pack.version} (${pack.loader} ${pack.loaderVersion})`,
)
