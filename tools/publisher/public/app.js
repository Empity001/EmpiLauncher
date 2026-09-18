/* Empi Publisher - vanilla JS, no build step. Talks to server.js (same origin). */

const $ = (selector) => document.querySelector(selector)

const CATEGORIES = [
    { id: 'required', title: 'Obligatorios', desc: 'Todos los jugadores los llevan.', icon: '🔒' },
    { id: 'optionalon', title: 'Opcionales · activados', desc: 'Vienen encendidos, se pueden apagar.', icon: '✅' },
    { id: 'optionaloff', title: 'Opcionales · apagados', desc: 'Vienen apagados, se pueden encender.', icon: '⬜' }
]
const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }
const JAVA_CHOICES = [['', 'Automático'], ['8', 'Java 8'], ['17', 'Java 17'], ['21', 'Java 21'], ['25', 'Java 25']]

const state = {
    tab: 'packs',
    packs: [],
    selectedId: null,
    pack: null,
    subtab: 'settings',
    draft: {},
    filter: '',
    packsStatus: { compiled: null, stale: false },
    launcher: null,
    launcherChoice: 'patch',
    notes: '',
    commitMessage: '',
    running: null,
    iconStamp: Date.now()
}

// ------------------------------------------------------------------ helpers

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

function bumpVersion(version, kind) {
    const [major, minor, patch] = String(version).split('.').map((part) => Number(part) || 0)
    if (kind === 'minor') return `${major}.${minor + 1}.0`
    return `${major}.${minor}.${(patch || 0) + 1}`
}

const packIconUrl = (pack) => `/api/packs/${encodeURIComponent(pack.id)}/icon?t=${state.iconStamp}`

// ------------------------------------------------------------------ activity drawer (live progress)

const activity = { steps: [], failed: false }

function renderSteps() {
    const list = $('#activitySteps')
    list.replaceChildren(...activity.steps.map((step, index) => {
        const isLast = index === activity.steps.length - 1
        let cls = 'done'
        let icon = h('span', {}, '✓')
        if (isLast && !activity.finished) {
            cls = 'current'
            icon = h('span', { class: 'spinner' })
        }
        if (isLast && activity.failed) {
            cls = 'failed'
            icon = h('span', {}, '✗')
        }
        return h('li', { class: cls }, h('span', { class: 'step-icon' }, icon), step)
    }))
}

function showBanner(kind, text, action) {
    const banner = $('#activityBanner')
    banner.className = `banner ${kind}`
    banner.replaceChildren(text)
    if (action) {
        banner.append(' ', h('button', { class: 'btn small', onclick: action.run }, action.label))
    }
    banner.hidden = false
}

function openActivity(title, subtitle) {
    activity.steps = []
    activity.finished = false
    activity.failed = false
    $('#activityTitle').textContent = title
    $('#activitySub').textContent = subtitle || 'No cierres esta ventana hasta que termine.'
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

function attachJob(jobId, title, onSuccess) {
    state.running = { jobId, title }
    if ($('#activity').hidden) openActivity(title)
    renderPipeline()

    const source = new EventSource(`/api/jobs/${jobId}/stream`)
    let finished = false
    source.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.line != null) appendLog(data.line)
        else if (data.step) {
            activity.steps.push(data.step)
            renderSteps()
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
    state.running = null
    activity.finished = true
    activity.failed = !!data.error
    renderSteps()
    $('#activityCancel').hidden = true
    $('#activityClose').hidden = false
    $('#activitySub').textContent = data.error ? 'Algo salió mal.' : 'Terminado.'
    if (data.error) {
        showBanner('err', data.error)
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
            ? [h('span', { class: 'pill ok' }, 'Todo listo ✓')]
            : problems.map(([label, hint]) => h('span', { class: 'pill bad', title: hint }, label))))
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
        openActivity(status.job.title)
        attachJob(status.job.id, status.job.title)
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
    render()
}

// ------------------------------------------------------------------ rendering: pack list & detail

function render() {
    renderPackList()
    renderPackDetail()
    renderLauncher()
    renderPipeline()
}

