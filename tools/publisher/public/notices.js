/* Empi Publisher - the Avisos tab. Loaded before app.js and uses its helpers (h, icon, api, toast, runJob, state...).
   Three views: the notices (each one is a newspaper PAGE built here, piece by piece, and sent to the launcher as an image), the modpacks
   (maintenance, schedule, "novedades" link) and the launcher (minimum version). The rules and the file format live in lib/notices.js.

   The page you see IS a canvas: the same drawing is what gets saved as the image, so what you build is exactly what the launcher shows. */

const PAGE = { w: 900, h: 1200, grid: 10 }
const FONTS = { dot: 'Doto', mono: '"Geist Mono","Cascadia Mono",Consolas,monospace', body: '"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif' }
const FONT_NAMES = { dot: 'Puntos', mono: 'Mono', body: 'Cuerpo' }
const PALETTE = { paper: '#f1efe8', dim: '#8a8880', red: '#ff5a4d', amber: '#f5a524', pink: '#ff3d8b', ink: '#0b0b0c' }
const COLOR_NAMES = { paper: 'Crema', dim: 'Gris', red: 'Rojo', amber: 'Ámbar', pink: 'Rosa', ink: 'Negro' }
const SEVERITY_NAMES = { info: 'Información', important: 'Importante', critical: 'Crítico' }
const PIECES = [['title', 'Titular', 'heading'], ['subtitle', 'Subtítulo', 'text'], ['text', 'Texto', 'list'], ['image', 'Imagen', 'image'], ['box', 'Recuadro', 'square'], ['rule', 'Línea', 'minus'], ['tag', 'Etiqueta', 'tag']]

const nu = {
    data: null, error: null, sub: 'avisos', id: null, draft: null, dirty: false, saving: false,
    selected: null, history: [], future: [], images: new Map(), overflow: new Set(), scale: 0.6,
    access: null, accessDirty: false, openPack: null, newAllow: {}
}
let nuBlockCounter = 1
const nuNewId = () => `b${Date.now().toString(36)}${nuBlockCounter++}`

// ---------------------------------------------------------------- drawing: one function draws the page, on screen and for the image

/** Words wrapped to a width; a word longer than the line is broken. Blank lines are kept. */
function nuWrap(ctx, text, maxWidth) {
    const lines = []
    for (const paragraph of String(text).split('\n')) {
        if (paragraph.trim() === '') { lines.push(''); continue }
        let line = ''
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            let candidate = line ? `${line} ${word}` : word
            if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; continue }
            if (line) { lines.push(line); line = '' }
            candidate = word
            while (ctx.measureText(candidate).width > maxWidth && candidate.length > 1) {
                let cut = candidate.length - 1
                while (cut > 1 && ctx.measureText(candidate.slice(0, cut)).width > maxWidth) cut--
                lines.push(candidate.slice(0, cut))
                candidate = candidate.slice(cut)
            }
            line = candidate
        }
        lines.push(line)
    }
    return lines
}

function nuSetFont(ctx, b) {
    const weight = b.font === 'dot' ? 700 : b.type === 'title' ? 700 : 400
    ctx.font = `${weight} ${b.size}px ${FONTS[b.font] || FONTS.body}`
    ctx.letterSpacing = b.font === 'dot' ? '1px' : b.font === 'mono' ? `${Math.round(b.size * 0.08)}px` : '0px'
}

const PAD = 12

