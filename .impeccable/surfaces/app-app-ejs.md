---
version: 1
slug: "app-app-ejs"
primary_target: "app/app.ejs"
related_targets: ["app/landing.ejs","app/settings.ejs","app/login.ejs","app/loginOptions.ejs","app/welcome.ejs","app/waiting.ejs","app/assets/css/launcher.css"]
---

Scope: EmpiLauncher (Electron renderer), every view: welcome, login options, login, waiting, landing, settings (all tabs), overlay, loading. Visitor mode: Operate on settings and login; Experience on landing, where the modpack's own artwork leads and the interface recedes. Extension of the Empi Publisher world already recorded in DESIGN.md: same identity, no new tournament. Product truth, copy, structure, IDs and JS behavior stay.

Audience and task: players of the PanolisSMP community and friends, on Windows, mostly in Spanish. They open the launcher, pick a version, press Jugar (or Actualizar), wait for the download, play. Must not need to know what Java or a loader is. Low CPU/RAM is binding: the launcher shares the machine with Minecraft. No new continuous animation, no backdrop-filter, no canvas loops; everything new is a static raster or a short event glitch; it must switch off under Ahorro de RAM (html[data-empi-performance-mode]) and pause when the window is inactive (html[data-empi-inactive]).

Chosen direction: the Publisher's proof-bench world applied to the player's side. Halftone dots are tone, a tear is feedback when something happens, black and white plus ONE colour. In the launcher that one colour is the modpack's own accent (per-version accent already drives --empi-accent), electric pink #ff3d8b when a pack sets none. Each modpack's background and banner are untouched material: they are screened with dots, never recoloured.

## Direction contract

THESIS: the launcher is the darkroom around the modpack's picture. The pack's art is the print; the chrome is a proof sheet with dotted rules, square corners and a dot screen that darkens the print where the interface needs to be read. It refuses the glassy rounded dark card with a blurred backdrop and a glowing outline.

OWN-WORLD: near-black solid panels (no blur), paper-white text, dotted 1px rules, zero radius, selected rail entry inverted to paper with crop marks, ordered-stipple dither for disabled, dot-matrix face (Doto) for titles and the launch label over the bundled Avenir for reading, black halftone screen on the print's lower edge, paper-white halftone plates on the views that have no artwork, the pack accent as the single colour on the launch button, focus and progress, tears in red/cyan for 260 ms only on events.

STORY: pick a version in the index, see its print, press the one accent-coloured notched button; while it downloads the button turns dark and fills with accent dots from the bottom, the percentage and bytes sit under it, and a short tear marks each state change; a failure tears and says what broke.

FIRST VIEWPORT (1600x900 and 1280x720): frame bar with Doto title; left, an index panel of versions on solid near-black with the selected entry inverted to paper; centre, the pack banner over its screened print, one notched accent button below it whose accent-dot fill is the progress meter (the launcher's V12 layer hides the native progress element, so the button carries progress) with the percentage and byte stats beneath it; top-right avatar and name, social icons as square outlined marks; bottom band with players, Mojang status and Ahorro de RAM in dotted cells. Views without artwork (welcome, login options, settings) sit on two feathered halftone plates.

FORM: the Publisher's item 6 (darkroom contact sheet and proof marks), seed key 562a65f2, inherited, not re-rolled. Same raises: dither as state, one lit indicator as the only glow.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
