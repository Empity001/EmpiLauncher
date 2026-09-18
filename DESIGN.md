---
name: Empi Publisher
description: A darkroom proof bench for publishing modpacks, in halftone black and paper-white with one electric pink marking the next action.
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
  pink: "#ff3d8b"
  pink-hover: "#ff6aa6"
  pink-ink: "#16030c"
  split-red: "#ff2a4a"
  split-cyan: "#33e6ff"
  danger: "#ff6a4d"
  warn: "#ffb14a"
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
---

# Design System: Empi Publisher

## Overview

**Creative North Star: "The Proof Bench"**

A darkroom bench where a modpack is framed, developed and printed. Ground is near-black, marks are paper-white, and tone is made of halftone dots rather than gradients or shadows. The tool is still at rest: a glitch (a 260 ms scan-line tear with a red/cyan channel split) is how it speaks about change and failure, and one electric pink is reserved for the next thing the operator should do. Text and controls stay crisp and legible; the dithering, ribbing and glitch belong to the ground and to events, never to the words you work in.

The mood is precise, printed and slightly uncanny: dot-matrix headlines over a plain Windows UI face, square corners, dotted rules where other systems draw solid lines, and static halftone plates (flower, cloud, tear, field) as the only imagery. Density is that of a working tool: a 290px pack list beside a form column, with a fixed pipeline footer that always shows the current step. Low RAM and CPU are a product principle, so every texture is a pre-rendered raster or CSS gradient on a fixed layer and nothing loops except one LED while a task runs.

**Key Characteristics:**
- Black and paper-white plus exactly one pink; pink means "next action" or "focus".
- Dotted rules (radial-gradient dots) divide sections, tabs, the topbar and the pipeline instead of solid hairlines.
- Square corners everywhere; the primary button is notched, not rounded.
- Doto dot-matrix for identity and numerals only; Segoe UI Variable for everything read or edited.
- Motion is event-only: tear on new step, failure and pack selection; split on button hover.
- Halftone plates are static, feathered by masks, height-capped and hidden at 900px and below.

## Colors

A monochrome darkroom palette: warm-tinted near-blacks, three paper tones, a single hot pink, and two legibility exceptions for status.

