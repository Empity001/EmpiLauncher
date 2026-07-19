import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

const jei = await readFile(
  new URL(
    '../packs/forge-1.20.1/overrides/mods/jei-1.20.1-forge-15.20.0.106.jar',
    import.meta.url,
  ),
)

assert.equal(jei.length, 1_379_220)
assert.equal(
  createHash('sha256').update(jei).digest('hex'),
  'e3d8f2c4028fa431368d42bde25b92b2210bddd2e1fb59a932d0c2cc62dd3587',
)

console.log(
  `Instancia validada: ${pack.name} v${pack.version} con JEI (${pack.loader} ${pack.loaderVersion})`,
)
