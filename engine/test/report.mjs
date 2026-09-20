// node engine/test/report.mjs
// The local failure report (lib/report.js: what it says, and above all what it hides) and "quitar de mi PC" (pack.uninstall).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const { redact } = require('../src/lib/report.js')

// ---- part 1: what gets hidden ----------------------------------------------------------------------------------------------------
const user = 'MaríaLópez'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
const raw = [
    `Launch: java -Xmx4G -cp C:\\Users\\${user}\\AppData\\Roaming\\.minecraft\\libraries\\a.jar net.minecraft.Main --username Empi_Secret --uuid 12345678123412341234123456789abc --accessToken ${JWT} --version 1.21.11`,
    `Setting user: Empi_Secret`,
    `path /Users/${user}/Library/x and C:/Users/${user}/Documents/y`,
    `"accessToken":"abcdef0123456789abcdef","refreshToken":"zzzzzz-yyyy-xxxx"`,
    `Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789`,
    `contacto: persona@example.com`,
    `session key ${'A1b2C3d4E5'.repeat(6)} fin`,
    `Minecraft 1.21.11 loaded 214 mods in 8.4 s`
].join('\n')
const out = redact(raw, { userName: user, extra: ['Empi_Secret'] })
check('the access token is gone, in arguments and in JSON', !out.includes(JWT) && !out.includes('abcdef0123456789abcdef') && !out.includes('zzzzzz-yyyy-xxxx') && !/Bearer abcdefgh/.test(out))
check('the name and the id of the player are gone', !out.includes('Empi_Secret') && !out.includes('12345678123412341234123456789abc'))
check('the user name inside every kind of path is gone', !out.includes(user) && out.includes('C:\\Users\\<usuario>\\AppData') && out.includes('/Users/<usuario>/Library') && out.includes('C:/Users/<usuario>/Documents'))
check('e-mails and long opaque keys are gone', !out.includes('persona@example.com') && !out.includes('A1b2C3d4E5'.repeat(6)))
check('what helps to diagnose is kept', out.includes('-Xmx4G') && out.includes('--version 1.21.11') && out.includes('loaded 214 mods in 8.4 s'))

// ---- part 2: the engine ----------------------------------------------------------------------------------------------------------
const ID = 'Pack-1.21.11'
const put = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.alloc(bytes, 1)) }
const engine = await startEngine({
    label: 'report',
    env: { EMPI_ENGINE_TEST: '1' },
    prepare: ({ userDir, dataDir }) => {
        fs.mkdirSync(userDir, { recursive: true })
        const account = { type: 'microsoft', accessToken: 'tok', username: 'Empi_Secret', uuid: 'aaaaaaaabbbbccccddddeeeeeeeeeeee', displayName: 'Empi_Secret', expiresAt: 32503680000000, microsoft: { access_token: 'x', refresh_token: 'y', expires_at: 32503680000000 } }
        fs.writeFileSync(path.join(userDir, 'config.json'), JSON.stringify({ selectedAccount: account.uuid, authenticationDatabase: { [account.uuid]: account } }))
        const dir = path.join(dataDir, 'instances', ID)
        put(path.join(dir, 'mods', 'sodium-0.6.jar'), 100)
        put(path.join(dir, 'mods', 'iris-1.8.jar'), 100)
        put(path.join(dir, 'mods', 'lithium.jar.disabled'), 100)
        put(path.join(dir, 'saves', 'Mundo', 'level.dat'), 5000)
        put(path.join(dir, 'screenshots', 'a.png'), 3000)
        put(path.join(dir, 'config', 'x.json'), 500)
        put(path.join(dir, '.empilauncher', 'pack-state.json'), 50)
        fs.mkdirSync(path.join(dir, 'logs'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'logs', 'latest.log'), `[12:00:01] Setting user: Empi_Secret\n[12:00:02] --accessToken ${JWT}\n[12:00:03] Exception in thread main at C:\\Users\\${os.userInfo().username}\\x`)
        fs.mkdirSync(path.join(dir, 'crash-reports'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'crash-reports', 'crash-2026-09-20_12.00.00-client.txt'), '---- Minecraft Crash Report ----\nDescription: Exception ticking world\n')
    }
})
try {
    const built = await engine.call('report.build', { serverId: ID })
    const text = built.result && built.result.text
    check('the report lists the mods, the crash report and the log', built.ok && /sodium-0.6.jar/.test(text) && /lithium.jar.disabled/.test(text) && /Exception ticking world/.test(text) && /Setting user/.test(text), built.error ? JSON.stringify(built.error) : '')
    check('and hides the token, the player and the user name of this PC', !text.includes(JWT) && !text.includes('Empi_Secret') && !text.includes(os.userInfo().username + '\\'))
    check('it says the kind of account, never the name', /Tipo de cuenta: microsoft/.test(text))

    const preview = await engine.call('pack.uninstall.preview', { id: ID })
    check('the preview says what would be freed and what stays', preview.ok && preview.result.installed && preview.result.savesBytes === 5000 && preview.result.screenshotsBytes === 3000 && preview.result.gameBytes > 300, JSON.stringify(preview.result))
    const traversal = await engine.call('pack.uninstall', { id: '..\\..\\Windows' })
    const empty = await engine.call('pack.uninstall', { id: '' })
    check('a name that leaves the instances folder is refused', traversal.ok === false && traversal.error.code === 'bad_id' && empty.ok === false)

    const kept = await engine.call('pack.uninstall', { id: ID })
    const dir = path.join(engine.root, 'data', 'instances', ID)
    check('uninstalling removes the game files and keeps worlds and screenshots', kept.ok && kept.result.freedBytes > 300 && !fs.existsSync(path.join(dir, 'mods')) && !fs.existsSync(path.join(dir, '.empilauncher')) && fs.existsSync(path.join(dir, 'saves', 'Mundo', 'level.dat')) && fs.existsSync(path.join(dir, 'screenshots', 'a.png')), JSON.stringify(kept.result ?? kept.error))
    const again = await engine.call('pack.uninstall', { id: ID, includePersonal: true })
    check('and with the box ticked it removes those too', again.ok && !fs.existsSync(dir))
    const missing = await engine.call('pack.uninstall.preview', { id: ID })
    check('a modpack that is not installed says so', missing.ok && missing.result.installed === false)
} finally {
    await engine.stop()
}
