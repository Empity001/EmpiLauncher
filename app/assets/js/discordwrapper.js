const { LoggerUtil } = require('helios-core')
const isDiscordRenderer = process.type === 'renderer'
const discordIpcRenderer = isDiscordRenderer ? require('electron').ipcRenderer : null
const { Client } = isDiscordRenderer ? { Client: null } : require('discord-rpc-patch')

const logger = LoggerUtil.getLogger('DiscordWrapper')

let client = null
let ready = false
let currentClientId = null
let pendingActivity = null
let lastActivitySignature = null
let launcherSettings = null
let reconnectTimer = null
let connecting = false

const launcherStartedAt = Date.now()
const RECONNECT_DELAY = 15000
const MAX_RECONNECT_DELAY = 60000
let reconnectDelay = RECONNECT_DELAY

function compactActivity(value){
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry != null && entry !== ''))
}

function trimText(value, fallback = '', max = 128){
    const text = String(value ?? fallback).trim()
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
}

function getRawServer(server){
    return server?.rawServer || server || null
}

function getSerializableServer(server){
    const raw = getRawServer(server)
    if(raw == null){
        return null
    }
    return {
        rawServer: {
            id: raw.id,
            name: raw.name,
            minecraftVersion: raw.minecraftVersion,
            icon: raw.icon,
            discord: raw.discord == null
                ? null
                : JSON.parse(JSON.stringify(raw.discord))
        }
    }
}

function sendRendererDiscordAction(action, settings, server, extra = null){
    const serializableSettings = settings == null
        ? null
        : JSON.parse(JSON.stringify(settings))
    discordIpcRenderer.send('discord-presence-action', action, {
        settings: serializableSettings,
        server: getSerializableServer(server),
        extra
    })
}

function getVersionLabel(server){
    const raw = getRawServer(server)
    if(raw == null){
        return 'Sin versión seleccionada'
    }

    const name = raw.name || raw.id || 'Versión desconocida'
    return raw.minecraftVersion
        ? `${name} • Minecraft ${raw.minecraftVersion}`
        : name
}

function normalizeImageReference(value){
    const reference = String(value ?? '').trim()
    if(reference === ''){
        return null
    }

    // Discord can load a public HTTP(S) image directly. Asset keys from the
    // Developer Portal remain supported for backwards compatibility.
    if(/^https?:\/\//i.test(reference)){
        try {
            const url = new URL(reference)
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
        } catch(_error){
            return null
        }
    }

    // Local paths and file:// URLs cannot be fetched by Discord. Treat any
    // other simple value as a traditional uploaded asset key.
    if(/^file:/i.test(reference) || /^[a-zA-Z]:[\\/]/.test(reference)){
        return null
    }

    return reference
}

function firstImageReference(...values){
    for(const value of values){
        const reference = normalizeImageReference(value)
        if(reference != null){
            return reference
        }
    }
    return null
}

function getLauncherImage(settings){
    return firstImageReference(
        settings?.launcherImageUrl,
        settings?.imageUrl,
        settings?.largeImageUrl,
        settings?.launcherImageKey,
        settings?.largeImageKey,
        settings?.smallImageKey
    )
}

function getLauncherImageText(settings){
    return settings?.launcherImageText
        || settings?.largeImageText
        || settings?.smallImageText
        || 'Empi Launcher'
}

function getServerImage(server, settings){
    const raw = getRawServer(server)
    return firstImageReference(
        raw?.discord?.largeImageUrl,
        raw?.discord?.imageUrl,
        raw?.discord?.largeImageKey,
        // Every Empi pack already publishes an icon URL. This allows the
        // launcher to use each version image without uploading it again to
        // Discord's Developer Portal.
        raw?.icon,
        getLauncherImage(settings)
    )
}

function getServerImageText(server){
    const raw = getRawServer(server)
    return raw?.discord?.largeImageText || raw?.name || raw?.id || 'Minecraft'
}

function activitySignature(activity){
    return JSON.stringify(activity)
}

