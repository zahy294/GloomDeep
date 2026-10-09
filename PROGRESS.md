# Gloamdeep — Progress Log

Running log per `CLAUDE.md`. Newest milestone at the top.

---

## M3 — Lighting ✅ (2026-10-09)

### Built

- **Light grid in the simulation** (rule 7): `world.lightR/G/B`, 0–255 per channel (decided: 0–255 for smooth coloured mixing; the flood fill is fast enough). `LightSystem` recomputes a region around the camera 30× per second — the view plus a border (72×46 tiles) plus a 16-tile margin that only feeds light inwards — and writes the inner part back, emitting `lightUpdated`.
- **Flood fill in a Web Worker** (`src/workers/lighting/`): per-channel bucket-queue Dijkstra, exact (checked against a reference implementation on random grids). Seeds: sunlight straight down each column to the first solid tile (`World.skyline`, kept current on every edit), emissive tiles, point lights and the lantern cone (rays stop at solid tiles). Air loses 16 per tile, solid blocks 56. Deterministic fire flicker. **~0.15–0.35 ms per update** (budget 4 ms). Falls back to the main thread if workers are unavailable.
- **Light map:** one texel per tile, LINEAR filtering, scaled ×16, MULTIPLY blend. **The sky is its own scene** rendered first; the Game camera composites into its own framebuffer with a transparent background, so the multiply only darkens the world and never the sky.
- **Torches** (new tile + item, 30 to start with): placeable, flickering warm light, a fixed look instead of autotiling. Lumen and Moonstone crystals glow.
- **Lantern with the Amber lens:** a cone of warm light towards the mouse plus a soft glow around the player; burns Lumen (HUD gauge); **F** toggles it; when there's room it burns a Lumen Crystal from the inventory to refill.
- **Glow pass:** additive soft halos over emissive tiles and the lantern, flickering in step with the light grid; off on Low quality (`?quality=low`, saved setting).
- **Day–night cycle** (20 min/day): keyframes for sunlight colour and sky gradient (`src/data/dayCycle.ts`), Phaser `Gradient` sky, sun and moon on an arc, stars at night. `?time=dawn|morning|noon|sunset|dusk|night|midnight`, **T** cycles times.
- **HUD:** Lumen gauge, lens, clock. F3 shows the light at the player and the average light-update time.
- **Input fix:** key taps shorter than one frame were lost (keys were only polled); presses are now latched on key-down.
- **`npm run shot`:** noon, sunset, night-with-lantern, dark cave and torch-lit cave screenshots, with checks: sunset light is warm (r > 1.5 × b), a cave is fully dark with the lantern off, torches light it, the light update averages < 4 ms.
- **Tests:** 216 (flood fill incl. reference comparison, walls, colour, sun, cone, flicker, backends; skyline; day cycle; lantern; LightSystem on a small world).

### Done-when check

| Item | Result |
|---|---|
| Caves are dark | ✅ cave light 6 tiles from the player with the lantern off: rgb 0,0,0 (`light-cave-dark.png`) |
| Torches and the lantern light them with soft, coloured light | ✅ torch-lit cave rgb ~172,120,65, soft falloff (`light-cave-torches.png`); the lantern cone lights the cave 7 tiles away where it points, rgb ~135,91,53 (`light-cave-lantern.png`) |
| Sunset visibly turns everything warm | ✅ surface light at sunset rgb 237,133,76 (`light-sunset.png`) |
| Light update under 4 ms on average | ✅ ~0.15 ms average in the worker (headless Chromium) |

### Decisions and deviations

