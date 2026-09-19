/**
 * Accounts: sign in, sign out, keep the session valid.
 *
 * The Microsoft sign-in window is the classic launcher's working flow, run by a helper that exists only while it is open
 * (lib/authhelper.js). The engine then exchanges the one-time code with the classic AuthManager (helios-core MicrosoftAuth)
 * and stores the tokens in ConfigManager. Tokens never cross the pipe: the UI only ever sees names and ids.
 */
const path = require('path')
const { ensureCore, accountsView } = require('./core')
const { EngineError } = require('../ipc/server')
const { runAuthHelper } = require('../lib/authhelper')
const offline = require('../lib/offline')

/**
 * Is there a network at all? Any answer from Microsoft (even an error page) means yes; only a failure to connect means no.
 * Used so that having no internet is never mistaken for "this account's session is no good".
 */
async function hasNetwork() {
    if (process.env.EMPI_ENGINE_TEST === '1' && process.env.EMPI_FORCE_OFFLINE === '1') return false
    try {
        await fetch('https://login.microsoftonline.com/', { method: 'HEAD', signal: AbortSignal.timeout(4000) })
        return true
    } catch { return false }
}

function register(handlers, state) {
    const auth = { helper: null, busy: false }
    const authManager = () => require(path.join(state.appJs, 'authmanager'))
    const { AZURE_CLIENT_ID } = require(path.join(state.appJs, 'ipcconstants'))
    const emit = (event, data) => { if (state.ipc) state.ipc.broadcast(event, data) }
    const sessionDir = () => path.join(ensureCore(state).ConfigManager.getLauncherDirectory(), 'login-session')

    /** AuthManager rejects with { title, desc } for the errors a player should read. */
    function toEngineError(err) {
        const { isDisplayableError } = require('helios-core/common')
        if (isDisplayableError(err)) {
            const error = new EngineError('auth_failed', err.desc)
            error.title = err.title
            return error
        }
        state.log.error('Unhandled error during authentication.', err)
        const error = new EngineError('auth_failed', 'Ocurrió un error inesperado al iniciar sesión. Inténtalo de nuevo.')
        error.title = 'Error al iniciar sesión'
        return error
    }

    async function withHelper(mode, fn) {
        if (auth.busy) throw new EngineError('busy', 'the sign-in window is already open')
        auth.busy = true
        state.keepAlive.add('auth')
        try { return await fn() } finally { auth.busy = false; auth.helper = null; state.keepAlive.delete('auth') }
    }

    handlers.set('auth.microsoft.login', async () => withHelper('login', async () => {
        const { ConfigManager } = ensureCore(state)
        emit('auth.progress', { stage: 'window' })
        const result = await runAuthHelper('login', {
            electron: state.electron, userDataDir: sessionDir(), clientId: AZURE_CLIENT_ID, onStart: (child) => { auth.helper = child }
        })
        if (result.type !== 'result') throw new EngineError('cancelled', 'Cancelaste el inicio de sesión.')

        // Microsoft answered with an error instead of a code (usually a misconfigured app registration).
        if (Object.prototype.hasOwnProperty.call(result.query, 'error')) {
            const error = new EngineError('auth_failed', result.query.error_description || result.query.error)
            error.title = result.query.error
            throw error
        }

        emit('auth.progress', { stage: 'exchange' })
        try {
            await authManager().addMicrosoftAccount(result.query.code)
        } catch (err) {
            throw toEngineError(err)
        }
        // The account just added is the one that plays now, not an offline player chosen earlier.
        offline.setActive(ConfigManager.getLauncherDirectory(), false)
        return accountsView(ConfigManager)
    }))

    /** Signs an account out: Microsoft accounts clear the browser session in the helper window first, like the classic launcher. */
    handlers.set('account.remove', async ({ uuid }) => {
        const { ConfigManager } = ensureCore(state)
        const dir = ConfigManager.getLauncherDirectory()
        const saved = offline.read(dir)
        if (saved && offline.profile(saved.name).uuid === uuid) {
            // Nothing to sign out of: the offline player only exists in this launcher.
            offline.clear(dir)
            return accountsView(ConfigManager)
        }
        const account = ConfigManager.getAuthAccount(uuid)
        if (!account) throw new EngineError('no_account', 'that account is not saved')

        if (account.type === 'microsoft') {
            await withHelper('logout', async () => {
                emit('auth.progress', { stage: 'logout' })
                const result = await runAuthHelper('logout', { electron: state.electron, userDataDir: sessionDir(), onStart: (child) => { auth.helper = child } })
                if (result.type !== 'loggedout') throw new EngineError('cancelled', 'Cancelaste el cierre de sesión.')
            })
            await authManager().removeMicrosoftAccount(uuid)
        } else {
            try { await authManager().removeMojangAccount(uuid) } catch (err) { throw toEngineError(err) }
        }
        return accountsView(ConfigManager)
    })

    /** Closes the sign-in window if it is open (the UI's cancel button). */
    handlers.set('auth.cancel', async () => {
        if (auth.helper) { try { auth.helper.kill() } catch { /* already gone */ } }
        return { cancelled: auth.helper != null }
    })

    /**
     * Checks the selected account against Microsoft and refreshes its tokens when they expired, like the classic startup.
     * If the session cannot be renewed the account is removed, as the classic launcher does, and the UI asks to sign in again.
     */
    handlers.set('auth.validate', async () => {
        const { ConfigManager } = ensureCore(state)
        const saved = offline.read(ConfigManager.getLauncherDirectory())
        if (saved && saved.active) return { valid: true, offline: true }   // no session to renew
        const selected = ConfigManager.getSelectedAccount()
        if (!selected) return { valid: false, none: true }
        // Without a network the session cannot be renewed, and that says nothing about the account: keep it, it is renewed next time.
        if (!(await hasNetwork())) return { valid: true, skipped: 'offline', accounts: accountsView(ConfigManager) }
        let valid = false
        try { valid = await authManager().validateSelected() } catch (err) { state.log.warn('Unable to validate the selected account.', err) }
        if (valid) return { valid: true, accounts: accountsView(ConfigManager) }

        ConfigManager.removeAuthAccount(selected.uuid)
        ConfigManager.save()
        return { valid: false, removed: selected.displayName, accounts: accountsView(ConfigManager) }
    })
}

module.exports = { register }