/** Draws one piece; returns true when its text does not fit in its box. */
function nuDrawBlock(ctx, b, images, forExport = false) {
    const color = PALETTE[b.color] || PALETTE.paper
    let overflow = false
    ctx.save()
    if (b.type === 'rule') {
        ctx.fillStyle = color
        ctx.fillRect(b.x, b.y + Math.max(0, b.h / 2 - 1), b.w, Math.max(2, Math.min(b.h, 4)))
    } else if (b.type === 'image') {
        const img = b.asset ? images.get(b.asset) : null
        ctx.strokeStyle = 'rgba(241,239,232,.28)'
        ctx.lineWidth = 2
        if (img && img.complete && img.naturalWidth) {
            ctx.save()
            ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip()
            const cover = b.fit !== 'contain'
            const ratio = (cover ? Math.max : Math.min)(b.w / img.naturalWidth, b.h / img.naturalHeight)
            const dw = img.naturalWidth * ratio, dh = img.naturalHeight * ratio
            if (!cover) { ctx.fillStyle = '#141416'; ctx.fillRect(b.x, b.y, b.w, b.h) }
            ctx.drawImage(img, b.x + (b.w - dw) / 2, b.y + (b.h - dh) / 2, dw, dh)
            ctx.restore()
            ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2)
        } else if (!forExport) {
            ctx.fillStyle = '#141416'; ctx.fillRect(b.x, b.y, b.w, b.h)
            ctx.setLineDash([10, 8]); ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); ctx.setLineDash([])
            ctx.fillStyle = PALETTE.dim; ctx.font = `400 22px ${FONTS.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(b.asset ? 'Cargando imagen…' : 'Imagen', b.x + b.w / 2, b.y + b.h / 2)
        }
    } else if (b.type === 'box' || b.type === 'tag') {
        const fill = b.type === 'tag' ? color : PALETTE.paper
        ctx.fillStyle = fill; ctx.fillRect(b.x, b.y, b.w, b.h)
        ctx.fillStyle = PALETTE.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        nuSetFont(ctx, { ...b, font: b.font === 'dot' ? 'dot' : 'mono' })
        const text = String(b.text || '')
        if (ctx.measureText(text).width > b.w - PAD * 2) overflow = true
        ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 1)
    } else {
        const cw = b.w - PAD * 2, ch = b.h - PAD * 2
        nuSetFont(ctx, b)
        const lh = Math.round(b.size * (b.type === 'title' ? 1.06 : 1.4))
        const columns = b.type === 'text' && b.columns === 2 ? 2 : 1
        const colW = columns === 2 ? (cw - 24) / 2 : cw
        const lines = nuWrap(ctx, b.text || '', colW)
        const perColumn = Math.max(1, Math.floor(ch / lh))
        if (lines.length > perColumn * columns) overflow = true
        ctx.fillStyle = color; ctx.textBaseline = 'top'
        ctx.textAlign = b.align === 'center' ? 'center' : 'left'
        lines.forEach((line, i) => {
            const col = Math.min(columns - 1, Math.floor(i / perColumn)), row = i - col * perColumn
            const x0 = b.x + PAD + col * (colW + 24)
            ctx.fillText(line, b.align === 'center' ? x0 + colW / 2 : x0, b.y + PAD + row * lh)
        })
    }
    ctx.restore()
    return overflow
}

/** The whole page. `images` maps an asset name to a loaded Image. Returns the ids of the pieces whose text does not fit. */
function nuDrawPage(ctx, editor, images, forExport = false) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = PALETTE.ink; ctx.fillRect(0, 0, PAGE.w, PAGE.h)
    ctx.fillStyle = 'rgba(241,239,232,.10)'
    for (let x = 9; x < PAGE.w; x += 18) for (let y = 9; y < PAGE.h; y += 18) { ctx.beginPath(); ctx.arc(x, y, 1.15, 0, Math.PI * 2); ctx.fill() }
    ctx.strokeStyle = 'rgba(241,239,232,.22)'; ctx.lineWidth = 2; ctx.strokeRect(9, 9, PAGE.w - 18, PAGE.h - 18)
    ctx.restore()
    const over = new Set()
    for (const b of editor.blocks) if (nuDrawBlock(ctx, b, images, forExport)) over.add(b.id)
    return over
}

// ---------------------------------------------------------------- templates

const nuTemplates = {
    portada: () => [
        { type: 'rule', x: 40, y: 44, w: 820, h: 6, color: 'paper' },
        { type: 'text', x: 40, y: 58, w: 820, h: 50, text: 'EMPI · AVISOS', font: 'mono', size: 26, align: 'center', color: 'paper' },
        { type: 'rule', x: 40, y: 112, w: 820, h: 6, color: 'paper' },
        { type: 'title', x: 40, y: 140, w: 820, h: 230, text: 'TITULAR DEL AVISO', font: 'dot', size: 88, color: 'paper' },
        { type: 'subtitle', x: 40, y: 380, w: 820, h: 70, text: 'Una nota corta que cuenta de qué va el aviso', font: 'body', size: 30, color: 'dim' },
        { type: 'image', x: 40, y: 470, w: 820, h: 300, fit: 'cover' },
        { type: 'text', x: 40, y: 800, w: 540, h: 360, text: 'Escribe aquí el cuerpo del aviso. Puedes ponerlo en una o dos columnas.', font: 'body', size: 24, color: 'paper', columns: 1 },
        { type: 'box', x: 620, y: 800, w: 240, h: 64, text: 'IMPORTANTE', size: 24 },
        { type: 'text', x: 620, y: 880, w: 240, h: 280, text: 'Una nota aparte, más corta.', font: 'body', size: 22, color: 'dim' }
    ],
    extra: () => [
        { type: 'tag', x: 40, y: 60, w: 220, h: 66, text: 'EXTRA!', size: 34, color: 'amber' },
        { type: 'title', x: 40, y: 150, w: 820, h: 280, text: 'ALGO IMPORTANTE HA PASADO', font: 'dot', size: 110, color: 'paper' },
        { type: 'rule', x: 40, y: 450, w: 820, h: 6, color: 'paper' },
        { type: 'text', x: 40, y: 480, w: 820, h: 600, text: '+ Primera cosa que quieres contar\n+ Segunda cosa\n+ Tercera cosa', font: 'body', size: 34, color: 'paper', columns: 1 }
    ],
    comunicado: () => [
        { type: 'text', x: 40, y: 50, w: 820, h: 50, text: 'COMUNICADO', font: 'mono', size: 24, color: 'dim' },
        { type: 'title', x: 40, y: 110, w: 820, h: 170, text: 'TÍTULO DEL COMUNICADO', font: 'dot', size: 76, color: 'paper' },
        { type: 'rule', x: 40, y: 300, w: 820, h: 4, color: 'dim' },
        { type: 'text', x: 40, y: 330, w: 820, h: 620, text: 'Escribe aquí el texto. En dos columnas se lee mejor cuando es largo.', font: 'body', size: 26, color: 'paper', columns: 2 },
        { type: 'text', x: 40, y: 1080, w: 820, h: 70, text: 'Gracias por leerlo.', font: 'body', size: 22, color: 'dim' }
    ]
}

function nuBlockDefaults(type) {
    const base = { id: nuNewId(), type, x: 60, y: 60, w: 400, h: 120, text: '', font: 'body', size: 26, align: 'left', color: 'paper', columns: 1 }
    const kinds = {
        title: { text: 'TITULAR', font: 'dot', size: 80, h: 160, w: 780 },
        subtitle: { text: 'Subtítulo', size: 30, h: 70, w: 780, color: 'dim' },
        text: { text: 'Escribe aquí.', size: 24, h: 240, w: 500 },
        image: { w: 500, h: 300, asset: null, fit: 'cover' },
        box: { text: 'IMPORTANTE', font: 'mono', size: 24, w: 260, h: 64 },
        rule: { w: 780, h: 6 },
        tag: { text: 'EXTRA!', font: 'mono', size: 30, w: 220, h: 64, color: 'amber' }
    }
    return { ...base, ...kinds[type] }
}

// ---------------------------------------------------------------- loading and saving

const NU_ICONS = {
    heading: '<path d="M5 5v14M19 5v14M5 12h14"/>', text: '<path d="M5 6h14M12 6v13"/>', list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    square: '<rect x="5" y="5" width="14" height="14"/>', minus: '<path d="M5 12h14"/>', tag: '<path d="M4 4h9l7 7-9 9-7-7z"/>',
    undo: '<path d="M8 6 4 10l4 4M4 10h10a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m16 6 4 4-4 4M20 10H10a5 5 0 0 0 0 10h3"/>'
}

async function noticesEnter() {
    for (const [name, svg] of Object.entries(NU_ICONS)) if (!(name in ICONS)) ICONS[name] = svg
    if (!nu.data) $('#noticesContent').replaceChildren(h('div', { class: 'skeleton', style: 'height:320px' }))
    await loadNotices()
}

async function loadNotices(keepSelection = true) {
    try {
        nu.data = await api('/api/notices')
        nu.error = null
        if (!nu.access || !nu.accessDirty) nu.access = { modpacks: structuredClone(nu.data.modpacks), launcher: structuredClone(nu.data.launcher) }
        const known = nu.data.notices.find((n) => n.id === nu.id)
        if (!keepSelection || !known) nuSelectNotice(nu.data.notices[0]?.id || null, false)
        else if (!nu.dirty) nuSelectNotice(nu.id, false)
    } catch (err) {
        nu.data = null
        nu.error = err.message === 'No encontrado' ? 'Este Publisher es anterior a los avisos. Ciérralo y ábrelo de nuevo con su acceso directo.' : err.message
    }
    nuPaint()
}

function nuSelectNotice(id, paint = true) {
    nu.id = id
    const found = nu.data && nu.data.notices.find((n) => n.id === id)
    nu.draft = found ? structuredClone(found) : null
    if (nu.draft && !nu.draft.editor) nu.draft.editor = { blocks: [] }
    if (nu.draft) { nu.draft.expiresLocal = nuToLocal(nu.draft.expiresAt); nu.draft.startsLocal = nuToLocal(nu.draft.startsAt) }
    nu.selected = null; nu.dirty = false; nu.history = []; nu.future = []
    if (paint) nuPaint()
}

function nuToLocal(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const nuFromLocal = (local) => (local ? new Date(local).toISOString() : null)

async function nuNewNotice() {
    if (nu.dirty && !confirm('Tienes cambios sin guardar en este aviso. ¿Descartarlos?')) return
    try {
        const made = await api('/api/notices', { method: 'POST', body: { title: 'Aviso nuevo', severity: 'info', targets: ['*'], published: true, editor: { blocks: nuTemplates.portada().map((b) => ({ ...nuBlockDefaults(b.type), ...b, id: nuNewId() })) } } })
        nu.data = await api('/api/notices')
        nuSelectNotice(made.id)
    } catch (err) { toast(err.message, true) }
}

/** Renders the page into a Blob (WebP when the browser can, PNG otherwise). */
async function nuRenderBlob(editor) {
    await nuLoadAssets(editor)
    const canvas = document.createElement('canvas')
    canvas.width = PAGE.w; canvas.height = PAGE.h
    nuDrawPage(canvas.getContext('2d'), editor, nu.images, true)
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.88))
}

async function nuSave() {
    const d = nu.draft
    if (!d || nu.saving) return
    if (!d.title.trim()) { toast('Ponle un título corto al aviso (sale en el aviso de arranque y en la lista).', true); return }
    nu.saving = true; nuPaintBar()
    try {
        const summary = d.editor.blocks.filter((b) => ['title', 'subtitle', 'text'].includes(b.type)).map((b) => b.text).join(' ').replace(/\s+/g, ' ').slice(0, 400)
        await api(`/api/notices/${encodeURIComponent(d.id)}`, { method: 'POST', body: { title: d.title, severity: d.severity, targets: d.targets, summary, startsAt: nuFromLocal(d.startsLocal), expiresAt: nuFromLocal(d.expiresLocal), button: d.button && d.button.label && d.button.url ? d.button : null, editor: d.editor, published: d.published === true } })
        const blob = await nuRenderBlob(d.editor)
        await api(`/api/notices/${encodeURIComponent(d.id)}/image`, { method: 'POST', raw: blob })
        nu.dirty = false
        toast('Aviso guardado.')
        await loadNotices()
    } catch (err) { toast(err.message, true) }
    nu.saving = false
    nuPaint()
}

async function nuDelete() {
    if (!nu.draft || !confirm(`¿Borrar el aviso "${nu.draft.title}"? Si estaba publicado, deja de verse en el próximo "Publicar avisos".`)) return
    try { await api(`/api/notices/${encodeURIComponent(nu.draft.id)}`, { method: 'DELETE' }); nu.id = null; await loadNotices(false); toast('Aviso borrado.') } catch (err) { toast(err.message, true) }
}

function nuAsset(id, name) {
    const key = `${id}/${name}`
    if (!nu.images.has(name)) {
        const img = new Image()
        img.onload = () => { if (nu.draft && nu.draft.id === id) nuRedraw() }
        img.src = `/api/notices/${encodeURIComponent(id)}/asset/${encodeURIComponent(name)}`
        nu.images.set(name, img)
        nu.images.set(key, img)
    }
    return nu.images.get(name)
}
function nuLoadAssets(editor) {
    const waits = []
    for (const b of editor.blocks) if (b.type === 'image' && b.asset) {
        const img = nuAsset(nu.draft.id, b.asset)
        if (!img.complete) waits.push(new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }) }))
    }
    return Promise.all(waits)
}

/** A picture chosen for an image piece: shrunk here (never sent big), stored with the notice, placed by its name. */
async function nuPickImage(block, file) {
    if (!file) return
    try {
        const bitmap = await createImageBitmap(file)
        const scale = Math.min(1, 1100 / bitmap.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86))
        const { name } = await api(`/api/notices/${encodeURIComponent(nu.draft.id)}/asset`, { method: 'POST', raw: blob })
        nuPush()
        block.asset = name
        nu.dirty = true
        nuAsset(nu.draft.id, name)
        nuRedraw(); nuPaintProps(); nuPaintBar()
    } catch (err) { toast(err.message.includes('Guarda primero') ? err.message : `No se pudo usar esa imagen: ${err.message}`, true) }
}

// ---------------------------------------------------------------- history

function nuPush() {
    nu.history.push(JSON.stringify(nu.draft.editor.blocks))
    if (nu.history.length > 80) nu.history.shift()
    nu.future = []
}
function nuUndo(redo = false) {
    const from = redo ? nu.future : nu.history
    if (!from.length) return
    ;(redo ? nu.history : nu.future).push(JSON.stringify(nu.draft.editor.blocks))
    nu.draft.editor.blocks = JSON.parse(from.pop())
    if (!nu.draft.editor.blocks.some((b) => b.id === nu.selected)) nu.selected = null
    nu.dirty = true
    nuRedraw(); nuPaintProps(); nuPaintBar()
}
const nuBlock = () => nu.draft && nu.draft.editor.blocks.find((b) => b.id === nu.selected)

// ---------------------------------------------------------------- painting the tab

function nuPaint() {
    const box = $('#noticesContent')
    if (!box) return
    if (nu.error) { box.replaceChildren(h('div', { class: 'module' }, h('h2', {}, 'Avisos'), h('p', { class: 'muted' }, nu.error))); return }
    if (!nu.data) { box.replaceChildren(h('div', { class: 'skeleton', style: 'height:320px' })); return }

    const segmented = h('div', { class: 'segmented', role: 'tablist' },
        [['avisos', 'Avisos'], ['modpacks', 'Modpacks'], ['launcher', 'Launcher']].map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(nu.sub === id), class: nu.sub === id ? 'active' : '', onclick: () => { nu.sub = id; nuPaint() } }, label)))
    const body = nu.sub === 'avisos' ? nuNoticesView() : nu.sub === 'modpacks' ? nuModpacksView() : nuLauncherView()
    box.replaceChildren(h('div', { class: 'nx' }, h('div', { class: 'nx-top' }, segmented, h('div', { class: 'nx-bar', id: 'nxBar' })), body))
    nuPaintBar()
    if (nu.sub === 'avisos' && nu.draft) { nuRedraw(); nuPaintProps() }
    Life?.refresh()
}

/** The strip at the top right: what is unsaved, what is unpublished, and the button that sends it all. */
function nuPaintBar() {
    const bar = $('#nxBar')
    if (!bar || !nu.data) return
    const pending = nu.data.published.pending || nu.accessDirty
    const at = nu.data.published.at
    const drafts = nu.data.notices.filter((n) => !n.published).length
    bar.replaceChildren(
        h('span', { class: 'muted nx-status' }, nu.dirty || nu.accessDirty ? 'Hay cambios sin guardar' : pending ? 'Hay cambios sin publicar' : at ? `Publicado ${ago(at)}` : 'Nada publicado todavía'),
        drafts > 0 && h('span', { class: 'chip warn', title: 'Un borrador no se publica. Ábrelo y marca «Publicarlo con Publicar avisos».' }, drafts === 1 ? '1 aviso en borrador' : `${drafts} avisos en borrador`),
        h('button', { class: 'btn small', disabled: nu.saving || !!state.running, title: 'Comprueba que los enlaces de los botones abren, sin publicar nada', onclick: nuCheckLinks }, 'Comprobar enlaces'),
        h('button', { class: 'btn small', disabled: nu.saving || !!state.running, title: 'Los jugadores vuelven a ver los avisos como antes de la última publicación', onclick: nuUndo }, 'Deshacer última publicación'),
        h('button', { class: 'btn paper', disabled: nu.saving || !!state.running, onclick: nuPublish }, withIcon('upload', 'Publicar avisos'))
    )
}

/** The links that would go out, with what each one does: a list for a person to read. */
function nuLinkReport(out) {
    const line = (r) => `• ${r.where}: ${r.ok === true ? 'abre' : r.ok === null ? `no pude confirmarlo (${r.note})` : r.note}`
    return out.results.filter((r) => r.ok !== true).map(line).join('\n')
}

async function nuCheckLinks() {
    try {
        const out = await api('/api/notices/check-links', { method: 'POST', body: {} })
        if (!out.results.length) { toast('No hay enlaces publicados que comprobar.'); return }
        if (!out.broken && !out.unknown) { toast(`Los ${out.results.length} enlaces abren.`); return }
        alert(`${out.results.length - out.broken - out.unknown} de ${out.results.length} enlaces abren.\n\n${nuLinkReport(out)}`)
    } catch (err) { toast(err.message, true) }
}

async function nuUndo() {
    if (!confirm('Los jugadores volverán a ver los avisos, los mantenimientos y la versión mínima como estaban ANTES de la última publicación.\n\nTus borradores no se tocan: se quedan aquí, marcados como sin publicar.\n\n¿Deshacer la última publicación?')) return
    runJob('Deshacer la última publicación de avisos', '/api/jobs/undo-notices', {}, () => { toast('Deshecho. Los jugadores lo verán en 1-2 minutos.'); loadNotices() })
}

async function nuPublish() {
    if (nu.dirty || nu.accessDirty) {
        if (!confirm('Tienes cambios sin guardar. Se publica solo lo que está guardado. ¿Continuar?')) return
    }
    // a button that leads nowhere is found out by the players: look first
    try {
        const links = await api('/api/notices/check-links', { method: 'POST', body: {} })
        if (links.broken && !confirm(`Estos enlaces no abren:\n\n${nuLinkReport({ results: links.results.filter((r) => r.ok === false) })}\n\n¿Publicar de todos modos?`)) return
    } catch { /* the check is a courtesy: without it publishing goes on */ }
    const drafts = nu.data.notices.filter((n) => !n.published).length
    runJob('Publicar avisos', '/api/jobs/publish-notices', {}, () => { toast(drafts ? `Avisos publicados. ${drafts === 1 ? 'Un aviso sigue' : `${drafts} avisos siguen`} como borrador y no se ve.` : 'Avisos publicados.'); loadNotices() })
}

// ---- view 1: the notices

function nuNoticesView() {
    const list = nu.data.notices.map((n) => {
        const where = n.targets.includes('*') ? 'General' : n.targets.length === 1 ? (nu.data.packs.find((p) => p.id === n.targets[0])?.name || n.targets[0]) : `${n.targets.length} modpacks`
        return h('button', { class: `nx-item${n.id === nu.id ? ' on' : ''}`, onclick: () => { if (n.id === nu.id) return; if (nu.dirty && !confirm('Tienes cambios sin guardar en este aviso. ¿Descartarlos?')) return; nuSelectNotice(n.id) } },
            h('span', { class: `nx-dot ${n.severity}`, title: SEVERITY_NAMES[n.severity] }),
            h('span', { class: 'nx-item-text' }, h('b', {}, n.title), h('small', { class: 'muted' }, `${where} · ${n.published ? (n.startsAt && Date.parse(n.startsAt) > Date.now() ? `Programado: se ve el ${new Date(n.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Publicado') : 'Borrador'}${n.expiresAt ? ` · caduca ${new Date(n.expiresAt).toLocaleDateString()}` : ''}`)))
    })
    const side = h('section', { class: 'module nx-side' },
        h('div', { class: 'module-head' }, h('h2', {}, 'Avisos'), h('span', { class: 'chip tnum' }, String(nu.data.notices.length)), h('button', { class: 'btn paper small', onclick: nuNewNotice }, withIcon('plus', 'Nuevo'))),
        list.length ? h('div', { class: 'nx-list' }, list) : h('p', { class: 'muted' }, 'Todavía no hay avisos. Pulsa Nuevo y construye la primera página.'))
    if (!nu.draft) return h('div', { class: 'nx-avisos' }, side, h('section', { class: 'module nx-empty' }, h('h2', {}, 'Un aviso es una página de periódico'), h('p', { class: 'muted' }, 'La construyes aquí pieza a pieza (titulares, textos, imágenes, recuadros) y el launcher la muestra tal cual. Elige una plantilla al crear uno nuevo.')))
    return h('div', { class: 'nx-avisos' }, side, h('div', { class: 'nx-editor' }, nuCanvasCard(), h('div', { class: 'nx-right' }, h('section', { class: 'module', id: 'nxProps' }), nuDataCard())))
}

