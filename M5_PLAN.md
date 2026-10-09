# M5 working plan: the mystical forest look

Working file for M5; delete it when M5 is committed. Plan sections: 2.0, 2.2, 2.4, 2.5, 2.7, 3.2 step 7/9, M5.

**Done when:** standing still in the Elderglade at sunrise looks like a fantasy painting (light shafts, mist, motes, swaying grass); walking from the surface down to the Moonstone Hollows feels like passing through different places; a screenshot of each biome is easy to tell apart.

## Constraints

- **No real art exists yet** (manifest empty). Everything gets a code-drawn placeholder that approved art replaces by id (`SPRITE_ASSETS` / tiles). Never depend on a specific asset.
- **No audio files.** Ambience and music start as procedural Web Audio, behind an interface that can play approved audio files later.
- Budgets: < 100 draw calls, 60 FPS, light update ≤ 4 ms. The Low quality setting turns off the expensive passes.
- Rules: sim never imports Phaser; content in `src/data/`; no magic numbers in systems.

## Design decisions

1. **New tile properties** (`src/data/tiles.ts`):
   - `platform`: one-way (branches). Stand on the top edge, jump up through it, drop through with Down.
   - `blocksSun`: leaves stop straight-down sunlight (the skyline) without being solid.
   - `lightFalloff`: overrides air/solid falloff per tile (leaves let some light through sideways).
   - `decor`: non-solid flora/decoration drawn by the foliage renderer, not the tilemap. Fields: sprite frame, anchor, sway, and support (`ground` | `ceiling` | `wall`). Losing its support removes it, and it drops its item.
2. **Skyline** becomes "first sun-blocking tile" (solid or `blocksSun`). Debug surface spawns use the first *solid* tile.
3. **Weather and wind live in the sim** as a pure function of (seed, elapsed). That makes them deterministic with nothing extra to save. Lightning strikes emit a `lightning` event and briefly boost sunlight in the light grid.
4. **Bioluminescence:** lights get an optional `pulse` (period, depth), with a per-tile phase from a hash, like the flicker. Touching a glowing decor brightens it for a few seconds (a sim map with decay).
5. **Giant trees** are worldgen step 7 structures, driven by data in `src/data/trees.ts`:
   - trunk: living-wood background walls with solid bark edges at the base;
   - branches: platform tiles with leaf clumps at the ends;
   - canopy: a leaf blob with gaps, where the light shafts fall;
   - roots: solid root tiles in the ground, a few arching above it.
   - One giant tree stands just outside the starting glade.
6. **Flora:** step 9 places surface and cave decor per biome or layer from `src/data/flora.ts`. Small rune ruins (ancient stone + emissive rune tiles) appear now and then.
7. **Render placement:**
   - Parallax (4 layers per surface biome) and back mist: **SkyScene**, unaffected by the light map, tinted by the time of day, blended at biome borders, faded out underground.
   - Foliage: **Game scene**, a `SpriteGPULayer` per chunk with GPU sway, between the tiles and the entities.
   - Light shafts, glowing particles (motes, fireflies, spores, embers) and starfall: **GlowScene** (additive on the opaque canvas).
   - Non-glowing particles (rain, leaves, petals): Game scene, so the light map darkens them.
   - Front mist and foreground canopy: a new **FrontScene** after GlowScene.
   - Colour grade, underwater and heat haze: camera filters, blended over ~2 s.
8. **Visual data per biome** lives in `src/data/biomeVisuals.ts`, keyed by surface biome / depth layer key: parallax, mist, motes, grade, ambient particles, ambience and music.

## Tasks (in order; ✅ when done)

- [x] **A1** ✅ Tile properties: platforms, blocksSun, lightFalloff, decor + support rule; skyline; light worker per-tile falloff; tests (collision: platforms, drop-through; support; skyline; light).
- [x] **A2** ✅ WeatherSystem + wind + lightning (sim, data `src/data/weather.ts`); tests.
- [x] **A3** ✅ Light pulse + touch brighten (sim); tests.
- [ ] **B1** Giant trees in worldgen (data `trees.ts`); tests (deterministic, spawn clear, canopy blocks sun, branches walkable).
- [ ] **B2** Flora + rune ruins in worldgen (data `flora.ts`); tests.
- [x] **C1** ✅ Placeholder art: new tiles, decor sprite sheets, small trees, parallax layers, foreground canopy, light-shaft texture.
- [ ] **D1** Parallax + back mist (SkyScene).
- [ ] **D2** FoliageRenderer (SpriteGPULayer, sway with wind, bend near player, falling leaves).
- [ ] **D3** Light shafts + motes (GlowScene).
- [ ] **D4** Ambient particles + weather visuals (rain, petals, spores, embers, fireflies, starfall, lightning flash).
- [ ] **D5** FrontScene: front mist + foreground canopy.
- [ ] **D6** Colour grade per biome, underwater, heat haze, vignette.
- [ ] **D7** Reflective pools + waterfalls.
- [ ] **D8** Audio: procedural ambience + music per biome, crossfades, unlock on first click.
- [ ] **D9** Quality settings + performance pass.
- [ ] **E** Shots (sunrise Elderglade, each biome, descent, weather), reviewer, PROGRESS.md, commit.
