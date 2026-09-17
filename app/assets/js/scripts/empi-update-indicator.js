/**
 * EmpiLauncher update indicator.
 *
 * Keeps launcher updates visible without bringing back the old corner logo.
 * The updater itself remains managed by index.js and electron-updater.
 */
(() => {
    'use strict'

    const { ipcRenderer } = require('electron')

    const GREEN = '#48dc35'
    let currentState = 'hidden'
    let currentVersion = ''
    let lastRenderedDownloadPercent = -1

    const byId = (id) => document.getElementById(id)

    function elements(){
        return {
            container: byId('empiUpdateMediaContainer'),
            button: byId('empiUpdateMediaButton'),
            percent: byId('empiUpdatePercent'),
            badge: byId('empiUpdateBadge'),
            tooltip: byId('empiUpdateTooltip'),
            notice: byId('empiUpdateReadyNotice'),
            noticeTitle: byId('empiUpdateReadyTitle'),
            noticeDescription: byId('empiUpdateReadyDescription'),
            installButton: byId('empiUpdateInstallButton')
        }
    }

    function clampPercent(value){
        const number = Number(value)
        if(!Number.isFinite(number)) return 0
        return Math.max(0, Math.min(100, number))
    }

    function formatBytes(value){
        const bytes = Number(value)
        if(!Number.isFinite(bytes) || bytes <= 0) return ''
        const units = ['B', 'KB', 'MB', 'GB']
        let unit = 0
        let amount = bytes
        while(amount >= 1024 && unit < units.length - 1){
            amount /= 1024
            unit++
        }
        return `${amount >= 100 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`
    }

    function setVisible(container, visible){
        if(!container) return
        container.setAttribute('aria-hidden', visible ? 'false' : 'true')
        container.toggleAttribute('visible', visible)
    }

    function setNoticeVisible(notice, visible){
        if(!notice) return
        notice.setAttribute('aria-hidden', visible ? 'false' : 'true')
        notice.toggleAttribute('visible', visible)
    }

    function setState(state, data = {}){
        const el = elements()
        if(!el.container || !el.button) return

        currentState = state
        el.container.dataset.state = state
        el.button.dataset.state = state

        const visible = state !== 'hidden'
        setVisible(el.container, visible)

        const progress = clampPercent(data.percent)
        const roundedProgress = Math.round(progress)
        if(state !== 'downloading' || roundedProgress !== lastRenderedDownloadPercent){
            el.button.style.setProperty('--empi-update-progress', `${roundedProgress}`)
            lastRenderedDownloadPercent = state === 'downloading' ? roundedProgress : -1
        }
        el.button.style.setProperty('--empi-update-color', GREEN)

        if(el.percent){
            el.percent.textContent = state === 'downloading' ? `${roundedProgress}%` : ''
            el.percent.setAttribute('aria-hidden', state === 'downloading' ? 'false' : 'true')
        }

        if(el.badge){
            el.badge.textContent = state === 'ready' ? 'ACTUALIZAR' : ''
        }

        let label = 'Actualización del launcher'
        let tooltip = 'Actualización del launcher'

        switch(state){
            case 'checking':
                label = 'Buscando actualizaciones'
                tooltip = 'Buscando actualizaciones…'
                setNoticeVisible(el.notice, false)
                break
            case 'available':
                label = currentVersion ? `EmpiLauncher ${currentVersion} disponible` : 'Nueva actualización disponible'
                tooltip = label
                setNoticeVisible(el.notice, false)
                break
            case 'downloading': {
                const downloaded = formatBytes(data.transferred)
                const total = formatBytes(data.total)
                label = `Descargando actualización: ${roundedProgress}%`
                tooltip = downloaded && total
                    ? `${label} · ${downloaded} de ${total}`
                    : label
                setNoticeVisible(el.notice, false)
                break
            }
            case 'ready':
                label = currentVersion ? `EmpiLauncher ${currentVersion} listo para instalar` : 'Actualización lista para instalar'
                tooltip = 'Reiniciar y actualizar'
                setNoticeVisible(el.notice, true)
                if(el.noticeTitle){
                    el.noticeTitle.textContent = currentVersion
                        ? `EmpiLauncher ${currentVersion} está preparado.`
                        : 'Una nueva versión de EmpiLauncher está preparada.'
                }
                if(el.noticeDescription){
                    el.noticeDescription.textContent = 'Reinicia el launcher para terminar la instalación.'
                }
                break
            default:
                setNoticeVisible(el.notice, false)
                break
        }

        el.button.setAttribute('aria-label', label)
        el.button.title = tooltip
        if(el.tooltip) el.tooltip.textContent = tooltip
    }

    function openUpdateSettings(){
        try {
            if(
                typeof switchView === 'function' &&
                typeof getCurrentView === 'function' &&
                typeof VIEWS !== 'undefined' &&
                typeof settingsNavItemListener === 'function'
            ){
                switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
                    const updateNav = byId('settingsNavUpdate')
                    if(updateNav) settingsNavItemListener(updateNav, false)
                })
                return
            }
        } catch(error){
            console.warn('No se pudo abrir Actualizaciones directamente.', error)
        }

        const settingsButton = byId('settingsMediaButton')
        if(settingsButton){
            settingsButton.click()
            setTimeout(() => {
                const updateNav = byId('settingsNavUpdate')
                if(updateNav) updateNav.click()
            }, 650)
        }
    }

    function installUpdate(){
        ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
    }

    function bindActions(){
        const el = elements()
        if(el.button && !el.button.dataset.empiUpdateBound){
            el.button.dataset.empiUpdateBound = 'true'
            el.button.addEventListener('click', () => {
                if(currentState === 'ready'){
                    installUpdate()
                } else {
                    openUpdateSettings()
                }
            })
        }

        if(el.installButton && !el.installButton.dataset.empiUpdateBound){
            el.installButton.dataset.empiUpdateBound = 'true'
            el.installButton.addEventListener('click', installUpdate)
        }
    }

    function handleUpdaterEvent(arg, info){
        switch(arg){
            case 'checking-for-update':
                setState('checking')
                break
            case 'update-available':
                currentVersion = info?.version || currentVersion
                setState('available')
                break
            case 'update-downloaded':
                currentVersion = info?.version || currentVersion
                setState('ready')
                break
            case 'update-not-available':
                setState('hidden')
                break
            case 'realerror':
                setState('hidden')
                break
            default:
                break
        }
    }

    bindActions()
    setState('hidden')

    ipcRenderer.on('autoUpdateNotification', (_event, arg, info) => {
        handleUpdaterEvent(arg, info)
    })

    ipcRenderer.on('empiUpdateDownloadProgress', (_event, progress) => {
        setState('downloading', progress || {})
    })

    // Small manual preview helpers for development. They do not download or install anything.
    window.EmpiUpdatePreview = {
        checking: () => setState('checking'),
        available: (version = '2.2.3') => {
            currentVersion = version
            setState('available')
        },
        downloading: (percent = 45) => setState('downloading', { percent }),
        ready: (version = '2.2.3') => {
            currentVersion = version
            setState('ready')
        },
        hide: () => setState('hidden')
    }
})()