function nuCanvasCard() {
    const tools = h('div', { class: 'nx-tools' },
        PIECES.map(([type, label, ic]) => h('button', { class: 'btn small', title: `Añadir ${label.toLowerCase()}`, onclick: () => nuAddBlock(type) }, withIcon(ic, label))),
        h('span', { class: 'nx-tools-gap' }),
        h('select', { 'aria-label': 'Plantilla', onchange: (e) => { nuApplyTemplate(e.target.value); e.target.value = '' } },
            h('option', { value: '' }, 'Plantilla…'), h('option', { value: 'portada' }, 'Portada'), h('option', { value: 'extra' }, 'Extra'), h('option', { value: 'comunicado' }, 'Comunicado')),
        h('button', { class: 'btn small', title: 'Deshacer (Ctrl+Z)', onclick: () => nuUndo(false) }, withIcon('undo', 'Deshacer')),
        h('button', { class: 'btn small', title: 'Rehacer (Ctrl+Y)', onclick: () => nuUndo(true) }, withIcon('redo', 'Rehacer')))
    const wrap = h('div', { class: 'nx-stage', id: 'nxStage' },
        h('canvas', { id: 'nxCanvas', width: PAGE.w, height: PAGE.h, 'aria-label': 'Página del aviso' }),
        h('div', { id: 'nxOverlay', class: 'nx-overlay', tabindex: '0', 'aria-label': 'Piezas de la página: flechas para mover, Supr para quitar' }))
    const overlay = wrap.querySelector('#nxOverlay')
    overlay.addEventListener('pointerdown', nuPointerDown)
    overlay.addEventListener('keydown', nuKeyDown)
    return h('section', { class: 'module nx-canvas' }, tools, wrap, h('p', { class: 'muted nx-hint' }, 'Arrastra para mover, tira de las esquinas para cambiar el tamaño. Se pega a una rejilla para que todo quede alineado. Lo que ves es exactamente la imagen que verá el launcher.'), h('div', { id: 'nxWarnings' }))
}

