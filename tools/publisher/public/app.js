/* Empi Publisher - vanilla JS, no build step. Talks to server.js (same origin). */

const $ = (selector) => document.querySelector(selector)

const CATEGORIES = [
    { id: 'required', title: 'Obligatorios', desc: 'Todos los jugadores los llevan.', icon: 'lock' },
    { id: 'optionalon', title: 'Opcionales · activados', desc: 'Vienen encendidos, se pueden apagar.', icon: 'toggleOn' },
    { id: 'optionaloff', title: 'Opcionales · apagados', desc: 'Vienen apagados, se pueden encender.', icon: 'toggleOff' }
]
const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }
const JAVA_CHOICES = [['', 'Automático'], ['8', 'Java 8'], ['17', 'Java 17'], ['21', 'Java 21'], ['25', 'Java 25']]

// One authored icon family: 24px grid, 1.75 stroke, round caps.
const ICONS = {
    sliders: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    toggleOn: '<rect width="20" height="12" x="2" y="6" rx="6"/><circle cx="16" cy="12" r="2"/>',
    toggleOff: '<rect width="20" height="12" x="2" y="6" rx="6"/><circle cx="8" cy="12" r="2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    folder: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    send: '<path d="M14.5 21.7a.5.5 0 0 0 .94-.02l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'
}

const state = {
    tab: 'packs',
    loaded: false,
    creating: false,
    packs: [],
    selectedId: null,
    pack: null,
    subtab: 'settings',
    draft: {},
    filter: '',
    protection: null,
    protectionOpen: new Set(),
    protectionFilter: '',
    visuals: null,
    packsStatus: { compiled: null, stale: false },
    launcher: null,
    launcherChoice: 'patch',
    notes: '',
    commitMessage: '',
    running: null,
    iconStamp: Date.now()
}

// ------------------------------------------------------------------ helpers

function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.5')
    svg.setAttribute('stroke-linecap', 'square')
    svg.setAttribute('stroke-linejoin', 'miter')
    svg.setAttribute('class', 'i')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = ICONS[name] // static, authored strings only
    return svg
}

/** Tiny hyperscript: h('div', { class: 'x', onclick }, 'text', child...) - text is never parsed as HTML. */
function h(tag, attrs, ...children) {
    const el = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs || {})) {
        if (value == null || value === false) continue
        if (key.startsWith('on')) el.addEventListener(key.slice(2), value)
        else if (key === 'class') el.className = value
        else if (key === 'value') el.value = value
        else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') el[key] = !!value
        else el.setAttribute(key, value === true ? '' : value)
    }
    for (const child of children.flat()) {
        if (child == null || child === false) continue
        el.append(child.nodeType ? child : document.createTextNode(String(child)))
    }
    return el
}

const withIcon = (name, label) => [icon(name), label]

/** Replays the 260 ms glitch on an element; used only when something happens (a step, a failure, a new selection). */
function tear(el) {
    if (!el) return
    el.classList.remove('tear')
    void el.offsetWidth
    el.classList.add('tear')
}

async function api(path, { method = 'GET', body, raw } = {}) {
    const res = await fetch(path, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || res.statusText)
    return data
}

let toastTimer
function toast(message, isError = false) {
    const el = $('#toast')
    el.textContent = message
    el.className = `toast${isError ? ' err' : ''}`
    el.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { el.hidden = true }, isError ? 6000 : 2600)
}

function formatSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function ago(iso) {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'hace un momento'
    if (minutes < 60) return `hace ${minutes} min`
    if (minutes < 60 * 24) return `hace ${Math.round(minutes / 60)} h`
    return `hace ${Math.round(minutes / 60 / 24)} d`
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function bumpVersion(version, kind) {
    const [major, minor, patch] = String(version).split('.').map((part) => Number(part) || 0)
    if (kind === 'minor') return `${major}.${minor + 1}.0`
    return `${major}.${minor}.${(patch || 0) + 1}`
}

const packIconUrl = (pack) => `/api/packs/${encodeURIComponent(pack.id)}/icon?t=${state.iconStamp}`

// Static markup carries `data-icon`; fill those in once.
for (const el of document.querySelectorAll('[data-icon]')) el.prepend(icon(el.dataset.icon))

// The footer's height changes with the viewport; keep content and toast clear of it.
new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--pipeline-h', `${Math.ceil(entry.target.getBoundingClientRect().height)}px`)
}).observe($('#pipeline'))

// ------------------------------------------------------------------ activity drawer (live progress)

const activity = { steps: [], failed: false, finished: false, startedAt: 0, timer: null }

function elapsed() {
    const seconds = Math.max(0, Math.round((Date.now() - activity.startedAt) / 1000))
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function renderSteps() {
    $('#activitySteps').replaceChildren(...activity.steps.map((step, index) => {
        const isLast = index === activity.steps.length - 1
        let cls = 'done'
        let mark = icon('check')
        if (isLast && !activity.finished) {
            cls = 'current'
            mark = h('span', { class: 'spinner' })
        }
        if (isLast && activity.failed) {
            cls = 'failed'
            mark = icon('x')
        }
        return h('li', { class: cls }, h('span', { class: 'step-icon' }, mark), step)
    }))
    const total = activity.steps.length
    const resolve = $('#activityResolve')
    const progress = activity.finished && !activity.failed ? 1 : Math.min(0.9, 1 - 1 / (1 + total * 0.5))
    resolve.style.setProperty('--p', progress.toFixed(2))
    resolve.classList.toggle('failed', !!activity.failed)
}

function showBanner(kind, text, action) {
    const banner = $('#activityBanner')
    banner.className = `banner ${kind}`
    banner.replaceChildren(text)
    if (action) banner.append(h('button', { class: 'btn small', onclick: action.run }, action.icon ? withIcon(action.icon, action.label) : action.label))
    banner.hidden = false
}

function openActivity(title, startedAt) {
    clearInterval(activity.timer)
    activity.steps = []
    activity.finished = false
    activity.failed = false
    activity.startedAt = startedAt || Date.now()
    $('#activityTitle').textContent = title
    $('#activitySub').textContent = `En marcha · ${elapsed()}`
    activity.timer = setInterval(() => { $('#activitySub').textContent = `En marcha · ${elapsed()}` }, 1000)
    $('#activityLog').textContent = ''
    $('#activityBanner').hidden = true
    $('#activityCancel').hidden = false
    $('#activityCancel').disabled = false
    $('#activityClose').hidden = true
    renderSteps()
    $('#activity').hidden = false
}

function appendLog(line) {
    const log = $('#activityLog')
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40
    log.append(document.createTextNode(`${line}\n`))
    if (atBottom) log.scrollTop = log.scrollHeight
}

function attachJob(jobId, title, onSuccess, startedAt) {
    state.running = { jobId, title }
    if ($('#activity').hidden) openActivity(title, startedAt)
    renderPipeline()

    const source = new EventSource(`/api/jobs/${jobId}/stream`)
    let finished = false
    source.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.line != null) appendLog(data.line)
        else if (data.step) {
            activity.steps.push(data.step)
            renderSteps()
            tear($('#activitySteps li:last-child .step-icon'))
        } else if (data.done) {
            finished = true
            source.close()
            finishJob(data, onSuccess)
        }
    }
    source.onerror = () => {
        source.close()
        if (!finished) finishJob({ error: 'Se perdió la conexión con el Publisher.' })
    }
}

