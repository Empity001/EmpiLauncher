/* Empi Publisher: the colour of the living ground's dots.
   Round presets and a rainbow one that opens the Publisher's own picker (not the browser's): a square for saturation and brightness, a bar for
   the hue, the hex code, presets and a reset. It works with the pointer and with the arrow keys (Shift = bigger steps). The colour is applied
   live while it is dragged and kept (in this browser) when the pointer is released, Enter is pressed or a preset is chosen. Same idea, same
   presets and same default grey as the launcher's picker. */
(() => {
    'use strict'
    const host = document.getElementById('dotColor')
    if (!host || !window.Life) return

    const PRESETS = [['#64635f', 'Gris'], ['#b8b7b1', 'Blanco'], ['#4a6fd8', 'Azul'], ['#2fa8b5', 'Cian'], ['#4caf6d', 'Verde'], ['#c99a3a', 'Ámbar'], ['#cc5a8a', 'Rosa'], ['#8b6bd6', 'Violeta']]
    const DEFAULT = window.Life.defaultDot
    const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
    const h = (tag, props = {}, ...kids) => {
        const el = document.createElement(tag)
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') el.className = v
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
            else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v)
        }
        el.append(...kids.filter((kid) => kid != null))
        return el
    }

    function hsvToHex(hue, s, v) {
        const c = v * s, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = v - c
        const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.min(5, Math.floor(hue / 60))]
        return '#' + [r, g, b].map((n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('')
    }
    function hexToHsv(hex) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
        const hue = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
        return [hue < 0 ? hue + 360 : hue, max === 0 ? 0 : d / max, max]
    }
    const valid = (text) => /^#[0-9a-f]{6}$/i.test((text || '').trim())

    let hue = 0, sat = 1, val = 1
    const life = window.Life
    const swatches = []
    let custom, panel, svArea, svThumb, hueBar, hueThumb, preview, hexInput

    const hex = () => hsvToHex(hue, sat, val)
    function mark() {
        const now = life.dotColor()
        const isPreset = PRESETS.some(([p]) => p === now)
        for (const [btn, p] of swatches) btn.setAttribute('aria-pressed', String(p === now))
        custom.setAttribute('aria-pressed', String(!isPreset))
        custom.style.setProperty('--swatch', isPreset ? '' : now)
        custom.classList.toggle('filled', !isPreset)
    }
    function show(fromText = false) {
        const color = hex()
        panel.style.setProperty('--pk-hue', hsvToHex(hue, 1, 1))
        panel.style.setProperty('--pk-color', color)
        svThumb.style.left = `${sat * 100}%`
        svThumb.style.top = `${(1 - val) * 100}%`
        hueThumb.style.left = `${hue / 360 * 100}%`
        if (!fromText) hexInput.value = color
    }
    /** live = still dragging: shown at once but not kept yet. */
    function apply(live) {
        life.setDotColor(hex(), !live)
        mark()
    }
    function set(color, live = false) {
        [hue, sat, val] = hexToHsv(color)
        show()
        apply(live)
    }

    // the presets and the rainbow one
    for (const [color, label] of PRESETS) {
        const btn = h('button', { type: 'button', class: 'swatch', 'aria-label': `Color ${label}`, title: label, style: `--swatch:${color}`, onclick: () => set(color) })
        swatches.push([btn, color])
        host.append(btn)
    }
    custom = h('button', { type: 'button', class: 'swatch custom', 'aria-label': 'Color personalizado', title: 'Personalizado…', 'aria-expanded': 'false', onclick: () => toggle() })
    host.append(custom)

    // the picker
    svThumb = h('i', { class: 'pk-thumb' })
    svArea = h('div', { class: 'pk-sv', tabindex: '0', role: 'group', 'aria-label': 'Saturación y brillo' }, svThumb)
    hueThumb = h('i', { class: 'pk-thumb pk-hue-thumb' })
    hueBar = h('div', { class: 'pk-hue', tabindex: '0', role: 'slider', 'aria-label': 'Tono', 'aria-valuemin': '0', 'aria-valuemax': '360' }, hueThumb)
    preview = h('span', { class: 'pk-preview' })
    hexInput = h('input', { class: 'pk-hex', type: 'text', maxlength: '7', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Color en hexadecimal' })
    const reset = h('button', { type: 'button', class: 'btn pk-reset', title: 'Volver al color de siempre', onclick: () => set(DEFAULT) }, 'Gris')
    const presets = h('div', { class: 'pk-presets' }, ...PRESETS.map(([color, label]) => h('button', { type: 'button', class: 'swatch small', 'aria-label': `Color ${label}`, title: label, style: `--swatch:${color}`, onclick: () => set(color) })))
    panel = h('div', { class: 'picker', hidden: true, role: 'group', 'aria-label': 'Selector de color' }, svArea, hueBar, h('div', { class: 'pk-row' }, preview, hexInput, reset), presets)
    host.append(panel)

    function drag(el, move) {
        el.addEventListener('pointerdown', (event) => {
            el.setPointerCapture(event.pointerId)
            el.focus()
            const r = el.getBoundingClientRect()
            move(clamp((event.clientX - r.left) / r.width), clamp((event.clientY - r.top) / r.height))
            apply(true)
            const onMove = (e) => { move(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)); apply(true) }
            const onUp = () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); apply(false) }
            el.addEventListener('pointermove', onMove)
            el.addEventListener('pointerup', onUp)
            el.addEventListener('pointercancel', onUp)
            event.preventDefault()
        })
    }
    drag(svArea, (x, y) => { sat = x; val = 1 - y; show() })
    drag(hueBar, (x) => { hue = x * 360; show() })
    const arrows = (el, step) => el.addEventListener('keydown', (event) => {
        const big = event.shiftKey
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key]
        if (!d) return
        event.preventDefault()
        step(d[0], d[1], big)
        show(); apply(false)
    })
    arrows(svArea, (dx, dy, big) => { sat = clamp(sat + dx * (big ? 0.1 : 0.02)); val = clamp(val + dy * (big ? 0.1 : 0.02)) })
    arrows(hueBar, (dx, _dy, big) => { hue = (hue + dx * (big ? 10 : 2) + 360) % 360 })
    hexInput.addEventListener('input', () => { if (valid(hexInput.value)) { [hue, sat, val] = hexToHsv(hexInput.value.trim()); show(true); apply(true) } })
    hexInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); if (valid(hexInput.value)) apply(false) } })
    hexInput.addEventListener('change', () => { if (valid(hexInput.value)) apply(false); else show() })

    function toggle(open = panel.hidden) {
        panel.hidden = !open
        custom.setAttribute('aria-expanded', String(open))
        if (open) { [hue, sat, val] = hexToHsv(life.dotColor()); show() }
    }
    // Escape closes the picker without closing the whole dialog behind it
    panel.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { event.stopPropagation(); event.preventDefault(); toggle(false); custom.focus() } })

    mark()
})()