function nuAddBlock(type) {
    nuPush()
    const b = nuBlockDefaults(type)
    b.y = Math.min(PAGE.h - b.h - 20, 60 + (nu.draft.editor.blocks.length % 8) * 30)
    nu.draft.editor.blocks.push(b)
    nu.selected = b.id; nu.dirty = true
    nuRedraw(); nuPaintProps(); nuPaintBar()
}
function nuApplyTemplate(name) {
    if (!name || !nuTemplates[name]) return
    if (nu.draft.editor.blocks.length && !confirm('La plantilla sustituye las piezas que tienes ahora. ¿Seguir?')) return
    nuPush()
    nu.draft.editor.blocks = nuTemplates[name]().map((b) => ({ ...nuBlockDefaults(b.type), ...b, id: nuNewId() }))
    nu.selected = null; nu.dirty = true
    nuRedraw(); nuPaintProps(); nuPaintBar()
}

// ---- the canvas and the pieces over it

function nuRedraw() {
    const canvas = $('#nxCanvas')
    if (!canvas || !nu.draft) return
    for (const b of nu.draft.editor.blocks) if (b.type === 'image' && b.asset) nuAsset(nu.draft.id, b.asset)
    document.fonts.load('700 40px Doto').then(() => document.fonts.load('400 20px "Geist Mono"')).catch(() => {}).then(() => {
        nu.overflow = nuDrawPage(canvas.getContext('2d'), nu.draft.editor, nu.images)
        nuPaintOverlay()
    })
}