function renderPackList() {
    const list = $('#packList')
    if (state.packs.length === 0) {
        list.replaceChildren(h('p', { class: 'muted' }, 'Todavía no hay modpacks. Crea el primero con “+ Nuevo”.'))
        return
    }
    list.replaceChildren(...state.packs.map((pack) => h('button', {
        class: `pack-card${pack.id === state.selectedId ? ' active' : ''}`,
        onclick: () => selectPack(pack.id)
    },
    packIcon(pack),
    h('div', { class: 'pack-meta' },
        h('div', { class: 'pack-name' }, pack.name),
        h('div', { class: 'pack-sub' }, `${LOADER_NAMES[pack.loader.type] || '?'} · MC ${pack.minecraft} · v${pack.packVersion}`)))))
}

function packIcon(pack) {
    if (!pack.hasIcon) return h('div', { class: 'pack-icon' }, '📦')
    return h('img', { class: 'pack-icon', src: packIconUrl(pack), alt: '' })
}

async function selectPack(id) {
    state.selectedId = id
    state.draft = {}
    state.filter = ''
    try { state.pack = await api(`/api/packs/${encodeURIComponent(id)}`) } catch (err) { toast(err.message, true) }
    render()
}

function renderPackDetail() {
    const box = $('#packContent')
    const pack = state.pack
    if (!pack) {
        box.replaceChildren(h('div', { class: 'card empty' },
            h('h2', {}, 'Empieza creando un modpack'),
            h('p', {}, 'Pulsa “+ Nuevo”, elige la versión de Minecraft y el loader, y yo preparo todo por detrás.')))
        return
    }

    const modCount = pack.counts.required + pack.counts.optionalon + pack.counts.optionaloff
    const head = h('div', { class: 'card' },
        h('div', { class: 'pack-head' },
            h('label', { title: 'Cambiar icono (PNG)' },
                pack.hasIcon ? h('img', { class: 'pack-icon', src: packIconUrl(pack), alt: '' }) : h('div', { class: 'pack-icon' }, '📦'),
                h('input', { type: 'file', accept: 'image/png', hidden: true, onchange: (event) => uploadIcon(event.target.files[0]) })),
            h('div', { class: 'grow' },
                h('h1', {}, pack.name),
                h('div', { class: 'chips' },
                    h('span', { class: 'chip accent' }, `Minecraft ${pack.minecraft}`),
                    h('span', { class: 'chip accent' }, `${LOADER_NAMES[pack.loader.type] || 'Sin loader'} ${pack.loader.version || ''}`),
                    h('span', { class: 'chip' }, `Modpack v${pack.packVersion}`),
                    h('span', { class: 'chip' }, `${modCount} mods`))),
            h('button', { class: 'btn small', onclick: () => openFolder('root') }, 'Abrir carpeta')),
        h('div', { class: 'subtabs' },
            ...[['settings', 'Ajustes'], ['mods', `Mods (${modCount})`], ['files', 'Archivos']].map(([id, label]) => h('button', {
                class: `subtab${state.subtab === id ? ' active' : ''}`,
                onclick: () => { state.subtab = id; renderPackDetail() }
            }, label))),
        state.subtab === 'settings' ? settingsForm(pack) : state.subtab === 'mods' ? modsView(pack) : filesView(pack))

    box.replaceChildren(head)
    if (state.subtab === 'settings') fillLoaderVersions(pack)
}

function settingsForm(pack) {
    const value = (key, fallback) => (key in state.draft ? state.draft[key] : fallback)
    const meta = pack.meta
    const set = (key) => (event) => {
        state.draft[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value
        $('#saveMeta').disabled = false
    }

    const versionInput = h('input', { value: value('version', meta.version), oninput: set('version') })
    const bump = (kind) => h('button', {
        type: 'button', class: 'btn small',
        onclick: () => {
            versionInput.value = bumpVersion(versionInput.value || meta.version, kind)
            state.draft.version = versionInput.value
            $('#saveMeta').disabled = false
        }
    }, kind === 'minor' ? '+ menor' : '+ parche')

    const address = value('address', meta.address)

    return h('form', {
        onsubmit: (event) => { event.preventDefault(); saveMeta() }
    },
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
    h('div', { class: 'form-actions' },
        h('button', { class: 'btn primary', id: 'saveMeta', type: 'submit', disabled: Object.keys(state.draft).length === 0 }, 'Guardar cambios'),
        h('span', { class: 'muted' }, 'Guarda y luego pulsa “Compilar” abajo para preparar la publicación.')))
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
        toast('Guardado ✓')
        await refreshAll()
    } catch (err) {
        toast(err.message, true)
    }
}

