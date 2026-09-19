// node native/build/test/migration.mjs
// The installer against a stand-in for the classic launcher, with nothing real involved: its own registry identity, its own
// shortcut names, its own folders, and small dummy programs (an NSIS exe that just sleeps) instead of the real launcher.
// What it proves, step by step, is what has to happen on a player's PC when the classic launcher updates into the native one:
//   1  the classic program is closed and uninstalled with the protocol electron-builder's uninstaller speaks
//   2  the native files land in the same folder, the registration is replaced, existing shortcuts survive
//   3  --force-run starts the new launcher; native -> native updates work through the same path
//   4  the uninstaller removes everything it installed (and only that) and stops what is running from there
//   5  a folder that is not called "Empi Launcher" gets that name appended, so an uninstall can never wipe someone's folder
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const installerScript = path.join(here, '..', 'installer.nsi')
const icon = path.join(here, '..', '..', '..', 'build', 'icon.ico')

let failed = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++ }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function findMakensis() {
    if (process.env.MAKENSIS && fs.existsSync(process.env.MAKENSIS)) return process.env.MAKENSIS
    const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'nsis')
    for (const dir of (fs.existsSync(cache) ? fs.readdirSync(cache) : []).filter((d) => d.startsWith('nsis-3')).sort().reverse()) {
        const candidate = path.join(cache, dir, 'makensis.exe')
        if (fs.existsSync(candidate)) return candidate
    }
    throw new Error('makensis.exe not found (set MAKENSIS)')
}
const makensis = findMakensis()

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim()
const desktop = ps("[Environment]::GetFolderPath('Desktop')")
const startMenu = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')

const id = crypto.randomBytes(4).toString('hex')
const GUID = `empi-test-${id}`
const SHORTCUT = `Empi Launcher TEST ${id}`
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-migration-'))
const installDir = path.join(root, 'Programs', 'Empi Launcher')
const userData = path.join(root, 'userdata')
fs.mkdirSync(userData, { recursive: true })
fs.writeFileSync(path.join(userData, 'config.json'), '{"accounts":"stay"}')
const uninstallLog = path.join(root, 'old-uninstaller-args.log')
// where the installer goes when it is pointed at a folder it cannot write to (the real one is in the person's profile: never used by a test)
const fallbackDir = path.join(root, 'Fallback', 'Empi Launcher')

const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}`
const installKey = `HKCU\\Software\\${GUID}`
function regValue(key, name) {
    try {
        const out = execFileSync('reg', ['query', key, '/v', name], { encoding: 'utf8' })
        const match = new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, 'm').exec(out)
        return match ? match[1].trim() : null
    } catch { return null }
}
const regExists = (key) => { try { execFileSync('reg', ['query', key], { stdio: 'ignore' }); return true } catch { return false } }

function nsis(script, defines) {
    const args = ['/V1', ...Object.entries(defines).map(([k, v]) => `/D${k}=${v}`), script]
    execFileSync(makensis, args, { stdio: 'pipe' })
}

// what runs from a folder (path filter, like the installer itself uses)
const runningFrom = (dir) => ps(`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${dir.replace(/'/g, "''")}\\', 'OrdinalIgnoreCase') } | ForEach-Object { $_.Name }`).split(/\r?\n/).filter(Boolean)
async function waitFor(predicate, ms = 20000) {
    const end = Date.now() + ms
    while (Date.now() < end) { if (predicate()) return true; await sleep(300) }
    return predicate()
}

const alive = (pid) => execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid))
const bystanders = []   // children the test started that it must clean up
function start(exe) {
    const child = spawn(exe, [], { stdio: 'ignore', detached: true, env: { ...process.env, EMPI_USER_DATA: userData } })
    child.on('error', () => {})   // a program that cannot start is reported by the checks, not by a crash that skips the clean-up
    child.unref()
    bystanders.push(child.pid)
    return child.pid
}

function cleanUp() {
    for (const pid of bystanders) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* gone */ } }
    for (const dir of [installDir, path.join(root, 'Games', 'Empi Launcher')]) {
        try { ps(`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${dir}\\', 'OrdinalIgnoreCase') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`) } catch { /* nothing */ }
    }
    for (const key of [uninstallKey, installKey]) { try { execFileSync('reg', ['delete', key, '/f'], { stdio: 'ignore' }) } catch { /* not there */ } }
    for (const file of [path.join(startMenu, `${SHORTCUT}.lnk`), path.join(desktop, `${SHORTCUT}.lnk`)]) fs.rmSync(file, { force: true })
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}