function finishJob(data, onSuccess) {
    clearInterval(activity.timer)
    state.running = null
    activity.finished = true
    activity.failed = !!data.error
    renderSteps()
    $('#activityCancel').hidden = true
    $('#activityClose').hidden = false
    $('#activitySub').textContent = `${data.error ? 'Se detuvo' : 'Terminado'} · ${elapsed()}`
    if (data.error) {
        showBanner('err', data.error)
        tear($('#activityBanner'))
        $('#logWrap').open = true
    } else {
        $('#logWrap').open = false
        if (onSuccess) onSuccess(data.result)
    }
    refreshAll()
}

async function runJob(title, endpoint, body, onSuccess) {
    try {
        state.running = { jobId: null, title }
        openActivity(title)
        const { jobId } = await api(endpoint, { method: 'POST', body: body || {} })
        attachJob(jobId, title, onSuccess)
    } catch (err) {
        clearInterval(activity.timer)
        state.running = null
        $('#activity').hidden = true
        toast(err.message, true)
    }
}

$('#activityClose').addEventListener('click', () => { $('#activity').hidden = true })
$('#activityCancel').addEventListener('click', async () => {
    if (!state.running) return
    $('#activityCancel').disabled = true
    await api(`/api/jobs/${state.running.jobId}/cancel`, { method: 'POST' }).catch(() => {})
})

// ------------------------------------------------------------------ health + presence

async function renderHealth() {
    const box = $('#health')
    try {
        const info = await api('/api/health')
        const problems = []
        if (!info.git) problems.push(['Falta Git', 'Instala Git for Windows.'])
        if (!info.gh) problems.push(['GitHub sin sesión', 'Abre una terminal y corre: gh auth login'])
        if (!info.java) problems.push(['Java de Nebula', 'No encuentro JAVA_EXECUTABLE del .env de Nebula.'])
        if (!info.nebula) problems.push(['Nebula sin instalar', 'Corre "npm install" una vez en la carpeta de Nebula.'])
        if (!info.launcherRepo) problems.push(['Launcher no encontrado', 'Revisa la ruta en Ajustes.'])
        box.replaceChildren(...(problems.length === 0
            ? [h('span', { class: 'pill ok' }, withIcon('checkCircle', 'Todo listo'))]
            : problems.map(([label, hint]) => h('span', { class: 'pill bad', title: hint }, withIcon('alert', label)))))
    } catch {
        box.replaceChildren()
    }
}

function watchPresence() {
    const source = new EventSource('/api/presence')
    source.onerror = async () => {
        try {
            await api('/api/health')
        } catch {
            source.close()
            $('#offline').hidden = false
        }
    }
}

// ------------------------------------------------------------------ data refresh

async function refreshPacks() {
    state.packs = await api('/api/packs')
    if (state.selectedId && !state.packs.some((pack) => pack.id === state.selectedId)) state.selectedId = null
    if (!state.selectedId && state.packs.length) state.selectedId = state.packs[0].id
    if (state.selectedId) {
        try { state.pack = await api(`/api/packs/${encodeURIComponent(state.selectedId)}`) } catch { state.pack = null }
    } else {
        state.pack = null
    }
}

async function refreshStatus() {
    const status = await api('/api/status')
    state.packsStatus = status.packs
    if (status.job && !state.running) {
        // Page was reloaded while something was running: pick the live log back up.
        openActivity(status.job.title, status.job.startedAt)
        attachJob(status.job.id, status.job.title, null, status.job.startedAt)
    }
}

async function refreshLauncher() {
    state.launcher = await api('/api/launcher')
}

async function refreshAll() {
    try {
        await Promise.all([refreshPacks(), refreshStatus(), refreshLauncher()])
    } catch (err) {
        toast(err.message, true)
    }
    state.loaded = true
    render()
}

// ------------------------------------------------------------------ rendering: pack list & detail

function render() {
    $('#packContent').hidden = state.creating
    $('#newPackForm').hidden = !state.creating
    renderPackList()
    if (!state.creating) renderPackDetail()
    renderLauncher()
    renderPipeline()
}

function renderPackList() {
    const list = $('#packList')
    if (!state.loaded) {
        list.replaceChildren(...[0, 1].map(() => h('div', { class: 'skeleton', style: 'height:56px' })))
        return
    }
    if (state.packs.length === 0) {
        list.replaceChildren(h('p', { class: 'muted' }, 'Todavía no hay modpacks. Crea el primero con “Nuevo”.'))
        return
    }
    list.replaceChildren(...state.packs.map((pack) => h('button', {
        class: `pack-card${pack.id === state.selectedId && !state.creating ? ' active' : ''}`,
        onclick: () => selectPack(pack.id)
    },
    packIcon(pack),
    h('div', { class: 'pack-meta' },
        h('div', { class: 'pack-name' }, pack.name),
        h('div', { class: 'pack-sub tnum' }, `${LOADER_NAMES[pack.loader.type] || '?'} · MC ${pack.minecraft} · v${pack.packVersion}`)))))
}

function packIcon(pack) {
    if (!pack.hasIcon) return h('div', { class: 'pack-icon' }, icon('package'))
    return h('img', { class: 'pack-icon', src: packIconUrl(pack), alt: '' })
}

async function selectPack(id) {
    state.creating = false
    state.selectedId = id
    state.draft = {}
    state.filter = ''
    state.protection = null
    state.protectionOpen = new Set()
    state.protectionFilter = ''
    state.visuals = null
    try { state.pack = await api(`/api/packs/${encodeURIComponent(id)}`) } catch (err) { toast(err.message, true) }
    render()
    tear($('.pack-head h1'))
}

function renderPackDetail() {
    const box = $('#packContent')
    const pack = state.pack
    if (!state.loaded) {
        box.replaceChildren(h('div', { class: 'skeleton', style: 'height:64px;max-width:420px' }), h('div', { class: 'skeleton', style: 'height:220px;margin-top:32px;max-width:820px' }))
        return
    }
    if (!pack) {
        box.replaceChildren(h('div', { class: 'empty-hero' },
            h('div', { class: 'prose' },
                h('h1', {}, 'Empieza creando un modpack'),
                h('p', { class: 'muted' }, 'Pulsa “Nuevo”, elige la versión de Minecraft y el loader, y yo preparo todo por detrás.')),
            h('img', { src: '/art/flower.png', alt: '', width: '651', height: '655', decoding: 'async' })))
        return
    }

    const modCount = pack.counts.required + pack.counts.optionalon + pack.counts.optionaloff
    const tabs = [['settings', 'Ajustes'], ['appearance', 'Apariencia'], ['protection', 'Protección'], ['mods', `Mods (${modCount})`], ['files', 'Archivos']]

    box.replaceChildren(
        h('div', { class: 'pack-head' },
            h('label', { class: 'icon-pick', title: 'Cambiar el icono (PNG)' },
                pack.hasIcon ? h('img', { class: 'pack-icon', src: packIconUrl(pack), alt: 'Icono del modpack' }) : h('div', { class: 'pack-icon' }, icon('package')),
                h('input', { type: 'file', accept: 'image/png', class: 'sr-only', 'aria-label': 'Cambiar el icono del modpack', onchange: (event) => uploadIcon(event.target.files[0]) })),
            h('div', { class: 'grow' },
                h('h1', {}, pack.name),
                h('div', { class: 'facts tnum' },
                    h('span', {}, `Minecraft ${pack.minecraft}`),
                    h('span', {}, `${LOADER_NAMES[pack.loader.type] || 'Sin loader'} ${pack.loader.version || ''}`.trim()),
                    h('span', {}, `Modpack v${pack.packVersion}`),
                    h('span', {}, plural(modCount, 'mod', 'mods')))),
            h('button', { class: 'btn small', onclick: () => openFolder('root') }, withIcon('folder', 'Abrir carpeta'))),
        h('div', { class: 'subtabs', role: 'tablist' },
            ...tabs.map(([id, label]) => h('button', {
                class: 'subtab', role: 'tab', 'aria-selected': String(state.subtab === id),
                onclick: () => { state.subtab = id; renderPackDetail() }
            }, label))),
        state.subtab === 'settings' ? settingsForm(pack)
            : state.subtab === 'appearance' ? appearanceView(pack)
                : state.subtab === 'protection' ? protectionView(pack)
                    : state.subtab === 'mods' ? modsView(pack) : filesView(pack))

    if (state.subtab === 'settings') fillLoaderVersions(pack)
    if (state.subtab === 'appearance') loadVisuals()
    if (state.subtab === 'protection') loadProtection()
}