- **Sky as a separate scene** instead of a sky layer in the Game scene: with one canvas, the multiplied light map would darken the sky twice at night. Rendering the world camera into its own framebuffer keeps empty sky transparent.
- **Sunlight passes through background walls** (plan 2.3 wording) and stops at the first solid block.
- **The lantern cone is light, not yet a "gameplay lens"**: Amber's slow healing waits for health (M6/M8); Azure/Crimson/Verdant are M7.
- **Refuelling** by burning Lumen Crystals from the inventory automatically — the simplest rule until crafting (M6) decides otherwise.
- **Sprite rim lighting deferred:** plan 2.3 suggests Phaser point lights (`setLighting(true)`) for rim highlights on the player and enemies. That needs normal maps, which come with real character art; the placeholder sprites would gain nothing. Revisit when the player/enemy art is approved.
- **Moonlight raised slightly** (night sunlight 40,48,82) so the surface away from the lantern isn't pure black.
- **Faint player aura** (always on, very dim) so the player is never invisible in full darkness (plan 2.1 readability).
- **Glow pass uses additive soft sprites** rather than a Glow/Blur filter: same look for point-like sources at a fraction of the cost; a camera bloom (ParallelFilters) can be added later if wanted.
- **Phaser gotcha:** `scene.moveBelow(a, b)` moves **b** below a. The scene list order in `main.ts` already draws the sky first.

### Reviewer pass

No blockers; the reviewer confirmed against Phaser's source that the MULTIPLY blend leaves the transparent framebuffer at alpha 0 (sky untouched) and that the flood fill and edge write-back are correct. Fixed from the review: a crashed light worker no longer freezes lighting (the backend switches to the main thread, and jobs unanswered for 1 s are abandoned and re-submitted); the sky gradient is only re-encoded when its colours change (it re-uploaded a texture every frame); the T debug key goes through a simulation command (rule 3); a lantern-in-cave check was added; falloffs of 0 are rejected (the bucket queue needs ≥ 1).

### Browser check (real GPU, Playwright, after the review)

Played through title → game → run/jump → dig → torch → T (time) → F (lantern) → F3 in a headed browser: ~150 FPS, 17 draw calls, light update ~0.6 ms, 0 late chunk loads, no console errors. Found and fixed one visual bug: **overlapping glow halos drew a darker square** around the player. Phaser's ADD blend is `[ONE, DST_ALPHA]`, which inside the Game camera's transparent composite framebuffer scales what's underneath by a fractional alpha. Halos now live in a `GlowScene` drawn after the Game scene onto the opaque canvas, where ADD is plain additive; its camera copies the Game camera each frame. Also added an empty favicon (404 in the console).

### Known issues

- Light results are applied when the worker answers (wall-clock), and light outside the current region goes stale when the camera leaves. Fine while nothing reads the grid for gameplay; apply results at a step boundary when the Gloam (M7) starts reading it.
- Water and lava light behaviour arrives with liquids (M9); the falloff tables are per channel, ready for it.
- Light jobs allocate their input arrays ~30× per second (small, off the per-frame path).
- Flicker is 30 Hz (the light-update rate); the glow halos flicker every frame.

### Next step

**M4 — World generation, biomes and saving:** worldgen worker with the 12 steps and a progress screen, surface biomes and depth layers, ores and Lumen crystals by depth, save/load (IndexedDB + gzip), world select/create, autosave.

---

## M2b — Art pipeline tools ✅ (2026-10-08)

### Built