function nuFit() {
    const stage = $('#nxStage')
    if (!stage) return
    const width = Math.min(stage.parentElement.clientWidth - 8, 560)
    nu.scale = Math.max(0.3, width / PAGE.w)
    stage.style.width = `${PAGE.w * nu.scale}px`
    stage.style.height = `${PAGE.h * nu.scale}px`
}

const HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]]

function nuPaintOverlay() {
    const overlay = $('#nxOverlay')
    if (!overlay) return
    nuFit()
    const k = nu.scale
    const parts = nu.draft.editor.blocks.map((b) => h('div', {
        class: `nx-piece${b.id === nu.selected ? ' on' : ''}${nu.overflow.has(b.id) ? ' over' : ''}`, 'data-id': b.id,
        style: `left:${b.x * k}px;top:${b.y * k}px;width:${b.w * k}px;height:${b.h * k}px`
    }))
    const sel = nuBlock()
    if (sel) for (const [name, fx, fy] of HANDLES) parts.push(h('div', { class: 'nx-handle', 'data-h': name, style: `left:${(sel.x + sel.w * fx) * k}px;top:${(sel.y + sel.h * fy) * k}px;cursor:${name}-resize` }))
    overlay.replaceChildren(...parts)
    const warn = $('#nxWarnings')
    if (warn) warn.replaceChildren(...[...nu.overflow].map((id) => { const b = nu.draft.editor.blocks.find((x) => x.id === id); return h('p', { class: 'nx-warn' }, withIcon('alert', `El texto de "${(b.text || FONT_NAMES[b.font]).slice(0, 28)}" no cabe en su caja: agranda la caja o achica la letra.`)) }))
}

function nuPointer(event) {
    const rect = $('#nxOverlay').getBoundingClientRect()
    return { x: (event.clientX - rect.left) / nu.scale, y: (event.clientY - rect.top) / nu.scale }
}
const snap = (v) => Math.round(v / PAGE.grid) * PAGE.grid

function nuPointerDown(event) {
    const overlay = event.currentTarget
    overlay.focus({ preventScroll: true })
    const p = nuPointer(event)
    const handle = event.target.closest('.nx-handle')
    let block = nuBlock()
    let mode = null
    if (handle && block) mode = handle.dataset.h
    else {
        const hit = [...nu.draft.editor.blocks].reverse().find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
        block = hit || null
        nu.selected = hit ? hit.id : null
        mode = hit ? 'move' : null
    }
    nuPaintOverlay(); nuPaintProps()
    if (!mode || !block) return
    event.preventDefault()
    overlay.setPointerCapture(event.pointerId)
    const start = { p, x: block.x, y: block.y, w: block.w, h: block.h }
    let moved = false
    const onMove = (e) => {
        const q = nuPointer(e)
        const dx = q.x - start.p.x, dy = q.y - start.p.y
        if (!moved && Math.hypot(dx, dy) < 3) return
        if (!moved) { nuPush(); moved = true }
        if (mode === 'move') { block.x = Math.max(0, Math.min(PAGE.w - block.w, snap(start.x + dx))); block.y = Math.max(0, Math.min(PAGE.h - block.h, snap(start.y + dy))) }
        else {
            let { x, y, w, h: hh } = start
            if (mode.includes('e')) w = Math.max(PAGE.grid * 2, snap(start.w + dx))
            if (mode.includes('s')) hh = Math.max(PAGE.grid * 2, snap(start.h + dy))
            if (mode.includes('w')) { const nx = snap(start.x + dx); w = Math.max(PAGE.grid * 2, start.w + (start.x - nx)); x = start.x + start.w - w }
            if (mode.includes('n')) { const ny = snap(start.y + dy); hh = Math.max(PAGE.grid * 2, start.h + (start.y - ny)); y = start.y + start.h - hh }
            Object.assign(block, { x, y, w: Math.min(w, PAGE.w - x), h: Math.min(hh, PAGE.h - y) })
        }
        nu.dirty = true
        nuRedraw(); nuPaintProps(true)
    }
    const onUp = () => { overlay.removeEventListener('pointermove', onMove); overlay.removeEventListener('pointerup', onUp); overlay.removeEventListener('pointercancel', onUp); if (moved) nuPaintBar() }
    overlay.addEventListener('pointermove', onMove); overlay.addEventListener('pointerup', onUp); overlay.addEventListener('pointercancel', onUp)
}

function nuKeyDown(event) {
    const b = nuBlock()
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); nuUndo(event.shiftKey); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); nuUndo(true); return }
    if (!b) return
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); nuRemove(); return }
    const step = event.shiftKey ? 1 : PAGE.grid
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
    if (!move) return
    event.preventDefault()
    nuPush()
    b.x = Math.max(0, Math.min(PAGE.w - b.w, b.x + move[0])); b.y = Math.max(0, Math.min(PAGE.h - b.h, b.y + move[1]))
    nu.dirty = true
    nuRedraw(); nuPaintProps(true); nuPaintBar()
}

