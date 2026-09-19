/* Empi Publisher - the Perfiles tab: several ways of playing one modpack. Loaded before app.js and uses its helpers (h, icon, api, toast...).
   The format and what it means live in lib/profiles.js; this is only the editor.

   The modpack's folders hold everything any profile needs. Here a person ticks, for each profile, which mods and files it takes. What is
   stored is what each profile does NOT take (so a mod or file uploaded later is in every profile until someone decides otherwise). The
   editor works on single files; on saving, a folder whose files are all left out becomes one rule ("shaderpacks/"). */

const profilesUi = { data: null, draft: null, dirty: false, filter: '', open: new Set(), uid: 0, cardSummaries: new Map() }

const pKey = (path) => String(path).replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase()
const ruleHits = (rule, path) => (rule.endsWith('/') ? pKey(path).startsWith(rule) : pKey(path) === rule)

function slugOf(name) {
    return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
}

// ---------------------------------------------------------------- the draft: stored profiles <-> what is being edited

function newProfile(fields = {}) {
    return { uid: ++profilesUi.uid, id: null, name: '', description: '', below: '', ram: null, mods: new Set(), files: new Set(), off: new Set(), keep: { mods: [], files: [], off: [] }, ...fields }
}

/** Stored profiles -> the draft. Rules are expanded to the files they match; the ones that match nothing are kept as they are. */
function draftFromData(data) {
    const stored = data.profiles
    if (!stored) return null
    const stems = new Set(data.items.mods.map((mod) => mod.stem))
    const list = stored.list.map((profile) => {
        const mods = new Set()
        const files = new Set()
        const keep = { mods: [], files: [], off: [] }
        const off = new Set()
        for (const stem of profile.exclude.mods) { if (stems.has(stem)) mods.add(stem); else keep.mods.push(stem) }
        for (const stem of profile.optionalOff || []) { if (stems.has(stem)) off.add(stem); else keep.off.push(stem) }
        for (const rule of profile.exclude.files) {
            const hits = data.items.files.filter((file) => ruleHits(rule, file.path))
            hits.forEach((file) => files.add(file.path))
            if (!hits.length) keep.files.push(rule)
        }
        return newProfile({ id: profile.id, name: profile.name, description: profile.description || '', below: profile.recommendedBelowGb ?? '', ram: profile.ram ? { ...profile.ram } : null, mods, files, off, keep })
    })
    return { default: list.find((profile) => profile.id === stored.default).uid, list }
}

/** Folders whose files are ALL left out (and that hold at least two) become one rule; the rest are single files. */
function filesRules(profile, files) {
    const total = new Map()
    const gone = new Map()
    for (const file of files) {
        const parts = file.path.split('/')
        for (let i = 1; i < parts.length; i++) {
            const folder = `${parts.slice(0, i).join('/')}/`
            total.set(folder, (total.get(folder) || 0) + 1)
            if (profile.files.has(file.path)) gone.set(folder, (gone.get(folder) || 0) + 1)
        }
    }
    const rules = []
    const whole = [...total.keys()].filter((folder) => total.get(folder) >= 2 && gone.get(folder) === total.get(folder)).sort((a, b) => a.length - b.length)
    for (const folder of whole) if (!rules.some((rule) => pKey(folder).startsWith(rule))) rules.push(pKey(folder))
    for (const file of files) if (profile.files.has(file.path) && !rules.some((rule) => pKey(file.path).startsWith(rule))) rules.push(pKey(file.path))
    return [...profile.keep.files, ...rules]
}

