---
version: 1
slug: "tools-publisher-public-index-html"
primary_target: "tools/publisher/public/index.html"
related_targets: []
---

Scope: Empi Publisher (tools/publisher), every screen. Visitor mode: Operate. Replacement of the incumbent green "taller ordenado" world; product truth, copy, structure and behavior stay.

Audience and task: the author (Empity001), alone, in long sessions; creates modpacks, edits mods and files, then Compilar and Enviar. Must always see state and progress; must be able to read file names, versions and errors in plain Spanish. Low CPU/RAM is binding: no continuous animation at rest, no canvas or WebGL loops, no animated filters.

Chosen direction: a darkroom / proof bench where errors are the material. The author supplied a moodboard: halftone and dithered dot fields, scan-line and data-moshed glitches, RGB-split streaks, ribbed glass. Confirmed with the author: dots and glitches live in backgrounds, empty states, progress, errors and hover; forms, lists and text stay crisp. Black and white plus one electric pink. Motion is a short tear only when something happens.

## Direction contract

THESIS: the tool is a proof bench, not a dashboard. Halftone dots are the tone of everything and a glitch is how the tool speaks about change and failure. It refuses the polite dark panel with a green accent and rounded cards.

OWN-WORLD: near-black ground, paper-white dot fields (fixed 45-degree screen), ordered-stipple dither for disabled, inverted paper for selected, one electric pink for the next action, red and cyan only as a 260 ms channel split, dot-matrix display face for titles over a crisp system face for work, dotted rules, square corners, a single notched corner on primary buttons, crop marks.

STORY: the author frames (Editar), develops (Compilar) and prints (Enviar); dots resolve as work advances, and a failure tears the frame in plain sight and says what broke.

FIRST VIEWPORT (1280): ribbed-glass top band with a dotted mark and two tabs; left index of modpacks, the chosen one inverted to paper with crop marks; right, the modpack name in dot-matrix at 32 px over its facts, dotted-underlined subtabs, crisp form; footer of three squared exposures joined by a dotted line, the next one pink. Empty state: a large dithered flower.

FORM: item 6 of the grounded list (darkroom contact sheet and proof marks), seed key 562a65f2. Raised by the one-bit desktop challenger (dither as state: dimmed for disabled, inverted for selected, steps() motion) and the drum-machine row (one lit indicator as the only glow, while a task runs). Both other challengers declined.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Motion update (2026-09-18, author's request)

The author asked for more life: a moving background in the spirit of a dot-field reference page, plus transitions and movement throughout. This replaces the earlier "still at rest" rule for the Publisher only; the launcher keeps its budget (see app-app-ejs.md).

- The ground is one canvas of halftone dots (life.js): slow interference waves, two corner plates that swell, a scan band that crosses now and then, the pointer and clicks pushing dots outward, the hovered control lighting the dots around it, the next action glowing pink, a running job speeding the field up, a finished job sending a ring through it. Dots stay faint under text.
- Everything else moves to say where you are, what changed or what to do next: staggered arrivals on load and on pack/tab change, an underline that slides between tabs, the pack title decoding out of noise, pipeline steps that pop when they change and beat when they are next, links that carry dots forward, cards that lean, buttons that lift and sink, the primary that catches light and leans toward the pointer, the flower that turns, the cloud that drifts.
- Budget stays binding: canvas 24 fps focused and 10 fps otherwise, nothing while hidden, one canvas pixel per CSS pixel, measured frame cost and delivered frame rate thin the field and finally stop it, only transform and opacity animate, infinite CSS animations are avoided (finite, replayed on a timer), a visible "Vivo / Tranquilo" switch, prefers-reduced-motion starts calm. Measured in headless Edge with software raster: about 7-10% of one core alive, about 0% calm.

## Modular UI update (2026-09-18, author's request with two references and two clips)

References: a bento of dark rounded modules with mono data type, pill buttons and circular icon buttons, hatched bars and heat grids; and a crypto prototype clip with pill chips, a two-button Sell/Buy pair, a soft glow wash at the top of a card, a line that draws itself, and circular icon buttons that fill dark and grow when selected. The author asked to keep the integration with the background and shapes and to make text and buttons feel alive, and for layout corrections.

Decisions, superseding the older square-corner rule for the Publisher only (the launcher keeps square corners and notches):
- Everything is a module: dark translucent panel (dots read through its edge), 1px hairline, 22px radius, a static corner of halftone dots inside. Inputs 12px, everything pressable is a pill or a circle. Selected = filled paper.
- Segmented pills with a sliding paper thumb replace the dotted underline (top tabs and modpack tabs). Circular icon buttons fill and spring to 1.12 when pressed. Checkboxes are switches.
- Type: Geist Mono (self-hosted) for data and chrome, Doto for the modpack name and numerals, Segoe UI Variable for reading text and input text.
- Layout corrections: modpack head becomes a hero module with four data tiles (Minecraft, Loader, Version, Mods with a hatched share bar); settings become a two-column bento (Identity, Version, Server, Options, then Discord and the save bar); the launcher tab becomes a hero with four tiles plus two modules side by side; the sidebar gains a "Publicacion" status module (three dots, four facts); the footer becomes a floating dock; the empty state gets a real "Crear modpack" button; the new-modpack form is a two-column module; the modpack list draws before GitHub answers.
- Kept: the living dot ground (modules are HOT targets, so the field lights up around them), the single pink for the next action, Doto titles, the tear glitch, dithered disabled, the LED, all budget rules and the Vivo/Tranquilo switch.