function settingsForm(pack) {
    const value = (key, fallback) => (key in state.draft ? state.draft[key] : fallback)
    const meta = pack.meta
    const dirty = () => Object.keys(state.draft).length > 0
    const markDirty = () => {
        $('#saveMeta').disabled = !dirty()
        const hint = $('#saveHint')
        hint.textContent = dirty() ? 'Cambios sin guardar' : 'Todo guardado. Cuando termines, pulsa Compilar abajo.'
        hint.classList.toggle('dirty', dirty())
    }
    const set = (key) => (event) => {
        state.draft[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value
        markDirty()
    }

    const versionInput = h('input', { value: value('version', meta.version), oninput: set('version'), inputmode: 'decimal', class: 'tnum' })
    const bump = (kind) => h('button', {
        type: 'button', class: 'btn small',
        onclick: () => {
            versionInput.value = bumpVersion(versionInput.value || meta.version, kind)
            state.draft.version = versionInput.value
            markDirty()
        }
    }, kind === 'minor' ? '+ menor' : '+ parche')

    const address = value('address', meta.address)

    // Discord Rich Presence: three related fields kept together in the draft.
    const discord = { shortId: '', largeImageText: '', largeImageKey: '', ...(meta.discord || {}), ...(state.draft.discord || {}) }
    const setDiscord = (key) => (event) => {
        discord[key] = event.target.value
        state.draft.discord = { ...discord }
        markDirty()
    }
    const imageInput = h('input', { value: discord.largeImageKey, oninput: setDiscord('largeImageKey'), placeholder: 'https://…/icon.png' })

    return h('form', { onsubmit: (event) => { event.preventDefault(); saveMeta() } },
        h('div', { class: 'form-grid' },
            h('label', {}, 'Nombre que ven los jugadores', h('input', { value: value('name', meta.name), oninput: set('name') })),
            h('label', {}, 'Versión del modpack',
                h('div', { class: 'inline' }, versionInput, bump('patch'), bump('minor')),
                h('small', { class: 'muted' }, 'Súbela cada vez que publiques cambios para que los jugadores actualicen.')),
            h('label', { class: 'wide' }, 'Descripción', h('input', { value: value('description', meta.description || ''), oninput: set('description') })),
            h('label', {}, 'IP del servidor',
                h('input', { value: address, placeholder: 'ip:puerto', oninput: set('address') }),
                /localhost/.test(address) ? h('small', { class: 'warn' }, 'Todavía tiene la IP de ejemplo.') : null),
            h('label', {}, `Versión de ${LOADER_NAMES[pack.loader.type] || 'loader'}`,
                h('select', { id: 'metaLoaderVersion', onchange: set('loaderVersion') }, h('option', { value: pack.loader.version }, pack.loader.version))),
            h('label', {}, 'Java',
                h('select', { onchange: set('javaMajor') }, ...JAVA_CHOICES.map(([id, label]) => h('option', { value: id, selected: String(value('javaMajor', pack.javaMajor || '')) === id }, label)))),
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Opciones'),
                h('div', { class: 'checks' },
                    ...[['mainServer', 'Servidor principal'], ['whitelist', 'Tiene whitelist'], ['autoconnect', 'Conectar solo']].map(([key, label]) =>
                        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: value(key, !!meta[key]), onchange: set(key) }), label))))),
        h('details', { class: 'advanced', open: !!(meta.discord && meta.discord.shortId) },
            h('summary', {}, 'Discord (Rich Presence)'),
            h('p', { class: 'muted' }, 'Lo que ven tus amigos en Discord mientras juegas este modpack. Déjalo vacío para no mostrar nada.'),
            h('div', { class: 'form-grid' },
                h('label', {}, 'Nombre en Discord', h('input', { value: discord.shortId, oninput: setDiscord('shortId'), placeholder: pack.name })),
                h('label', {}, 'Texto de la imagen', h('input', { value: discord.largeImageText, oninput: setDiscord('largeImageText'), placeholder: `Jugando ${pack.name}` })),
                h('label', { class: 'wide' }, 'Imagen (enlace)',
                    h('div', { class: 'inline' }, imageInput,
                        h('button', {
                            type: 'button', class: 'btn small',
                            onclick: () => { imageInput.value = pack.defaultDiscordImage; discord.largeImageKey = pack.defaultDiscordImage; state.draft.discord = { ...discord }; markDirty() }
                        }, 'Usar el icono del pack'))))),
        h('div', { class: 'form-actions' },
            h('button', { class: 'btn paper', id: 'saveMeta', type: 'submit', disabled: !dirty() }, 'Guardar cambios'),
            h('span', { class: `hint-line${dirty() ? ' dirty' : ''}`, id: 'saveHint' }, dirty() ? 'Cambios sin guardar' : 'Todo guardado. Cuando termines, pulsa Compilar abajo.')))
}

/** The loader-version dropdown is filled from the network after the form is drawn. */
async function fillLoaderVersions(pack) {
    const select = $('#metaLoaderVersion')
    if (!select || !pack.loader.type) return
    try {
        const { versions } = await api(`/api/versions/loader?type=${pack.loader.type}&mc=${pack.minecraft}`)
        const wanted = state.draft.loaderVersion || pack.loader.version
        const list = [...new Set([pack.loader.version, ...versions.slice(0, 40)])]
        select.replaceChildren(...list.map((version) => h('option', { value: version, selected: version === wanted }, version === pack.loader.version ? `${version} (actual)` : version)))
    } catch { /* offline: keep the current version only */ }
}

