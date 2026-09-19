/* Empi Publisher - the Perfiles tab. Loaded before app.js and uses its helpers (h, icon, api, toast, selectPack...).
   The idea and the format live in lib/profiles.js. A profile is only a link to another modpack: that modpack keeps being edited in its own
   sheet (mods, files, memory...), stays published, and in the launcher is shown inside this one instead of on its own. */

const profilesUi = { error: null, data: null, draft: null, dirty: false, picking: false }

const gbLabel = (mb) => String(Math.round((mb / 1024) * 10) / 10).replace('.', ',')
const memoryLabel = (ram) => (ram ? (ram.minimumMb === ram.maximumMb ? `${gbLabel(ram.maximumMb)} GB` : `${gbLabel(ram.minimumMb)}–${gbLabel(ram.maximumMb)} GB`) : null)

// ---------------------------------------------------------------- the draft: stored profiles <-> what is being edited

function draftFrom(data) {
    const stored = data.profiles
    if (!stored) return null
    const own = (entry) => ({ name: entry.name, description: entry.description || '', below: entry.recommendedBelowGb ?? '' })
    return { self: own(stored.self), list: stored.list.map((entry) => ({ pack: entry.pack, info: entry.info, ...own(entry) })) }
}

/** The draft -> what the server stores. */
function profilesPayload() {
    const { draft } = profilesUi
    const clean = (entry) => ({ name: entry.name.trim(), description: entry.description.trim(), recommendedBelowGb: entry.below === '' ? null : Number(entry.below) })
    return { self: clean(draft.self), list: draft.list.map((entry) => ({ pack: entry.pack, ...clean(entry) })) }
}

// ---------------------------------------------------------------- loading and saving

function profilesView() {
    return h('div', { class: 'profiles' }, h('div', { id: 'profilesBox' }, h('div', { class: 'skeleton', style: 'height:240px' })))
}