// ---- mods

function modsView(pack) {
    const filter = state.filter.toLowerCase()
    const search = h('input', {
        placeholder: 'Buscar un mod…', value: state.filter,
        oninput: (event) => {
            state.filter = event.target.value
            const caret = event.target.selectionStart
            renderPackDetail()
            const again = $('.mods-toolbar input')
            again.focus()
            again.setSelectionRange(caret, caret)
        }
    })
    const picker = h('input', { type: 'file', accept: '.jar', multiple: true, hidden: true, onchange: (event) => uploadMods([...event.target.files], 'required') })

    return h('div', {},
        h('div', { class: 'mods-toolbar' }, search,
            h('button', { class: 'btn', type: 'button', onclick: () => picker.click() }, '+ Añadir mods'),
            picker,
            h('button', { class: 'btn', type: 'button', onclick: () => openFolder('mods') }, 'Abrir carpeta de mods')),
        h('p', { class: 'muted' }, 'Arrastra los .jar a la columna que corresponda. Se copian a la carpeta del modpack.'),
        h('div', { class: 'zones' }, ...CATEGORIES.map((category) => modZone(pack, category, filter))))
}

function modZone(pack, category, filter) {
    const files = pack.mods[category.id].filter((file) => file.name.toLowerCase().includes(filter))
    const zone = h('div', { class: 'zone' },
        h('div', { class: 'zone-head' }, h('h3', {}, category.title), h('span', { class: 'muted' }, String(pack.mods[category.id].length))),
        h('div', { class: 'zone-desc' }, category.desc),
        h('div', { class: 'zone-list' },
            files.length === 0
                ? h('div', { class: 'zone-empty' }, filter ? 'Sin resultados' : 'Suelta aquí los .jar')
                : files.map((file) => h('div', { class: 'mod-row' },
                    h('span', { class: 'name', title: file.name }, file.name),
                    h('span', { class: 'size' }, formatSize(file.size)),
                    ...CATEGORIES.filter((other) => other.id !== category.id).map((other) =>
                        h('button', { title: `Mover a ${other.title}`, onclick: () => moveMod(file.name, category.id, other.id) }, other.icon)),
                    h('button', { class: 'del', title: 'Quitar del modpack', onclick: () => deleteMod(file.name, category.id) }, '🗑')))))

    zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('over') })
    zone.addEventListener('dragleave', () => zone.classList.remove('over'))
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
        toast(`Subiendo ${index + 1}/${jars.length}: ${file.name}`)
        try {
            await api(`/api/packs/${encodeURIComponent(state.selectedId)}/mods?category=${category}&name=${encodeURIComponent(file.name)}`, { method: 'POST', raw: file })
        } catch (err) {
            toast(`${file.name}: ${err.message}`, true)
            break
        }
    }
    if (jars.length) {
        toast(`${jars.length} mod(s) añadidos ✓`)
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
    toast('Icono actualizado ✓')
    await refreshAll()
}

function openFolder(what) {
    api(`/api/packs/${encodeURIComponent(state.selectedId)}/open`, { method: 'POST', body: { what } }).catch((err) => toast(err.message, true))
}

function filesView(pack) {
    return h('div', {},
        h('p', {}, 'Aquí van las cosas que no son mods: ',
            h('b', {}, 'configuraciones, resource packs, shaders, options.txt, servers.dat'),
            '… Todo lo que pongas en la carpeta “files” se copia al Minecraft de cada jugador.'),
        h('div', { class: 'form-actions' },
            h('button', { class: 'btn primary', onclick: () => openFolder('files') }, 'Abrir carpeta “files”'),
            h('span', { class: 'muted' }, 'Cuando termines de copiar cosas, vuelve aquí y pulsa Compilar.')),
        h('h3', { style: 'margin-top:20px' }, 'Contenido actual'),
        h('div', { class: 'chips' }, pack.filesEntries.length ? pack.filesEntries.map((name) => h('span', { class: 'chip' }, name)) : h('span', { class: 'muted' }, 'La carpeta está vacía.')))
}

// ------------------------------------------------------------------ pipeline footer (Editar -> Compilar -> Enviar)