function nuRemove() {
    const b = nuBlock()
    if (!b) return
    nuPush()
    nu.draft.editor.blocks = nu.draft.editor.blocks.filter((x) => x.id !== b.id)
    nu.selected = null; nu.dirty = true
    nuRedraw(); nuPaintProps(); nuPaintBar()
}

// ---- the properties of the selected piece

function nuField(label, control) { return h('label', {}, label, control) }

/** `keepFocus`: the numbers changed because the piece is being dragged, so the panel is only refreshed, not rebuilt. */
function nuPaintProps(keepFocus = false) {
    const box = $('#nxProps')
    if (!box) return
    const b = nuBlock()
    if (!b) { box.replaceChildren(h('div', { class: 'module-head' }, h('h2', {}, 'Pieza')), h('p', { class: 'muted' }, 'Elige una pieza de la página, o añade una con los botones de arriba.')); return }
    if (keepFocus && box.dataset.block === b.id) {
        for (const key of ['x', 'y', 'w', 'h']) { const input = box.querySelector(`[data-k="${key}"]`); if (input && document.activeElement !== input) input.value = b[key] }
        return
    }
    box.dataset.block = b.id
    const set = (key, value, repaint = false) => { nuPush(); b[key] = value; nu.dirty = true; nuRedraw(); nuPaintBar(); if (repaint) nuPaintProps() }
    const num = (key, label, min) => nuField(label, h('input', { type: 'number', min, step: PAGE.grid, value: b[key], 'data-k': key, onchange: (e) => set(key, Math.max(min, Number(e.target.value) || min)) }))
    const chips = (options, current, key) => h('div', { class: 'chips' }, options.map(([value, label]) => h('button', { type: 'button', class: `chip-btn${current === value ? ' on' : ''}`, onclick: () => set(key, value, true) }, label)))
    const rows = [h('div', { class: 'module-head' }, h('h2', {}, PIECES.find((p) => p[0] === b.type)[1]),
        h('button', { class: 'btn small', title: 'Duplicar', onclick: () => { nuPush(); const copy = { ...structuredClone(b), id: nuNewId(), x: Math.min(PAGE.w - b.w, b.x + 20), y: Math.min(PAGE.h - b.h, b.y + 20) }; nu.draft.editor.blocks.push(copy); nu.selected = copy.id; nu.dirty = true; nuRedraw(); nuPaintProps(); nuPaintBar() } }, 'Duplicar'),
        h('button', { class: 'btn small danger', onclick: nuRemove }, 'Quitar'))]
    if (['title', 'subtitle', 'text', 'box', 'tag'].includes(b.type)) rows.push(nuField('Texto', h('textarea', { rows: b.type === 'text' ? 6 : 2, value: b.text, oninput: (e) => { if (!b._pushed) { nuPush(); b._pushed = true; setTimeout(() => { delete b._pushed }, 800) } b.text = e.target.value; nu.dirty = true; nuRedraw(); nuPaintBar() } })))
    if (['title', 'subtitle', 'text'].includes(b.type)) {
        rows.push(nuField('Letra', chips(Object.entries(FONT_NAMES), b.font, 'font')))
        rows.push(nuField('Alineación', chips([['left', 'Izquierda'], ['center', 'Centro']], b.align, 'align')))
    }
    if (b.type !== 'image') rows.push(nuField('Color', chips(b.type === 'box' ? [] : Object.entries(COLOR_NAMES), b.color, 'color')))
    if (b.type !== 'rule' && b.type !== 'image') rows.push(nuField('Tamaño de la letra', h('input', { type: 'number', min: 10, max: 220, value: b.size, onchange: (e) => set('size', Math.max(10, Math.min(220, Number(e.target.value) || b.size))) })))
    if (b.type === 'text') rows.push(nuField('Columnas', chips([[1, 'Una'], [2, 'Dos']], b.columns, 'columns')))
    if (b.type === 'image') {
        const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => nuPickImage(b, e.target.files[0]) })
        rows.push(h('div', { class: 'field' }, file, h('button', { class: 'btn small', onclick: () => file.click() }, withIcon('upload', b.asset ? 'Cambiar imagen' : 'Elegir imagen')), b.asset ? nuField('Ajuste', chips([['cover', 'Rellenar'], ['contain', 'Entera']], b.fit, 'fit')) : h('small', { class: 'muted' }, 'Se reduce sola para que pese poco.')))
    }
    rows.push(h('div', { class: 'nx-nums' }, num('x', 'X', 0), num('y', 'Y', 0), num('w', 'Ancho', PAGE.grid), num('h', 'Alto', PAGE.grid)))
    rows.push(h('div', { class: 'nx-order' },
        h('button', { class: 'btn small', onclick: () => { nuPush(); const list = nu.draft.editor.blocks; list.push(list.splice(list.indexOf(b), 1)[0]); nu.dirty = true; nuRedraw(); nuPaintBar() } }, 'Traer al frente'),
        h('button', { class: 'btn small', onclick: () => { nuPush(); const list = nu.draft.editor.blocks; list.unshift(list.splice(list.indexOf(b), 1)[0]); nu.dirty = true; nuRedraw(); nuPaintBar() } }, 'Enviar al fondo')))
    box.replaceChildren(...rows)
}

// ---- the notice's own data

