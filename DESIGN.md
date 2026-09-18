---
name: Empi Proof Bench (Publisher and Launcher)
description: One darkroom world for two surfaces, halftone black and paper-white with a single accent (electric pink, or the modpack's own colour in the launcher) marking the next action; the Publisher is soft, modular and alive on a dot ground, the launcher stays square, notched and event-only.
colors:
  well: "#060607"
  bg: "#0b0b0d"
  surface: "#111114"
  surface-2: "#18181c"
  surface-3: "#212127"
  line: "#24242a"
  line-strong: "#3b3b44"
  dot: "#55555f"
  paper: "#f1efe8"
  paper-2: "#a5a598"
  paper-3: "#8b8b81"
  paper-ink: "#47473f"
  mask-black: "#000000"
  module: "rgb(17 18 21 / .76)"
  hair: "rgb(241 239 232 / .1)"
  hair-strong: "rgb(241 239 232 / .22)"
  dock: "rgb(14 15 17 / .95)"
  pink: "#ff3d8b"
  pink-hover: "#ff6aa6"
  pink-ink: "#16030c"
  split-red: "#ff2a4a"
  split-cyan: "#33e6ff"
  danger: "#ff6a4d"
  warn: "#ffb14a"
  launcher-ink: "#050506"
  launcher-surface: "#0c0c0f"
  launcher-surface-2: "#151519"
  launcher-text-2: "#bdbab1"
  launcher-text-3: "#8d8a82"
  launcher-danger: "#ff5a67"
typography:
  display:
    fontFamily: "Doto, Cascadia Mono, Consolas, monospace"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  tile-numeral:
    fontFamily: "Doto, Cascadia Mono, Consolas, monospace"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.1
  drawer-title:
    fontFamily: "Doto, Cascadia Mono, Consolas, monospace"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
  wordmark:
    fontFamily: "Doto, Cascadia Mono, Consolas, monospace"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Geist Mono, Cascadia Mono, Consolas, monospace"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Mono, Cascadia Mono, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  button:
    fontFamily: "Geist Mono, Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Mono, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.2
  caption:
    fontFamily: "Geist Mono, Cascadia Mono, Consolas, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.35
  code:
    fontFamily: "Geist Mono, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
  launcher-title-32:
    fontFamily: "Doto, Avenir Medium, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    letterSpacing: "0.04em"
  launcher-title-30:
    fontFamily: "Doto, Avenir Medium, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.04em"
  launcher-title-22:
    fontFamily: "Doto, Avenir Medium, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "0.04em"
  launcher-title-20:
    fontFamily: "Doto, Avenir Medium, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "0.08em"
  launcher-launch-label:
    fontFamily: "Doto, Avenir Medium, sans-serif"
    fontWeight: 800
    letterSpacing: "0.14em"
  launcher-label:
    fontFamily: "Avenir Medium, Avenir Book, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.06em"
  launcher-help:
    fontFamily: "Avenir Medium, Avenir Book, sans-serif"
    fontSize: "11px"
  launcher-chip:
    fontFamily: "Avenir Medium, Avenir Book, sans-serif"
    fontSize: "10px"
rounded:
  none: "0px"
  input: "12px"
  tile: "16px"
  zone: "20px"
  module: "22px"
  drawer: "26px"
  dock: "32px"
  pill: "999px"
  circle: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.pink-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.pink-hover}"
  button-secondary:
    backgroundColor: "rgb(255 255 255 / .07)"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-secondary-hover:
    backgroundColor: "rgb(255 255 255 / .13)"
  button-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bg}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.paper-2}"
    rounded: "{rounded.circle}"
    size: "38px"
  icon-button-pressed:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bg}"
  input:
    backgroundColor: "rgb(6 6 7 / .62)"
    textColor: "{colors.paper}"
    rounded: "{rounded.input}"
    padding: "10px 14px"
    height: "42px"
  switch:
    backgroundColor: "rgb(255 255 255 / .1)"
    rounded: "{rounded.pill}"
    width: "40px"
    height: "24px"
  switch-on:
    backgroundColor: "{colors.paper}"
  module:
    backgroundColor: "{colors.module}"
    textColor: "{colors.paper}"
    rounded: "{rounded.module}"
    padding: "20px 22px"
  tile:
    backgroundColor: "rgb(255 255 255 / .04)"
    textColor: "{colors.paper}"
    rounded: "{rounded.tile}"
    padding: "10px 12px"
  zone:
    backgroundColor: "{colors.module}"
    rounded: "{rounded.zone}"
    padding: "14px 10px 10px"
  pack-card:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    rounded: "{rounded.tile}"
    padding: "10px 12px"
  pack-card-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bg}"
  tabs-track:
    backgroundColor: "rgb(17 18 21 / .7)"
    rounded: "{rounded.pill}"
    padding: "4px"
    height: "42px"
  tabs-thumb:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.pill}"
  topbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper}"
    height: "60px"
  dock:
    backgroundColor: "{colors.dock}"
    textColor: "{colors.paper}"
    rounded: "{rounded.dock}"
    padding: "10px 20px"
    width: "960px"
  activity-drawer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.drawer}"
    padding: "20px 22px"
    width: "520px"
  pill:
    backgroundColor: "rgb(255 255 255 / .05)"
    textColor: "{colors.paper-2}"
    rounded: "{rounded.pill}"
    padding: "3px 10px 3px 8px"
  launcher-launch-button:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.launcher-ink}"
    typography: "{typography.launcher-launch-label}"
    rounded: "{rounded.none}"
    width: "360px"
  launcher-launch-button-working:
    backgroundColor: "{colors.launcher-surface}"
    textColor: "{colors.paper}"
  launcher-launch-button-running:
    backgroundColor: "{colors.launcher-surface}"
    textColor: "{colors.launcher-danger}"
  launcher-rail-entry:
    backgroundColor: "{colors.launcher-surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
  launcher-rail-entry-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.launcher-ink}"
  launcher-panel:
    backgroundColor: "{colors.launcher-surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
  launcher-toggle-on:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.launcher-ink}"
