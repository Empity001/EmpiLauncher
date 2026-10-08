# Empi Launcher

Launcher de Minecraft de Empi. Se responde en español (voz mexicana, "Ty", para el texto del launcher). Primero actuar y luego informar; el login real de Microsoft lo hace el usuario.

## Mapa
- `engine/` motor Node sin ventana (protocolo NDJSON por socket); reusa los módulos clásicos de `app/assets/js/`. Pruebas: `node engine/test/smoke.mjs` y `update.mjs`.
- `native/src/EmpiLauncher.App` interfaz WPF (Windows) · `native/src/EmpiLauncher.Linux` interfaz Avalonia (Linux, código-first, port del WPF) · `EmpiLauncher.Ipc` cliente del motor. `Styles/styles.json` es una sola lista para los dos.
- `native/build/build.mjs` (instalador de Windows; en Linux compila cruzado) y `build-linux.mjs` (`.tar.gz`). `tools/publisher/` publica todo (`node --test tools/publisher/test/`).
- `docs/LINUX.md` explica la parte de Linux y cómo publicar.

## Reglas
- Commits sin `Co-Authored-By`. No borrar Releases ni inventar historial. Nunca `pkill -f` ni matar por patrón: verificar cada PID.
- Después de tocar código del Linux: `dotnet build native/src/EmpiLauncher.Linux` y una captura con `EMPI_SHOT=/ruta.png EMPI_SHOT_EXIT=1` (más ganchos: `EMPI_STYLE`, `EMPI_SCREEN=settings:about`, `EMPI_ACCESS=retired`, `EMPI_FOLDS=open`).
- Nada de contraseñas: el inicio de sesión lo hace el usuario.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