function hasImageFields(activity){
    return activity.largeImageKey != null || activity.smallImageKey != null
}

function withoutImages(activity){
    const fallback = { ...activity }
    delete fallback.largeImageKey
    delete fallback.largeImageText
    delete fallback.smallImageKey
    delete fallback.smallImageText
    return fallback
}

async function sendActivity(activity, signature){
    try {
        await client.setActivity(activity)
        lastActivitySignature = signature
        logger.debug('Discord Rich Presence updated.')
        return
    } catch(error){
        // A wrong asset key used to make the complete presence disappear.
        // Retry without artwork so the text and timer still work.
        if(hasImageFields(activity)){
            logger.warn(`Discord rejected a Rich Presence image. Retrying without artwork: ${error.message}`)
            try {
                await client.setActivity(withoutImages(activity))
                lastActivitySignature = signature
                return
            } catch(fallbackError){
                logger.warn(`Unable to update Discord Rich Presence: ${fallbackError.message}`)
            }
        } else {
            logger.warn(`Unable to update Discord Rich Presence: ${error.message}`)
        }
        lastActivitySignature = null
    }
}

function publishActivity(activity){
    const next = compactActivity(activity)
    const signature = activitySignature(next)

    pendingActivity = next
    if(signature === lastActivitySignature){
        return
    }

    if(client == null || !ready){
        return
    }

    sendActivity(next, signature).catch(error => {
        lastActivitySignature = null
        logger.warn(`Unable to update Discord Rich Presence: ${error.message}`)
    })
}

function clearReconnectTimer(){
    if(reconnectTimer != null){
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
}

function scheduleReconnect(){
    if(reconnectTimer != null || launcherSettings?.clientId == null){
        return
    }

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        ensureClient(launcherSettings)
    }, reconnectDelay)
    reconnectDelay = Math.min(MAX_RECONNECT_DELAY, reconnectDelay * 2)
}

async function closeDiscordClient(oldClient, clearPresence){
    if(clearPresence){
        try {
            await oldClient.clearActivity()
        } catch(_error){
            // Discord may already be closed.
        }
    }

    try {
        await oldClient.destroy()
    } catch(_error){
        // Client may already be destroyed.
    }
}

function disposeClient(preserveSettings = false){
    const oldClient = client
    const clearPresence = ready
    client = null
    ready = false
    connecting = false
    currentClientId = null
    lastActivitySignature = null

    if(oldClient != null){
        // Both operations can reject asynchronously after the IPC transport
        // disappears. Awaiting them in a guarded task prevents unhandled
        // promise errors without delaying navigation or shutdown.
        closeDiscordClient(oldClient, clearPresence).catch(() => {})
    }

    if(!preserveSettings){
        launcherSettings = null
        reconnectDelay = RECONNECT_DELAY
        clearReconnectTimer()
    }
}

function ensureClient(settings){
    const clientId = String(settings?.clientId ?? '').trim()
    if(clientId === ''){
        logger.warn('Discord Rich Presence is disabled: discord.clientId is missing from distribution.json.')
        return false
    }

    launcherSettings = settings

    if(client != null && currentClientId === clientId){
        return true
    }

    clearReconnectTimer()
    disposeClient(true)

    currentClientId = clientId
    connecting = true
    client = new Client({ transport: 'ipc' })
    const activeClient = client

    activeClient.on('ready', () => {
        if(client !== activeClient){
            return
        }
        connecting = false
        ready = true
        reconnectDelay = RECONNECT_DELAY
        clearReconnectTimer()
        logger.info(`Discord RPC Connected (Application ID: ${currentClientId})`)
        if(pendingActivity != null){
            lastActivitySignature = null
            publishActivity(pendingActivity)
        }
    })

    activeClient.on('disconnected', () => {
        if(client !== activeClient){
            return
        }
        logger.info('Discord RPC disconnected. It will retry automatically.')
        disposeClient(true)
        scheduleReconnect()
    })

    activeClient.login({ clientId }).catch(error => {
        if(client !== activeClient){
            return
        }
        if(error.message.includes('ENOENT')){
            logger.info('Discord Rich Presence is waiting for the Discord desktop app.')
        } else {
            logger.warn(`Unable to initialize Discord Rich Presence: ${error.message}`)
        }
        disposeClient(true)
        scheduleReconnect()
    })

    return true
}