function step(number, { done, current }, ...content) {
    return h('div', { class: `pstep${done ? ' done' : ''}${current ? ' current' : ''}` }, h('div', { class: 'pnum' }, done ? '✓' : number), h('div', { class: 'pinfo' }, ...content))
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
        const largeCount = compiled ? compiled.large.filter((file) => file.needsUpload).length : 0
        const largeBytes = compiled ? compiled.large.filter((file) => file.needsUpload).reduce((sum, file) => sum + file.size, 0) : 0

        let compileHint = 'Aún no compilado'
        if (stale) compileHint = 'Hay cambios nuevos: compila otra vez'
        else if (fresh) compileHint = `Compilado ${ago(compiled.at)}`

        let sendHint = 'Primero compila'
        if (canSend) sendHint = `${compiled.changes.total} cambios${largeCount ? ` · ${largeCount} archivo(s) grande(s), ${formatSize(largeBytes)}, van a Releases` : ''}`
        else if (sent) sendHint = `Enviado ${ago(compiled.sentAt)}`
        else if (nothingNew) sendHint = 'Todo está al día, nada que enviar'

        footer.replaceChildren(...[
            step(1, { done: state.packs.length > 0 }, h('b', {}, 'Editar'), h('span', { class: 'hint' }, 'Crea modpacks y sube mods')),
            connector(true),
            step(2, { done: fresh, current: !fresh }, h('button', { class: `btn ${fresh ? '' : 'primary'} big`, disabled: busy || state.packs.length === 0, onclick: compilePacks }, fresh ? 'Compilar de nuevo' : 'Compilar'), h('span', { class: 'hint' }, compileHint)),
            connector(fresh),
            step(3, { done: sent || nothingNew, current: canSend },
                h('button', { class: `btn ${canSend ? 'primary' : ''} big`, disabled: busy || !canSend, onclick: sendPacks }, 'Enviar'),
                h('span', { class: 'hint' }, sendHint)),
            canSend ? h('input', {
                class: 'pmessage', placeholder: compiled.suggestedMessage, value: state.commitMessage,
                oninput: (event) => { state.commitMessage = event.target.value }, title: 'Mensaje del cambio (opcional)'
            }) : null].filter(Boolean))
        return
    }

    const info = state.launcher
    // A compiled installer only counts if it is the version currently chosen above.
    const build = info && info.build && info.build.version === launcherVersion() ? info.build : null
    const other = info && info.build && !build ? info.build : null
    const canSend = !!build && !build.sent
    footer.replaceChildren(
        step(1, { done: true }, h('b', {}, 'Elegir versión'), h('span', { class: 'hint' }, 'Y contar qué cambia')),
        connector(true),
        step(2, { done: !!build, current: !build }, h('button', { class: `btn ${build ? '' : 'primary'} big`, disabled: busy || !info, onclick: compileLauncher }, build ? 'Compilar de nuevo' : 'Compilar'),
            h('span', { class: 'hint' }, build ? `Instalador v${build.version} listo (${formatSize(build.size)})` : other ? `Hay uno de v${other.version}; para v${launcherVersion()} compila otra vez` : 'Genera el instalador (unos minutos)')),
        connector(!!build),
        step(3, { done: !!build && build.sent, current: canSend },
            h('button', { class: `btn ${canSend ? 'primary' : ''} big`, disabled: busy || !canSend, onclick: sendLauncher }, 'Enviar'),
            h('span', { class: 'hint' }, build ? (build.sent ? `v${build.version} ya está publicada` : 'Sube la versión a GitHub para que se actualicen') : 'Primero compila')))
}

function compilePacks() {
    runJob('Compilar modpacks', '/api/jobs/compile-packs', {}, (compiled) => {
        if (!compiled) return
        const { total } = compiled.changes
        showBanner('ok', total === 0
            ? 'Todo estaba ya al día, no hay nada nuevo que enviar.'
            : `Listo para enviar: ${total} cambios${compiled.large.some((f) => f.needsUpload) ? ' (los archivos grandes irán a Releases)' : ''}. Cierra esto y pulsa “Enviar”.`)
    })
}