try {
    // ---- the dummies -------------------------------------------------------------------------------------------------
    const sleeperScript = path.join(root, 'sleeper.nsi')
    fs.writeFileSync(sleeperScript, 'Unicode true\nOutFile "${OUT}"\nSilentInstall silent\nRequestExecutionLevel user\nSection\n  Sleep 300000\nSectionEnd\n')
    const sleeper = path.join(root, 'sleeper.exe')
    nsis(sleeperScript, { OUT: sleeper })

    // the "classic launcher": installs into the folder, registers itself like electron-builder does, and its uninstaller records how it was called
    const oldScript = path.join(root, 'old.nsi')
    fs.writeFileSync(oldScript, [
        'Unicode true', 'OutFile "${OUT}"', 'InstallDir "$TEMP\\unused"', 'SilentInstall silent', 'RequestExecutionLevel user',
        'Section', '  SetOutPath "$INSTDIR"', '  File "/oname=Empi Launcher.exe" "${SLEEPER}"',
        '  CreateDirectory "$INSTDIR\\resources"', '  FileOpen $0 "$INSTDIR\\resources\\app.asar" w', '  FileWrite $0 "old"', '  FileClose $0',
        '  WriteUninstaller "$INSTDIR\\Uninstall Empi Launcher.exe"',
        '  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}" "DisplayName" "Empi Launcher 2.6.2"',
        '  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}" "DisplayVersion" "2.6.2"',
        '  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}" "UninstallString" \'"$INSTDIR\\Uninstall Empi Launcher.exe" /currentuser\'',
        '  WriteRegStr HKCU "Software\\${GUID}" "InstallLocation" "$INSTDIR"',
        '  CreateShortcut "$SMPROGRAMS\\${SHORTCUT}.lnk" "$INSTDIR\\Empi Launcher.exe"',
        'SectionEnd',
        'Section "Uninstall"',
        '  FileOpen $0 "${LOG}" a', '  FileSeek $0 0 END', '  FileWrite $0 "$CMDLINE|INSTDIR=$INSTDIR$\\r$\\n"', '  FileClose $0',
        '  Delete "$INSTDIR\\Empi Launcher.exe"', '  RMDir /r "$INSTDIR\\resources"', '  Delete "$SMPROGRAMS\\${SHORTCUT}.lnk"',
        '  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${GUID}"', '  DeleteRegKey HKCU "Software\\${GUID}"',
        'SectionEnd', ''
    ].join('\n'))
    const oldSetup = path.join(root, 'old-setup.exe')
    nsis(oldScript, { OUT: oldSetup, SLEEPER: sleeper, GUID, SHORTCUT, LOG: uninstallLog })

    // the "new" launcher: a stage with the same layout as the real one, but tiny
    const stage = path.join(root, 'stage')
    fs.mkdirSync(path.join(stage, 'runtime'), { recursive: true })
    fs.mkdirSync(path.join(stage, 'engine', 'src'), { recursive: true })
    fs.copyFileSync(sleeper, path.join(stage, 'Empi Launcher.exe'))
    fs.copyFileSync(sleeper, path.join(stage, 'runtime', 'electron.exe'))
    fs.writeFileSync(path.join(stage, 'engine', 'src', 'main.js'), '// engine')
    const build = (version) => {
        const out = path.join(root, `setup-${version}.exe`)
        nsis(installerScript, { VERSION: version, STAGE: stage, OUTFILE: out, APP_GUID: GUID, SHORTCUT_NAME: SHORTCUT, FALLBACK_DIR: fallbackDir, ICON: icon, ESTIMATED_KB: 1000 })
        return out
    }
    const setup300 = build('3.0.0')
    const setup301 = build('3.0.1')
    // NSIS wants /D=<folder> unquoted even with spaces in it, so the arguments go through exactly as written
const run = (exe, args) => execFileSync(exe, args, { windowsVerbatimArguments: true, stdio: 'ignore', env: { ...process.env, EMPI_USER_DATA: userData }, timeout: 120000 })

    // ---- 1: the classic launcher is installed and running -----------------------------------------------------------
    run(oldSetup, ['/S', `/D=${installDir}`])
    check('the stand-in classic launcher installed', fs.existsSync(path.join(installDir, 'Empi Launcher.exe')) && fs.existsSync(path.join(installDir, 'resources', 'app.asar')))
    check('it registered like electron-builder does', regValue(uninstallKey, 'DisplayVersion') === '2.6.2' && (regValue(uninstallKey, 'UninstallString') || '').includes('/currentuser'))
    check('and has its Start menu shortcut', fs.existsSync(path.join(startMenu, `${SHORTCUT}.lnk`)))
    const oldPid = start(path.join(installDir, 'Empi Launcher.exe'))
    await sleep(800)
    check('the classic launcher is running', alive(oldPid))

    // ---- 2 and 3: what electron-updater does when it finds the native release -----------------------------------------
    run(setup300, ['--updated', '/S', '--force-run'])   // no /D: the folder comes from the registration, as with electron-updater
    check('the classic launcher was closed', !alive(oldPid))
    check('its uninstaller ran with the electron-builder protocol', fs.existsSync(uninstallLog) && /\/S/.test(fs.readFileSync(uninstallLog, 'latin1')) && /KEEP_APP_DATA/.test(fs.readFileSync(uninstallLog, 'latin1')) && fs.readFileSync(uninstallLog, 'latin1').includes(`INSTDIR=${installDir}`), fs.existsSync(uninstallLog) ? fs.readFileSync(uninstallLog, 'latin1').trim() : 'no log')
    check('the classic files are gone', !fs.existsSync(path.join(installDir, 'resources', 'app.asar')))
    check('the native files are in the same folder', fs.existsSync(path.join(installDir, 'runtime', 'electron.exe')) && fs.existsSync(path.join(installDir, 'engine', 'src', 'main.js')) && fs.existsSync(path.join(installDir, 'Uninstall Empi Launcher.exe')))
    check('one entry in Apps, now the native version', regValue(uninstallKey, 'DisplayVersion') === '3.0.0' && regValue(uninstallKey, 'DisplayName') === 'Empi Launcher 3.0.0', regValue(uninstallKey, 'DisplayName'))
    check('the registered uninstaller is the native one', (regValue(uninstallKey, 'QuietUninstallString') || '').includes(`${installDir}\\Uninstall Empi Launcher.exe`))
    check('the Start menu shortcut was kept (and points at the new program)', fs.existsSync(path.join(startMenu, `${SHORTCUT}.lnk`)))
    check('no desktop shortcut appeared where there was none', !fs.existsSync(path.join(desktop, `${SHORTCUT}.lnk`)))
    check('--force-run started the new launcher', runningFrom(installDir).includes('Empi Launcher.exe'))
    check('the player\'s data was not touched', fs.readFileSync(path.join(userData, 'config.json'), 'utf8') === '{"accounts":"stay"}')

    // ---- native -> native: the engine (runtime\electron.exe) is running too and must be stopped ----------------------
    start(path.join(installDir, 'runtime', 'electron.exe'))
    await sleep(800)
    const before = runningFrom(installDir).length
    run(setup301, ['--updated', '/S', '--force-run'])
    check('a native update closed the launcher and its engine and started the launcher again', before >= 2 && runningFrom(installDir).length === 1 && runningFrom(installDir)[0] === 'Empi Launcher.exe', `${before} before, now ${runningFrom(installDir).join(',')}`)
    check('and the entry now says 3.0.1', regValue(uninstallKey, 'DisplayVersion') === '3.0.1')

    // ---- 4: uninstall ---------------------------------------------------------------------------------------------------
    const quiet = regValue(uninstallKey, 'QuietUninstallString')
    check('there is a quiet uninstall command', !!quiet)
    run(path.join(installDir, 'Uninstall Empi Launcher.exe'), ['/currentuser', '/S'])
    const gone = await waitFor(() => !fs.existsSync(path.join(installDir, 'Empi Launcher.exe')), 30000)
    check('the uninstaller removed the program', gone)
    check('and stopped what was running from there', await waitFor(() => runningFrom(installDir).length === 0, 10000))
    check('and its registration and shortcut', await waitFor(() => !regExists(uninstallKey) && !fs.existsSync(path.join(startMenu, `${SHORTCUT}.lnk`)), 10000))
    check('and left the player\'s data alone', fs.existsSync(path.join(userData, 'config.json')))

    // ---- 5: a fresh install into a folder that is not called "Empi Launcher" ------------------------------------------
    const games = path.join(root, 'Games')
    run(setup300, ['/S', `/D=${games}`])
    const appFolder = path.join(games, 'Empi Launcher')
    check('the app folder name is appended to a chosen folder', fs.existsSync(path.join(appFolder, 'Empi Launcher.exe')) && !fs.existsSync(path.join(games, 'Empi Launcher.exe')))
    check('a first install creates both shortcuts', fs.existsSync(path.join(startMenu, `${SHORTCUT}.lnk`)) && fs.existsSync(path.join(desktop, `${SHORTCUT}.lnk`)))
    check('and does not start the launcher unless told to', runningFrom(appFolder).length === 0)
    run(path.join(appFolder, 'Uninstall Empi Launcher.exe'), ['/currentuser', '/S'])
    check('and uninstalls cleanly', await waitFor(() => !fs.existsSync(path.join(appFolder, 'Empi Launcher.exe')) && !fs.existsSync(path.join(desktop, `${SHORTCUT}.lnk`)), 30000))

    // ---- 6: aimed at Program Files (where a classic launcher installed "for all users" lives) without being administrator ---------
    // The installer runs as the person: writing there fails on every file. It has to land in the per-user folder instead.
    const protectedDir = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Empi Launcher')
    const probe = path.join(path.dirname(protectedDir), `.empi-write-probe-${id}`)
    let elevated = false
    try { fs.writeFileSync(probe, 'x'); fs.rmSync(probe); elevated = true } catch { /* the normal case */ }
    if (elevated) {
        console.log('SKIP  installing into Program Files: this shell is administrator, so the folder is writable and there is nothing to fall back from')
    } else {
        run(setup300, ['/S', `/D=${protectedDir}`])
        check('an install aimed at Program Files lands in the per-user folder instead', fs.existsSync(path.join(fallbackDir, 'Empi Launcher.exe')) && fs.existsSync(path.join(fallbackDir, 'runtime', 'electron.exe')) && fs.existsSync(path.join(fallbackDir, 'Uninstall Empi Launcher.exe')))
        check('and nothing was written to Program Files', !fs.existsSync(protectedDir))
        check('it is registered where it really is', regValue(installKey, 'InstallLocation') === fallbackDir && (regValue(uninstallKey, 'QuietUninstallString') || '').includes(fallbackDir), regValue(installKey, 'InstallLocation'))
        check('and has its shortcuts', fs.existsSync(path.join(startMenu, `${SHORTCUT}.lnk`)) && fs.existsSync(path.join(desktop, `${SHORTCUT}.lnk`)))
        run(path.join(fallbackDir, 'Uninstall Empi Launcher.exe'), ['/currentuser', '/S'])
        check('and uninstalls cleanly', await waitFor(() => !fs.existsSync(path.join(fallbackDir, 'Empi Launcher.exe')), 30000))
    }
} catch (err) {
    check('the test itself ran', false, err.stack || String(err))
} finally {
    cleanUp()
}
process.exit(failed ? 1 : 0)