function nuDataCard() {
    const d = nu.draft
    const touch = () => { nu.dirty = true; nuPaintBar() }
    const toggleTarget = (id) => {
        const on = d.targets.includes(id)
        d.targets = id === '*' ? (on ? [] : ['*']) : (on ? d.targets.filter((t) => t !== id) : [...d.targets.filter((t) => t !== '*'), id])
        if (!d.targets.length) d.targets = ['*']
        touch(); nuPaintDataCard()
    }
    const packChip = (p) => h('button', { type: 'button', class: `chip-btn${d.targets.includes(p.id) ? ' on' : ''}`, title: p.profileOf ? 'Es un perfil: márcalo tú si quieres que también lo vea' : '', onclick: () => toggleTarget(p.id) }, p.name)
    const card = h('section', { class: 'module', id: 'nxData' },
        h('div', { class: 'module-head' }, h('h2', {}, 'Aviso')),
        nuField('Título corto (sale en el aviso de arranque)', h('input', { value: d.title, maxlength: 90, oninput: (e) => { d.title = e.target.value; touch() } })),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Gravedad'), h('div', { class: 'segmented' }, Object.entries(SEVERITY_NAMES).map(([value, label]) => h('button', { type: 'button', class: d.severity === value ? 'active' : '', onclick: () => { d.severity = value; touch(); nuPaintDataCard() } }, label)))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Dónde se ve'), h('div', { class: 'chips' }, h('button', { type: 'button', class: `chip-btn${d.targets.includes('*') ? ' on' : ''}`, onclick: () => toggleTarget('*') }, 'General (megáfono)'), nu.data.packs.map(packChip)),
            h('small', { class: 'muted' }, 'Un aviso de un modpack no sale en sus perfiles: márcalos tú.')),
        nuField('Se ve desde (déjalo vacío para que se vea en cuanto publiques)', h('input', { type: 'datetime-local', value: d.startsLocal || '', onchange: (e) => { d.startsLocal = e.target.value; touch() } })),
        d.startsLocal ? h('small', { class: 'muted' }, 'Aviso programado: lo respetan los launchers 3.5.2 o posteriores. Los anteriores lo muestran en cuanto lo publicas.') : null,
        nuField('Caduca (déjalo vacío para que no caduque)', h('input', { type: 'datetime-local', value: d.expiresLocal || '', onchange: (e) => { d.expiresLocal = e.target.value; touch() } })),
        h('div', { class: 'nx-two' }, nuField('Botón (opcional)', h('input', { placeholder: 'Ver en Discord', value: d.button?.label || '', maxlength: 40, oninput: (e) => { d.button = { ...(d.button || {}), label: e.target.value }; touch() } })), nuField('Enlace (https)', h('input', { placeholder: 'https://discord.gg/...', value: d.button?.url || '', oninput: (e) => { d.button = { ...(d.button || {}), url: e.target.value }; touch() } }))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.published === true, onchange: (e) => { d.published = e.target.checked; touch() } }), 'Publicarlo con «Publicar avisos» (si lo quitas, queda como borrador y nadie lo ve)'),
        h('div', { class: 'nx-actions' }, h('button', { class: 'btn paper', disabled: nu.saving, onclick: nuSave }, withIcon('check', nu.saving ? 'Guardando…' : 'Guardar')), h('button', { class: 'btn danger', onclick: nuDelete }, 'Borrar aviso')))
    return card
}
function nuPaintDataCard() { const old = $('#nxData'); if (old) old.replaceWith(nuDataCard()) }

// ---- view 2: modpacks (maintenance, schedule, novedades)

function nuModpacksView() {
    const packs = nu.data.packs.filter((p) => p.active)
    if (!packs.length) return h('section', { class: 'module' }, h('h2', {}, 'Modpacks'), h('p', { class: 'muted' }, 'Todavía no hay modpacks activos.'))
    const entry = (id) => (nu.access.modpacks[id] ||= {})
    const touch = () => { nu.accessDirty = true; nuPaintBar() }
    const summaryChips = (e) => [e.maintenance?.active && h('span', { class: 'chip warn' }, 'Mantenimiento'), e.schedule?.from && Date.parse(e.schedule.from) > Date.now() && h('span', { class: 'chip' }, `Desde ${new Date(e.schedule.from).toLocaleDateString()}`), e.schedule?.until && h('span', { class: 'chip' }, `Hasta ${new Date(e.schedule.until).toLocaleDateString()}`), e.novedades && h('span', { class: 'chip' }, 'Novedades')]
    const card = (p) => {
        const e = entry(p.id)
        const open = nu.openPack === p.id
        const head = h('button', { class: 'nx-pack-head', 'aria-expanded': String(open), onclick: () => { nu.openPack = open ? null : p.id; nuPaint() } }, h('b', {}, p.name), p.profileOf ? h('small', { class: 'muted' }, 'perfil') : null, h('span', { class: 'nx-pack-chips' }, summaryChips(e)))
        if (!open) return h('div', { class: 'module nx-pack' }, head)
        const m = (e.maintenance ||= { active: false, message: '', until: null, allow: [] })
        const s = (e.schedule ||= { from: null, until: null })
        const allowChip = (a) => h('span', { class: 'chip' }, a.name, h('button', { class: 'chip-x', title: 'Quitar', onclick: () => { m.allow = m.allow.filter((x) => x.uuid !== a.uuid); touch(); nuPaint() } }, '×'))
        const nameInput = h('input', { placeholder: 'Nombre de Minecraft', maxlength: 16, 'aria-label': 'Nombre de Minecraft', value: nu.newAllow[p.id] || '', oninput: (ev) => { nu.newAllow[p.id] = ev.target.value } })
        const addAllowed = async () => {
            try { const found = await api(`/api/notices/uuid?name=${encodeURIComponent(nu.newAllow[p.id] || '')}`); if (!m.allow.some((x) => x.uuid === found.uuid)) m.allow.push(found); nu.newAllow[p.id] = ''; touch(); nuPaint() } catch (err) { toast(err.message, true) }
        }
        return h('div', { class: 'module nx-pack open' }, head,
            h('div', { class: 'nx-pack-body' },
                h('div', { class: 'nx-block' },
                    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: m.active, onchange: (ev) => { m.active = ev.target.checked; touch(); nuPaint() } }), 'Mantenimiento: nadie juega ni actualiza este modpack'),
                    m.active ? [
                        nuField('Mensaje que verán', h('textarea', { rows: 2, maxlength: 300, value: m.message, oninput: (ev) => { m.message = ev.target.value; touch() } })),
                        nuField('Termina solo a las (vacío: lo quitas tú a mano)', h('input', { type: 'datetime-local', value: nuToLocal(m.until), onchange: (ev) => { m.until = nuFromLocal(ev.target.value); touch() } })),
                        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Cuentas que sí pueden entrar (Microsoft; el jugador sin conexión nunca)'), h('div', { class: 'chips' }, m.allow.map(allowChip)),
                            h('div', { class: 'nx-add' }, nameInput, h('button', { class: 'btn small', onclick: addAllowed }, 'Añadir')))
                    ] : null),
                h('div', { class: 'nx-block' }, h('span', { class: 'label' }, 'Agenda'), h('div', { class: 'nx-two' },
                    nuField('Disponible desde', h('input', { type: 'datetime-local', value: nuToLocal(s.from), onchange: (ev) => { s.from = nuFromLocal(ev.target.value); touch() } })),
                    nuField('Retirado desde', h('input', { type: 'datetime-local', value: nuToLocal(s.until), onchange: (ev) => { s.until = nuFromLocal(ev.target.value); touch() } }))),
                    h('small', { class: 'muted' }, 'Antes de la fecha sale "próximamente" con su cuenta atrás. Después de la de retirado no se puede jugar y aparece el botón roto.')),
                h('div', { class: 'nx-block' }, nuField('Enlace de novedades de este modpack (https)', h('input', { placeholder: 'https://discord.com/channels/...', value: e.novedades || '', oninput: (ev) => { e.novedades = ev.target.value.trim(); touch() } })))))
    }
    return h('div', { class: 'nx-packs' }, h('p', { class: 'muted' }, 'La hora que uses aquí es la de tu ordenador; el launcher la compara con la del servidor, así que cambiar el reloj de un PC no adelanta nada.'), packs.map(card), h('div', { class: 'nx-actions' }, h('button', { class: 'btn paper', disabled: !nu.accessDirty, onclick: nuSaveAccess }, withIcon('check', 'Guardar ajustes'))))
}