### Primary
- **Electric Pink** (#ff3d8b, `pink`): the one live color. Used for the next pipeline action (the Compilar primary button), the focus ring, the active-tab dot strip, the dashed current-step marker (step 2), the running-task LED (10px square spinner) and the single lit dot in the logo. It also drives the selection highlight, the text caret and the mod drop-zone hover (12% tint), which are focus-like states.
- **Pink Hover** (#ff6aa6, `pink-hover`): primary button hover.
- **Pink Ink** (#16030c, `pink-ink`): text on pink and on selected text.

### Secondary
- **Split Red** (#ff2a4a, `split-red`) and **Split Cyan** (#33e6ff, `split-cyan`): the two RGB channels. They exist only as text-shadow offsets inside the 260 ms `tear` flash and the 200 ms hover `split`. Never a fill, border or text color at rest.

### Neutral
- **Well** (#060607): recessed wells; inputs, log, segmented tracks, command preview.
- **Bench Black** (#0b0b0d, `bg`): page ground.
- **Surface** (#111114): topbar, pipeline footer, drawer, dialogs.
- **Surface 2 / 3** (#18181c / #212127): hover fills, secondary buttons, pack icon tiles.
- **Line / Line Strong** (#24242a / #3b3b44): solid 1px borders on controls (inputs, buttons, segmented).
- **Dot Grey** (#55555f, `dot`): the color of every dotted rule and dotted border.
- **Paper** (#f1efe8): primary text, done markers, inverted selection and paper buttons.
- **Paper 2** (#a5a598): secondary text and icons. **Paper 3** (#8b8b81): placeholders, tertiary metadata, disabled text.

### Status (legibility exceptions)
- **Danger Coral** (#ff6a4d, `danger`) and **Warn Amber** (#ffb14a, `warn`): persistent status colors for Libre badges (warn), the unsaved-changes hint, error banners and toasts, the failed step and failed resolve strip, the offline bar, and the Cancelar outline (danger). They sit outside the black/white/pink palette on purpose: status must be readable at a glance and must never be confused with the pink next-action signal.

### Named Rules
**The One Pink Rule.** Pink marks the next action and focus, nothing else. A second pink element competing on screen means one of them is wrong.
**The Flash-Only Channels Rule.** Red and cyan appear only as 260 ms (or 200 ms hover) split flashes. They are never persistent.
**The Status Exception Rule.** `danger` and `warn` are the only persistent colors outside black, white and pink, and only for status. Do not extend them to decoration or emphasis.

## Typography

**Display Font:** Doto (with Cascadia Mono, Consolas, monospace), self-hosted variable woff2 (weights 100 to 900, `font-display: swap`)
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui, sans-serif)
**Label/Mono Font:** Cascadia Mono (with Consolas, monospace) for code, logs and paths

**Character:** A dot-matrix face for what the tool calls itself and its big numerals, over the operating system's own UI face for everything you read or edit. The contrast is printout versus paper.

### Hierarchy
- **Display** (Doto 700, 32px, 1.1; 26px at 900px and below): page headline such as the selected pack title.
- **Drawer Title** (Doto 700, 24px, 1.1): activity drawer title; also the version numerals in the launcher version choices.
- **Wordmark** (Doto 800, 17px, 0.02em, uppercase): "Empi Publisher" in the topbar; hidden below 520px.
- **Headline** (Segoe 600, 16px): section headings (h2).
- **Title** (Segoe 600 to 700, 14px): h3, pack names (700), step titles (700), zone titles.
- **Body** (Segoe 400, 14px, 1.5): everything else; prose capped at 62ch.
- **Label** (Segoe 400, 13px, `paper-2`): form labels, hints, facts.
- **Caption** (Segoe 400, 12px): sub-lines, counts, badges, metadata.

### Named Rules
**The Dots Are Headlines Rule.** Doto is for the wordmark, headlines, the drawer title and version numerals. It is never body text, labels, buttons or inputs.
**The Tabular Numerals Rule.** Counts, sizes, versions and progress use `tabular-nums`.

## Layout

A two-column workbench: a 290px sticky pack sidebar and a fluid content column (container max 1240px, 40px gutter, 28px/24px padding). Single-column surfaces (launcher tab, settings) are centred at 760px. Forms use a two-column grid (20px/24px gaps, max 820px); the mod zones use three equal columns with 16px gaps. Vertical rhythm steps through 6, 8, 12, 16, 24, with 28px above form actions. A fixed pipeline footer (min-height 84px, exposed as `--pipeline-h`) reserves bottom padding on `main`; the toast and the bottom-left plate both sit above it.

Halftone plates sit on the fixed ground: bottom-left (340px wide, height capped at `min(496px, 100vh - pipeline - 380px)` so it stays below the modpack list) and top-right (320 by 118px, rotated 180deg). On the launcher tab the left plate narrows to the margin beside the centred column. Both hide at 900px and below.

Responsive has one breakpoint at 900px: the sidebar becomes a horizontal pack strip, grids collapse to one column, the health pills and plates are hidden, the pipeline drops its numbered markers and connectors and its button goes full width, and the permissions rows stack. At 520px the wordmark text is hidden.

## Elevation & Depth

Flat by default. Depth comes from tone steps (well, bench, surface, surface 2, surface 3), dotted rules and the halftone plates behind content, not from shadows. The single shadow is the activity drawer's left cast (`box-shadow: -16px 0 40px rgb(0 0 0 / .55)`), which separates a slid-in overlay from the page. Dialogs separate by a 1px `paper-3` border and an 80% black backdrop. Selection is expressed by inversion (a paper block with crop marks), not lift.

### Named Rules
**The Flat Ground Rule.** No hard offset shadows, glows or blurred card shadows. The drawer cast is the only shadow.
**The Ribbed Glass Exception.** The topbar's `repeating-linear-gradient` of fine vertical paper lines (7% alpha, 1px lines on a 5px pitch, faded in from the left by a mask) is a deliberate part of the world (ribbed glass from the moodboard). It is an intentional advisory exception, not a defect: do not remove it, and do not spread it beyond the topbar.
**The Static Raster Rule.** Every texture is a pre-rendered PNG or a CSS gradient on a fixed layer. No canvas, video, blur filters or continuously animated background.

## Shapes

Square corners throughout (border-radius 0). Silhouette comes from rules, notches and inversion instead of rounding. Solid 1px `line-strong` borders on interactive controls; 1px dotted `dot` borders on containers, zones, pills, logs, trees and the drawer edge. The primary button has a 5-vertex clip-path polygon that cuts a 9px notch off the top-right corner; the notch is removed on `:focus-visible` so the focus ring stays whole. The active pack card and the selected version choice invert to paper; the active pack card also gains four L-shaped crop marks (7px arms, inset -4px, `paper-2`), like a frame picked on a proof sheet. Icons are 16px, square-capped, miter-joined 1.5px outline strokes.

## Components

### Buttons
- **Shape:** square, 1px border, padding 8px 16px (small 5px 11px, big 11px 22px), weight 500.
- **Primary:** pink fill, pink-ink text, 700, notched top-right corner. One per screen: the next pipeline action (Compilar). Hover lightens to pink-hover.
- **Secondary:** Surface 2 fill, paper text, `line-strong` border. Hover: Surface 3 plus the `split` text-shadow flash (no transform, no clip-path). Active: inverts to paper.
- **Paper:** paper fill, bench-black text, 700. Emphasis without pink (Nuevo, Guardar, Crear). Hover goes to white.
- **Danger:** coral text and outline on Surface (Cancelar). Hover adds a 10% coral tint.
- **Disabled:** ordered-stipple dither (`repeating-conic-gradient`, 3px cells, 14% paper), `paper-3` text, `line` border, not-allowed cursor, notch removed, no hover flash.

### Inputs / Fields
- **Style:** Well fill, 1px `line-strong` border, 8px 10px padding, min-height 36px, square. Select uses a square-capped chevron. Checkboxes are 16px with a paper accent.
- **Focus:** 2px pink outline drawn inside (-1px offset), border transparent. Caret is pink. Placeholder is `paper-3`.
- **Segmented control:** Well track, the active segment inverts to paper.

### Pack Card (sidebar)
Transparent row with a 40px square icon tile, bold name and 12px sub-line. Hover: Surface 2. Active: paper block with bench-black text, a `#47473f` sub-line and crop marks. On selection the pack title fires one `tear`.

### Navigation
- **Topbar:** 52px, Surface, ribbed-glass overlay, dotted rule along the bottom, wordmark beside a dot-matrix E logo (one row slipped sideways, one pink dot at the bottom right). Tabs are `paper-2`; hover and current go to paper; the current tab and the current pack sub-tab carry a 4px strip of pink dots underneath. Sub-tabs sit on a dotted rule and fade at the right edge when they overflow.
- **Health pills:** dotted-border chips with an icon; the `bad` state turns coral.

### Pipeline Footer (signature)
Fixed bar (84px) with a dotted top rule: numbered 28px square markers joined by dotted connectors. Done: paper fill with a check. Current: 2px dashed pink outline with a pink numeral. Upcoming: grey outline. A new step marker tears once.

### Activity Drawer (signature)
520px right-hand drawer on Surface with a dotted left edge. The head carries the cloud plate on the right behind a left-to-transparent surface gradient; the title is Doto 24px. Steps: done in paper with a check, current bold with the pink 10px square LED spinner (1s `steps(1)` blink), failed in coral. Below sits the `resolve` strip: a 14px row of dots on a 12px pitch whose radius grows with progress (`--p`, 0 to 1 in the JS, radius = `--p` x 3.6px in CSS), paper when running and coral when failed. Banners: success has a dotted paper border; error has a coral border over the `tear.png` texture and tears once on appearance. The log is a Well block with a dotted border in the code face.

### Zones, Permission Tree, Badges
Mod zones have dotted borders (drop-over turns the border pink with a 12% tint). The permissions tree is a dotted-bordered list with dotted row separators; the `pctl` segmented control inverts its active option. Libre badges are amber dotted chips.

### Empty State
Two-column hero: headline and prose beside the dithered flower plate (`art/flower.png`), stacked at 900px and below.

## Do's and Don'ts

### Do:
- **Do** spend pink only on the next pipeline action, the focus ring, active-tab dots, the dashed current-step marker, the running LED and the logo dot.
- **Do** invert to paper (`#f1efe8` on `#0b0b0d`) for selection and secondary emphasis: active pack card, selected version choice, Nuevo, Guardar, Crear.
- **Do** divide with the dotted rule (`--dotted`, or `dot`-coloured dotted borders) instead of solid hairlines.
- **Do** fire `tear` only on events (new step marker, failure banner, pack title after selecting a pack) and use the `split` text-shadow only for hover.
- **Do** keep art static: `body::before` and `body::after` plates from `art/field.png` feathered with a mask and height-capped; cloud in the drawer head, tear behind error banners, flower in the empty state.
- **Do** honour `prefers-reduced-motion` and keep raster layers fixed; minimum RAM and CPU is a hard product principle.
- **Do** keep persistent `danger` and `warn` for status only (Libre badges, error banners, Cancelar outline, failed step). They are legibility exceptions to the black/white/pink palette.

### Don't:
- **Don't** add a second accent, gradient fills on controls or colored glows.
- **Don't** show red or cyan at rest; they exist only inside the 260 ms tear and 200 ms split flashes.
- **Don't** set Doto on body text, labels, buttons or inputs.
- **Don't** round corners or add card shadows or hard offset shadows.
- **Don't** animate hover with `transform` or `clip-path`; hover uses only `text-shadow` (split) and color transitions.
- **Don't** add continuously animated backgrounds, blur filters, video or canvas. The only looping motion is the running-task LED (plus the short-lived loading skeleton).
- **Don't** remove the topbar's ribbed-glass repeating gradient as a defect; it is a deliberate advisory exception. Don't reuse it as a general pattern either.
- **Don't** let a halftone plate end in a hard edge or sit at full strength behind list text.
- **Don't** use `danger` or `warn` for decoration or emphasis; they are for status only.

## Assets

Four procedural halftone rasters live in `tools/publisher/public/art/` (`cloud.png`, `flower.png`, `tear.png`, `field.png`), generated by `tools/publisher/scripts/make-art.js`. Provenance for each is embedded in its PNG tEXt chunk by `impeccable embed-prompt`. Doto (`fonts/Doto.woff2`, licence in `Doto-LICENSE.txt`) is the only web font.
