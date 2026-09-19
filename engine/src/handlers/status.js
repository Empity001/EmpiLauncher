/**
 * Server status (players online). Same query as the classic launcher: Minecraft's status ping, protocol 47, two attempts.
 */
const { getServerStatus } = require('helios-core/mojang')
const { ensureCore } = require('./core')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function register(handlers, state) {
    handlers.set('server.status', async ({ id } = {}) => {
        const { ConfigManager, DistroAPI } = ensureCore(state)
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(id || ConfigManager.getSelectedServer())
        if (!server) return { online: false }
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const status = await getServerStatus(47, server.hostname, server.port)
                return { online: true, players: { online: status.players.online, max: status.players.max } }
            } catch (err) {
                if (attempt === 0) await wait(650)
                else state.log.debug('Server status unavailable, assuming offline.', err)
            }
        }
        return { online: false }
    })
}

module.exports = { register }