async function saveMeta() {
    const patch = { ...state.draft }
    if ('javaMajor' in patch) patch.javaMajor = patch.javaMajor || null
    try {
        state.pack = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/meta`, { method: 'POST', body: patch })
        state.draft = {}
        toast('Guardado')
        await refreshAll()
    } catch (err) {
        toast(err.message, true)
    }
}

// ---- mods

function modsView(pack) {
    const filter = state.filter.toLowerCase()
    const search = h('input', {
        type: 'search', placeholder: 'Buscar un mod…', value: state.filter, 'aria-label': 'Buscar un mod',
        oninput: (event) => {
            state.filter = event.target.value
            const caret = event.target.selectionStart
            renderPackDetail()
            const again = $('.mods-toolbar input')
            again.focus()
            again.setSelectionRange(caret, caret)
        }
    })

    return h('div', {},
        h('div', { class: 'mods-toolbar' }, search,
            h('button', { class: 'btn', type: 'button', onclick: () => openFolder('mods') }, withIcon('folder', 'Abrir carpeta de mods'))),
        h('p', { class: 'muted mods-help' }, 'Arrastra los .jar a la columna que corresponda, o usa el + de cada una. Se copian a la carpeta del modpack.'),
        h('div', { class: 'zones' }, ...CATEGORIES.map((category) => modZone(pack, category, filter))))
}

function modZone(pack, category, filter) {
    const all = pack.mods[category.id]
    const files = all.filter((file) => file.name.toLowerCase().includes(filter))
    const picker = h('input', { type: 'file', accept: '.jar', multiple: true, class: 'sr-only', tabindex: '-1', onchange: (event) => uploadMods([...event.target.files], category.id) })

    const zone = h('div', { class: 'zone' },
        h('div', { class: 'zone-head' },
            h('h3', {}, category.title),
            h('span', { class: 'count tnum' }, String(all.length)),
            h('button', { class: 'icon-btn', type: 'button', title: `Añadir mods a ${category.title}`, 'aria-label': `Añadir mods a ${category.title}`, onclick: () => picker.click() }, icon('plus')),
            picker),
        h('div', { class: 'zone-desc' }, category.desc),
        h('div', { class: 'zone-list' },
            files.length === 0
                ? h('div', { class: 'zone-empty' }, icon('upload'), filter ? 'Sin resultados' : 'Suelta aquí los .jar')
                : files.map((file) => h('div', { class: 'mod-row' },
                    h('span', { class: 'name', title: file.name }, file.name),
                    h('span', { class: 'size' }, formatSize(file.size)),
                    h('span', { class: 'mod-actions' },
                        ...CATEGORIES.filter((other) => other.id !== category.id).map((other) =>
                            h('button', { title: `Mover a ${other.title}`, 'aria-label': `Mover ${file.name} a ${other.title}`, onclick: () => moveMod(file.name, category.id, other.id) }, icon(other.icon))),
                        h('button', { class: 'del', title: 'Quitar del modpack', 'aria-label': `Quitar ${file.name} del modpack`, onclick: () => deleteMod(file.name, category.id) }, icon('trash'))))))
    )

    zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('over') })
    zone.addEventListener('dragleave', (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove('over') })
    zone.addEventListener('drop', (event) => {
        event.preventDefault()
        zone.classList.remove('over')
        uploadMods([...event.dataTransfer.files], category.id)
    })
    return zone
}

async function uploadMods(files, category) {
    const jars = files.filter((file) => file.name.toLowerCase().endsWith('.jar'))
    if (jars.length < files.length) toast('Solo se aceptan archivos .jar', true)
    for (const [index, file] of jars.entries()) {
        toast(`Subiendo ${index + 1} de ${jars.length}: ${file.name}`)
        try {
            await api(`/api/packs/${encodeURIComponent(state.selectedId)}/mods?category=${category}&name=${encodeURIComponent(file.name)}`, { method: 'POST', raw: file })
        } catch (err) {
            toast(`${file.name}: ${err.message}`, true)
            break
        }
    }
    if (jars.length) {
        toast(`${plural(jars.length, 'mod añadido', 'mods añadidos')}`)
        await refreshAll()
    }
}

async function deleteMod(name, category) {
    if (!confirm(`¿Quitar ${name} del modpack?`)) return
    await api(`/api/packs/${encodeURIComponent(state.selectedId)}/mods?category=${category}&name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    await refreshAll()
}

async function moveMod(name, from, to) {
    await api(`/api/packs/${encodeURIComponent(state.selectedId)}/mods/move`, { method: 'POST', body: { name, from, to } })
    await refreshAll()
}

async function uploadIcon(file) {
    if (!file) return
    if (file.type !== 'image/png') return toast('El icono tiene que ser un PNG.', true)
    await api(`/api/packs/${encodeURIComponent(state.selectedId)}/icon`, { method: 'POST', raw: file })
    state.iconStamp = Date.now()
    toast('Icono actualizado')
    await refreshAll()
}

function openFolder(what) {
    api(`/api/packs/${encodeURIComponent(state.selectedId)}/open`, { method: 'POST', body: { what } }).catch((err) => toast(err.message, true))
}

// ---- appearance (icon, accent colour, background, banner)

const VISUALS = [
    { kind: 'background', preview: 'background-preview', title: 'Fondo', help: 'La imagen grande detrás del launcher. Admite PNG, JPG, WebP, AVIF y también animados (GIF, APNG, WebP).' },
    { kind: 'banner', preview: 'banner-preview', title: 'Banner', help: 'El logo o la cabecera del modpack. Mismos formatos.' }
]
const PREVIEW_LIMIT = 8 * 1024 * 1024
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const fullHex = (value) => (/^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((c) => c + c).join('')}` : value)

function appearanceView(pack) {
    const accent = pack.meta.accent || ''
    const colorInput = h('input', { type: 'color', value: fullHex(accent) || '#5e89ff', 'aria-label': 'Elegir el color' })
    const hexInput = h('input', { value: accent, placeholder: '#5e89ff', class: 'tnum', 'aria-label': 'Color en hexadecimal', maxlength: '7' })
    const sample = h('span', { class: 'accent-sample', style: `--sample:${fullHex(accent) || 'transparent'}` }, 'JUGAR')
    const paint = (value) => sample.style.setProperty('--sample', HEX.test(value) ? fullHex(value) : 'transparent')

    colorInput.addEventListener('input', () => { hexInput.value = colorInput.value; paint(colorInput.value) })
    hexInput.addEventListener('input', () => {
        if (HEX.test(hexInput.value)) colorInput.value = fullHex(hexInput.value)
        paint(hexInput.value)
    })

    const saveAccent = async (value) => {
        if (value && !HEX.test(value)) return toast('El color tiene que ser un hex como #5e89ff.', true)
        try {
            state.pack = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/meta`, { method: 'POST', body: { accent: value || null } })
            hexInput.value = value || ''
            paint(value)
            toast(value ? 'Color guardado' : 'Color quitado')
            await refreshStatus()
            renderPipeline()
        } catch (err) {
            toast(err.message, true)
        }
    }

    return h('div', { class: 'appearance' },
        h('section', { class: 'section' },
            h('h2', {}, 'Icono'),
            h('p', { class: 'muted' }, 'Aparece en la lista de versiones del launcher y en Discord. PNG cuadrado, mejor de 512 × 512.'),
            h('div', { class: 'visual-row' },
                pack.hasIcon ? h('img', { class: 'pack-icon big', src: packIconUrl(pack), alt: 'Icono actual' }) : h('div', { class: 'pack-icon big' }, icon('package')),
                h('label', { class: 'btn small file-btn' }, withIcon('upload', pack.hasIcon ? 'Cambiar icono' : 'Elegir icono'),
                    h('input', { type: 'file', accept: 'image/png', class: 'sr-only', onchange: (event) => uploadIcon(event.target.files[0]) })))),
        h('section', { class: 'section' },
            h('h2', {}, 'Color de acento'),
            h('p', { class: 'muted' }, 'Tiñe los botones y detalles del launcher mientras este modpack está seleccionado.'),
            h('div', { class: 'color-row' },
                colorInput, hexInput, sample,
                h('button', { class: 'btn small paper', type: 'button', onclick: () => saveAccent(hexInput.value.trim()) }, 'Guardar color'),
                accent ? h('button', { class: 'btn small', type: 'button', onclick: () => saveAccent('') }, 'Quitar') : null)),
        h('div', { id: 'visualsBox' }, h('div', { class: 'skeleton', style: 'height:160px' })))
}