async function loadProfiles() {
    profilesUi.error = null
    try {
        profilesUi.data = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/profiles`)
        profilesUi.draft = draftFrom(profilesUi.data)
        profilesUi.dirty = false
    } catch (err) {
        profilesUi.data = null
        profilesUi.error = err.message
    }
    paintProfiles()
}

async function saveProfiles(removeAll = false, message = null) {
    try {
        profilesUi.data = await api(`/api/packs/${encodeURIComponent(state.selectedId)}/profiles`, { method: 'POST', body: { profiles: removeAll ? null : profilesPayload() } })
        profilesUi.draft = draftFrom(profilesUi.data)
        profilesUi.dirty = false
        profilesUi.picking = false
        toast(message || (removeAll ? 'Perfiles quitados.' : 'Perfiles guardados. Falta compilar y enviar para que lleguen a los jugadores.'))
        await refreshAll()
    } catch (err) {
        toast(err.message, true)
        await loadProfiles()
    }
}

function markProfilesDirty() {
    profilesUi.dirty = true
    paintProfilesBar()
}

// ---------------------------------------------------------------- what can be done

/** Makes another modpack a profile of this one: it only becomes a link (the modpack itself is not touched), so it is saved at once. */
async function addLink(version) {
    const host = (state.pack && state.pack.name) || ''
    const taken = new Set([(profilesUi.draft ? profilesUi.draft.self.name : 'Normal').toLowerCase(), ...(profilesUi.draft ? profilesUi.draft.list.map((entry) => entry.name.toLowerCase()) : [])])
    const base = (version.name.toLowerCase().startsWith(host.toLowerCase()) ? version.name.slice(host.length).replace(/^[\s\-_:·]+/, '').trim() : version.name) || version.name
    let name = base.slice(0, 32)
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`
    const draft = profilesUi.draft || { self: { name: 'Normal', description: '', below: '' }, list: [] }
    draft.list.push({ pack: version.id, name, description: '', below: '', info: null })
    profilesUi.draft = draft
    await saveProfiles(false, `«${version.name}» ahora es el perfil «${name}» de ${host}. Sigue como siempre en su ficha. Falta compilar y enviar.`)
}

async function removeLink(entry) {
    const { draft } = profilesUi
    draft.list = draft.list.filter((candidate) => candidate.pack !== entry.pack)
    if (draft.list.length === 0) await saveProfiles(true, `«${entry.name}» ya no es un perfil. Sigue como siempre en su ficha.`)
    else await saveProfiles(false, `«${entry.name}» ya no es un perfil. Sigue como siempre en su ficha.`)
}

function openVersion(id) {
    state.subtab = 'settings'
    selectPack(id)
}

// ---------------------------------------------------------------- painting

function paintProfiles() {
    const box = $('#profilesBox')
    if (!box) return
    if (profilesUi.error) {
        box.replaceChildren(h('section', { class: 'section' },
            h('h2', {}, 'Perfiles'),
            h('p', { class: 'note' }, icon('alert'), profilesUi.error === 'No encontrado'
                ? 'Este Publisher es anterior a los perfiles y no sabe manejarlos. Ciérralo y ábrelo otra vez (Publicar.bat) para que los tenga.'
                : `No pude cargar los perfiles: ${profilesUi.error}`),
            h('div', { class: 'form-actions', style: 'margin-top:14px' }, h('button', { class: 'btn small', type: 'button', onclick: loadProfiles }, withIcon('refresh', 'Reintentar')))))
        return
    }
    const { data, draft } = profilesUi
    if (!data) return

    // a modpack that is somebody's profile does not have profiles of its own
    if (data.profileOf) {
        box.replaceChildren(h('section', { class: 'section' },
            h('h2', {}, 'Perfiles'),
            h('p', { class: 'prose' }, `Esta versión es un perfil de «${data.profileOf.name}»: en el launcher aparece dentro de ese modpack en lugar de por su cuenta. Aquí se sigue editando como cualquier otra versión (mods, archivos, memoria…).`),
            h('div', { class: 'form-actions', style: 'margin-top:14px' }, h('button', { class: 'btn', type: 'button', onclick: () => openVersion(data.profileOf.id) }, withIcon('package', `Abrir «${data.profileOf.name}»`)))))
        return
    }

    const usable = data.versions.filter((version) => version.available)
    box.replaceChildren(h('section', { class: 'section' },
        h('h2', {}, draft ? `Perfiles (${draft.list.length + 1})` : 'Perfiles'),
        h('p', { class: draft ? 'muted' : 'prose' }, draft
            ? 'En el launcher los jugadores ven un solo modpack y eligen el perfil en un desplegable pequeño junto a su nombre. Cada perfil es otra versión que ya tienes: se sigue editando en su propia ficha y no se oculta ni se archiva.'
            : 'Un modpack puede tener perfiles: otras versiones tuyas (por ejemplo «PanolisSMP Lite») que en el launcher aparecen dentro de este, en un desplegable pequeño junto a su nombre, en lugar de como una versión más. Cada una se sigue editando en su propia ficha (mods, memoria, versión de Minecraft, todo) y no se oculta ni se archiva.'),
        data.legacy ? h('p', { class: 'note' }, icon('alert'), 'Este modpack tenía perfiles de la forma anterior. Ya no hacen nada y se quitan al guardar. Añade ahora las versiones que quieras como perfiles.') : null,
        draft ? h('div', { class: 'pcards', id: 'profileCards' }) : null,
        h('div', { id: 'profilesPicker' }),
        h('div', { class: 'form-actions', style: 'margin-top:14px' },
            h('button', { class: 'btn paper', type: 'button', id: 'addProfileButton', disabled: !usable.length || (draft && draft.list.length >= 11), onclick: () => { profilesUi.picking = true; paintPicker() } }, withIcon('plus', 'Añadir perfil')),
            !usable.length ? h('span', { class: 'hint-line' }, data.versions.length ? 'Todas tus otras versiones ya son perfiles o tienen perfiles propios.' : 'Todavía no tienes otra versión. Crea la que quieras (por ejemplo «Lite») con «Nuevo».') : null)),
        draft ? h('div', { class: 'savebar', id: 'profilesBar' }) : null)
    if (draft) { paintCards(); paintProfilesBar() }
    paintPicker()
}

function paintPicker() {
    const slot = $('#profilesPicker')
    const opener = $('#addProfileButton')
    if (!slot) return
    if (opener) opener.hidden = profilesUi.picking
    if (!profilesUi.picking) { slot.replaceChildren(); return }
    const describe = (version) => [`Minecraft ${version.minecraft}`, version.loaderName || 'sin loader', `v${version.packVersion}`, plural(version.mods, 'mod', 'mods'), version.active ? null : 'desactivado'].filter(Boolean).join(' · ')
    slot.replaceChildren(h('div', { class: 'pick-panel' },
        h('div', { class: 'module-head' }, h('h3', {}, 'Añadir perfil'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => { profilesUi.picking = false; paintPicker() } }, icon('x'))),
        h('p', { class: 'muted small-help' }, 'Elige una de tus versiones. Puede ser de cualquier versión de Minecraft y de cualquier loader. No se cambia nada en ella.'),
        h('div', { class: 'pick-list', role: 'list' },
            ...profilesUi.data.versions.map((version) => (version.available
                ? h('button', { type: 'button', class: 'pick', role: 'listitem', onclick: () => addLink(version) }, h('b', {}, version.name), h('span', { class: 'muted' }, describe(version)))
                : h('div', { class: 'pick disabled', role: 'listitem', 'aria-disabled': 'true' }, h('b', {}, version.name), h('span', { class: 'muted' }, `${version.reason}: no puede ser un perfil de este modpack`)))))))
}

