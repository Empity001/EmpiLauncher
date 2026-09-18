---
name: Empi Proof Bench (Publisher and Launcher)
description: One darkroom world for two surfaces, halftone black and paper-white with a single accent (electric pink, or the modpack's own colour in the launcher) marking the next action; alive and budgeted in the Publisher, event-only in the launcher.
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
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
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
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "Cascadia Mono, Consolas, monospace"
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
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.pink-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-3}"
  button-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bg}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.well}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
    height: "36px"
  pack-card:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
  pack-card-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bg}"
  topbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper}"
    height: "52px"
  pipeline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper}"
    height: "84px"
  activity-drawer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.paper}"
    padding: "20px 22px"
    width: "520px"
  pill:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.paper-2}"
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

## Overview

**Creative North Star: "The Proof Bench"**

A darkroom bench where a modpack is framed, developed and printed. Ground is near-black, marks are paper-white, and tone is made of halftone dots rather than gradients or shadows. Glitch (a 260 ms scan-line tear with a red/cyan channel split) is how the world speaks about change and failure, and one accent colour is reserved for the next thing the person should do. Text and controls stay crisp and legible; the dithering, ribbing and glitch belong to the ground and to events, never to the words you work in.

The mood is precise, printed and slightly uncanny: dot-matrix headlines over a plain UI face, square corners, dotted rules where other systems draw solid lines, and halftone dots as the only imagery the system itself supplies. Both surfaces spend motion by doctrine, and the doctrines differ. **The Publisher is alive but budgeted**: a canvas of dots breathes behind the work at 24 fps focused, and every movement must say something (where you are, what changed, what to do next). **The launcher is event-only**: nothing moves at rest, one short tear marks a real state change. Low RAM and CPU stay a product principle in both.

**Key Characteristics:**
- Black and paper-white plus exactly one accent. Publisher: pink. Launcher: the modpack's own accent, pink when a pack sets none. The accent means "next action" or "focus".
- Dotted rules divide sections, tabs, bars and panels instead of solid hairlines.
- Square corners everywhere; the primary action is notched at one corner, not rounded.
- Doto dot-matrix for identity and large headings; a plain UI face for everything read or edited.
- Selection is inversion: a paper block, with crop marks on the selected pack or version.
- Disabled and locked are ordered stipple, never a faded fill.
- Publisher motion is alive at rest but budgeted (below); launcher motion is a tear when something happens.

## Colors

A monochrome darkroom palette: warm-tinted near-blacks, three paper tones, one accent, and two legibility exceptions for status.