async function nuSaveAccess() {
    try {
        const cleaned = {}
        for (const [id, e] of Object.entries(nu.access.modpacks)) cleaned[id] = { maintenance: e.maintenance && e.maintenance.active ? e.maintenance : null, schedule: e.schedule && (e.schedule.from || e.schedule.until) ? e.schedule : null, novedades: e.novedades || null }
        await api('/api/notices/access', { method: 'POST', body: { modpacks: cleaned, launcher: nu.access.launcher } })
        nu.accessDirty = false
        toast('Ajustes guardados. Se publican con "Publicar avisos".')
        await loadNotices()
    } catch (err) { toast(err.message, true) }
}

// ---- view 3: the launcher

const NU_SUPPORT_SCRIPT = [
    "// Aviso instantáneo al celular con la app gratis ntfy (Gmail no avisa de los correos que te mandas a ti mismo).",
    "// Escribe aquí un nombre largo y secreto, y suscríbete a él en la app; déjalo '' para no usarlo.",
    "var NTFY_TOPIC = 'TU_TEMA_SECRETO';",
    '',
    'function doPost(e) {',
    '  try {',
    '    var data = JSON.parse(e.postData.contents);',
    "    var subject = String(data.subject || 'Informe de Empi Launcher').slice(0, 200);",
    '    MailApp.sendEmail({',
    "      to: 'TU_CORREO@gmail.com',",
    '      subject: subject,',
    "      body: String(data.message || '').slice(0, 100000),",
    "      name: 'Empi Launcher'",
    '    });',
    '    if (NTFY_TOPIC) {',
    '      try {',
    "        var code = (subject.match(/EMPI-[A-Z0-9]{6}/) || ['informe nuevo'])[0];",
    "        UrlFetchApp.fetch('https://ntfy.sh', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,",
    "          payload: JSON.stringify({ topic: NTFY_TOPIC, title: 'Empi Launcher: informe nuevo', message: 'Código ' + code + '. Ábrelo en tu correo.', priority: 4, tags: ['warning'] }) });",
    '      } catch (ignored) {}',
    '    }',
    '    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);',
    '  } catch (err) {',
    '    return ContentService.createTextOutput(JSON.stringify({ success: false, message: String(err) })).setMimeType(ContentService.MimeType.JSON);',
    '  }',
    '}'
].join('\n')

function nuLauncherView() {
    const l = nu.access.launcher
    const touch = () => { nu.accessDirty = true; nuPaintBar() }
    return h('section', { class: 'module nx-launcher' },
        h('div', { class: 'module-head' }, h('h2', {}, 'Launcher')),
        nuField('Versión mínima del launcher', h('input', { placeholder: '3.5.0', value: l.minVersion || '', oninput: (e) => { l.minVersion = e.target.value.trim(); touch() } })),
        h('p', { class: 'muted' }, 'Quien tenga una versión anterior no puede jugar hasta actualizar. Solo lo entienden los launchers 3.5.0 o posteriores: los anteriores no lo leen, así que ponlo cuando casi todos ya tengan la 3.5.0. Si publicas una versión con un fallo grave, sube esto a la siguiente.'),
        nuField('Enlace de novedades general (https)', h('input', { placeholder: 'https://discord.com/channels/...', value: l.novedades || '', oninput: (e) => { l.novedades = e.target.value.trim(); touch() } })),
        h('div', { class: 'module-head' }, h('h3', {}, 'Soporte: «Enviar a soporte para revisión»')),
        h('p', { class: 'muted' }, 'Cuando a un jugador se le cierra Minecraft con un error, el launcher le enseña el informe (con su nombre de jugador, su versión y su equipo; nunca su sesión ni su correo) y, si él lo pulsa, te lo manda a tu correo. Lo más simple y gratis es un script de tu cuenta de Google que reenvía el informe a tu Gmail: tu correo queda dentro del script y no se publica en ningún sitio.'),
        h('ol', { class: 'muted nx-steps' },
            h('li', {}, 'Entra a script.google.com con tu cuenta de Google y pulsa «Nuevo proyecto».'),
            h('li', {}, 'Borra lo que haya, pega el script de abajo y cambia TU_CORREO@gmail.com por tu correo. Para que te suene el celular: instala la app gratis «ntfy» (Android o iPhone), suscríbete a un tema con un nombre largo y secreto, y ponlo en lugar de TU_TEMA_SECRETO. Sin eso el correo llega igual, pero Gmail no avisa de los correos que te mandas a ti mismo.'),
            h('li', {}, '«Implementar» > «Nueva implementación» > tipo «Aplicación web» > ejecutar como «Yo» > acceso «Cualquier usuario» > «Implementar». Google te pedirá permiso para enviar correos: acéptalo.'),
            h('li', {}, 'Copia el ID de la implementación (la parte larga de la dirección que está entre /s/ y /exec) y pégalo aquí abajo. Guarda los ajustes y pulsa «Publicar avisos».')),
        h('div', { class: 'nx-code-wrap' },
            h('pre', { class: 'nx-code' }, NU_SUPPORT_SCRIPT),
            h('button', { class: 'btn small', onclick: async () => { try { await navigator.clipboard.writeText(NU_SUPPORT_SCRIPT); toast('Script copiado.') } catch { toast('No se pudo copiar: selecciónalo y cópialo a mano.', true) } } }, 'Copiar script')),
        h('div', { class: 'nx-two' },
            nuField('Servicio', h('select', { onchange: (e) => { l.support = { ...(l.support || {}), service: e.target.value }; touch() } },
                h('option', { value: '', selected: !l.support?.service }, '(ninguno)'), h('option', { value: 'appsscript', selected: l.support?.service === 'appsscript' }, 'Google Apps Script (gratis, recomendado)'), h('option', { value: 'formspree', selected: l.support?.service === 'formspree' }, 'Formspree (sin probar)'))),
            nuField('ID de la implementación (Apps Script) o id del formulario (Formspree)', h('input', { placeholder: 'AKfycb...', value: l.support?.key || '', oninput: (e) => { l.support = { ...(l.support || {}), key: e.target.value.trim() }; touch() } }))),
        nuField('Tu correo, solo si quieres que el jugador lo vea (es público) cuando no se pueda enviar', h('input', { type: 'email', placeholder: '(déjalo vacío si usas el script)', value: l.support?.email || '', oninput: (e) => { l.support = { ...(l.support || {}), email: e.target.value.trim() }; touch() } })),
        h('div', { class: 'nx-actions' }, h('button', { class: 'btn paper', disabled: !nu.accessDirty, onclick: nuSaveAccess }, withIcon('check', 'Guardar ajustes'))))
}

window.addEventListener('resize', () => { if (state.tab === 'notices' && nu.draft && nu.sub === 'avisos') nuPaintOverlay() })