/** The draft -> what the server stores. New profiles get their id here so "the default one" can name them before they exist. */
function profilesPayload() {
    const { draft, data } = profilesUi
    const taken = new Set(draft.list.filter((profile) => profile.id).map((profile) => profile.id))
    const idOf = new Map()
    for (const profile of draft.list) {
        if (profile.id) { idOf.set(profile.uid, profile.id); continue }
        let id = slugOf(profile.name) || 'perfil'
        for (let n = 2; taken.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`
        taken.add(id)
        idOf.set(profile.uid, id)
    }
    return {
        default: idOf.get(draft.default),
        list: draft.list.map((profile) => ({
            id: idOf.get(profile.uid),
            name: profile.name.trim(),
            description: profile.description.trim(),
            recommendedBelowGb: profile.below === '' ? null : Number(profile.below),
            ram: profile.ram,
            exclude: { mods: [...profile.keep.mods, ...profile.mods], files: filesRules(profile, data.items.files) },
            optionalOff: [...profile.keep.off, ...[...profile.off].filter((stem) => !profile.mods.has(stem))]
        }))
    }
}

// ---------------------------------------------------------------- loading and saving

function profilesView() {
    return h('div', { class: 'profiles' }, h('div', { id: 'profilesBox' }, h('div', { class: 'skeleton', style: 'height:240px' })))
}

async function loadProfiles() {
    try {
        profilesUi.data = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/profiles`)
        profilesUi.draft = draftFromData(profilesUi.data)
        profilesUi.dirty = false
    } catch (err) { toast(err.message, true) }
    paintProfiles()
}