async function loadVisuals() {
    try { state.visuals = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/visuals`) } catch { state.visuals = null }
    paintVisuals()
}

function paintVisuals() {
    const box = $('#visualsBox')
    if (!box || !state.visuals) return
    const id = encodeURIComponent(state.selectedId)
    const stamp = state.iconStamp

    const slot = (kind, label, help) => {
        const current = state.visuals[kind]
        const picker = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: (event) => uploadVisual(kind, event.target.files[0]) })
        return h('div', { class: 'slot' },
            h('div', { class: 'slot-info' },
                h('b', {}, label),
                current
                    ? h('span', { class: 'muted tnum' }, `${current.name} · ${formatSize(current.size)}`)
                    : h('span', { class: 'muted' }, 'Sin imagen'),
                help ? h('span', { class: 'muted small-help' }, help) : null,
                current && current.size > 40 * 1024 * 1024 ? h('span', { class: 'warn' }, 'Pesa mucho: al Enviar irá a un Release automáticamente.') : null),
            h('div', { class: 'slot-actions' },
                h('label', { class: 'btn small file-btn' }, withIcon('upload', current ? 'Cambiar' : 'Elegir'), picker),
                current ? h('button', { class: 'btn small', type: 'button', onclick: () => removeVisual(kind) }, 'Quitar') : null))
    }

    box.replaceChildren(...VISUALS.map(({ kind, preview, title, help }) => {
        const main = state.visuals[kind]
        const light = state.visuals[preview]
        const shown = light && light.size <= PREVIEW_LIMIT ? preview : main && main.size <= PREVIEW_LIMIT ? kind : null
        return h('section', { class: 'section' },
            h('h2', {}, title),
            h('p', { class: 'muted' }, help),
            h('div', { class: 'visual-card' },
                shown
                    ? h('img', { class: 'visual-thumb', src: `/api/packs/${id}/visual?kind=${shown}&t=${stamp}`, alt: `${title} actual` })
                    : h('div', { class: 'visual-thumb empty' }, icon('image'), main ? 'Archivo grande: sin vista previa aquí' : 'Sin imagen'),
                h('div', { class: 'slots' },
                    slot(kind, title, null),
                    slot(preview, 'Vista previa ligera (opcional)', 'Una versión pequeña que el launcher muestra al instante mientras baja la grande.'))))
    }))
}

async function uploadVisual(kind, file) {
    if (!file) return
    const extension = (file.name.split('.').pop() || '').toLowerCase()
    try {
        toast(`Subiendo ${file.name}…`)
        state.visuals = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/visual?kind=${kind}&ext=${encodeURIComponent(extension)}`, { method: 'POST', raw: file })
        state.iconStamp = Date.now()
        paintVisuals()
        toast('Imagen guardada')
        await refreshStatus()
        renderPipeline()
    } catch (err) {
        toast(err.message, true)
    }
}

async function removeVisual(kind) {
    if (!confirm('¿Quitar esta imagen del modpack?')) return
    try {
        state.visuals = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/visual?kind=${kind}`, { method: 'DELETE' })
        state.iconStamp = Date.now()
        paintVisuals()
        await refreshStatus()
        renderPipeline()
    } catch (err) {
        toast(err.message, true)
    }
}

// ---- protection (which files the launcher restores and which the player may change)

const ruleKey = (path) => String(path).replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase()

/** "sodium-0.8.14+mc1.21.11.jar" -> "mods/sodium-*": a rule that keeps matching after the mod is updated. */
function modRulePath(name) {
    const tokens = name.replace(/\.jar$/i, '').split(/([-_+ ])/)
    const versionish = (token) => /^(v|mc)?\d+/i.test(token)
    let stem = ''
    for (let i = 0; i < tokens.length; i += 2) {
        if (versionish(tokens[i])) return stem ? `mods/${stem}${i > 0 ? tokens[i - 1] : '-'}*` : `mods/${name}`
        stem += (i > 0 ? tokens[i - 1] : '') + tokens[i]
    }
    return `mods/${name}`
}

function buildTree(items) {
    const make = (name, path) => ({ name, path, folders: new Map(), files: [], counts: { locked: 0, free: 0 } })
    const root = make('', '')
    for (const item of items) {
        const parts = item.path.split('/')
        let node = root
        node.counts[item.mode]++
        for (const part of parts.slice(0, -1)) {
            if (!node.folders.has(part)) node.folders.set(part, make(part, `${node.path}${part}/`))
            node = node.folders.get(part)
            node.counts[item.mode]++
        }
        node.files.push({ ...item, name: parts[parts.length - 1] })
    }
    return root
}

function protectionView() {
    return h('div', { class: 'protection' }, h('div', { id: 'protectionBox' }, h('div', { class: 'skeleton', style: 'height:240px' })))
}

async function loadProtection() {
    try { state.protection = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/protection`) } catch (err) { toast(err.message, true) }
    paintProtection()
}