function paintCards() {
    const { draft } = profilesUi
    const cards = $('#profileCards')
    if (!cards) return
    const parse = (text) => { const n = parseFloat(String(text).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : '' }
    const fields = (entry, own) => [
        h('label', {}, 'Nombre en el launcher',
            h('input', { value: entry.name, maxlength: '32', 'aria-label': 'Nombre del perfil', oninput: (event) => { entry.name = event.target.value; markProfilesDirty() } })),
        h('label', {}, 'Descripción (la ven los jugadores)',
            h('input', { value: entry.description, maxlength: '160', placeholder: own ? 'El de siempre' : 'Menos carga para equipos modestos', 'aria-label': 'Descripción del perfil', oninput: (event) => { entry.description = event.target.value; markProfilesDirty() } })),
        h('label', {}, 'Recomendarlo si el equipo tiene menos de (GB)',
            h('input', {
                type: 'text', inputmode: 'decimal', class: 'pnum', placeholder: 'nunca', value: entry.below === '' ? '' : String(entry.below), 'aria-label': 'Recomendado si el equipo tiene menos de estos GB',
                oninput: (event) => { entry.below = parse(event.target.value); markProfilesDirty() }
            }))
    ]

    const selfCard = h('div', { class: 'pcard default' },
        h('div', { class: 'pcard-tag' }, 'Este modpack', h('span', { class: 'muted' }, ` · ${state.pack ? state.pack.name : ''}`)),
        ...fields(draft.self, true),
        h('p', { class: 'muted small-help' }, 'Es el que reciben los jugadores la primera vez, y el que ven los launchers que todavía no conocen los perfiles.'))

    const linkCards = draft.list.map((entry) => {
        const info = entry.info
        return h('div', { class: 'pcard' },
            h('div', { class: 'pcard-tag' }, info ? info.name : entry.pack, info && !info.active ? h('span', { class: 'flag off', style: 'margin-left:8px' }, 'Desactivado') : null),
            ...fields(entry, false),
            info
                ? h('div', { class: 'pcard-info' },
                    h('span', { class: 'tnum' }, `Minecraft ${info.minecraft} · ${info.loaderName || 'sin loader'} · v${info.packVersion} · ${plural(info.mods, 'mod', 'mods')}`),
                    h('span', {}, `Memoria: ${memoryLabel(info.ram) || 'la que calcula el launcher'}`),
                    h('span', { class: 'muted' }, 'La memoria, los mods y todo lo demás se cambian en su propia ficha.'))
                : h('p', { class: 'note' }, icon('alert'), 'Esa versión ya no existe. Quita este perfil.'),
            h('div', { class: 'pcard-foot' },
                info ? h('button', { class: 'btn small', type: 'button', onclick: () => openVersion(entry.pack) }, withIcon('package', 'Abrir su ficha')) : null,
                h('button', { class: 'btn small', type: 'button', title: 'Deja de ser perfil de este modpack (la versión no se toca)', onclick: () => removeLink(entry) }, withIcon('trash', 'Quitar'))))
    })
    cards.replaceChildren(selfCard, ...linkCards)
}

function paintProfilesBar() {
    const bar = $('#profilesBar')
    if (!bar || !profilesUi.draft) return
    const { draft, dirty } = profilesUi
    const problem = [draft.self, ...draft.list].some((entry) => !entry.name.trim()) ? 'A un perfil le falta el nombre.' : null
    bar.replaceChildren(
        h('button', { class: 'btn paper', type: 'button', disabled: !dirty || !!problem, onclick: () => saveProfiles(false) }, 'Guardar perfiles'),
        h('button', {
            class: 'btn', type: 'button',
            onclick: () => { if (confirm('Este modpack dejará de tener perfiles. Las versiones que eran perfiles siguen como siempre, cada una por su cuenta. ¿Seguro?')) saveProfiles(true) }
        }, withIcon('trash', 'Quitar todos los perfiles')),
        h('span', { class: `hint-line${dirty ? ' dirty' : ''}` }, problem || (dirty ? 'Cambios sin guardar' : 'Todo guardado. Cuando termines, pulsa Compilar abajo.')))
}