async function saveProfiles(remove = false) {
    try {
        profilesUi.data = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/profiles`, { method: 'POST', body: { profiles: remove ? null : profilesPayload() } })
        profilesUi.draft = draftFromData(profilesUi.data)
        profilesUi.dirty = false
        paintProfiles()
        toast(remove ? 'Perfiles quitados.' : 'Perfiles guardados. Falta compilar y enviar para que lleguen a los jugadores.')
        await refreshStatus()
        renderPipeline()
    } catch (err) {
        toast(err.message, true)
    }
}

function markProfilesDirty() {
    profilesUi.dirty = true
    paintProfilesBar()
}

// ---------------------------------------------------------------- what each profile takes (for the summaries)

function tally(profile) {
    const { items } = profilesUi.data
    const mods = items.mods.filter((mod) => !profile.mods.has(mod.stem))
    const files = items.files.filter((file) => !profile.files.has(file.path))
    return { mods: mods.length, files: files.length, bytes: mods.reduce((sum, mod) => sum + mod.size, 0) + files.reduce((sum, file) => sum + file.size, 0) }
}

const tallyText = (profile) => {
    const t = tally(profile)
    const off = [...profile.off].filter((stem) => !profile.mods.has(stem)).length
    return `${plural(t.mods, 'mod', 'mods')}${off ? ` (${plural(off, "apagado", "apagados")} al empezar)` : ''} · ${plural(t.files, 'archivo', 'archivos')} · ${formatSize(t.bytes)}`
}

function paintSummaries() {
    for (const [uid, el] of profilesUi.cardSummaries) {
        const profile = profilesUi.draft.list.find((candidate) => candidate.uid === uid)
        if (profile) el.textContent = tallyText(profile)
    }
}

// ---------------------------------------------------------------- painting

function paintProfiles() {
    const box = $('#profilesBox')
    if (!box || !profilesUi.data) return
    profilesUi.cardSummaries.clear()

    if (!profilesUi.draft) {
        const { items } = profilesUi.data
        box.replaceChildren(h('section', { class: 'section' },
            h('h2', {}, 'Perfiles'),
            h('p', { class: 'prose' }, 'Un modpack puede jugarse de varias maneras: por ejemplo el Completo y uno Lite con menos carga. En el launcher los jugadores eligen el perfil desde un desplegable pequeño junto al nombre del modpack.'),
            h('p', { class: 'prose' }, 'Todos los perfiles comparten mundos, opciones y configuración: solo cambian qué mods y archivos lleva cada uno (y, si quieres, la memoria con la que empiezan). Sube todos los mods de todos los perfiles en la pestaña ', h('b', {}, 'Mods'),
                ' y aquí marcas qué perfil usa cada uno.'),
            items.mods.length === 0 ? h('p', { class: 'note' }, icon('alert'), 'Este modpack todavía no tiene mods. Sube primero los mods en su pestaña.') : null,
            h('div', { class: 'form-actions', style: 'margin-top:16px' },
                h('button', {
                    class: 'btn paper', type: 'button', disabled: items.mods.length === 0,
                    onclick: () => {
                        const first = newProfile({ id: 'completo', name: 'Completo' })
                        profilesUi.draft = { default: first.uid, list: [first, newProfile({ name: 'Lite' })] }
                        profilesUi.dirty = true
                        paintProfiles()
                    }
                }, withIcon('plus', 'Crear perfiles')))))
        return
    }

    const { draft } = profilesUi
    box.replaceChildren(
        h('section', { class: 'section' },
            h('h2', {}, `Perfiles (${draft.list.length})`),
            h('p', { class: 'muted' }, 'Cada tarjeta es un perfil. El «por defecto» es el que reciben los jugadores la primera vez, y el que ven los launchers que todavía no conocen los perfiles.'),
            h('div', { class: 'pcards', id: 'profileCards' }),
            h('div', { class: 'form-actions', style: 'margin-top:14px' },
                h('button', { class: 'btn small', type: 'button', disabled: draft.list.length >= 12, onclick: addProfile }, withIcon('plus', 'Agregar perfil')),
                h('span', { class: 'hint-line' }, 'El nuevo empieza igual que el perfil por defecto.'))),
        h('section', { class: 'section' },
            h('h2', {}, 'Qué lleva cada perfil'),
            h('p', { class: 'muted' }, 'Marcado: el perfil lo lleva. Vacío: no. En un mod, cada clic pasa de «lo lleva» a «lo lleva apagado al empezar» (○, opcional: el jugador puede encenderlo) y a «no lo lleva». Una carpeta entera se marca o desmarca de una vez; si dejas fuera todos los archivos de una carpeta, también queda fuera lo que subas ahí después.'),
            h('div', { class: 'ptools' },
                h('input', {
                    type: 'search', placeholder: 'Buscar un mod o un archivo…', 'aria-label': 'Buscar un mod o un archivo', value: profilesUi.filter,
                    oninput: (event) => { profilesUi.filter = event.target.value; paintMatrix() }
                }),
                h('button', { class: 'btn small', type: 'button', onclick: () => { profilesUi.open.clear(); paintMatrix() } }, 'Cerrar carpetas')),
            h('div', { class: 'pmatrix', id: 'profileMatrix' })),
        h('div', { class: 'savebar', id: 'profilesBar' }))
    paintCards()
    paintMatrix()
    paintProfilesBar()
}

function addProfile() {
    const { draft } = profilesUi
    const base = draft.list.find((profile) => profile.uid === draft.default)
    let n = draft.list.length + 1
    const names = new Set(draft.list.map((profile) => profile.name.toLowerCase()))
    while (names.has(`perfil ${n}`)) n++
    draft.list.push(newProfile({ name: `Perfil ${n}`, mods: new Set(base.mods), files: new Set(base.files), off: new Set(base.off), keep: { mods: [...base.keep.mods], files: [...base.keep.files], off: [...base.keep.off] } }))
    markProfilesDirty()
    paintProfiles()
}

function removeProfile(profile) {
    const { draft } = profilesUi
    draft.list = draft.list.filter((candidate) => candidate.uid !== profile.uid)
    if (draft.default === profile.uid) draft.default = draft.list[0].uid
    markProfilesDirty()
    paintProfiles()
}

const gbInput = (mb, label, onchange) => h('input', {
    type: 'text', inputmode: 'decimal', class: 'pnum', 'aria-label': label, value: mb ? String(mb / 1024).replace('.', ',') : '', placeholder: 'auto',
    oninput: (event) => onchange(event.target.value)
})

function paintCards() {
    const { draft } = profilesUi
    const cards = $('#profileCards')
    const parse = (text) => { const n = parseFloat(String(text).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }
    cards.replaceChildren(...draft.list.map((profile) => {
        const isDefault = draft.default === profile.uid
        const summary = h('div', { class: 'pcard-sum tnum' }, tallyText(profile))
        profilesUi.cardSummaries.set(profile.uid, summary)
        const setRam = (which, text) => {
            const value = parse(text)
            const current = profile.ram || { minimumMb: null, maximumMb: null }
            const next = { ...current, [which]: value == null ? null : Math.round(value * 1024) }
            // one filled in: the other follows it, so there is never half a setting
            profile.ram = next.minimumMb == null && next.maximumMb == null ? null : { minimumMb: next.minimumMb ?? next.maximumMb, maximumMb: next.maximumMb ?? next.minimumMb }
            markProfilesDirty()
        }
        return h('div', { class: `pcard${isDefault ? ' default' : ''}` },
            h('div', { class: 'pcard-head' },
                h('input', {
                    value: profile.name, 'aria-label': 'Nombre del perfil', placeholder: 'Nombre',
                    oninput: (event) => { profile.name = event.target.value; markProfilesDirty(); paintMatrixHead() }
                }),
                h('button', {
                    type: 'button', class: `toggle-pill${isDefault ? ' main' : ''}`, 'aria-pressed': String(isDefault), title: 'El perfil que reciben los jugadores la primera vez',
                    onclick: () => { if (!isDefault) { draft.default = profile.uid; markProfilesDirty(); paintProfiles() } }
                }, isDefault ? 'Por defecto' : 'Poner por defecto')),
            h('label', {}, 'Descripción (la ven los jugadores)', h('input', { value: profile.description, maxlength: '160', placeholder: 'Menos carga para equipos modestos', oninput: (event) => { profile.description = event.target.value; markProfilesDirty() } })),
            h('div', { class: 'prow2' },
                h('label', {}, 'Memoria mín. (GB)', gbInput(profile.ram && profile.ram.minimumMb, 'Memoria mínima en GB', (text) => setRam('minimumMb', text))),
                h('label', {}, 'máx. (GB)', gbInput(profile.ram && profile.ram.maximumMb, 'Memoria máxima en GB', (text) => setRam('maximumMb', text)))),
            h('label', {}, 'Recomendarlo si el equipo tiene menos de (GB)',
                h('input', {
                    type: 'text', inputmode: 'decimal', class: 'pnum', 'aria-label': 'Recomendado si el equipo tiene menos de estos GB', placeholder: 'nunca', value: profile.below === '' ? '' : String(profile.below),
                    oninput: (event) => { const n = parse(event.target.value); profile.below = n == null ? '' : n; markProfilesDirty() }
                })),
            summary,
            profile.keep.mods.length + profile.keep.files.length + profile.keep.off.length
                ? h('p', { class: 'muted small-help' }, `${plural(profile.keep.mods.length + profile.keep.files.length + profile.keep.off.length, 'regla', 'reglas')} sin efecto ahora (un mod o archivo que ya no está). `,
                    h('button', { type: 'button', class: 'link', onclick: () => { profile.keep = { mods: [], files: [], off: [] }; markProfilesDirty(); paintProfiles() } }, 'Limpiar'))
                : null,
            h('div', { class: 'pcard-foot' },
                h('button', {
                    class: 'btn small', type: 'button', disabled: draft.list.length <= 2,
                    title: draft.list.length <= 2 ? 'Un modpack con perfiles necesita al menos dos. Para dejar de usarlos, quita todos los perfiles.' : 'Quitar este perfil',
                    onclick: () => removeProfile(profile)
                }, withIcon('trash', 'Quitar'))))
    }))
}

// ---- the matrix

const cellState = (checked) => (checked === 'mixed' ? 'mixed' : String(checked))

function cell(checked, label, onclick) {
    // 'off': the profile takes the mod but hands it over switched off (an optional mod that starts disabled)
    return h('button', { type: 'button', class: 'mcell', role: 'checkbox', 'data-state': checked === 'off' ? 'off' : null, 'aria-checked': checked === 'off' ? 'true' : cellState(checked), 'aria-label': checked === 'off' ? `${label} (opcional, apagado al empezar)` : label, title: checked === 'off' ? 'Lo lleva, pero apagado al empezar (el jugador puede encenderlo)' : null, onclick },
        checked === true ? icon('check') : checked === 'mixed' ? h('span', { class: 'mmix' }) : checked === 'off' ? h('span', { class: 'moff' }) : null)
}

function matrixHead() {
    const { draft } = profilesUi
    return h('div', { class: 'mrow head', style: `--cols:${draft.list.length}` },
        h('span', {}, ''), h('span', { class: 'pcount' }, 'Tamaño'),
        ...draft.list.map((profile) => h('span', { class: 'mcol', title: profile.name }, draft.default === profile.uid ? '★ ' : '', profile.name || '—')))
}

function paintMatrixHead() {
    const head = $('#profileMatrix .mrow.head')
    if (head) head.replaceWith(matrixHead())
}

function modRow(mod) {
    const { draft } = profilesUi
    const many = mod.names.length > 1
    return h('div', { class: 'mrow', style: `--cols:${draft.list.length}` },
        h('span', { class: 'pname' }, h('span', { class: 'pspacer' }), icon('package'),
            h('span', { class: 'ptext', title: mod.names.join('\n') }, mod.names[0]),
            many ? h('span', { class: 'pbadge', title: 'Hay varias versiones del mismo mod en las carpetas: el launcher las instalaría todas.' }, icon('alert'), `${mod.names.length} archivos`) : null),
        h('span', { class: 'pcount tnum' }, formatSize(mod.size)),
        ...draft.list.map((profile) => {
            const state = profile.mods.has(mod.stem) ? false : profile.off.has(mod.stem) ? 'off' : true
            // takes it -> takes it switched off -> does not take it -> takes it
            return cell(state, `${mod.stem} en ${profile.name}`, () => {
                if (state === true) profile.off.add(mod.stem)
                else if (state === 'off') { profile.off.delete(mod.stem); profile.mods.add(mod.stem) }
                else profile.mods.delete(mod.stem)
                afterToggle()
            })
        }))
}

function fileRowFor(file, label, depth) {
    const { draft } = profilesUi
    return h('div', { class: 'mrow', style: `--cols:${draft.list.length};--depth:${depth}` },
        h('span', { class: 'pname' }, h('span', { class: 'pspacer' }), icon('file'), h('span', { class: 'ptext', title: file.path }, label)),
        h('span', { class: 'pcount tnum' }, formatSize(file.size)),
        ...draft.list.map((profile) => cell(!profile.files.has(file.path), `${file.path} en ${profile.name}`, () => { profile.files.has(file.path) ? profile.files.delete(file.path) : profile.files.add(file.path); afterToggle() })))
}

function filesTree(files) {
    const make = (name, path) => ({ name, path, folders: new Map(), files: [], all: [] })
    const root = make('', '')
    for (const file of files) {
        const parts = file.path.split('/')
        let node = root
        node.all.push(file)
        for (const part of parts.slice(0, -1)) {
            if (!node.folders.has(part)) node.folders.set(part, make(part, `${node.path}${part}/`))
            node = node.folders.get(part)
            node.all.push(file)
        }
        node.files.push({ ...file, name: parts[parts.length - 1] })
    }
    return root
}

function folderRows(node, depth, rows) {
    const { draft } = profilesUi
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    for (const folder of [...node.folders.values()].sort(byName)) {
        const open = profilesUi.open.has(folder.path)
        rows.push(h('div', { class: 'mrow folder', style: `--cols:${draft.list.length};--depth:${depth}` },
            h('button', {
                type: 'button', class: 'pname', 'aria-expanded': String(open),
                onclick: () => { open ? profilesUi.open.delete(folder.path) : profilesUi.open.add(folder.path); paintMatrix() }
            }, icon(open ? 'chevronDown' : 'chevronRight'), icon('folder'), h('span', { class: 'ptext' }, folder.name)),
            h('span', { class: 'pcount tnum' }, plural(folder.all.length, 'archivo', 'archivos')),
            ...draft.list.map((profile) => {
                const gone = folder.all.filter((file) => profile.files.has(file.path)).length
                const checked = gone === 0 ? true : gone === folder.all.length ? false : 'mixed'
                return cell(checked, `Carpeta ${folder.path} en ${profile.name}`, () => {
                    // all in -> all out; anything else -> all in
                    for (const file of folder.all) { if (checked === true) profile.files.add(file.path); else profile.files.delete(file.path) }
                    afterToggle()
                })
            })))
        if (open) folderRows(folder, depth + 1, rows)
    }
    for (const file of node.files.sort(byName)) rows.push(fileRowFor(file, file.name, depth))
    return rows
}

function paintMatrix() {
    const box = $('#profileMatrix')
    if (!box || !profilesUi.draft) return
    const { items } = profilesUi.data
    const filter = profilesUi.filter.trim().toLowerCase()
    const section = (title, count) => h('div', { class: 'mrow section-row' }, h('span', { class: 'label' }, `${title} (${count})`))
    const mods = items.mods.filter((mod) => !filter || mod.stem.includes(filter) || mod.names.some((name) => name.toLowerCase().includes(filter)))
    const files = items.files.filter((file) => !filter || file.path.toLowerCase().includes(filter))

    const rows = [matrixHead(), section('Mods', mods.length), ...mods.map(modRow)]
    if (!mods.length) rows.push(h('div', { class: 'zone-empty' }, filter ? 'Ningún mod coincide.' : 'Sin mods.'))
    rows.push(section('Archivos', files.length))
    if (filter) rows.push(...files.slice(0, 300).map((file) => fileRowFor(file, file.path, 0)), files.length > 300 ? h('div', { class: 'pcount', style: 'padding:8px 12px' }, `Y ${files.length - 300} más: afina la búsqueda.`) : null)
    else folderRows(filesTree(files), 0, rows)
    if (!files.length) rows.push(h('div', { class: 'zone-empty' }, filter ? 'Ningún archivo coincide.' : 'Este modpack no tiene archivos en «files».'))
    box.replaceChildren(...rows)
}

function afterToggle() {
    markProfilesDirty()
    paintSummaries()
    const box = $('#profileMatrix')
    const top = box ? box.scrollTop : 0
    paintMatrix()
    if (box) box.scrollTop = top
}

function paintProfilesBar() {
    const bar = $('#profilesBar')
    if (!bar || !profilesUi.draft) return
    const problem = profilesUi.draft.list.some((profile) => !profile.name.trim()) ? 'A un perfil le falta el nombre.' : null
    bar.replaceChildren(
        h('button', { class: 'btn paper', type: 'button', disabled: !profilesUi.dirty || !!problem, onclick: () => saveProfiles(false) }, 'Guardar perfiles'),
        h('button', {
            class: 'btn', type: 'button',
            onclick: () => {
                if (!profilesUi.data.profiles) { profilesUi.draft = null; profilesUi.dirty = false; paintProfiles(); return }
                if (confirm('Este modpack dejará de tener perfiles: todos los jugadores recibirán lo del perfil por defecto. Los mods y archivos no se borran. ¿Seguro?')) saveProfiles(true)
            }
        }, withIcon('trash', profilesUi.data.profiles ? 'Quitar los perfiles' : 'Descartar')),
        h('span', { class: `hint-line${profilesUi.dirty ? ' dirty' : ''}` }, problem || (profilesUi.dirty ? 'Cambios sin guardar' : 'Todo guardado. Cuando termines, pulsa Compilar abajo.')))
}