- **`npm run art:import [id|category]`** (`tools/import-art.ts`, `tools/lib/importArt.ts`): magenta chroma key + fringe removal, grid detection from block edges (handles uneven 6/7 px and fractional 6.5 px "pixels"), downscale by majority colour of each block's centre (never averaging), OKLab palette matching with a "far from palette" report, trim + anchor, sheet slicing, seam check, 4× preview next to the raw file, manifest status → `cleaned`. Never touches `art/raw/` except writing the `.preview.png`.
- **`npm run art:palette`**: weighted k-means in OKLab on the style reference → up to 16 hue ramps × 4 shades, dark → light; writes `art/reference/palette-suggestion.json` + `palette.png`. Never overwrites `src/data/palette.ts` (you adjust and copy it).
- **`npm run art:autotiles [material]`**: one cleaned seamless base texture → 47 blob shapes × 3 variations (cut from different areas of the texture), outlines in the darkest shade of the texture's own ramp, inner-corner notches, top highlight. Output matches the game's atlas frame layout.
- **`npm run art:pack`**: builds everything the game loads into `assets/packed/` — tile and wall atlases (approved terrain replaces only its own tile's frames; walls derived one shade darker within each palette ramp), cracks, a sprite atlas + `sprites.json`, `pack.json`, and `preview/` for the art-test scene. Runs automatically before `dev` and `build`.
- **Manifest-driven loading:** the game now loads only `assets/packed/` — approved art merged with placeholders, so it always runs and never shows unapproved art.
- **Player from parts** (`src/data/playerParts.ts`, `PlayerRenderer`, `playerAnimation.ts`): placeholder hooded lamplighter in 12 part frames (arms, body, head, hood, 4 walk + idle + jump legs, lantern). Animated in code: walk cycle from distance travelled, body bob, swinging arms, trailing hood, jump/fall poses, a mining swing towards the target, an arm that points where you build, lantern in the back hand, faces the cursor while working.
- **Art-test scene** `?scene=art-test&id=<asset>&time=day|night`: the asset on real ground at 1× plus a 4× copy, the style reference beside it when it exists; terrain shows an autotiled sample patch.
- **`npm run shot`** now also runs a pipeline demo (`tools/demo-art.ts`): fake AI images → import → autotiles → pack into `dist/packed-demo/`, then screenshots of the demo mushroom (day/night), the generated soil autotiles, the whole game using that soil, and player close-ups walking and mining.
- **Tests:** 188 (each import step + pixel-exact end-to-end on fake-AI fixtures at pitches 6/7, 8 and 6.5, palette extraction, autotile generation, packing, player poses).

### Done-when check

| Item | Result |
|---|---|
| Raw AI image → clean, palette-matched pixel art at the right size | ✅ on synthetic fake-AI fixtures: the original sprite comes back **pixel-exact** (uneven 6/7 px pitch, fractional 6.5 px, magenta fringe, noise, colour drift), also when it sits inside a much larger magenta canvas at an off-grid offset. **Needs a real Nano Banana image** — not available yet |
| One base texture becomes a full autotile set in the game | ✅ `screenshots/game-demo-pack-soil.png`: the whole world's forest soil uses a set generated from one 32×32 texture; `art-test-soil-autotiles.png` shows edges, corners and holes |
| The player animates from parts | ✅ `screenshots/player-parts-walking.png`, `player-parts-mining.png` |

### Decisions and deviations

- **Synthetic fixtures instead of a real AI image** (none exists yet). They reproduce the known Nano Banana problems; the first real image you drop in is the real test.
- **Sprites are cropped to their content before downscaling.** AI images are big canvases with the sprite somewhere inside; the first version squashed the whole canvas into `targetSize` (caught by testing a realistic canvas). The sprite's size now comes from the detected pixel grid when both axes agree, else it is fitted to `targetSize`.
- **Seam check is relative:** a seamless texture's last column should *continue into* its first, not equal it. Wrap differences are compared with the texture's own neighbour differences, so grainy textures no longer fail falsely.
- **Night in the art-test scene is a multiply overlay** until M3 lighting.
- **Pack always produces a complete set** (placeholders fill gaps), so code never depends on a particular asset existing.
- **Autotile outline colour** comes from the base texture's dominant palette ramp (darkest shade), not from per-tile rules in `tiles.ts` as plan 2.9.7 suggests — simpler and keeps outlines in the material's own colour (plan 2.9.1). A per-tile override can be added when real art needs one.
- **Top decorations** for autotiles (grass tufts, moss overhang; plan 2.9.7) are left as a TODO in `autotileGen.ts` — they need real art to be worth designing.
- The title strip had used pre-M2 frame numbers; it now shows each tile's icon frame.

### Reviewer pass

A first review run was cut off by a usage limit while probing "a realistic canvas" — which exposed the real bug: the importer squashed the whole AI canvas into `targetSize`. Fixed (sprites are cropped to their content first) and covered by tests. The second review found no blockers and confirmed pixel-exact imports at pitches up to 42 px with off-grid margins and a noisy background. Fixed from it: stray specks or a corner watermark no longer stretch the crop (small detached blobs are ignored, with a warning); sheets/textures that don't match their grid now warn (non-square pixels) instead of importing silently; `art:pack` leaves out approved third-party (`source: "pack"`) art without a license, with a warning; short sprite sheets warn; no per-frame allocations in the player animation; the art-test ground is autotiled; the demo deletes its temp art folder.

### How to use the pipeline

1. Add a manifest entry (`art-import` skill / prompt templates in `art/prompts/`), generate the image, save it to `art/raw/<category>/<id>.png`.
2. `npm run art:import <id>` → check the report and `art/raw/<category>/<id>.preview.png`.
3. Terrain: `npm run art:autotiles <material>`.
4. Look at it in the game: `npm run dev`, open `?scene=art-test&id=<id>` (and `&time=night`).
5. Approve by setting `"status": "approved"` in `art/manifest.json`, then `npm run art:pack` (or just restart `npm run dev`).

### Known issues

- Grid detection needs blocks ≥ 5 px; without a trustworthy grid a sprite is fitted to its `targetSize`.
- **Sheets** (and textures) still treat the whole image as the grid: crop a real AI sheet to its grid before importing. Single sprites are found anywhere in the canvas.
- The fringe pass can occasionally eat non-palette pink/green edge pixels.

### Next step

**M3 — Lighting:** lighting worker (sunlight, flood fill, coloured light, material absorption), smooth light map, torches, the lantern with the Amber lens, glow pass, day–night cycle. **In parallel (you):** create and approve the style reference (plan 2.9.4) and run `npm run art:palette` on it.

---

## M2 — Mining, building and tile visuals ✅ (2026-10-08)

### Built

- **Controls:** left mouse mines the tile under the cursor, right mouse places the selected hotbar block, **Shift** switches both to background walls. 1–0 and the mouse wheel select hotbar slots, **E** opens the inventory.
- **Data:** tiles gained `hardness`, `drop` and `mergesWith`; new item registry (`src/data/items.ts`, block items) with a starting inventory (99 planks, 50 stone) until crafting arrives in M6.
- **MiningSystem:** progress = base power × time ÷ hardness, 4 crack stages (`tileDamaged` events), resets when you release or change target; breaking emits `tileBroken` and spawns the tile's drop. Walls can only be mined where no block covers them. Reach 6 tiles.
- **BuildingSystem:** placement needs an empty, in-reach tile that touches a block or wall (or has a wall behind it), never inside the player; one item per tile; 0.1 s repeat while held.
- **Inventory** (40 slots, first 10 = hotbar) and **item drops**: drops pop out, fall with tile collision, then fly to the player when within range and are collected (`itemPickedUp`, `inventoryChanged`); despawn after 10 min.
- **UI commands:** `selectSlot`, `cycleSlot`, `swapSlots` are queued and applied at the start of the next simulation step (the UI never edits state directly).
- **Blob autotiling** (`src/sim/world/autotile.ts`): 8-neighbour masks reduced to the 47 blob shapes, merge rules (e.g. grass ↔ soil, moss ↔ stone), 3 position-hashed variations. The chunk renderer recomputes only the edited tile and its 8 neighbours, and re-uploads each touched chunk at most once per frame.
- **Background walls** rendered as a second chunk layer (darker atlas), with the foreground and wall layers sharing one chunk preload per frame.
- **Placeholder atlases:** blob shapes × 3 variations for every tile (`tiles.png`), darker walls (`walls.png`) and 4 crack stages (`cracks.png`), palette colours only.
- **Feedback:** tile cursor (dimmed out of reach), crack overlay, debris particles in the tile's colours while mining and on break, a puff on placement, a sparkle on pickup, small screen shake on break.
- **Hotbar + basic inventory panel** (DOM, Preact): icons are cut from the tile atlas with CSS; click two slots to swap. Clicks over UI panels don't reach the world.
- **`npm run shot`** adds a mine-and-build check: dig a 3×2 pit with the real mouse (all 6 drops must reach the inventory), place a 3-tile plank pillar and 3 plank walls, and confirm 6 planks were used. Plus an inventory-open screenshot.
- **Tests:** 116 (autotile masks/merges/frames, atlases, mining, building, inventory, drops, world events).

### Done-when check

| Item | Result |
|---|---|
| Digging and building feel responsive | ✅ mining time = hardness (soil 0.35 s, stone 0.9 s), cracks + debris while mining, placement repeats every 0.1 s; checked with real mouse input in the shot run. **Please try it yourself** |
| Tile edges join correctly after every edit | ✅ only edited tiles + neighbours are recomputed (tested); screenshots show seamless joins around the dug pit and the pillar |
| Mined blocks show up in the hotbar | ✅ the shot run digs 6 tiles and requires 6 soil in the inventory/hotbar |
| Performance | streaming CPU ≤ 2.2 ms worst frame, 0 late chunk loads, 60 FPS in headless Chromium |

### Decisions and deviations

- **Second Phaser 4.2.1 quirk — empty tiles in `TilemapGPULayer` are not transparent:** the shader samples atlas texel (0, 0) for empty cells instead of discarding them. With the new atlas layout, that texel belonged to the soil tile, so the whole sky turned soil-coloured. **Fix:** atlas frame 0 is reserved and fully transparent (`RESERVED_FRAMES` in `autotile.ts`); tile frames start at 1. No workaround code, only the frame layout.
- **Walls use the same items as blocks** (Shift + right click), instead of separate wall items and a hammer. Simplest scheme that keeps M6 open.
- **Drop magnet radius 112 px** (mining reach + 1 tile): with a smaller radius, blocks mined at the edge of reach stayed on the ground.
- **Mining progress tolerance:** summing `dt / hardness` drifts just under 1 (e.g. 54 × (1/60) / 0.9), which made tiles take one extra step; a 1e-9 tolerance absorbs it.
- **Item icons** are the tile's isolated autotile shape until real item art exists.
- **The basic inventory panel swaps slots by clicking**; full drag and drop, sorting, tooltips and splitting stacks are M6.

### Reviewer pass

No architecture or Phaser API problems; the frame-0 shader reasoning was confirmed independently. Fixed from the review: a Prettier failure in a test file; the crack overlay stayed over a hole after a tile broke (break now clears it, test updated); the mouse stayed disabled if the inventory panel closed under the cursor (guard released on close/unmount); screen shake could show a few pixels outside the world at its edges (now clamped after shake); a stale comment about empty GPU tiles.

### Known issues

- The placeholder blob art is plain; real terrain comes from `gen-autotiles` in M2b.
- No sounds yet (audio arrives with M5's ambient layer; the plan's "pop" on pickup is pending).

### Next step

**M2b — Art pipeline tools:** `extract-palette`, `import-art`, `gen-autotiles`, `pack-atlases` with fixture tests; manifest-driven asset loading; player rendered from parts; the `?scene=art-test` scene.

---

## M1 — World rendering and player movement ✅ (2026-10-08)

### Built

- **World data** (`src/sim/world/`): `World` holds the plan 3.1 arrays (`fg`, `bg`, `liquid`, `liquidType`, `lightR/G/B`, `gloam`, `damage` map) as flat world-sized typed arrays; `Chunk` (128×128) tracks `version` + `dirty`. All writes go through `set`/`setBg`, which bump the chunk and emit `tileChanged`. Outside the world counts as solid.
- **Test world** (`src/workers/worldgen/testWorld.ts`): 4200×1200, rolling hills, soil over stone, noise caves (~17% of the deep underground open), moss patches, lumen crystal veins, a flat cave-free clearing at the spawn. Deterministic per seed (tested); ~350 ms to generate.
- **Seeded noise** (`src/sim/random.ts`): mulberry32, 2D hash, 1D/2D value noise.
- **Input → actions** (`src/sim/input.ts`, `src/render/InputMapper.ts`, `src/data/keybindings.ts`): A/D/arrows to move, Space/W/Up to jump. Presses are latched until a simulation step consumes them; keys release on window blur.
- **Player physics** (`src/sim/physics/tileCollision.ts`, `src/sim/systems/PlayerSystem.ts`): AABB vs tiles, X then Y, substeps ≤ 8 px (no tunnelling), acceleration/friction curves, coyote time, jump buffer, variable jump height, automatic 1-tile step-up while walking. All tunables in `config.ts` (`PLAYER`, `PHYSICS`).
- **ChunkRenderer**: a pool of 6 `TilemapGPULayer`s re-pointed at chunks around the camera; chunks in view are filled immediately, off-screen preloads (512 px margin) at most one per frame.
- **CameraDirector**: frame-rate-independent smooth follow + velocity look-ahead, clamped to the world, whole-pixel scroll.
- **Player placeholder** (`PlayerRenderer`): 20×40 body + lantern dot, interpolated between simulation steps; the 16 px auto step-up is eased visually so the sprite and camera don't jump.
- **F3 debug overlay** (Preact): FPS, draw calls, CPU per frame, chunks loaded, late chunk loads, entities, tile/chunk coordinates, chunk borders; light/biome/Gloam show "—" until M3/M4/M7. `?debug=1` opens it on start.
- **Debug URL params:** added `x`, `y` (spawn tile; moved up out of terrain if needed) and `debug=1`.
- **`npm run shot`**: now also checks behaviour, not just screenshots: jump height; a 120-tile run west must preload every chunk before it enters the view (0 late loads), unload the chunks left behind, and stay within the pool. It also records frame pacing. Shots: spawn, debug overlay, a cave, after running.
- **Tests:** 71 (world, chunks, worldgen determinism/spawn/caves, collision incl. tunnelling/corners/step-up, player feel, simulation, chunk-range maths, camera maths).

### Done-when check

| Item | Result |
|---|---|
| Runs and jumps smoothly across a 4200×1200 world | ✅ in shot checks (jump rises > 2 tiles, 122-tile run west over hills) |
| Steady 60 FPS | ✅ headless run: 60.0 FPS avg, p95 frame 16.7 ms, worst 16.8 ms; 6 draw calls; our CPU work ~0.06 ms/frame avg, ~2–5 ms worst (a chunk upload). Headless uses SwiftShader, so **please confirm on your own machine with F3** |
| Chunks load/unload without visible pop-in | ✅ 0 late loads (every chunk was preloaded before entering the view), 2 unloads, ≤ 4 loaded |

### Decisions and deviations

- **Phaser 4.2.1 bug — `TilemapGPULayer` applies its position twice** (`SubmitterTilemapGPULayer.run` translates by x/y via the sprite matrix, then builds the quad from x/y again), so a layer at x = 32768 draws at 65536. Confirmed on the Intel GPU and SwiftShader. **Workaround (user-approved):** each pooled layer stays at (0, 0) inside a `Container` at the chunk origin. Correct whether or not Phaser fixes it. Worth reporting upstream.
- **Chunk layer pool instead of creating tilemaps per chunk:** `TilemapGPULayer` keeps a `Tile` object per cell and the world is wider than its 4096-tile limit, so one big layer is impossible and creating layers on the fly would hitch.
- **Renderer is `Phaser.WEBGL`** (was AUTO): `TilemapGPULayer` has no Canvas fallback.
- **Draw-call counter** wraps the WebGL context's draw methods (Phaser 4 has no built-in counter); installed only when F3 is first opened.
- **Auto step-up of 1 tile** while walking (not in the plan): without it, every 1-tile bump in the hills needs a jump. Terraria behaves the same way.
- **World generation runs synchronously** on scene start (~350 ms). It moves to a worker with a progress screen in M4, as planned.
- **Slopes and one-way platforms** (plan 3.3) are deferred until those tiles exist; collision has a marked hook for them.
- **Background walls are generated but not drawn yet** (M2), so caves show the sky colour behind them.

### Reviewer pass

No blockers; the Phaser bug analysis was independently confirmed. Fixed from the review: the original pop-in metric could never fail (visible chunks are built synchronously), so it was replaced by **late loads** (chunks that entered the view before being preloaded, i.e. a hitch) and the run check now also requires unloads; per-frame allocations removed (chunk ranges reuse objects, input loop uses arrays); pool sized to 6 with a correct comment (view + margin touches at most 2×2 chunks); `groundProbe` moved to `PHYSICS`; step-up eased visually; debug spawns no longer start inside terrain.

### Known issues

- **For M2:** every chunk upload allocates a 64 KB `Uint32Array` and recreates the GL texture inside Phaser's `generateLayerDataTexture`. Fine for loading, but mining re-uploads a whole chunk per edit; batch edits per frame (at most one upload per chunk per frame) and measure.
- Headless Chromium uses WebGL 1; the game doesn't need WebGL 2 so far.
- The sky is a flat colour until M3's sky gradient.
- Still open from M0: windowed 1080p falls back to ×1 zoom (needs a user decision).

### Next step

**M2 — Mining, building and tile visuals:** cursor with reach, mining with cracks, placement, background walls (rendered), 8-neighbour autotiling with merge rules, item drops + hotbar, particles and screen shake.


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