async function saveProtection(input) {
    try {
        state.protection = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/protection`, { method: 'POST', body: input })
        paintProtection()
        await refreshStatus()
        renderPipeline()
    } catch (err) {
        toast(err.message, true)
    }
}

function setRule(rulePath, mode) {
    const rules = state.protection.protection.rules.filter((rule) => ruleKey(rule.path) !== ruleKey(rulePath))
    if (mode) rules.push({ path: rulePath, mode })
    saveProtection({ rules })
}

function ruleControl(rulePath, disabled) {
    const explicit = state.protection.protection.rules.find((rule) => ruleKey(rule.path) === ruleKey(rulePath))
    const current = explicit ? explicit.mode : null
    const button = (mode, label, title) => h('button', {
        type: 'button', disabled, title, 'aria-pressed': String(current === mode), class: current === mode ? 'on' : '',
        onclick: () => setRule(rulePath, mode)
    }, label)
    return h('span', { class: 'pctl', role: 'group', 'aria-label': `Regla para ${rulePath}` },
        button(null, 'Heredar', 'Sin regla propia: manda la carpeta o el valor por defecto'),
        button('locked', 'Protegido', 'El launcher lo restaura si falta o cambia'),
        button('free', 'Libre', 'Se entrega una vez y el jugador puede cambiarlo'))
}

function modeBadge(item) {
    const free = item.mode === 'free'
    return h('span', { class: `pbadge ${item.mode}`, title: item.by ? `Por la regla «${item.by}»` : 'Por el valor por defecto' },
        icon(free ? 'unlock' : 'lock'), free ? 'Libre' : 'Protegido', item.by ? h('span', { class: 'pby' }, '· regla') : null)
}

function protectionRows(node, depth, managed, rows) {
    const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    for (const folder of folders) {
        const open = state.protectionOpen.has(folder.path)
        const lockedByLauncher = folder.path === 'mods/' && !managed
        rows.push(h('div', { class: 'prow folder', style: `--depth:${depth}` },
            h('button', {
                type: 'button', class: 'pname', 'aria-expanded': String(open),
                onclick: () => { if (open) state.protectionOpen.delete(folder.path); else state.protectionOpen.add(folder.path); paintTree() }
            }, icon(open ? 'chevronDown' : 'chevronRight'), icon('folder'), h('span', { class: 'ptext' }, folder.name)),
            h('span', { class: 'pcount tnum' }, lockedByLauncher ? 'los gestiona el launcher' : `${plural(folder.counts.locked, 'protegido', 'protegidos')} · ${plural(folder.counts.free, 'libre', 'libres')}`),
            h('span', {}),
            ruleControl(folder.path, lockedByLauncher)))
        if (open) protectionRows(folder, depth + 1, managed, rows)
    }
    for (const item of node.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))) {
        rows.push(fileRow(item, item.name, depth, managed))
    }
    return rows
}

function fileRow(item, label, depth, managed) {
    const isMod = item.kind === 'mod'
    const rulePath = isMod ? modRulePath(item.path.slice(5)) : item.path
    return h('div', { class: 'prow', style: `--depth:${depth}` },
        h('span', { class: 'pname' }, h('span', { class: 'pspacer' }), icon('file'), h('span', { class: 'ptext', title: item.path }, label)),
        h('span', { class: 'pcount tnum' }, formatSize(item.size)),
        modeBadge(item),
        isMod && !managed ? h('span', { class: 'pcount' }, 'gestionado por el launcher') : ruleControl(rulePath, false))
}

function paintTree() {
    const box = $('#protectionTree')
    if (!box || !state.protection) return
    const { items, modsLiveInInstance } = state.protection
    const filter = state.protectionFilter.trim().toLowerCase()

    if (filter) {
        const matches = items.filter((item) => item.path.toLowerCase().includes(filter))
        box.replaceChildren(...matches.slice(0, 250).map((item) => fileRow(item, item.path, 0, modsLiveInInstance)),
            matches.length > 250 ? h('div', { class: 'pcount', style: 'padding:8px 12px' }, `Y ${matches.length - 250} más: afina la búsqueda.`) : null,
            matches.length === 0 ? h('div', { class: 'zone-empty' }, 'Nada coincide con esa búsqueda.') : null)
        return
    }
    box.replaceChildren(...protectionRows(buildTree(items), 0, modsLiveInInstance, []))
    if (items.length === 0) box.replaceChildren(h('div', { class: 'zone-empty' }, 'Este modpack todavía no tiene archivos.'))
}

function paintProtection() {
    const box = $('#protectionBox')
    if (!box || !state.protection) return
    const { protection, counts, modsLiveInInstance } = state.protection

    const ruleInput = h('input', { placeholder: 'config/ · options.txt · mods/sodium-*.jar', 'aria-label': 'Ruta o patrón', class: 'mono' })
    const ruleMode = h('select', { 'aria-label': 'Qué hace la regla' }, h('option', { value: 'locked' }, 'Protegido'), h('option', { value: 'free' }, 'Libre'))
    const addRule = () => {
        const path = ruleInput.value.trim()
        if (!path) return
        setRule(path, ruleMode.value)
    }

    box.replaceChildren(
        h('section', { class: 'section' },
            h('p', { class: 'prose' }, 'Elige qué archivos restaura el launcher y cuáles puede cambiar el jugador. ',
                h('b', {}, 'Protegido'), ': si el jugador lo borra, lo renombra o lo modifica, se restaura solo. ',
                h('b', {}, 'Libre'), ': se entrega una vez y después el jugador manda sobre él. Solo se comprueba lo que marques como protegido.'),
            h('div', { class: 'pdefault' },
                h('span', { class: 'label' }, 'Lo que no tenga regla es'),
                h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Valor por defecto' },
                    ...[['locked', 'Protegido'], ['free', 'Libre']].map(([mode, label]) => h('button', {
                        type: 'button', role: 'radio', 'aria-checked': String(protection.default === mode), class: protection.default === mode ? 'active' : '',
                        onclick: () => protection.default !== mode && saveProtection({ default: mode })
                    }, label))),
                h('span', { class: 'pcount tnum' }, `${plural(counts.locked, 'protegido', 'protegidos')} · ${plural(counts.free, 'libre', 'libres')}`)),
            !modsLiveInInstance ? h('p', { class: 'note' }, icon('alert'), 'En este loader el launcher gestiona los mods por su cuenta (no están en la carpeta mods de la instancia), así que siempre se verifican. Las reglas de mods solo cuentan en Forge y NeoForge 1.20.3+.') : null),
        h('section', { class: 'section' },
            h('div', { class: 'ptools' },
                h('input', {
                    type: 'search', placeholder: 'Buscar un archivo…', 'aria-label': 'Buscar un archivo', value: state.protectionFilter,
                    oninput: (event) => { state.protectionFilter = event.target.value; paintTree() }
                }),
                h('button', { class: 'btn small', type: 'button', onclick: () => { state.protectionOpen.clear(); paintTree() } }, 'Cerrar carpetas')),
            h('div', { class: 'ptree', id: 'protectionTree' })),
        h('section', { class: 'section' },
            h('h2', {}, `Reglas (${protection.rules.length})`),
            h('p', { class: 'muted' }, 'Las de arriba (los botones de cada fila) se guardan aquí. Gana la más concreta: un archivo exacto, luego un patrón con *, luego la carpeta más profunda.'),
            protection.rules.length
                ? h('div', { class: 'rules' }, ...protection.rules.map((rule) => h('div', { class: 'rule' },
                    h('code', {}, rule.path),
                    h('span', { class: `pbadge ${rule.mode}` }, icon(rule.mode === 'free' ? 'unlock' : 'lock'), rule.mode === 'free' ? 'Libre' : 'Protegido'),
                    h('button', { class: 'icon-btn', type: 'button', title: 'Quitar la regla', 'aria-label': `Quitar la regla ${rule.path}`, onclick: () => setRule(rule.path, null) }, icon('trash')))))
                : h('p', { class: 'muted' }, 'Todavía no hay reglas: todo es como el valor por defecto.'),
            h('form', { class: 'rule-add', onsubmit: (event) => { event.preventDefault(); addRule() } }, ruleInput, ruleMode,
                h('button', { class: 'btn small', type: 'submit' }, withIcon('plus', 'Añadir regla')))),
        h('section', { class: 'section' },
            h('h2', {}, 'Volver a entregar los archivos libres'),
            h('p', { class: 'muted' }, 'Los libres se entregan una sola vez. Si cambias uno y quieres que todos los jugadores lo reciban otra vez (pisando lo que hayan tocado), pulsa el botón. Los jugadores nuevos siempre reciben la versión actual.'),
            h('div', { class: 'form-actions', style: 'margin-top:12px' },
                h('button', {
                    class: 'btn', type: 'button',
                    onclick: () => confirm('Todos los jugadores recibirán otra vez los archivos libres y perderán sus cambios en ellos. ¿Seguro?') && saveProtection({ bumpRevision: true })
                }, withIcon('refresh', 'Volver a entregar')),
                h('span', { class: 'hint-line tnum' }, `Entrega número ${protection.revision + 1}${protection.revision ? '' : ' (la primera)'}`))))
    paintTree()
}

function filesView(pack) {
    return h('div', {},
        h('p', { class: 'prose' }, 'Aquí van las cosas que no son mods: ',
            h('b', {}, 'configuraciones, resource packs, shaders, options.txt, servers.dat'),
            '… Todo lo que pongas en la carpeta “files” se copia al Minecraft de cada jugador.'),
        h('div', { class: 'form-actions' },
            h('button', { class: 'btn paper', onclick: () => openFolder('files') }, withIcon('folder', 'Abrir carpeta “files”')),
            h('span', { class: 'hint-line' }, 'Cuando termines de copiar cosas, vuelve aquí y pulsa Compilar.')),
        h('h3', { style: 'margin-top:32px' }, 'Contenido actual'),
        h('div', { class: 'entries' }, pack.filesEntries.length ? pack.filesEntries.map((name) => h('span', { class: 'entry' }, name)) : h('span', { class: 'muted' }, 'La carpeta está vacía.')))
}

// ------------------------------------------------------------------ pipeline footer (Editar -> Compilar -> Enviar)

function step(number, { done, current }, ...content) {
    return h('div', { class: `pstep${done ? ' done' : ''}${current ? ' current' : ''}` },
        h('div', { class: 'pnum' }, done ? icon('check') : String(number)),
        h('div', { class: 'pinfo' }, ...content))
}

const connector = (done) => h('div', { class: `pconnect${done ? ' done' : ''}` })

function renderPipeline() {
    const busy = !!state.running
    const footer = $('#pipeline')

    if (state.tab === 'packs') {
        const { compiled, stale } = state.packsStatus
        const fresh = !!compiled && !stale
        const nothingNew = fresh && compiled.changes.total === 0
        const sent = fresh && !!compiled.sentAt
        const canSend = fresh && !sent && !nothingNew
        const pending = compiled ? compiled.large.filter((file) => file.needsUpload) : []
        const pendingBytes = pending.reduce((sum, file) => sum + file.size, 0)

        let compileHint = 'Aún sin compilar'
        if (stale) compileHint = 'Hay cambios nuevos: compila otra vez'
        else if (fresh) compileHint = `Compilado ${ago(compiled.at)}`

        let sendHint = 'Primero compila'
        if (canSend) sendHint = `${plural(compiled.changes.total, 'cambio', 'cambios')}${pending.length ? ` · ${plural(pending.length, 'archivo grande', 'archivos grandes')} (${formatSize(pendingBytes)}) irán a Releases` : ''}`
        else if (sent) sendHint = `Enviado ${ago(compiled.sentAt)}`
        else if (nothingNew) sendHint = 'Todo está al día, nada que enviar'

        footer.replaceChildren(...[
            step(1, { done: state.packs.length > 0 }, h('span', { class: 'title' }, 'Editar'), h('span', { class: 'hint' }, 'Crea modpacks y sube mods')),
            connector(true),
            step(2, { done: fresh, current: !fresh },
                h('button', { class: `btn ${fresh ? '' : 'primary'} big`, disabled: busy || state.packs.length === 0, onclick: compilePacks }, withIcon('package', fresh ? 'Compilar de nuevo' : 'Compilar')),
                h('span', { class: 'hint' }, compileHint)),
            connector(fresh),
            step(3, { done: sent || nothingNew, current: canSend },
                h('button', { class: `btn ${canSend ? 'primary' : ''} big`, disabled: busy || !canSend, onclick: sendPacks }, withIcon('send', 'Enviar')),
                h('span', { class: 'hint tnum' }, sendHint)),
            canSend ? h('input', {
                class: 'pmessage', placeholder: compiled.suggestedMessage, value: state.commitMessage, 'aria-label': 'Mensaje del cambio (opcional)',
                oninput: (event) => { state.commitMessage = event.target.value }
            }) : null
        ].filter(Boolean))
        return
    }

    const info = state.launcher
    // A compiled installer only counts if it is the version currently chosen above.
    const build = info && info.build && info.build.version === launcherVersion() ? info.build : null
    const other = info && info.build && !build ? info.build : null
    const canSend = !!build && !build.sent
    footer.replaceChildren(
        step(1, { done: true }, h('span', { class: 'title' }, 'Elegir versión'), h('span', { class: 'hint' }, 'Y contar qué cambia')),
        connector(true),
        step(2, { done: !!build, current: !build },
            h('button', { class: `btn ${build ? '' : 'primary'} big`, disabled: busy || !info, onclick: compileLauncher }, withIcon('package', build ? 'Compilar de nuevo' : 'Compilar')),
            h('span', { class: 'hint tnum' }, build ? `Instalador v${build.version} listo (${formatSize(build.size)})` : other ? `Hay uno de v${other.version}; para v${launcherVersion()} compila otra vez` : 'Genera el instalador (unos minutos)')),
        connector(!!build),
        step(3, { done: !!build && build.sent, current: canSend },
            h('button', { class: `btn ${canSend ? 'primary' : ''} big`, disabled: busy || !canSend, onclick: sendLauncher }, withIcon('send', 'Enviar')),
            h('span', { class: 'hint' }, build ? (build.sent ? `v${build.version} ya está publicada` : 'Sube la versión a GitHub para que se actualicen') : 'Primero compila')))
}

function compilePacks() {
    runJob('Compilar modpacks', '/api/jobs/compile-packs', {}, (compiled) => {
        if (!compiled) return
        const { total } = compiled.changes
        showBanner('ok', total === 0
            ? 'Todo estaba ya al día, no hay nada nuevo que enviar.'
            : `Listo para enviar: ${plural(total, 'cambio', 'cambios')}${compiled.large.some((f) => f.needsUpload) ? ' (los archivos grandes irán a Releases)' : ''}. Cierra esto y pulsa “Enviar”.`)
    })
}

function sendPacks() {
    runJob('Enviar modpacks', '/api/jobs/send-packs', { message: state.commitMessage }, () => {
        state.commitMessage = ''
        showBanner('ok', 'Publicado. GitHub Pages tarda un par de minutos en mostrar los cambios; luego el launcher los descarga solo.')
    })
}

// ------------------------------------------------------------------ launcher tab

function launcherVersion() {
    const info = state.launcher
    if (!info) return ''
    return state.launcherChoice === 'same' ? info.version : info.next[state.launcherChoice]
}

function renderLauncher() {
    const box = $('#launcherContent')
    const info = state.launcher
    if (!info) {
        box.replaceChildren(h('div', { class: 'skeleton', style: 'height:180px' }))
        return
    }

    const choice = (id, title, detail) => h('button', {
        class: 'choice', role: 'radio', 'aria-checked': String(state.launcherChoice === id),
        onclick: () => { state.launcherChoice = id; renderLauncher(); renderPipeline() }
    }, h('b', {}, id === 'same' ? info.version : info.next[id]), h('span', {}, `${title} · ${detail}`))

    const chosen = info.build && info.build.version === launcherVersion() ? info.build : null

    box.replaceChildren(...[
        h('section', { class: 'section' },
            h('h1', {}, 'Publicar el launcher'),
            h('div', { class: 'versions-line' },
                h('span', {}, 'En tu código ', h('b', {}, `v${info.version}`)),
                h('span', {}, 'Publicada en GitHub ', h('b', {}, info.latestTag || '—')))),
        h('section', { class: 'section' },
            h('h2', {}, 'Versión nueva'),
            h('p', { class: 'muted' }, 'Cuánto cambia el número decide cómo se presenta la actualización.'),
            h('div', { class: 'version-choices', role: 'radiogroup', 'aria-label': 'Versión nueva' },
                choice('patch', 'Parche', 'arreglos pequeños'),
                choice('minor', 'Menor', 'cosas nuevas'),
                choice('major', 'Mayor', 'cambio grande'),
                choice('same', 'La misma', 'reintentar')),
            info.dirty > 0 ? h('p', { class: 'note' }, icon('alert'), `Tienes ${plural(info.dirty, 'archivo modificado', 'archivos modificados')} en el código: se subirán junto con esta versión.`) : null),
        h('section', { class: 'section' },
            h('h2', {}, 'Qué cambia'),
            h('p', { class: 'muted' }, 'Se muestra en la página de la versión en GitHub. Puedes dejarlo vacío.'),
            h('textarea', { placeholder: '- Arreglado el login\n- Nuevo fondo', 'aria-label': 'Qué cambia en esta versión', oninput: (event) => { state.notes = event.target.value } }, state.notes)),
        chosen ? h('section', { class: 'section' },
            h('div', { class: 'build-row' }, icon('checkCircle'),
                h('span', { class: 'tnum' }, h('b', {}, chosen.name), ` · ${formatSize(chosen.size)} · ${ago(chosen.at)}`),
                h('span', {}, chosen.sent ? 'Ya está publicado en GitHub.' : 'Listo: pulsa “Enviar” abajo para publicarlo.'))) : null
    ].filter(Boolean))
}

function compileLauncher() {
    const version = launcherVersion()
    runJob(`Compilar el launcher ${version}`, '/api/jobs/compile-launcher', { version, notes: state.notes }, () => {
        showBanner('ok', `Instalador v${version} listo. Cierra esto y pulsa “Enviar” para publicarlo.`)
    })
}

function sendLauncher() {
    const build = state.launcher.build
    if (!confirm(`¿Publicar el launcher v${build.version}? Los jugadores lo recibirán como actualización.`)) return
    runJob(`Enviar el launcher v${build.version}`, '/api/jobs/send-launcher', { notes: state.notes }, (result) => {
        showBanner('ok', 'Publicado. El launcher de los jugadores se actualizará solo.', result && result.url ? { icon: 'external', label: 'Ver en GitHub', run: () => window.open(result.url, '_blank') } : null)
    })
}

// ------------------------------------------------------------------ new modpack (inline form)

const newPack = { loader: 'fabric', token: 0, mcLoaded: false, timer: null }

function packIdFromName(name) {
    return name.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '')
}

function loaderVersionValue() {
    const custom = $('#npLoaderVersionCustom')
    return custom.hidden ? $('#npLoaderVersion').value : custom.value.trim()
}

function updateNewPackPreview() {
    const id = packIdFromName($('#npName').value) || 'MiModpack'
    const mc = $('#npMc').value.trim() || '1.21.11'
    $('#npNameHint').textContent = `Se creará como ${id}-${mc}. Sin espacios ni símbolos raros.`
    $('#npCommand').textContent = `nebula generate server ${id} ${mc} --${newPack.loader} ${loaderVersionValue() || '…'}`
}

async function loadLoaderChoices() {
    const token = ++newPack.token
    const select = $('#npLoaderVersion')
    const custom = $('#npLoaderVersionCustom')
    const hint = $('#npLoaderHint')
    const mc = $('#npMc').value.trim()

    custom.hidden = true
    if (!/^\d+(\.\d+){1,2}$/.test(mc)) {
        select.replaceChildren(h('option', {}, 'Escribe primero la versión de Minecraft'))
        select.disabled = true
        hint.textContent = ''
        return updateNewPackPreview()
    }

    select.disabled = true
    select.replaceChildren(h('option', {}, 'Buscando versiones…'))
    try {
        const { versions, recommended } = await api(`/api/versions/loader?type=${newPack.loader}&mc=${mc}`)
        if (token !== newPack.token) return
        if (versions.length === 0) throw new Error(`No encontré versiones de ${LOADER_NAMES[newPack.loader]} para Minecraft ${mc}.`)
        select.replaceChildren(
            ...versions.slice(0, 60).map((version) => h('option', { value: version, selected: version === recommended }, version === recommended ? `${version} (recomendada)` : version)),
            h('option', { value: '__custom' }, 'Otra versión…'))
        select.disabled = false
        hint.textContent = ''
    } catch (err) {
        if (token !== newPack.token) return
        select.replaceChildren(h('option', { value: '__custom' }, 'Escribir a mano'))
        select.disabled = false
        custom.hidden = false
        hint.textContent = err.message
    }
    updateNewPackPreview()
}

async function openNewPack() {
    state.creating = true
    render()
    $('#npName').value = ''
    updateNewPackPreview()
    $('#npName').focus()
    if (!newPack.mcLoaded) {
        try {
            const { versions, latest } = await api('/api/versions/minecraft')
            $('#mcList').replaceChildren(...versions.map((version) => h('option', { value: version })))
            if (!$('#npMc').value) $('#npMc').value = latest
            newPack.mcLoaded = true
        } catch { /* offline: type it by hand */ }
    }
    loadLoaderChoices()
}

function closeNewPack() {
    state.creating = false
    render()
}

$('#newPackBtn').addEventListener('click', openNewPack)
$('#npCancel').addEventListener('click', closeNewPack)
$('#npName').addEventListener('input', updateNewPackPreview)
$('#npMc').addEventListener('input', () => {
    updateNewPackPreview()
    clearTimeout(newPack.timer)
    newPack.timer = setTimeout(loadLoaderChoices, 400)
})
$('#npLoader').addEventListener('click', (event) => {
    const button = event.target.closest('button')
    if (!button) return
    newPack.loader = button.dataset.value
    for (const other of $('#npLoader').children) {
        other.classList.toggle('active', other === button)
        other.setAttribute('aria-checked', String(other === button))
    }
    loadLoaderChoices()
})
$('#npLoaderVersion').addEventListener('change', () => {
    $('#npLoaderVersionCustom').hidden = $('#npLoaderVersion').value !== '__custom'
    updateNewPackPreview()
})
$('#npLoaderVersionCustom').addEventListener('input', updateNewPackPreview)

$('#newPackForm').addEventListener('submit', (event) => {
    event.preventDefault()
    const name = $('#npName').value.trim()
    const id = packIdFromName(name)
    const minecraft = $('#npMc').value.trim()
    const loaderVersion = loaderVersionValue()
    if (!id) return toast('Ponle un nombre al modpack.', true)
    if (!loaderVersion || loaderVersion === '__custom') return toast('Elige la versión del loader.', true)

    closeNewPack()
    runJob(`Crear ${id}-${minecraft}`, '/api/jobs/create-pack', { id, minecraft, loader: newPack.loader, loaderVersion, displayName: name }, async (result) => {
        await refreshPacks()
        if (result && result.id) {
            state.selectedId = result.id
            state.subtab = 'mods'
            state.pack = await api(`/api/packs/${encodeURIComponent(result.id)}`)
        }
        render()
        showBanner('ok', 'Modpack creado. Ahora sube sus mods.', { icon: 'package', label: 'Ir a los mods', run: () => { $('#activity').hidden = true } })
    })
})

// ------------------------------------------------------------------ settings dialog

const SETTINGS_FIELDS = ['launcherRepoPath', 'empiPacksRepoPath', 'nebulaProjectPath', 'nebulaRootPath', 'launcherGithubRepo', 'empiPacksGithubRepo', 'largeFileThresholdMb']

$('#settingsBtn').addEventListener('click', async () => {
    const config = await api('/api/config')
    for (const field of SETTINGS_FIELDS) $(`#${field}`).value = config[field] ?? ''
    $('#settingsDialog').showModal()
})
$('#settingsCancel').addEventListener('click', () => $('#settingsDialog').close())
$('#settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault()
    const partial = {}
    for (const field of SETTINGS_FIELDS) {
        const el = $(`#${field}`)
        partial[field] = el.type === 'number' ? Number(el.value) : el.value.trim()
    }
    await api('/api/config', { method: 'POST', body: partial })
    $('#settingsDialog').close()
    toast('Ajustes guardados')
    renderHealth()
    refreshAll()
})

// ------------------------------------------------------------------ tabs & boot

$('#mainTabs').addEventListener('click', (event) => {
    const button = event.target.closest('.tab')
    if (!button) return
    state.tab = button.dataset.tab
    document.body.dataset.view = state.tab
    for (const tab of $('#mainTabs').children) {
        if (tab === button) tab.setAttribute('aria-current', 'page')
        else tab.removeAttribute('aria-current')
    }
    $('#tab-packs').hidden = state.tab !== 'packs'
    $('#tab-launcher').hidden = state.tab !== 'launcher'
    renderPipeline()
})

// Dropping a file outside a drop zone must not make the browser navigate away to it.
for (const type of ['dragover', 'drop']) window.addEventListener(type, (event) => event.preventDefault())
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll() })

render()
watchPresence()
renderHealth()
refreshAll()