---

# Design System: Empi Proof Bench

Two finished surfaces share one world. **Empi Publisher** (the author's local page, `tools/publisher/public/`) is documented first and holds the shared tokens. **EmpiLauncher** (the Electron player app, `app/assets/`) is documented in the section "Launcher extension" at the end and only lists what differs. Frontmatter keys prefixed `launcher-` belong to the launcher; everything else is the Publisher, and the launcher reuses the neutral ones by value.

**Corner tradeoff, by design.** Since the modular UI update the two surfaces differ on corners. The Publisher is soft: modules, pills and circles. The launcher keeps square corners, the notched launch button and crop marks. Shared: palette, single accent, Doto, halftone dots, paper inversion for selection, stipple for disabled. A rule that says "square" or "notch" applies to the launcher only; a rule that says "pill" or "module" applies to the Publisher only. New Publisher work must not import launcher corners, and new launcher work must not import Publisher radii.

## Overview

**Creative North Star: "The Proof Bench"**

A darkroom bench where a modpack is framed, developed and printed. Ground is near-black, marks are paper-white, and tone is made of halftone dots rather than solid fills. Glitch (a 260 ms scan-line tear with a red/cyan channel split) is how the world speaks about change and failure, and one accent colour is reserved for the next thing the person should do. Text and controls stay crisp and legible; the dithering, ribbing and glitch belong to the ground and to events, never to the words you work in.

In the Publisher the bench is a set of dark translucent modules laid on the living dot ground: the dots read through the module edges and a corner of halftone continues inside each one. Everything you press is a pill or a circle; everything you read sits in a module. Data and chrome are set in Geist Mono, big numerals and the pack name in Doto, reading and input text in Segoe UI Variable. In the launcher the mood stays the original one: square corners, dotted rules, notched launch button. Both surfaces spend motion by doctrine, and the doctrines differ. **The Publisher is alive but budgeted**: a canvas of dots breathes behind the work at 24 fps focused, and every movement must say something. **The launcher is event-only**: nothing moves at rest, one short tear marks a real state change. Low RAM and CPU stay a product principle in both.

**Key Characteristics:**
- Black and paper-white plus exactly one accent. Publisher: pink. Launcher: the modpack's own accent, pink when a pack sets none. The accent means "next action" or "focus".
- Publisher: everything is a module (22px), pressables are pills or circles, hairline 1px borders separate; the ground shows through. Launcher: dotted rules, square corners, notched primary, crop marks.
- Doto dot-matrix for identity, the pack name and numerals; Geist Mono for Publisher data and chrome; a plain UI face for reading and inputs.
- Selection is inversion: a filled paper block (Publisher pack card, tab thumb, pressed icon button, chosen version); the launcher adds crop marks.
- Disabled and locked are ordered stipple, never a faded fill.
- Publisher motion is alive at rest but budgeted (below); launcher motion is a tear when something happens.

## Colors

A monochrome darkroom palette: warm-tinted near-blacks, three paper tones, one accent, and two legibility exceptions for status.

### Primary
- **Electric Pink** (#ff3d8b, `pink`): the one live colour. Publisher: the next pipeline action (Compilar and other primary pills), the input focus ring and tint, the next publishing-stage dot, the running-task LED, the single lit logo dot, the hover halo on the next action in the dot field, the selection highlight and caret, the drop-over border on mod zones. Launcher: the default accent, used only when a modpack sets none (see Launcher extension).
- **Pink Hover** (#ff6aa6, `pink-hover`): primary button hover (Publisher).
- **Pink Ink** (#16030c, `pink-ink`): text on pink (Publisher).

### Secondary
- **Split Red** (#ff2a4a, `split-red`) and **Split Cyan** (#33e6ff, `split-cyan`): the two RGB channels. Text-shadow offsets inside the tear and hover split flashes only. Never a fill, border or text colour at rest.

### Neutral
- **Well** (#060607): recessed wells; the launcher's ground. Publisher inputs use it at 62% alpha.
- **Bench Black** (#0b0b0d, `bg`): Publisher page ground; the ink on paper fills.
- **Surface** (#111114) and **Surface 2 / 3** (#18181c / #212127): topbar, dialogs, hover fills, icon tiles.
- **Module** (rgb(17 18 21 / .76), `module`): the translucent module and zone fill, so the dot field shows faintly through. **Dock** (rgb(14 15 17 / .95), `dock`) is the more opaque fill of the floating pipeline dock; the activity drawer is `rgb(13 14 16 / .985)`.
- **Hairline / Hairline Strong** (rgb(241 239 232 / .1) and / .22, `hair`, `hair-strong`): the Publisher's 1px borders on modules, tiles, pills, inputs, switches; strong on hover and on switch and dialog edges. Line / Line Strong (#24242a / #3b3b44) remain for the launcher-era controls and the disabled button border.
- **Dot Grey** (#55555f, `dot`): dotted rules and borders where they survive (the launcher, the drawer's inner rules).
- **Paper** (#f1efe8): primary text, done markers, inverted selection, paper buttons, the sliding tab thumb, the on-state of switches, the pressed icon button. **Paper 2** (#a5a598): secondary text. **Paper 3** (#8b8b81): placeholders, tertiary metadata, disabled text.
- **Paper Ink** (#47473f, `paper-ink`): the secondary text colour used only on a paper block (the sub-line of the selected launcher rail entry; on the Publisher active pack card the sub-line inherits the block's ink). It is a darker tone of the paper family chosen for contrast on #f1efe8 (about 8:1), not a general text colour.
- **Mask Black** (#000000, `mask-black`): appears only inside `mask-image` gradients that feather halftone plates and the module corner (`#000` means "fully visible" in a mask, alpha only). It is never painted and must not be used as a fill or text colour.

### Status (legibility exceptions)
- **Danger Coral** (#ff6a4d, `danger`) and **Warn Amber** (#ffb14a, `warn`): persistent status colours in the Publisher (Libre badges, unsaved hint, error banners and toasts, failed step, offline bar, the Cancelar outline, a bad health pill's border). The launcher's equivalents are its own status greens and reds and `launcher-danger` (#ff5a67). They sit outside the palette on purpose: status must be readable at a glance and never confused with the accent.

### Named Rules
**The One Accent Rule.** The accent marks the next action and focus, nothing else. A second accent element competing on screen means one of them is wrong.
**The Flash-Only Channels Rule.** Red and cyan appear only as short split flashes (260 ms tear, 200 ms Publisher hover split, 260 ms launcher hover split). They are never persistent.
**The Status Exception Rule.** Status colours are the only persistent colours outside black, white and the accent, and only for status. Do not extend them to decoration or emphasis.
**The Paper Ink Rule.** Text on a paper block is #050506 or #0b0b0d for the main line and #47473f for the sub-line where a sub-line is set; never paper-2 or paper-3, which fail on paper.

## Typography

**Display Font:** Doto (with Cascadia Mono, Consolas, monospace in the Publisher; with Avenir Medium in the launcher), self-hosted variable woff2 (weights 100 to 900, `font-display: swap`), shipped separately in each surface.
**Body Font:** Publisher: Segoe UI Variable Text (with Segoe UI, system-ui, sans-serif) for reading text (prose, zone descriptions, notes) and for text typed into inputs. Launcher: Avenir Medium and Avenir Book, bundled as TTF in `app/assets/fonts/` and kept on purpose.
**Label/Mono Font:** Publisher: Geist Mono (with Cascadia Mono, Consolas, monospace), self-hosted variable woff2 (weights 400 to 700, `font-display: swap`, `fonts/GeistMono.woff2`, licence in `GeistMono-LICENSE.txt`). It sets numbers, hints, tabs, chips, buttons, labels, h2 and h3, key-value rows, code, logs and paths.

**Character:** Three voices in the Publisher: dot-matrix for what the tool and the modpack call themselves and for big numerals; mono for data and chrome, like a print spec sheet; a plain UI face for prose and for what you type. The launcher keeps the two-voice pairing of Doto over Avenir.

### Hierarchy
- **Display** (Doto 700, 30px, 1.1; 24px at 520px and below): selected pack title and empty-state heading (Publisher).
- **Tile Numeral** (Doto 700, 21px; 19px at 520px): the value in each data tile.
- **Drawer Title** (Doto 700, 24px, 1.1): activity drawer title; version numerals in the launcher version choices.
- **Wordmark** (Doto 800, 17px, 0.02em, uppercase): "Empi Publisher" in the topbar; hidden below 520px.
- **Headline** (Geist Mono 500, 15px, -0.01em): module headings (h2).
- **Title** (Geist Mono 500, 14px): h3, module summaries, dock step titles.
- **Button** (Geist Mono 500, 13px; small 12px, big 14px; paper 600, primary 700): all Publisher buttons and tabs.
- **Body** (Segoe 400, 14px, 1.5): prose and input text; prose capped at 62ch. Checkbox-switch labels are Segoe 14px.
- **Label** (Geist Mono 500, 12px, `paper-2`): form labels.
- **Caption** (Geist Mono 400, 11.5px): hints, facts, sub-lines, counts, chip text, tile keys and sub-lines.
- **Launcher sizes** (Doto 700, 0.04em unless noted): 32px settings tab headers; 30px welcome header, login options heading and settings nav header; 22px login subheader; 20px rail title (0.08em, uppercase). The launch label is Doto 800 at 0.14em. These are the only launcher sizes at which Doto appears.
- **Launcher Avenir** (700 for labels, 400 to 500 elsewhere): 13px labels (launch progress label, player name, updater title), 12px frame title (0.2em, uppercase), 11px help text and progress stats, 10px chips and small labels.

### Named Rules
**The Dots Are Headlines Rule.** Doto is for wordmark, pack name and headings, tile numerals, the drawer title, version numerals and the launch label. It is never body text, labels, buttons (other than the launch label), or inputs, and in the launcher never below 20px. In the Publisher its smallest use is the 19px tile numeral.
**The Three Voices Rule (Publisher).** Doto names and counts, Geist Mono reports and labels, Segoe reads and receives typing. Do not set prose in mono or data in Segoe.
**The Small-Type Floor Rule.** Launcher text is never below 10px (chips and labels) or 11px (help text and progress). Do not shrink further to fit.
**The Tabular Numerals Rule.** Counts, sizes, versions and progress use `tabular-nums`.

## Layout

**Publisher.** A two-column workbench: a 308px sticky pack sidebar (top 84px, 16px gap between its modules) and a fluid content column (layout max 1360px, 24px padding, 20px column gap). Single-column surfaces (launcher tab, settings) are centred at max 1080px. The topbar is 60px tall. Content is stacked modules (20px 22px padding, 16px between). Settings and the launcher tab are bento grids: two equal columns with 16px gaps, `span2` items across both, items top-aligned. The new-pack form is a two-column grid (18px/24px gaps, max 900px) whose heading, command preview and actions span both. Mod zones keep three equal columns. The modpack hero is one module with the pack head, then four data tiles in a row (8px gap). A floating dock (below) replaces the old footer and reserves `--pipeline-h: 112px` of bottom space (`main` pads `--pipeline-h + 16px`); the toast sits above it. The dot-field canvas is a fixed layer behind everything. Breakpoints: at 900px the sidebar becomes static above the content, bento and launcher grids and the form collapse to one column, tiles go two across, the dock narrows to `100vw - 16px` at bottom 8px with 26px radius, the drawer inset shrinks to 6px on all sides, the publishing status module is hidden (the dock already shows it), the pack head wraps with its button full width, and the topbar is 56px. At 520px the wordmark text is hidden, tab padding shrinks to 12px, version choices go one column, dock buttons keep to one line with icons hidden, tile numerals drop to 19px, and h1 to 24px.

**Static plates (no-JS fallback).** `art/field.png` plates on `body::before` and `body::after` are what a Publisher without JavaScript sees. When `life.js` sets `data-motion` on the root the plates are hidden. Both also hide at 900px and below.

## Elevation & Depth

Publisher depth is layered translucency. Modules are translucent (`module`), lit by an inset top highlight (`inset 0 1px 0 rgb(255 255 255 / .05)`) and grounded by a tinted drop shadow (`0 24px 40px -28px rgb(0 0 0 / .85)`); the dot field reads through their edges and a static corner of halftone dots continues inside. The dock is the highest layer (`0 30px 60px -20px rgb(0 0 0 / .9)` plus an inset top highlight at .06). The activity drawer is a floating panel (12px inset, radius 26px) that keeps its left cast (`-16px 0 40px rgb(0 0 0 / .55)`). Dialogs separate by a `hair-strong` border. Selection is inversion, not lift. The launcher has no shadows at all (see its extension). There is no backdrop blur anywhere.

### Module recipe
- Fill `rgb(17 18 21 / .76)`, `isolation: isolate`, 1px `hair` border (hover `hair-strong`), radius 22px.
- Shadow: `inset 0 1px 0 rgb(255 255 255 / .05), 0 24px 40px -28px rgb(0 0 0 / .85)`.
- Halftone corner: `::before`, top right, 46% wide by 64% tall, `radial-gradient(circle, rgb(241 239 232 / .22) 1px, transparent 1.5px)` on a 9px grid, feathered with `radial-gradient(120% 120% at 100% 0, #000 0, transparent 68%)` as mask, behind content (`z-index: -1`). Static, no animation.

### Named Rules
**The Tinted Shadow Rule (Publisher).** Shadows are long, soft, black-tinted and low (modules, dock, drawer). No hard offset shadows, no coloured glows, no blurred card halos. The pink glow around the next action lives in the dot field, not in a box-shadow.
**The Flat Ground Rule (Launcher).** No shadows, glows or blur. Panels are solid.
**The Ribbed Glass Exception.** The Publisher topbar's `repeating-linear-gradient` of fine vertical paper lines (7% alpha, 1px lines on a 5px pitch, faded in from the left by a mask) is a deliberate part of the world. Do not remove it, and do not spread it beyond the topbar.
**The Budgeted Life Rule.** The Publisher may move at rest only within its budget (see Motion). Backdrop blur, WebGL, video and animated CSS filters stay out.

## Motion (Publisher: alive and budgeted)

Replaces the earlier "still at rest" rule for the Publisher only. Motion tokens are unchanged by the modular update except where noted.

- **Ground.** One `canvas#life` of halftone dots: slow interference waves, two corner plates that swell, a scan band that crosses now and then, the pointer and clicks pushing dots outward (click ripples), the hovered control lighting the dots around it (hover halo), the next action glowing pink, a running job speeding the field up, a finished job sending a ring through it (`Life.burst`). Dots stay faint under text blocks. Modules and sections are hover targets (`.module`, `.section` join the hot list), so the field lights up around a hovered module.
- **Budget.** 24 fps focused (41 ms gap), 10 fps unfocused (100 ms gap), paused entirely when the tab is hidden, one canvas pixel per CSS pixel. Measured frame cost above 9 ms (smoothed) for 90 frames, or frames arriving more than 2.2 times later than asked for 45 frames, thins the field (pitch +6px up to 36px) and then stops it and reports calm. Measured earlier in headless Edge with software raster: about 7 to 10% of one core alive, about 0% calm; not re-measured after the modular update.
- **Only transform and opacity animate** in springs, hover physics, pops and beats; the short arrival (`rise-in`) and the tear also use `clip-path`, briefly and only on the element that just arrived. No infinite CSS animation except the skeleton pulse and the running-job LED, plus one ambient exception: the empty-state flower turns (a compositor transform, only while no modpack exists). Others are finite or replayed on a timer.
- **Springs.** `--ease-out: cubic-bezier(.16, 1, .3, 1)` for movement; `--ease: cubic-bezier(.2, .9, .2, 1)` for colour; `--spring: cubic-bezier(.34, 1.56, .64, 1)` (overshoot) for everything you press: button transform .45s, icon button .5s, switch knob .45s, details chevron .4s. The tab thumb uses a gentler overshoot, `cubic-bezier(.34, 1.25, .64, 1)` over .55s.
- **Meaning.** Every movement says something: where you are (the paper thumb sliding between tabs and sub-tabs, staggered arrivals, pack title decoding from noise), what changed (pipeline step pops, new drawer step slides in, the ring on completion, a switch knob travelling, a stage dot filling), what to do next (the next step beats, the primary leans toward the pointer and catches a light sweep, the field glows pink around it).
- **Thumb placement.** `Life.ink` places the thumb from measured tab boxes (inset 0 for the thumb, so it covers the tab exactly) and `Life.reink` re-places it when fonts finish loading and when the window resizes.
- **Switch.** A visible circular icon button (`#lifeBtn`, wave icon, `aria-pressed`) toggles `data-motion="alive|calm"` on the root and persists in `localStorage` key `empi.motion`. `prefers-reduced-motion: reduce` starts calm when nothing is stored, and the CSS clamps all animation and transition durations.
- **Calm** removes canvas, entrances, beats and drifting, leaving the event-only tear.

### Named Rules
**The Says-Something Rule.** A Publisher movement that does not tell you where you are, what changed or what to do next is removed.
**The Calm Fallback Rule.** Every alive movement has a calm equivalent: the same information with no motion, reached by the switch, reduced-motion, or automatic degradation.

## Shapes

**Publisher: soft and modular.** Radius scale: modules 22px, tiles and pack cards and choices 16px, mod zones and the permission tree 20px, inputs 12px (textarea 16px), dialog 24px, drawer 26px, dock 32px (26px on narrow screens), banners 14px, mod rows 12px, pack icons 12px (64px hero icon 18px). Everything you press is a pill (999px: buttons, tabs, sub-tabs, segmented controls, chips, health pills, entries, toasts, search input, switches) or a circle (50%: icon buttons, step numerals, the accent sample, stage dots, switch knobs). Silhouette comes from the module edge (1px hairline), the halftone corner and inversion to paper. Icons are 16px, square-capped, miter-joined 1.5px outline strokes.

**Launcher: square and notched.** Square corners throughout (border-radius 0; the launcher forces it with `!important` inside `#main`; only its round spinners stay round). 1px dotted borders on containers. The launch button has a clip-path polygon that cuts an 18px notch off the top-right corner, removed on `:focus-visible` so the focus ring stays whole. The selected rail entry and the selected version choice invert to paper with four L-shaped crop marks (7px arms).

**Superseded in the Publisher:** square corners, the 9px notch on the primary, dotted rules as the main separator, crop marks on the active pack card, the fixed footer bar, the sliding pink dot underline on tabs.

## Components

### Buttons (Publisher)
- **Shape:** pill (999px), 1px `hair` border, padding 11px 18px (small 8px 14px, big 15px 26px), Geist Mono 500 13px.
- **Default:** `rgb(255 255 255 / .07)` fill, paper text. Hover lifts to .13 and `hair-strong`; press scales .97 on the spring.
- **Primary:** pink fill, pink-ink text, 700. One per screen: the next action. Hover lightens, lifts 1px, a 100-degree light sweep crosses it (.8s) and the button leans up to 6x4px toward the pointer (the magnet).
- **Paper:** paper fill, bench-black text, 600 (Nuevo, Guardar, Crear). Hover goes to white.
- **Danger:** transparent fill, coral text and outline (Cancelar). Hover adds a coral tint.
- **Disabled:** ordered-stipple dither (`repeating-conic-gradient`, 3px cells, 14% paper), `paper-3` text, not-allowed cursor, no hover motion.
- **Focus:** 2px pink outline, 2px offset.

### Icon buttons
38px circle, transparent, 1px `hair` border, `paper-2` glyph. Hover: faint fill and paper glyph. Pressed (`aria-pressed=true` or `.on`): fills paper, glyph bench-black, scales 1.12 on the spring over .5s. The motion switch is the reference use (dim glyph when off).

### Inputs / Fields
- **Style:** 12px radius, `rgb(6 6 7 / .62)` fill, 1px `hair` border, 10px 14px padding, min-height 42px; input text is Segoe. Search is a pill with an inset magnifier icon. Select has a right chevron at 14px inset.
- **Focus:** border goes to `accent-line` (pink at .55) plus a 3px pink tint ring (`0 0 0 3px rgb(255 61 139 / .12)`); caret is pink.
- **Switch (checkbox):** native checkbox restyled as a 40 by 24 pill, `rgb(255 255 255 / .1)` track, `hair-strong` border, 16px knob (`paper-2`). On: paper track, bench-black knob that travels 16px on the spring. Rows are label left, switch right, hairline top rule between rows. Focus: 2px pink outline.
- **Segmented control (`.segmented`, `.pctl`):** pill track, pill segments in Geist Mono; the active segment inverts to paper and pops once.

### Segmented tabs
Top tabs (42px) and sub-tabs share one shape: a pill track (`rgb(17 18 21 / .7)`, 1px hair, 4px padding), pill tabs at 13px Geist Mono, and one paper thumb (`.ink`, inset 4px top and bottom) that slides and resizes behind the current tab over .55s `cubic-bezier(.34, 1.25, .64, 1)`. The current tab's text turns bench-black. Sub-tabs scroll horizontally in their track on narrow widths.

### Modules and tiles
Module: the recipe in Elevation & Depth; head row (`module-head`, h2 flex-1, actions to the right, min-height 30px), `details.module` uses a summary with a spring-rotating chevron. Tile: 16px radius, `rgb(255 255 255 / .04)` fill, 1px hair, 10px 12px padding, a mono key (11.5px, `paper-3`), a Doto numeral (21px) and a mono sub-line. Four tiles sit in the modpack hero; the mods tile carries the hatched share bar.

### Hatched share bar
8px-tall row of pill segments with 2px gaps (`.mix`): required mods solid paper, optional-on mods paper at 50%, optional-off mods hatched (`--hatch`: 135-degree paper lines, 2px on a 5px pitch, at 55%) with a 1px paper inset outline. It carries an `aria-label` with the three counts. Hatching means "present but off", the same family as stipple.

### Pack Card (sidebar)
16px radius row with a 12px-radius icon tile, bold name and mono 11.5px sub-line. Hover: Surface 2 and a 4px lean right. Active: filled paper with bench-black text (no crop marks). On selection the pack title decodes out of noise.

### Navigation and status
- **Topbar:** 60px, translucent Surface with the ribbed-glass overlay and no dotted bottom rule; wordmark beside the dot-matrix E logo (one row slipped sideways, one pink dot); the top tabs are the segmented control above. Health pills are pill chips (`rgb(255 255 255 / .05)`, hair border, mono); `bad` turns the border coral; pills hide at 900px.
- **Status module (sidebar):** a module titled "Publicación" with three 10px stage dots in its head (`on` = filled paper, `next` = pink border with pink tint, rest = hair-strong outline) and key-value rows (`.kv`, mono 12.5px, hairline top rules, right-aligned tabular values). Hidden at 900px.

### Pipeline dock (signature)
A floating pill-cornered dock: `width: min(960px, 100vw - 32px)`, centred, `bottom: 16px`, radius 32px, 1px hair border, `rgb(14 15 17 / .95)` fill, min-height 76px, padding 10px 20px, the dock shadow. Step numerals are circles; done is paper with a check, the current step beats twice every 10 s, a changed step pops. The step title is mono 600 14px, its hint mono 11.5px; message bubbles and toasts are pills.

### Activity Drawer (signature)
A floating 520px panel inset 12px from top, right and bottom (6px all round at 900px), radius 26px, hair border, `rgb(13 14 16 / .985)` fill, left cast shadow. The head is rounded 26px at the top and carries the cloud plate behind a gradient; the title is Doto 24px. Steps: done in paper with a check, current bold with the pink 10px square LED (1s `steps(1)` blink), failed in coral. The `resolve` strip is a 14px row of dots on a 12px pitch whose radius grows with progress (`--p`, radius = `--p` x 3.6px). Error banners (14px radius) have a coral border over the `tear.png` texture and tear once.

### Zones, Permission Tree, Empty State
Mod zones: 20px radius, `module` fill, 1px hair, min-height 320px; drop-over turns the border pink with a 12% pink tint. Mod rows are 12px radius; the row's actions are a 10px-radius chip that appears on hover (always shown on hover-less devices). The permission tree is a 20px-radius module with hairline row rules; entries and badges are pills (Libre badges amber). Empty state: a module with a heading and a big primary pill "Crear modpack" (20px above it) beside the dithered flower plate, which turns slowly while alive.

## Launcher extension (EmpiLauncher)

Same world, adapted to a player app. Shared tokens are not repeated; only differences are listed. It is a layer (`app/assets/css/empi-identity.css`, loaded after `launcher.css`, appearance only, `!important` throughout to win over the older layer) plus `empi-identity.js` (event tears).

**The modpack's colour.** The one accent is per version: `landing.js` sets `--empi-accent`, `--empi-accent-rgb` and `--empi-accent-contrast` on the root from the pack's accent, default `#ff3d8b` when none. The label ink is chosen by WCAG contrast ratio: `#050506` or `#ffffff`, whichever reads better on the accent. Each pack's background and banner stay untouched material; two black halftone screens (`images/identity/screen-bottom.png`, `screen-right.png`) darken their bottom and right edges where the interface must be read. The banner breath is removed.

**Surfaces.** Solid near-black panels (`launcher-surface` #0c0c0f, `launcher-surface-2` #151519) with 1px dotted `rgb(241 239 232 / .4)` borders and dotted `.2` row dividers, zero radius, no blur, no shadow, no glow. Two static halftone plates (`images/identity/field.png`) sit on views without their own artwork.

**Type.** Doto only at 20px and larger plus the launch label; Avenir Medium and Book for everything else, with the small-type floor above. Text on a panel is `#f1efe8`, secondary `#bdbab1`, tertiary `#8d8a82`.

**Rail entry (version list).** Transparent row with a dotted bottom divider. Hover: Surface 2. Selected: inverted to paper with ink text, a `paper-ink` description (clamped to two lines) and crop marks inset 3px. Chips are dotted; the Principal chip is paper (ink when selected).

**Launch button.** 360px wide, accent fill, contrast ink, Doto 800 label at 0.14em, notched 18px top-right. It is also the progress meter. States: `play` and `update` (accent, hover splits the label once, no lift); `updating` and `launching` (dark plate, dotted accent outline, rising accent dots as fill, label on a solid ink plate, ACTUALIZANDO); `running` and `stopping` (dark plate, 2px red outline, red text, "DETENER"; red is a status exception and never the accent); `disabled` (ordered stipple). The native progress element is hidden by the launcher's V12 layer.

**Settings.** Left nav on Well with a dotted right rule; the selected item is paper. Rows sit on dotted dividers. Toggles: Surface 2 track with a dotted border and a paper knob; on = accent track and ink knob; required-mod (locked) toggles and disabled toggles = ordered stipple, never a tinted accent. Range sliders are a dotted ruler with a paper track.

**Launcher motion (event-only).** Nothing moves at rest. A 260 ms tear (`empiTear`, `steps(1, end)`) fires only when a view opens (title of welcome, login, login options, waiting, landing rail, settings), the launch button changes state, the launcher-update indicator changes state, or the update-ready notice appears. `empiSplit` (260 ms) runs on hover of the welcome and login buttons, login options and the launch label. Tears are skipped when the window is inactive (`html[data-empi-inactive]`) and there is no polling, only MutationObservers. Under `html[data-empi-performance-mode]` the plates are hidden and tears are off. `prefers-reduced-motion` disables tears and splits. The loading screen is deliberately unchanged, and there is no overlay markup.

**Persistent status.** Server and Mojang status greens and reds and the red DETENER stay as legibility exceptions.

## Do's and Don'ts

### Do:
- **Do** spend the accent only on the next action, focus, the next stage dot, the running LED and the logo dot (Publisher); on the launch button, focus ring and switched-on toggles (launcher).
- **Do** invert to filled paper (`#f1efe8` on `#0b0b0d`) for selection and pressed state: pack card, tab thumb, pressed icon button, chosen version, on-state switch.
- **Do** build Publisher surfaces as modules (22px, translucent, 1px hairline, halftone corner) and make everything pressable a pill (999px) or a circle (50%); inputs 12px, tiles 16px, zones 20px.
- **Do** set Publisher numbers, hints, tabs, chips, buttons and labels in Geist Mono, names and numerals in Doto, prose and typed text in Segoe.
- **Do** show a share as a hatched bar and a "present but off" state as hatching.
- **Do** make every Publisher movement say where you are, what changed or what to do next, animate transform and opacity (clip-path only for the short arrival and tear), and stay inside the budget (24 fps focused, 10 unfocused, paused hidden, one canvas pixel per CSS pixel).
- **Do** keep the visible motion switch, the `empi.motion` persistence and the reduced-motion calm start.
- **Do** fire the tear only on events, and use the split text-shadow only for hover.
- **Do** keep the launcher square: dotted rules, notched launch button, crop marks on the selected rail entry, per-pack accent, label ink by contrast, banner and background untouched behind the black halftone screens.
- **Do** keep persistent status colours for status only.

### Don't:
- **Don't** add a second accent, gradient fills on controls or coloured glows.
- **Don't** show red or cyan at rest; they exist only inside tear and split flashes.
- **Don't** set Doto on body text, labels, buttons (except the launch label) or inputs, or below 20px in the launcher.
- **Don't** carry Publisher radii, pills or module shadows into the launcher, and don't carry square corners, the notch or crop marks into new Publisher surfaces (the two differ on purpose).
- **Don't** add hard offset shadows or coloured glows anywhere; Publisher shadows stay long, soft and black-tinted.
- **Don't** add backdrop blur, WebGL, video, animated filters or new infinite CSS animations to the Publisher, and no motion at rest in the launcher.
- **Don't** use the accent for DETENER or other stopping actions; the way out is red and outlined.
- **Don't** tint locked or disabled controls with the accent; use the stipple.
- **Don't** remove the topbar's ribbed-glass gradient as a defect, or reuse it elsewhere.
- **Don't** let a halftone plate, the module corner or the dot field sit at full strength behind list text or end in a hard edge.
- **Don't** use status colours for decoration or emphasis.

## Assets

Publisher: four procedural halftone rasters in `tools/publisher/public/art/` (`cloud.png`, `flower.png`, `tear.png`, `field.png`), generated by `tools/publisher/scripts/make-art.js`; `field.png` is now only the no-JS fallback ground. Launcher: `app/assets/images/identity/{field,screen-bottom,screen-right}.png` (screens generated by the same script). Provenance is embedded in PNG tEXt chunks. Doto (`fonts/Doto.woff2`, licence in `Doto-LICENSE.txt`) is an added web font in each surface; the Publisher also self-hosts Geist Mono (`fonts/GeistMono.woff2`, licence in `GeistMono-LICENSE.txt`); the launcher also bundles Avenir TTFs.
