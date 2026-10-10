# Gloamdeep

**A 2D fantasy sandbox for the browser, set in a mystical forest where light is life.**

The Heartlight of the World Tree is fading, and a living darkness, the Gloam, is climbing its roots. You are the last Lamplighter. Gather and build, light the forest, go down through the depths, and rekindle the Heartlight at the bottom of the world.

**▶ Play in the browser: https://zahy294.github.io/GloomDeep/**

![Title screen](docs/screenshots/title.png)

Single-player · finite procedurally generated world · 16 px pixel art · saves in your browser. The current art is placeholder pixel art generated from code; final art is still to come.

---

## What makes it different

- **Light is gameplay.** A light grid is computed in a Web Worker, 30 times a second, and every system reads it:
  - **The Gloam** creeps through darkness and burns away in light.
  - **Shades** spawn only in the dark and dissolve in bright light.
  - **Plants** open and grow by it.
  - **Towns** feel safe, or not, by how well lit their streets are.
- **The Lantern and its lenses:**
  - Amber heals.
  - Azure reveals hidden ore and passages.
  - Crimson burns shades and the Gloam.
  - Verdant makes plants grow.
- **Matter behaves.** Water and lava flow, and water on lava makes obsidian. Fire spreads through wood and grass. Silt and gravel fall.
- **A living world.** Critters react to you, wisps lead you to secrets, and townsfolk keep daily routines. There are four kinds of quests, trade, caravans on roads you light, and festivals.
- **Dimming nights.** Every few days the sun dims further, auroras fill the sky, the Gloam spreads faster, and shades attack in waves.
- **Four bosses built around light.** Each one breaks a ward deeper into the world.

## Screenshots

### Starting out

| | |
|---|---|
| ![Loading](docs/screenshots/loading.png) | ![World generation](docs/screenshots/world-generation.png) |
| Loading the game | Generating a large world |
| ![Elderglade](docs/screenshots/elderglade.png) | ![Your village](docs/screenshots/village.png) |
| The Elderglade, where you start | Your village: folk move into lit homes |

### The forest and the depths

| | |
|---|---|
| ![Moonpetal Vale at night](docs/screenshots/moonpetal-vale-night.png) | ![Weeping Mire](docs/screenshots/weeping-mire.png) |
| Moonpetal Vale at night | The Weeping Mire |
| ![Glowcap Grottos](docs/screenshots/glowcap-grottos.png) | ![Rootdeep](docs/screenshots/rootdeep.png) |
| Glowcap Grottos | Rootdeep |
| ![Moonstone Hollows](docs/screenshots/moonstone-hollows.png) | ![Ember Roots](docs/screenshots/ember-roots.png) |
| Moonstone Hollows | Ember Roots |
| ![A ward](docs/screenshots/ward.png) | ![Dimming night](docs/screenshots/dimming-night.png) |
| A ward: it breaks only when its boss falls | A Dimming night: auroras, and shades in waves |

### Towns and landmarks

| | |
|---|---|
| ![Canopyhold](docs/screenshots/canopyhold.png) | ![Festival](docs/screenshots/canopyhold-festival.png) |
| Canopyhold, the trading town in the branches | A festival after a boss falls |
| ![Trade road](docs/screenshots/trade-road-caravan.png) | ![Rootdeep Citadel](docs/screenshots/rootdeep-citadel.png) |
| Light the road and the caravans roll | The Rootdeep Citadel: relight its beacons to bring its people home |

### The bosses

| | |
|---|---|
| ![Moth Matriarch intro](docs/screenshots/boss-moth-matriarch-intro.png) | ![Moth Matriarch](docs/screenshots/boss-moth-matriarch.png) |
| **The Moth Matriarch** appears | She hunts by light: put your lantern out, and bait her with lures |
| ![Mire Sovereign](docs/screenshots/boss-mire-sovereign.png) | ![Hollow Warden](docs/screenshots/boss-hollow-warden.png) |
| **The Mire Sovereign** floods its pool: drain it and keep the braziers lit | **The Hollow Warden**: bounce your lantern beam off the prisms to crack its shell |
| ![Gloam Heart](docs/screenshots/boss-gloam-heart.png) | ![The Heartlight](docs/screenshots/heartlight.png) |
| **The Gloam Heart**: relight its root-lamps one by one | The Heartlight burns again |

