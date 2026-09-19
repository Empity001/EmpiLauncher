// node tools/publisher/test/demo-root.js <folder>
// Builds a throwaway Publisher home with a fake Nebula root that looks like the real one (same names, flags and icons), so the
// interface can be tried and photographed without touching C:\EmpiPacksRoot. Start the Publisher on it with:
//   EMPI_PUBLISHER_HOME=<folder>\home PUBLISHER_PORT=4950 node tools/publisher/server.js --no-open
const fs = require('fs')
const path = require('path')

const target = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'publisher-demo'))
const realRoot = process.env.REAL_ROOT || 'C:\\EmpiPacksRoot'
const root = path.join(target, 'root')
const home = path.join(target, 'home')
fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(home, { recursive: true })

for (const where of ['servers', 'hide']) {
    const dir = path.join(realRoot, where)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const source = path.join(dir, entry.name)
        if (!entry.isDirectory() || !fs.existsSync(path.join(source, 'servermeta.json'))) continue
        const copy = path.join(root, where, entry.name)
        fs.mkdirSync(path.join(copy, 'fabricmods', 'required'), { recursive: true })
        fs.copyFileSync(path.join(source, 'servermeta.json'), path.join(copy, 'servermeta.json'))
        if (fs.existsSync(path.join(source, 'icon.png'))) fs.copyFileSync(path.join(source, 'icon.png'), path.join(copy, 'icon.png'))
    }
}
fs.writeFileSync(path.join(home, '.empilauncher-publisher.json'), JSON.stringify({ nebulaRootPath: root, nebulaProjectPath: path.join(target, 'no-nebula') }, null, 2))
console.log(target)