exports.setNavigationPresence = function(settings, server){
    if(isDiscordRenderer){
        launcherSettings = settings
        sendRendererDiscordAction('navigation', settings, server)
        return String(settings?.clientId ?? '').trim() !== ''
    }
    if(!ensureClient(settings)){
        return false
    }

    const launcherImage = getLauncherImage(settings)

    publishActivity({
        details: 'Navegando...',
        state: trimText(getVersionLabel(server)),
        // When no image URL/key is supplied, Discord falls back to the
        // application's icon from General Information.
        largeImageKey: launcherImage,
        largeImageText: launcherImage ? trimText(getLauncherImageText(settings)) : null,
        startTimestamp: launcherStartedAt,
        instance: false
    })

    return true
}

exports.setPlayingPresence = function(settings, server){
    if(isDiscordRenderer){
        launcherSettings = settings
        sendRendererDiscordAction('playing', settings, server)
        return String(settings?.clientId ?? '').trim() !== ''
    }
    if(!ensureClient(settings)){
        return false
    }

    const largeImage = getServerImage(server, settings)
    const launcherImage = getLauncherImage(settings)

    publishActivity({
        details: 'Jugando',
        state: trimText(getVersionLabel(server)),
        largeImageKey: largeImage,
        largeImageText: largeImage ? trimText(getServerImageText(server)) : null,
        smallImageKey: launcherImage && launcherImage !== largeImage ? launcherImage : null,
        smallImageText: launcherImage && launcherImage !== largeImage
            ? trimText(getLauncherImageText(settings))
            : null,
        startTimestamp: Date.now(),
        instance: false
    })

    return true
}

// Backwards-compatible entry point for older launcher code.
exports.initRPC = function(settings, serverSettings, initialDetails){
    if(isDiscordRenderer){
        launcherSettings = settings
        discordIpcRenderer.send('discord-presence-action', 'legacy', {
            settings: settings == null ? null : JSON.parse(JSON.stringify(settings)),
            serverSettings: serverSettings == null ? null : JSON.parse(JSON.stringify(serverSettings)),
            initialDetails
        })
        return String(settings?.clientId ?? '').trim() !== ''
    }
    if(!ensureClient(settings)){
        return false
    }

    if(serverSettings != null){
        publishActivity({
            details: initialDetails || 'Jugando',
            state: trimText(serverSettings.shortId || 'Minecraft'),
            largeImageKey: firstImageReference(
                serverSettings.largeImageUrl,
                serverSettings.imageUrl,
                serverSettings.largeImageKey,
                getLauncherImage(settings)
            ),
            largeImageText: trimText(serverSettings.largeImageText || 'Minecraft'),
            smallImageKey: getLauncherImage(settings),
            smallImageText: trimText(getLauncherImageText(settings)),
            startTimestamp: Date.now(),
            instance: false
        })
    }

    return true
}

exports.updateDetails = function(details){
    if(isDiscordRenderer){
        discordIpcRenderer.send('discord-presence-action', 'details', {
            details
        })
        return
    }
    if(pendingActivity == null){
        return
    }
    publishActivity({
        ...pendingActivity,
        details: trimText(details)
    })
}

exports.shutdownRPC = function(){
    if(isDiscordRenderer){
        launcherSettings = null
        discordIpcRenderer.send('discord-presence-action', 'shutdown')
        return
    }
    pendingActivity = null
    disposeClient(false)
}

exports.isConfigured = function(){
    return launcherSettings?.clientId != null
}

exports.getStatus = function(){
    if(isDiscordRenderer){
        return discordIpcRenderer.sendSync('discord-presence-status')
    }
    return {
        configured: launcherSettings?.clientId != null,
        connecting,
        ready,
        clientId: currentClientId
    }
}
