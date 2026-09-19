/* Empi Publisher: the living ground and its small motion helpers. Vanilla, no dependencies.

   The ground is one full-window canvas of halftone dots (a 45-degree hex screen). Dot size is the tone:
   slow interference waves breathe through it, two plates swell at the free corners, a scan band crosses now and then,
   the pointer and every click push dots outward, the hovered control lights the dots around it, and the next action glows pink.
   Everything else here (entrances, the sliding ink under the tabs, the text decode, the magnet on the primary button)
   is short and event-driven.

   Budget, because this shares a machine with a build: 24 fps (10 when the window is not focused), nothing runs while the tab
   is hidden, dots are batched into a few paths per frame, the frame cost is measured and the field thins out (then stops)
   if the machine cannot afford it. A visible "Vivo / Tranquilo" switch stops all of it, and the OS "reduce motion" setting
   starts it stopped. */
(() => {
    'use strict'
    const root = document.documentElement
    const canvas = document.getElementById('life')
    const toggle = document.getElementById('lifeBtn')
    const KEY = 'empi.motion'
    const TAU = Math.PI * 2
    // The dots' own colour (the player's choice; the grey of the launcher by default) and the accent. Where an effect of one meets an
    // effect of the other the dot is drawn in a blend: mix step 0 is the dot colour, MIX the accent, the steps between the transition.
    const DOT_KEY = 'empi.dots', DEFAULT_DOT = '#64635f', ACCENT = [255, 61, 139], MIX = 16
    const BUCKETS = 44
    const hyp = (a, b) => Math.sqrt(a * a + b * b)
    const HOT = '.pack-card, .toggle-pill, .btn:not(:disabled), .subtab, .tab, .choice, .zone, .icon-btn, .segmented button, input, select, textarea, .mod-row, .prow, .module, .section'

    const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
    const write = (value) => { try { localStorage.setItem(KEY, value) } catch { /* private window */ } }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')

    const stored = read()
    let alive = stored ? stored === 'alive' : !reduce.matches
    const ctx = canvas ? canvas.getContext('2d') : null

    // ---------------------------------------------------------------- click ripples
    // A ring has to be able to leave the window, so its life follows its reach (the farthest corner). It starts fast and slows like
    // water, spreads and weakens as it grows, wobbles a little so it is not a drawn circle, and only fades in its last quarter.
    const RIPPLE_BAND = 26
    function newRipple(x, y, accent) {
        const reach = Math.max(hyp(x, y), hyp(window.innerWidth - x, y), hyp(x, window.innerHeight - y), hyp(window.innerWidth - x, window.innerHeight - y)) + 3 * RIPPLE_BAND
        const life = Math.min(4.4, Math.max(1.6, 1.2 + reach / 650))
        return { x, y, t0: t, pink: accent, life, reach, phase: (x * 0.013 + y * 0.007) % TAU, r: 0, w: RIPPLE_BAND, a: 0 }
    }
    function stepRipple(rp) {
        const age = Math.min(t - rp.t0, rp.life)
        const radius = rp.reach * 1.08 * (1 - Math.exp(-age / (rp.life / 2.6)))
        const fadeFrom = rp.life * 0.72
        const fade = age <= fadeFrom ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (age - fadeFrom) / (rp.life - fadeFrom))
        rp.r = radius
        rp.w = RIPPLE_BAND + 0.028 * radius
        rp.a = 0.62 / Math.sqrt(1 + radius / 240) * fade
    }

    // ---------------------------------------------------------------- the field
    let W = 0, H = 0, dpr = 1, pitch = 24
    let raf = 0, last = 0, t = 0, speed = 1, wantSpeed = 1
    let cost = 0, slowFrames = 0, lateFrames = 0, nextProbe = 0, lastQuiet = 0
    const ptr = { x: -999, y: -999, amp: 0, want: 0 }
    const hot = { el: null, x: 0, y: 0, w: 0, h: 0, amp: 0 }
    const next = { el: null, x: 0, y: 0, w: 0, h: 0, amp: 0 }
    const ripples = []
    let quiet = []
    const sets = Array.from({ length: MIX + 1 }, () => Array.from({ length: BUCKETS }, () => []))   // [mix step][radius bucket] -> x, y pairs
    let dotHex = DEFAULT_DOT
    let mixColors = []
    const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    function buildMix() {
        const dot = toRgb(dotHex)
        mixColors = Array.from({ length: MIX + 1 }, (_, k) => `rgb(${dot.map((c, i) => Math.round(c + (ACCENT[i] - c) * (k / MIX))).join(',')})`)
    }
    /** The saved colour, if it is a valid one. Per browser: a viewing preference, like the motion switch. */
    const readDot = () => { try { const v = localStorage.getItem(DOT_KEY); return /^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : DEFAULT_DOT } catch { return DEFAULT_DOT } }
    dotHex = readDot()
    buildMix()

    function size() {
        dpr = 1   // dots are soft by nature; one canvas pixel per CSS pixel keeps the raster cost down on dense screens
        W = window.innerWidth
        H = window.innerHeight
        canvas.width = Math.round(W * dpr)
        canvas.height = Math.round(H * dpr)
        canvas.style.width = `${W}px`
        canvas.style.height = `${H}px`
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        if (typeof buildGrid === 'function') buildGrid()
    }

    /** Where text lives: dots stay faint there so nothing is ever hard to read. */
    function measureQuiet() {
        quiet = []
        for (const selector of ['#packList', '#packContent:not([hidden])', '#newPackForm:not([hidden])', '#tab-launcher:not([hidden]) #launcherContent']) {
            const el = document.querySelector(selector)
            if (!el || !el.offsetParent) continue
            const r = el.getBoundingClientRect()
            if (r.width > 0 && r.height > 0) quiet.push([r.left - 8, r.top - 8, r.right + 8, r.bottom + 8])
        }
    }

    function ease(s, el) {
        if (el && el.isConnected) {
            const r = el.getBoundingClientRect()
            if (s.amp < 0.02) { s.x = r.left; s.y = r.top; s.w = r.width; s.h = r.height }
            else { s.x += (r.left - s.x) * 0.3; s.y += (r.top - s.y) * 0.3; s.w += (r.width - s.w) * 0.3; s.h += (r.height - s.h) * 0.3 }
            s.amp += (1 - s.amp) * 0.12
        } else {
            s.amp *= 0.86
            if (s.amp < 0.01) s.amp = 0
        }
    }

    // The lattice and everything about it that does not depend on time is worked out once, not every frame.
    let gx = new Float32Array(0), gy = new Float32Array(0), gq = new Float32Array(0), gp = new Float32Array(0), gN = 0, quietSig = ''

    function buildGrid() {
        const rowH = pitch * 0.866
        const cols = Math.ceil((W + pitch) / pitch) + 1, rows = Math.ceil((H + pitch) / rowH) + 1
        gx = new Float32Array(cols * rows); gy = new Float32Array(cols * rows); gq = new Float32Array(cols * rows); gp = new Float32Array(cols * rows)
        gN = 0
        for (let row = 0; row < rows; row++) {
            const y = rowH * 0.5 + row * rowH
            if (y >= H + pitch) break
            const off = row & 1 ? pitch / 2 : 0
            for (let x = off; x < W + pitch; x += pitch) {
                gx[gN] = x; gy[gN] = y
                gp[gN] = Math.max(1 - hyp(x / (W * 0.3), (H - y) / (H * 0.6)), 1 - hyp((W - x) / (W * 0.3), y / (H * 0.32)))
                gN++
            }
        }
        quietSig = ''
        applyQuiet()
    }

    /** How much of each dot is covered by a block of text (0 in the open, 1 inside, feathered at the edge). */
    function applyQuiet() {
        const sig = quiet.map((b) => b.map(Math.round).join(',')).join('|')
        if (sig === quietSig) return
        quietSig = sig
        for (let i = 0; i < gN; i++) {
            let q = 0
            for (let k = 0; k < quiet.length; k++) {
                const bb = quiet[k]
                const dx = Math.max(bb[0] - gx[i], 0, gx[i] - bb[2]), dy = Math.max(bb[1] - gy[i], 0, gy[i] - bb[3])
                const inside = 1 - Math.min(1, hyp(dx, dy) / 30)
                if (inside > q) q = inside
            }
            gq[i] = q
        }
    }

    function draw(now) {
        const started = performance.now()
        const ph = t + (window.scrollY || 0) * 0.0025
        ptr.amp += (ptr.want - ptr.amp) * 0.12
        if (now - lastQuiet > 700) { lastQuiet = now; measureQuiet(); applyQuiet() }
        if (now - nextProbe > 400) { nextProbe = now; next.el = document.querySelector('#pipeline .btn.primary:not(:disabled)') }
        ease(hot, hot.el)
        ease(next, next.el)
        magnet()

        for (const set of sets) for (const bucket of set) bucket.length = 0
        const maxR = pitch * 0.53
        const band = ((ph * 0.075) % 1.5 - 0.25) * H
        for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].t0 > ripples[i].life) ripples.splice(i, 1)
        for (const rp of ripples) stepRipple(rp)
        const doPtr = ptr.amp > 0.01, doHot = hot.amp > 0.02, doNext = next.amp > 0.02
        const w1 = ph * 0.55, w2 = ph * 0.42, w3 = ph * 0.7, warp = ph * 0.6

        for (let i = 0; i < gN; i++) {
            const x = gx[i], y = gy[i], q = gq[i]
            const wave = 0.5 + 0.25 * (Math.sin(x * 0.0105 + w1) * Math.cos(y * 0.0125 - w2) + Math.sin((x + y) * 0.008 - w3))

            // the two plates, their edges undulating
            let plate = gp[i] + 0.12 * Math.sin(warp + y * 0.01 + x * 0.006)
            plate = plate <= 0 ? 0 : plate > 1 ? 1 : plate
            plate = plate * plate * (3 - 2 * plate)

            let tone = (0.012 + 0.03 * wave) * (1 - 0.5 * q) + plate * (0.24 + 0.4 * wave) * (1 - 0.86 * q)
            const dBand = (y - band) / (H * 0.05)
            if (dBand > -3 && dBand < 3) tone += Math.exp(-dBand * dBand) * 0.3 * (1 - 0.85 * q)

            if (doPtr) {
                const dx = x - ptr.x, dy = y - ptr.y, d2 = dx * dx + dy * dy
                if (d2 < 24000) tone += Math.exp(-d2 / 6500) * 0.36 * ptr.amp * (1 - 0.6 * q)
            }
            let glow = 0
            for (let k = 0; k < ripples.length; k++) {
                const rp = ripples[k], dx = x - rp.x, dy = y - rp.y
                const wobble = 1 + 0.035 * Math.sin(3 * Math.atan2(dy, dx) + rp.phase + (t - rp.t0) * 1.4)
                const ring = (hyp(dx, dy) - rp.r * wobble) / rp.w
                if (ring > -6 && ring < 3) {
                    // sharp leading edge, soft wake behind it
                    const v = (ring >= 0 ? Math.exp(-ring * ring * 1.6) : Math.exp(-ring * ring * 0.28)) * rp.a * (1 - 0.5 * q)
                    if (rp.pink) glow += v
                    else tone += v
                }
            }
            if (doHot) {
                const dx = Math.max(hot.x - x, 0, x - (hot.x + hot.w)), dy = Math.max(hot.y - y, 0, y - (hot.y + hot.h))
                const d = hyp(dx, dy)
                if (d < 58) tone += (1 - d / 58) ** 2 * hot.amp * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(x * 0.11 + ph * 3) * Math.cos(y * 0.11 - ph * 2))) * 0.5
            }
            if (doNext) {
                const dx = Math.max(next.x - x, 0, x - (next.x + next.w)), dy = Math.max(next.y - y, 0, y - (next.y + next.h))
                const d = hyp(dx, dy)
                if (d < 90) glow += (1 - d / 90) ** 2 * next.amp * (0.45 + 0.55 * Math.sin(d * 0.09 - ph * 4.2)) * 0.6
            }

            // where an accent effect and a dot-colour effect overlap the dot takes a colour in between, and is a little bigger than either alone
            const v = glow > 0.02 ? Math.max(glow, tone) + 0.35 * Math.min(glow, tone) : tone
            if (v <= 0.02) continue
            const r = maxR * Math.sqrt(v > 1 ? 1 : v)
            if (r < 0.75) continue
            sets[glow > 0.02 ? Math.round(glow / (glow + tone) * MIX) : 0][Math.min(BUCKETS - 1, (r * 2) | 0)].push(x, y)
        }

        ctx.clearRect(0, 0, W, H)
        for (let step = 0; step <= MIX; step++) {
            const set = sets[step]
            ctx.fillStyle = mixColors[step]
            for (let i = 1; i < set.length; i++) {
                const dots = set[i]
                if (!dots.length) continue
                const r = i / 2 + 0.25
                ctx.beginPath()
                for (let k = 0; k < dots.length; k += 2) { ctx.moveTo(dots[k] + r, dots[k + 1]); ctx.arc(dots[k], dots[k + 1], r, 0, TAU) }
                ctx.fill()
            }
        }

        // frame cost: thin the field out, and in the end stop, if this machine cannot afford it
        cost = cost * 0.9 + (performance.now() - started) * 0.1
        slowFrames = cost > 9 ? slowFrames + 1 : Math.max(0, slowFrames - 1)
        if (slowFrames > 90) { slowFrames = 0; cost = 0; degrade() }
    }

    /** Thin the dots out first; if even that is too much, go calm and say so. */
    function degrade() {
        if (pitch < 36) { pitch += 6; buildGrid() }
        else setAlive(false, true)
    }

    /** The primary action leans a few pixels toward the pointer. */
    function magnet() {
        const el = next.el
        if (!el || !el.isConnected) return
        const cx = next.x + next.w / 2, cy = next.y + next.h / 2
        const dx = ptr.x - cx, dy = ptr.y - cy
        const near = ptr.amp > 0.05 && hyp(dx, dy) < 150
        el.style.setProperty('--mx', near ? `${Math.max(-6, Math.min(6, dx * 0.07)).toFixed(1)}px` : '0px')
        el.style.setProperty('--my', near ? `${Math.max(-4, Math.min(4, dy * 0.1)).toFixed(1)}px` : '0px')
    }

    function frame(now) {
        raf = requestAnimationFrame(frame)
        const focused = document.hasFocus()
        const gap = focused ? 41 : 100
        if (now - last < gap) return
        const dt = Math.min(0.1, (now - last) / 1000)
        // if frames arrive far later than asked, the machine is struggling: count it like a slow draw
        if (last && now - last > gap * 2.2) lateFrames++
        else if (lateFrames > 0) lateFrames--
        if (lateFrames > 45) { lateFrames = 0; degrade() }
        last = now
        speed += (wantSpeed - speed) * 0.05
        t += dt * speed
        draw(now)
    }

    function paintStatic() {
        if (!ctx) return
        size()
        measureQuiet()
        ptr.amp = hot.amp = next.amp = 0
        hot.el = next.el = null
        ripples.length = 0
        t = 7.3
        draw(0)
    }

    function start() {
        if (raf || !alive || document.hidden || !ctx) return
        size()
        last = 0
        raf = requestAnimationFrame(frame)
    }
    function stop() {
        cancelAnimationFrame(raf)
        raf = 0
    }

    function setAlive(value, automatic = false, persist = true) {
        alive = value
        root.dataset.motion = alive ? 'alive' : 'calm'
        if (toggle) {
            toggle.setAttribute('aria-pressed', String(alive))
            toggle.title = alive ? 'Movimiento vivo: pulsa para dejarlo tranquilo' : 'Movimiento tranquilo: pulsa para darle vida'
        }
        if (alive) start()
        else { stop(); paintStatic() }
        if (automatic) {
            // (window.toast is the page's #toast element until app.js replaces it with the function)
            if (typeof window.toast === 'function') window.toast('Dejé el fondo quieto porque el equipo iba justo. Puedes reactivarlo arriba.')
        } else if (persist) write(alive ? 'alive' : 'calm')
    }

    // ---------------------------------------------------------------- pointer, clicks, hover
    const onMove = (event) => {
        ptr.x = event.clientX
        ptr.y = event.clientY
        ptr.want = 1
    }
    const onOver = (event) => { hot.el = event.target.closest ? event.target.closest(HOT) : null }

    // ---------------------------------------------------------------- helpers the app calls
    function enter(container, selector = ':scope > *', step = 45) {
        if (!alive || !container) return
        const kids = [...container.querySelectorAll(selector)].slice(0, 28)
        kids.forEach((el, i) => {
            el.style.setProperty('--i', i)
            el.classList.remove('rise')
            void el.offsetWidth
            el.classList.add('rise')
        })
        clearTimeout(container.__riseTimer)
        container.__riseTimer = setTimeout(() => kids.forEach((el) => el.classList.remove('rise')), 900 + kids.length * step)
    }

    const inkMemory = {}
    const inkArgs = {}
    /** A dotted underline that slides from the last tab to the new one. */
    function ink(container, key, selector, inset = 8) {
        if (!container) return
        inkArgs[key] = [container, key, selector, inset]
        let bar = container.querySelector(':scope > .ink')
        if (!bar) {
            bar = document.createElement('i')
            bar.className = 'ink'
            bar.setAttribute('aria-hidden', 'true')
            container.append(bar)
        }
        const target = container.querySelector(selector)
        if (!target) { bar.style.opacity = '0'; return }
        const r = target.getBoundingClientRect(), c = container.getBoundingClientRect()
        const x = Math.round(r.left - c.left - container.clientLeft + container.scrollLeft + inset), w = Math.max(0, Math.round(r.width - inset * 2))
        const before = inkMemory[key]
        bar.style.opacity = '1'
        if (before && alive) {
            bar.style.transition = 'none'
            bar.style.transform = `translateX(${before.x}px)`
            bar.style.width = `${before.w}px`
            void bar.offsetWidth
        }
        bar.style.transition = ''
        bar.style.transform = `translateX(${x}px)`
        bar.style.width = `${w}px`
        inkMemory[key] = { x, w }
    }

    const GLYPHS = '01#/+:*<>=_-'
    /** A title decoding out of noise, once, when it changes. */
    function scramble(el, ms = 520) {
        if (!alive || !el) return
        const text = el.textContent
        if (!text || text.length > 48) return
        const from = performance.now()
        el.setAttribute('aria-label', text)   // a screen reader hears the title, not the noise
        const tick = (now) => {
            if (!el.isConnected) return
            const p = Math.min(1, (now - from) / ms)
            const done = Math.floor(text.length * p)
            el.textContent = text.slice(0, done) + [...text.slice(done)].map((c) => (c === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('')
            if (p < 1) requestAnimationFrame(tick)
            else { el.textContent = text; el.removeAttribute('aria-label') }
        }
        requestAnimationFrame(tick)
    }

    /** A pink ring through the dots from an element: something finished. */
    function burst(el, isPink = true) {
        if (!alive || !el) return
        const r = el.getBoundingClientRect()
        ripples.push(newRipple(r.left + r.width / 2, r.top + r.height / 2, isPink))
        if (ripples.length > 6) ripples.shift()
    }

    /** The colour of the dots (and of the waves that are not the accent). persist = false while it is being dragged in the picker. */
    function setDotColor(hex, persist = true) {
        if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return
        dotHex = hex.toLowerCase()
        buildMix()
        if (persist) { try { localStorage.setItem(DOT_KEY, dotHex) } catch { /* private window */ } }
        if (!alive) paintStatic()
    }

    function nudge() {
        setInterval(() => {
            if (!alive || document.hidden || !document.hasFocus()) return
            for (const n of document.querySelectorAll('#pipeline .pstep.current .pnum')) {
                const next = n.classList.contains('beat-b') ? 'beat-c' : 'beat-b'
                n.classList.remove('beat-b', 'beat-c')
                n.classList.add(next)
            }
        }, 10000)
    }

    function glitchSometimes() {
        const delay = 6000 + Math.random() * 8000
        setTimeout(() => {
            if (alive && !document.hidden && document.hasFocus()) {
                const pool = [...document.querySelectorAll('.logo, .brand span, .pack-head h1, .activity-title, .empty-hero h1')].filter((el) => el.offsetParent)
                const el = pool[(Math.random() * pool.length) | 0]
                if (el) {
                    el.classList.remove('tear')
                    void el.offsetWidth
                    el.classList.add('tear')
                    setTimeout(() => el.classList.remove('tear'), 320)
                }
            }
            glitchSometimes()
        }, delay)
    }

    // ---------------------------------------------------------------- wiring
    if (!ctx) {
        window.Life = { enter() {}, ink() {}, scramble() {}, burst() {}, busy() {}, refresh() {}, setDotColor() {}, dotColor: () => '#64635f', defaultDot: '#64635f' }
        return
    }

    window.Life = {
        enter, ink, scramble, burst,
        busy: (on) => { wantSpeed = on ? 2.4 : 1 },
        refresh: () => { lastQuiet = 0; nextProbe = 0 },
        reink: () => { for (const args of Object.values(inkArgs)) if (args[0].isConnected) ink(...args) },
        setDotColor, dotColor: () => dotHex, defaultDot: DEFAULT_DOT,
        stats: () => ({ alive, pitch, cost: +cost.toFixed(2), dots: sets.reduce((n, set) => n + set.reduce((m, a) => m + a.length / 2, 0), 0) })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', (event) => {
        if (!alive) return
        ripples.push(newRipple(event.clientX, event.clientY, false))
        if (ripples.length > 6) ripples.shift()
    }, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    document.addEventListener('pointerleave', () => { ptr.want = 0; hot.el = null })
    window.addEventListener('blur', () => { ptr.want = 0 })
    let resizing = 0
    window.addEventListener('resize', () => {
        cancelAnimationFrame(resizing)
        resizing = requestAnimationFrame(() => { size(); if (!alive) paintStatic() })
    })
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (alive) start() })
    reduce.addEventListener('change', () => { if (!read()) setAlive(!reduce.matches) })
    if (toggle) toggle.addEventListener('click', () => setAlive(!alive))
    // the sliding thumbs measure text: place them once the fonts are in, and again when the window changes size
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.Life.reink())
    let reinking = 0
    window.addEventListener('resize', () => { cancelAnimationFrame(reinking); reinking = requestAnimationFrame(() => window.Life.reink()) })

    setAlive(alive, false, false)
    glitchSometimes()
    nudge()
    if (alive) requestAnimationFrame(() => scramble(document.querySelector('.brand span'), 700))
})()
