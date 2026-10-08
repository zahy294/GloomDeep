# Gloamdeep — Progress Log

Running log per `CLAUDE.md`. Newest milestone at the top.

---

## M0 — Project setup ✅ (2026-10-08)

### Built

- **Toolchain:** Vite 8, TypeScript 6 (strict + `noUncheckedIndexedAccess`), Phaser **4.2.1** (pinned `~4.2.1`), Preact 11, Vitest 5, ESLint 10 (typescript-eslint, flat config) + Prettier, Playwright, sharp, tsx.
- **npm scripts:** `dev`, `build`, `typecheck`, `test`, `lint`, `format`, `shot`, `art:placeholder`. `predev`/`prebuild` regenerate the placeholder atlas.
- **Folder structure** from plan Section 7 (empty dirs hold `.gitkeep`).
- **Game config** (`src/main.ts`): 960×540, `pixelArt: true`, `roundPixels: true`, whole-number scaling with letterboxing (`src/render/integerScale.ts`).
- **Scenes:** Boot (loads placeholder atlas) → Title (backdrop of placeholder tiles) → Game (empty, drives the simulation). Clicking the title starts the game.
- **DOM overlay:** Preact app mounted in `#ui` above the canvas, sized to the canvas with a `--px` CSS variable (one game pixel) so UI scales with it. Scenes and UI talk through `UiBridge` (state from scenes, commands from UI).
- **Simulation core:** `src/sim/FixedStepLoop.ts` (fixed 60 Hz, capped catch-up, interpolation `alpha`), `src/sim/Simulation.ts`, typed `EventBus` in `src/sim/events.ts`.
- **Data:** interim 64-colour master palette (`src/data/palette.ts`, 16 ramps × 4), first tile registry (`src/data/tiles.ts`, 10 tiles).
- **Placeholder art generator:** `tools/gen-placeholder-art.ts` → `assets/placeholder/tiles.png` + `tiles.json` (frame index = tile id; palette colours only; deterministic).
- **Art pipeline folders:** `art/{reference,prompts,raw,clean}`, empty `art/manifest.json`, prompt templates from plan 2.9.5 in `art/prompts/`.
- **Debug URL params:** `?seed=`, `?scene=game` (skip title), `?ui=0`.
- **`npm run shot`:** builds, serves with `vite preview`, captures `title`, `title-click-to-game`, `game-no-ui` at 1920×1080; fails on page errors.
- **Tests (25):** event bus (order, mid-emit unsubscribe), fixed-step loop, simulation, tile registry, placeholder atlas (determinism, palette-only, layout), integer zoom (incl. OS display scaling), debug params.

### Done-when check

| Item | Result |
|---|---|
| `npm run dev` shows a title screen | ✅ dev server serves; title verified in `screenshots/title.png` |
| Clicking starts an empty Game scene | ✅ `screenshots/title-click-to-game.png`; sim steps > 30 confirmed by the shot script |
| `npm test` runs a sample test | ✅ 25 tests pass |
| `npm run build` succeeds | ✅ |
| typecheck / lint | ✅ |

### Decisions and deviations

- **Integer scaling uses `Scale.NONE` + `setZoom()`**, not `Scale.FIT`: FIT allows fractional scales, which the plan forbids. Zoom = largest whole number of **device** pixels that fits the window (min ×1), so pixels stay square at 125%/150% OS scaling; CSS flex centring gives the letterbox.
- **Title text is DOM, not Phaser text**, since all UI belongs to the overlay; the Phaser Title scene only draws the backdrop.
- **Vite `publicDir` is `assets/`**, matching plan 2.9.3 ("final packed atlases used by the game"). Placeholders go in `assets/placeholder/` and are generated, not committed.
- **Interim palette:** the real palette comes from the style reference in M2b. The interim ramps follow plan 2.1 (teal/emerald shadows, warm bark, gold sunlight, cyan/mint/rose/moon-silver magic, Gloam violet used nowhere else).
- **ESLint enforces CLAUDE.md rule 2/3:** `src/sim/**` cannot import `phaser`, `preact`, or render/UI/audio modules.
- **Two tsconfigs:** `tsconfig.json` (src/, browser types only) and `tsconfig.node.json` (tools/, tests/, configs). Node globals are likewise limited to those folders in ESLint, so `process`/`Buffer` can't leak into game code.
- **`.gitattributes` forces LF** to keep diffs clean on Windows.
- The `.claude/agents/` were not picked up by the session that did M0 (they were moved into the workspace mid-session); the reviewer pass ran with the `reviewer.md` brief via a general agent. Fresh sessions opened in this folder will load them normally.

### Reviewer pass

No blockers. Fixed from the review: device-pixel-aware integer zoom; event bus now runs listeners in subscription order and is safe against (un)subscribing mid-emit (copy-on-write lists); `stepped` payload reused instead of allocated per step; Node types/globals scoped away from src/; tile-registry test (`id === index`); title screen auto-focuses so Enter/Space start the game; title strip height named.

### Known issues

- **Windowed 1080p falls back to ×1.** A non-fullscreen browser on a 1920×1080 screen has a viewport under 1080 px tall, so the game shows at 960×540 with wide borders. Integer scaling rules out ×1.9. Options: accept it (fullscreen/F11 gives ×2), or crop a few rows of the view instead of shrinking. Needs a user decision.

- The JS bundle is ~1.4 MB (366 KB gzip), almost all Phaser. Well within the 10 MB budget; code-splitting can wait.
- Headless screenshots use SwiftShader WebGL; fine for checks but not for performance numbers.

### Open questions for later milestones

- Light grid precision: plan 2.3 says "0–15 or 0–255" per channel. To decide at M3 (leaning 0–255 for smooth colour mixing; 0–15 would be faster to flood fill).

### Next step

**M1 — World rendering and player movement:** `World`/`Chunk` with the 3.1 arrays, a simple test world, `ChunkRenderer` with one `TilemapGPULayer` per visible chunk, player with tile collision + coyote time / jump buffer / variable jump, `CameraDirector`, F3 debug overlay.
