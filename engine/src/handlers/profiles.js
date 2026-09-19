/**
 * Choosing the profile of a modpack that has several (see lib/profiles.js for what a profile is).
 *
 *   profile.select { serverId, profileId } -> { changed, serverId, profileId, pack, distribution }
 *
 * The choice takes effect at once: the distribution the rest of the engine works with is rebuilt for the chosen profile, so the pack
 * status right after says whether the installation has to be updated to it (the UI then runs the normal update). What the player set
 * up for the profile they leave (their memory, the optional mods they switched) is kept and comes back when they return to it.
 */
const { EngineError } = require('../ipc/server')
const { ensureCore } = require('./core')
const { describeDistribution } = require('./distro')
const profilesLib = require('../lib/profiles')
const { onDistroLoaded, mergeModConfiguration } = require('../lib/distrosync')

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)))

function register(handlers, state) {
    /** What the player has now for a modpack, to keep it for the profile they are about to leave. */
    function snapshot(ConfigManager, serverId, profile) {
        let ram = null
        try { ram = { min: ConfigManager.getMinRAM(serverId), max: ConfigManager.getMaxRAM(serverId), author: profile.ram ?? null } } catch { /* no Java settings yet */ }
        const configuration = ConfigManager.getModConfiguration(serverId)
        return { ram, mods: configuration ? clone(configuration.mods) : null }
    }

    /** Puts back what the player had set for the profile they return to (memory only while the author has not changed that profile's own). */
    function restore(ConfigManager, serverId, profile, kept) {
        if (!kept) return
        if (kept.ram && same(kept.ram.author, profile.ram ?? null)) {
            ConfigManager.setMinRAM(serverId, kept.ram.min)
            ConfigManager.setMaxRAM(serverId, kept.ram.max)
        }
        const configuration = ConfigManager.getModConfiguration(serverId)
        if (kept.mods && configuration) {
            for (const key of Object.keys(configuration.mods)) {
                if (kept.mods[key] != null) configuration.mods[key] = mergeModConfiguration(kept.mods[key], configuration.mods[key])
            }
        }
    }

    handlers.set('profile.select', async ({ serverId, profileId } = {}) => {
        const { ConfigManager, DistroAPI } = ensureCore(state)
        if (state.game && state.game.phase !== 'idle') throw new EngineError('busy', 'No se puede cambiar de perfil mientras hay una operación o el juego en marcha.')

        await DistroAPI.getDistribution()
        const pristine = state.profiles.pristine
        const published = pristine && Array.isArray(pristine.servers) ? pristine.servers.find((server) => server.id === serverId) : null
        if (!profilesLib.hasProfiles(published)) throw new EngineError('no_profiles', `El modpack ${serverId} no tiene perfiles.`)
        const target = published.profiles.list.find((profile) => profile.id === profileId)
        if (!target) throw new EngineError('no_profile', `El modpack ${serverId} no tiene un perfil "${profileId}".`)

        const directory = ConfigManager.getLauncherDirectory()
        const stored = profilesLib.readState(directory)
        const leaving = profilesLib.chosenProfile(published, stored.selected[serverId])
        const describe = () => describeDistribution(ConfigManager, DistroAPI['distribution'])

        if (leaving.id === target.id) {
            return { changed: false, serverId, profileId, pack: await handlers.get('pack.status')({ id: serverId }), distribution: describe() }
        }

        stored.stash[serverId] = { ...(stored.stash[serverId] || {}), [leaving.id]: snapshot(ConfigManager, serverId, leaving) }
        stored.selected[serverId] = target.id

        const effective = profilesLib.effectiveDistribution(pristine, stored.selected)
        const { HeliosDistribution } = require('helios-core/common')
        DistroAPI['rawDistribution'] = effective
        DistroAPI['distribution'] = new HeliosDistribution(effective, DistroAPI['commonDir'], DistroAPI['instanceDir'])
        onDistroLoaded(ConfigManager, DistroAPI['distribution'])
        restore(ConfigManager, serverId, target, stored.stash[serverId][target.id])
        ConfigManager.save()
        profilesLib.writeState(directory, stored)

        const pack = await handlers.get('pack.status')({ id: serverId })
        const distribution = describe()
        if (state.ipc && ConfigManager.getSelectedServer() === serverId) {
            state.ipc.broadcast('pack.status', pack)
            state.ipc.broadcast('distro.refreshed', distribution)
        }
        return { changed: true, serverId, profileId: target.id, pack, distribution }
    })

    // Test hook (engine/test/profiles.mjs): which modules the engine now considers part of a modpack.
    if (process.env.EMPI_ENGINE_TEST === '1') {
        handlers.set('test.effectiveModules', async ({ serverId }) => {
            const { DistroAPI } = ensureCore(state)
            const distro = await DistroAPI.getDistribution()
            const server = distro.getServerById(serverId)
            return { ids: server.rawServer.modules.map((module) => module.id), javaOptions: server.rawServer.javaOptions || null }
        })
    }
}

module.exports = { register }