### Extras

| | |
|---|---|
| ![Photo mode](docs/screenshots/photo-mode.png) | ![Guide](docs/screenshots/guide.png) |
| Photo mode: free camera, time of day, filters, save PNG | The in-game guide (H) |

## How to play

Press **H** in game for the full guide. In short:

- Chop trees, mine and craft better tools.
- Build lit homes so villagers move in.
- Keep your lantern fuelled with Lumen.
- Push the Gloam back with light.
- Follow the Journal (**J**) down to each boss.

| Key | Does |
|---|---|
| A / D, W / Space | Walk, jump |
| S | Drop through a platform; swim down |
| Left click | Mine, chop, attack |
| Right click | Place; talk, open doors, refuel lamps, pull levers, turn prisms |
| Shift + click | Mine or place back walls |
| 1–0 / mouse wheel | Hotbar |
| F | Lantern on/off |
| Q | Switch lens |
| E | Inventory and crafting |
| J | Journal (quests and the way down) |
| H | Guide |
| P | Photo mode |
| Esc | Close a panel / pause |

Every key can be rebound in **Settings** (title screen or pause menu), along with the quality, display scale and volume.

## Running it locally

Requires Node.js 22+.

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # production build into dist/
npm test             # Vitest (the simulation runs without a browser)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint + Prettier
npm run shot         # Playwright screenshots of the built game → screenshots/
npm run shots:readme # refresh the screenshots in this README → docs/screenshots/
npm run perf         # draw calls, light-update time and CPU in heavy scenes
npm run bench:light  # the light job with up to ~1,200 torches
```

### Debug URL parameters

They make starts repeatable, for example:

- `?scene=game&seed=42&time=dusk&ui=0`: a fresh debug world (never saved), with the UI hidden.
- `?scene=game&biome=moonstone_hollows`, or `&spot=canopyhold`, `citadel`, `village`, `cave` or `ward`.
- `?scene=game&boss=moth_matriarch&kit=boss`: start inside a boss's arena. Add `&bossphase=1` to skip ahead.
- `?scene=game&dimming=1`: a Dimming night now.
- `?scene=game&beaten=moth_matriarch,mire_sovereign`: bosses already beaten.

F3 shows the debug overlay (FPS, draw calls, light values, the Gloam level).

### Deploying

- `npm run deploy:pages` builds and publishes `dist/` to the `gh-pages` branch (GitHub Pages).
- `npm run package:itch` writes `release/gloamdeep-html5.zip` for itch.io.

## How it's built

| | |
|---|---|
| Engine | [Phaser 4](https://phaser.io) |
| Language | TypeScript (strict) |
| Build | Vite |
| UI overlay | Preact |
| Saving | IndexedDB (via `idb`), gzip-compressed |
| Tests | Vitest (unit and simulation), Playwright (screenshots) |
| Maps | Towns and boss arenas are [Tiled](https://www.mapeditor.org) maps |

**Design rules the code follows:**
- **The simulation is plain TypeScript.** `src/sim/` never imports Phaser, and it runs headless in tests.
- **It talks to rendering, audio and UI only through typed events.** The UI sends commands; it never changes game state directly.
- **Content is data.** Tiles, items, recipes, creatures, biomes, lights, dialogue, quests, bosses and prefabs live in `src/data/`.
- **Lighting and world generation run in Web Workers.** The same seed always gives the same world.

```
src/
  sim/        the simulation: world, physics, systems (lighting, Gloam, towns, bosses, …)
  workers/    light flood fill and world generation (Web Workers)
  render/     Phaser scenes and renderers
  ui/         Preact overlay (HUD, inventory, journal, settings, photo mode, …)
  data/       content: tiles, items, recipes, creatures, biomes, bosses, dialogue, prefabs
  audio/      procedural Web Audio music and sound
tools/        screenshots, benchmarks, art pipeline, prefab and deploy scripts
tests/        Vitest suites mirroring src/
```

The design document is [GLOAMDEEP_PLAN.md](GLOAMDEEP_PLAN.md), and the build log, milestone by milestone, is [PROGRESS.md](PROGRESS.md).

## Credits

Design and development: **zahy294**, built with Claude (Anthropic).
Made with Phaser 4, TypeScript, Vite, Preact and idb. Sound is procedural Web Audio.