function sendPacks() {
    runJob('Enviar modpacks', '/api/jobs/send-packs', { message: state.commitMessage }, () => {
        state.commitMessage = ''
        showBanner('ok', 'Publicado ✓ GitHub Pages tarda un par de minutos en mostrar los cambios; luego el launcher los descarga solo.')
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
        box.replaceChildren(h('p', { class: 'muted' }, 'Cargando…'))
        return
    }

    const choice = (id, title, detail) => h('button', {
        class: `choice${state.launcherChoice === id ? ' active' : ''}`,
        onclick: () => { state.launcherChoice = id; renderLauncher(); renderPipeline() }
    }, h('b', {}, id === 'same' ? info.version : info.next[id]), h('span', {}, `${title} · ${detail}`))

    box.replaceChildren(
        h('div', { class: 'stat-row' },
            h('div', { class: 'card stat' }, h('span', { class: 'muted' }, 'Versión en tu código'), h('div', { class: 'num' }, `v${info.version}`)),
            h('div', { class: 'card stat' }, h('span', { class: 'muted' }, 'Última publicada en GitHub'), h('div', { class: 'num accent' }, info.latestTag || '—'))),
        h('div', { class: 'card' },
            h('h2', {}, '1 · ¿Qué versión vas a publicar?'),
            h('div', { class: 'version-choices' },
                choice('patch', 'Parche', 'arreglos pequeños'),
                choice('minor', 'Menor', 'cosas nuevas'),
                choice('major', 'Mayor', 'cambio grande'),
                choice('same', 'La misma', 'reintentar')),
            info.dirty > 0 ? h('p', { class: 'muted' }, `Tienes ${info.dirty} archivo(s) modificados en el código: se subirán junto con esta versión.`) : null),
        h('div', { class: 'card' },
            h('h2', {}, '2 · ¿Qué cambia?'),
            h('p', { class: 'muted' }, 'Este texto aparece en la página de la versión en GitHub. Puedes dejarlo vacío.'),
            h('textarea', { placeholder: '- Arreglado el login\n- Nuevo fondo', oninput: (event) => { state.notes = event.target.value } }, state.notes)),
        info.build && info.build.version === launcherVersion() ? h('div', { class: 'card' },
            h('h2', {}, 'Instalador compilado'),
            h('p', {}, `${info.build.name} · ${formatSize(info.build.size)} · ${ago(info.build.at)}`),
            info.build.sent ? h('p', { class: 'muted' }, 'Ya está publicado en GitHub.') : h('p', { class: 'muted' }, 'Listo: pulsa “Enviar” abajo para publicarlo.')) : null)
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
        showBanner('ok', 'Publicado ✓ El launcher de los jugadores se actualizará solo.', result && result.url ? { label: 'Ver en GitHub', run: () => window.open(result.url, '_blank') } : null)
    })
}

// ------------------------------------------------------------------ new modpack dialog

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
    const dialog = $('#newPackDialog')
    $('#npName').value = ''
    dialog.showModal()
    updateNewPackPreview()
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

$('#newPackBtn').addEventListener('click', openNewPack)
$('#npCancel').addEventListener('click', () => $('#newPackDialog').close())
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
    for (const other of $('#npLoader').children) other.classList.toggle('active', other === button)
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

    $('#newPackDialog').close()
    runJob(`Crear ${id}-${minecraft}`, '/api/jobs/create-pack', { id, minecraft, loader: newPack.loader, loaderVersion, displayName: name }, async (result) => {
        await refreshPacks()
        if (result && result.id) {
            state.selectedId = result.id
            state.subtab = 'mods'
            state.pack = await api(`/api/packs/${encodeURIComponent(result.id)}`)
        }
        render()
        showBanner('ok', 'Modpack creado ✓ Ahora sube sus mods.', { label: 'Ir a los mods', run: () => { $('#activity').hidden = true } })
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
    toast('Ajustes guardados ✓')
    renderHealth()
    refreshAll()
})

// ------------------------------------------------------------------ tabs & boot

$('#mainTabs').addEventListener('click', (event) => {
    const button = event.target.closest('.tab')
    if (!button) return
    state.tab = button.dataset.tab
    for (const tab of $('#mainTabs').children) tab.classList.toggle('active', tab === button)
    $('#tab-packs').hidden = state.tab !== 'packs'
    $('#tab-launcher').hidden = state.tab !== 'launcher'
    renderPipeline()
})

// Dropping a file outside a drop zone must not make the browser navigate away to it.
for (const type of ['dragover', 'drop']) window.addEventListener(type, (event) => event.preventDefault())
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll() })

watchPresence()
renderHealth()
refreshAll()