### Primary
- **Electric Pink** (#ff3d8b, `pink`): the one live colour. Publisher: the next pipeline action (Compilar), the focus ring, the sliding tab underline, the dashed current-step marker, the running-task LED, the single lit logo dot, the hover halo on the next action in the dot field, the selection highlight and caret. Launcher: the default accent, used only when a modpack sets none (see Launcher extension).
- **Pink Hover** (#ff6aa6, `pink-hover`): primary button hover (Publisher).
- **Pink Ink** (#16030c, `pink-ink`): text on pink (Publisher).

### Secondary
- **Split Red** (#ff2a4a, `split-red`) and **Split Cyan** (#33e6ff, `split-cyan`): the two RGB channels. Text-shadow offsets inside the tear and hover split flashes only. Never a fill, border or text colour at rest.

### Neutral
- **Well** (#060607): recessed wells; inputs, log, segmented tracks; the launcher's ground.
- **Bench Black** (#0b0b0d, `bg`): Publisher page ground.
- **Surface** (#111114) and **Surface 2 / 3** (#18181c / #212127): topbar and footer (translucent, see Elevation), drawer, dialogs, hover fills, secondary buttons, icon tiles.
- **Line / Line Strong** (#24242a / #3b3b44): solid 1px borders on Publisher controls.
- **Dot Grey** (#55555f, `dot`): every dotted rule and dotted border in the Publisher.
- **Paper** (#f1efe8): primary text, done markers, inverted selection, paper buttons. **Paper 2** (#a5a598): secondary text. **Paper 3** (#8b8b81): placeholders, tertiary metadata, disabled text.
- **Paper Ink** (#47473f, `paper-ink`): the secondary text colour used only on a paper block (the sub-line of the active pack card, the selected version choice, the selected launcher rail entry). It is a darker tone of the paper family chosen for contrast on #f1efe8 (about 8:1), not a general text colour.
- **Mask Black** (#000000, `mask-black`): appears only inside `mask-image` gradients that feather the halftone plates (`#000` means "fully visible" in a mask, alpha only). It is never painted, is not part of the visible palette, and must not be used as a fill or text colour.

### Status (legibility exceptions)
- **Danger Coral** (#ff6a4d, `danger`) and **Warn Amber** (#ffb14a, `warn`): persistent status colours in the Publisher (Libre badges, unsaved hint, error banners and toasts, failed step, offline bar, the Cancelar outline). The launcher's equivalents are its own status greens and reds (running DETENER, server and Mojang status) and `launcher-danger` (#ff5a67). They sit outside the palette on purpose: status must be readable at a glance and never confused with the accent.

### Named Rules
**The One Accent Rule.** The accent marks the next action and focus, nothing else. A second accent element competing on screen means one of them is wrong.
**The Flash-Only Channels Rule.** Red and cyan appear only as short split flashes (260 ms tear, 200 ms Publisher hover split, 260 ms launcher hover split). They are never persistent.
**The Status Exception Rule.** Status colours are the only persistent colours outside black, white and the accent, and only for status. Do not extend them to decoration or emphasis.
**The Paper Ink Rule.** Text on a paper block is #050506 or #0b0b0d for the main line and #47473f for the sub-line; never paper-2 or paper-3, which fail on paper.

## Typography

**Display Font:** Doto (with Cascadia Mono, Consolas, monospace in the Publisher; with Avenir Medium in the launcher), self-hosted variable woff2 (weights 100 to 900, `font-display: swap`), shipped separately in each surface.
**Body Font:** Publisher: Segoe UI Variable Text (with Segoe UI, system-ui, sans-serif). Launcher: Avenir Medium and Avenir Book, the launcher's existing body face, bundled as TTF in `app/assets/fonts/` and kept on purpose.
**Label/Mono Font:** Cascadia Mono (with Consolas, monospace) for Publisher code, logs and paths.

**Character:** A dot-matrix face for what the tool calls itself and its big headings, over the plain UI face of each surface for everything you read or edit. The contrast is printout versus paper.

### Hierarchy
- **Display** (Doto 700, 32px, 1.1; 26px at 900px and below): selected pack title (Publisher).
- **Drawer Title** (Doto 700, 24px, 1.1): activity drawer title; version numerals in the launcher version choices.
- **Wordmark** (Doto 800, 17px, 0.02em, uppercase): "Empi Publisher" in the topbar; hidden below 520px.
- **Headline** (Segoe 600, 16px): section headings (h2).
- **Title** (Segoe 600 to 700, 14px): h3, pack names, step titles.
- **Body** (Segoe 400, 14px, 1.5): everything else; prose capped at 62ch.
- **Label** (Segoe 400, 13px, `paper-2`): form labels, hints, facts.
- **Caption** (Segoe 400, 12px): sub-lines, counts, badges.
- **Launcher sizes** (Doto 700, 0.04em unless noted): 32px settings tab headers; 30px welcome header, login options heading and settings nav header; 22px login subheader; 20px rail title (0.08em, uppercase). The launch label is Doto 800 at 0.14em. These are the only launcher sizes at which Doto appears.
- **Launcher Avenir** (700 for labels, 400 to 500 elsewhere): 13px labels (launch progress label, player name, updater title), 12px frame title (0.2em, uppercase), 11px help text and progress stats, 10px chips and small labels.

### Named Rules
**The Dots Are Headlines Rule.** Doto is for wordmark, headlines, the drawer title, version numerals and the launch label. It is never body text, labels, buttons (other than the launch label), or inputs, and in the launcher never below 20px.
**The Small-Type Floor Rule.** Launcher text is never below 10px (chips and labels) or 11px (help text and progress). Do not shrink further to fit.
**The Tabular Numerals Rule.** Counts, sizes, versions and progress use `tabular-nums`.

## Layout

**Publisher.** A two-column workbench: a 290px sticky pack sidebar and a fluid content column (container max 1240px, 40px gutter, 28px/24px padding). Single-column surfaces (launcher tab, settings) are centred at 760px. Forms use a two-column grid (20px/24px gaps, max 820px); the mod zones use three equal columns with 16px gaps. Vertical rhythm steps through 6, 8, 12, 16, 24, with 28px above form actions. A fixed pipeline footer (min-height 84px, exposed as `--pipeline-h`) reserves bottom padding on `main`; the toast sits above it. The dot-field canvas is a fixed layer behind everything (`z-index: -1`, one canvas pixel per CSS pixel). One breakpoint at 900px: the sidebar becomes a horizontal pack strip, grids collapse to one column, health pills are hidden, the pipeline drops its numbered markers and connectors and its button goes full width, the permissions rows stack. At 520px the wordmark text is hidden.

**Static plates (no-JS fallback).** `art/field.png` plates on `body::before` and `body::after` (bottom-left 340px wide, capped at `min(496px, 100vh - pipeline - 380px)`; top-right 320 by 118px rotated 180deg) are now only what a Publisher without JavaScript sees. When `life.js` sets `data-motion` on the root the plates are hidden. Both also hide at 900px and below.

## Elevation & Depth

Flat by default. Depth comes from tone steps, dotted rules and the dot field behind content, not from shadows. The Publisher's topbar (`rgb(17 17 20 / .86)`) and footer (`rgb(17 17 20 / .9)`) are translucent, so the living ground shows faintly through; there is no blur behind them. The single shadow is the activity drawer's left cast (`box-shadow: -16px 0 40px rgb(0 0 0 / .55)`). Dialogs separate by a 1px `paper-3` border and an 80% black backdrop. Selection is inversion, not lift. The launcher has no shadows at all (see its extension).

### Named Rules
**The Flat Ground Rule.** No hard offset shadows, glows or blurred card shadows. The drawer cast is the only shadow. The pink glow around the next action lives in the dot field (dots swell and turn pink), not in a box-shadow.
**The Ribbed Glass Exception.** The Publisher topbar's `repeating-linear-gradient` of fine vertical paper lines (7% alpha, 1px lines on a 5px pitch, faded in from the left by a mask) is a deliberate part of the world (ribbed glass from the moodboard). It is an intentional advisory exception: do not remove it, and do not spread it beyond the topbar.
**The Budgeted Life Rule.** The Publisher may move at rest only within its budget (see Motion). Backdrop blur, WebGL, video and animated CSS filters stay out.

## Motion (Publisher: alive and budgeted)

Replaces the earlier "still at rest" rule for the Publisher only.

- **Ground.** One `canvas#life` of halftone dots: slow interference waves, two corner plates that swell, a scan band that crosses now and then, the pointer and clicks pushing dots outward (click ripples), the hovered control lighting the dots around it (hover halo), the next action glowing pink, a running job speeding the field up, a finished job sending a ring through it (`Life.burst`). Dots stay faint under text blocks.
- **Budget.** 24 fps focused (41 ms gap), 10 fps unfocused (100 ms gap), paused entirely when the tab is hidden, one canvas pixel per CSS pixel. Measured frame cost above 9 ms (smoothed) for 90 frames, or frames arriving more than 2.2 times later than asked for 45 frames, thins the field (pitch +6px up to 36px) and then stops it and reports calm. Measured in headless Edge with software raster: about 7 to 10% of one core alive, about 0% calm; canvas frame cost about 1 ms.
- **Only transform and opacity animate** in the movements added by this pass (springs, hover physics, pops, beats); the short arrival (`rise-in`) and the tear also use `clip-path`, briefly and only on the element that just arrived. No infinite CSS animation except the pre-existing skeleton pulse, the running-job LED, and one ambient exception: the empty-state flower turns (a compositor transform, 45 degrees per 24 s, only while no modpack exists). Others are finite or replayed on a timer (a beat every 10 s on the current step, an ambient glitch every 6 to 14 s on a title, both only when focused and alive).
- **Springs.** `--ease-out: cubic-bezier(.16, 1, .3, 1)` for movement; `--ease: cubic-bezier(.2, .9, .2, 1)` for colour. Drawer slide .5s, dialog pop .38s, toast rise .42s, ink slide .5s, card lean .4s, button lift .35s.
- **Meaning.** Every movement says something: where you are (sliding `.ink` underline under the current tab, staggered arrivals on pack and tab change, pack title decoding from noise via `Life.scramble`), what changed (pipeline step pops via `markPipeline`, new drawer step slides in, the ring on completion), what to do next (the next step beats, the primary leans toward the pointer and catches a highlight, the field glows pink around it).
- **Switch.** A visible "Vivo / Tranquilo" button (`#lifeBtn`) toggles `data-motion="alive|calm"` on the root and persists in `localStorage` key `empi.motion`. `prefers-reduced-motion: reduce` starts calm when nothing is stored, and the CSS clamps all animation and transition durations.
- **Calm** removes canvas, entrances, beats and drifting, leaving the event-only tear.

### Named Rules
**The Says-Something Rule.** A Publisher movement that does not tell you where you are, what changed or what to do next is removed.
**The Calm Fallback Rule.** Every alive movement has a calm equivalent: the same information with no motion, reached by the switch, reduced-motion, or automatic degradation.

## Shapes

Square corners throughout (border-radius 0), on both surfaces (the launcher forces it with `!important` inside `#main`; only its round spinners stay round). Silhouette comes from rules, notches and inversion. Solid 1px `line-strong` borders on Publisher controls; 1px dotted borders on containers, zones, pills, logs, trees and drawers. The primary button (Publisher Compilar, launcher launch) has a clip-path polygon that cuts a notch off the top-right corner (9px Publisher, 18px launcher); the notch is removed on `:focus-visible` so the focus ring stays whole. The active pack card, the selected launcher rail entry and the selected version choice invert to paper with four L-shaped crop marks (7px arms). Icons are 16px, square-capped, miter-joined 1.5px outline strokes.

## Components

### Buttons
- **Shape:** square, 1px border, padding 8px 16px (small 5px 11px, big 11px 22px), weight 500.
- **Primary:** accent fill, ink text, 700, notched top-right. One per screen: the next action. Hover lightens (Publisher), lifts 1px, catches a moving highlight and leans toward the pointer.
- **Secondary:** Surface 2 fill, paper text, `line-strong` border. Hover: Surface 3, `split` text-shadow flash and a 1px lift; active sinks to .97 scale and inverts to paper.
- **Paper:** paper fill, bench-black text, 700. Emphasis without accent (Nuevo, Guardar, Crear). Hover goes to white.
- **Danger:** coral text and outline on Surface (Cancelar). Hover adds a 10% coral tint.
- **Disabled:** ordered-stipple dither (`repeating-conic-gradient`, 3px cells, 14% paper), `paper-3` text, `line` border, not-allowed cursor, notch removed, no hover motion.

### Inputs / Fields
- **Style:** Well fill, 1px `line-strong` border, 8px 10px padding, min-height 36px, square.
- **Focus:** 2px accent outline drawn inside (-1px offset), border transparent, plus a 3px accent line at the bottom edge (`inset 0 -3px 0`). Caret is accent.
- **Segmented control:** Well track, the active segment inverts to paper and pops once.

### Pack Card (sidebar)
Transparent row with a 40px square icon tile, bold name and 12px sub-line. Hover: Surface 2 and a 4px lean to the right. Active: paper block with bench-black text, a `paper-ink` sub-line and crop marks that scale in. On selection the pack title decodes out of noise.

### Navigation
- **Topbar:** 52px, translucent Surface, ribbed-glass overlay, dotted rule along the bottom, wordmark beside a dot-matrix E logo (one row slipped sideways, one pink dot). Tabs are `paper-2`; hover and current go to paper. A single `.ink` strip of pink dots (4px) slides between the current tab or sub-tab; with no JS the current tab keeps a static dot strip.
- **Health pills:** dotted-border chips with an icon; the `bad` state turns coral.

### Pipeline Footer (signature)
Fixed translucent bar (84px) with a dotted top rule: numbered 28px square markers joined by dotted connectors. Done: paper fill with a check, and finished connectors carry dots forward (four marches). Current: 2px dashed pink outline with a pink numeral, beating twice every 10 s. A changed step pops.

### Activity Drawer (signature)
520px right-hand drawer on Surface with a dotted left edge. The head carries the cloud plate behind a left-to-transparent gradient, drifting slowly once; the title is Doto 24px. Steps: done in paper with a check, current bold with the pink 10px square LED (1s `steps(1)` blink), failed in coral. The `resolve` strip is a 14px row of dots on a 12px pitch whose radius grows with progress (`--p`, radius = `--p` x 3.6px), paper when running and coral when failed. Error banners have a coral border over the `tear.png` texture and tear once.

### Zones, Permission Tree, Badges, Empty State
Mod zones have dotted borders (drop-over turns the border pink with a 12% tint). The permissions tree is a dotted list; the `pctl` segmented control inverts its active option. Libre badges are amber dotted chips. Empty state: headline and prose beside the dithered flower plate (`art/flower.png`), which turns slowly while alive.

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
- **Do** spend the accent only on the next action, the focus ring, the current tab underline, the dashed current-step marker, the running LED and the logo dot (Publisher); on the launch button, focus ring and switched-on toggles (launcher).
- **Do** invert to paper (`#f1efe8` on `#0b0b0d`) for selection and secondary emphasis, with `#47473f` for the sub-line.
- **Do** divide with dotted rules instead of solid hairlines.
- **Do** make every Publisher movement say where you are, what changed or what to do next, animate transform and opacity (clip-path only for the short arrival and tear), and stay inside the budget (24 fps focused, 10 unfocused, paused hidden, one canvas pixel per CSS pixel).
- **Do** keep the visible Vivo / Tranquilo switch, the `empi.motion` persistence and the reduced-motion calm start.
- **Do** fire the tear only on events, and use the split text-shadow only for hover.
- **Do** keep the launcher's per-pack accent, choose its label ink by contrast, and let banner and background stay untouched material behind the black halftone screens.
- **Do** keep persistent status colours for status only.

### Don't:
- **Don't** add a second accent, gradient fills on controls or coloured glows.
- **Don't** show red or cyan at rest; they exist only inside tear and split flashes.
- **Don't** set Doto on body text, labels, buttons (except the launch label) or inputs, or below 20px in the launcher.
- **Don't** round corners or add card shadows or hard offset shadows.
- **Don't** add backdrop blur, WebGL, video, animated filters or new infinite CSS animations to the Publisher, and no motion at rest in the launcher.
- **Don't** use the accent for DETENER or other stopping actions; the way out is red and outlined.
- **Don't** tint locked or disabled controls with the accent; use the stipple.
- **Don't** remove the topbar's ribbed-glass gradient as a defect, or reuse it elsewhere.
- **Don't** let a halftone plate or the dot field sit at full strength behind list text or end in a hard edge.
- **Don't** use status colours for decoration or emphasis.

## Assets

Publisher: four procedural halftone rasters in `tools/publisher/public/art/` (`cloud.png`, `flower.png`, `tear.png`, `field.png`), generated by `tools/publisher/scripts/make-art.js`; `field.png` is now only the no-JS fallback ground. Launcher: `app/assets/images/identity/{field,screen-bottom,screen-right}.png` (screens generated by the same script). Provenance is embedded in PNG tEXt chunks. Doto (`fonts/Doto.woff2`, licence in `Doto-LICENSE.txt`) is the only added web font in each surface; the launcher also bundles Avenir TTFs.
