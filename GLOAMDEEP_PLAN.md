# GLOAMDEEP — Implementation Plan

> A 2D fantasy sandbox game for the browser, set in an ancient, mystical forest where **light is life**.
> Engine: **Phaser 4 (v4.2.x) + TypeScript + Vite**. Single-player. Finite world. 16px pixel art.

This file is the source of truth for building the game. Claude Code: read **Section 0** first, then work milestone by milestone (Section 9).

---

## 0. Instructions for Claude Code

1. **Phaser 4 only.** Most Phaser code online (and in your training data) is v3. Before using any Phaser API, check the official skill files that ship with the package: `node_modules/phaser/skills/` (especially `v4-new-features`, `v3-to-v4-migration`, `tilemaps`, `filters-and-postfx`, `game-object-components`). If something here contradicts those files, follow the files and note the difference in `PROGRESS.md`.
   - **Do not use (removed in v4):** `setPipeline`, pipelines, `preFX` / `postFX`, `BitmapMask`, WebGL `GeometryMask`, `Mesh`, `Plane`, `Phaser.Geom.Point`.
   - **Use instead:** `setLighting(true)`, `enableFilters()` + `filters.internal` / `filters.external`, filter masks, `Vector2`.
2. **Work one milestone at a time.** A milestone is done only when every "Done when" item passes, `npm run build` succeeds, and `npm test` passes.
3. **Keep the simulation free of Phaser.** Nothing in `src/sim/` may import Phaser. The simulation must run in Vitest without a browser.
4. **Make content data, not code.** Tiles, items, recipes, enemies, biomes and lights are entries in `src/data/`. Adding a new block should never need new engine code.
5. **Log progress** in `PROGRESS.md`: what was built, any deviations from this plan, known issues, and the next step.
6. **`CLAUDE.md` and `.claude/agents/` are provided** with this plan. Follow them every session, including the subagent delegation rules. Update `CLAUDE.md` only when a convention changes, and log why.
7. If a design decision isn't covered here, pick the simplest option that keeps future milestones possible, and log it.

---

## 1. The game

### 1.1 Premise

The ancient forest of **Vael** grew around **the Heartwood**, a World Tree whose roots run all the way to the bottom of the world. Its glow, **the Heartlight**, fed every living thing: glowing mushrooms, night-blooming flowers, the wisps that drift between the trees. Now that glow is fading. From deep underground, a living darkness called **the Gloam** is climbing the roots and spreading into every place light doesn't reach.

You are the last **Lamplighter**, a keeper of the forest. You carry a lantern that burns **Lumen**, the forest's stored light. Follow the World Tree's roots downward through layers of forest, grotto and ruin, push back the Gloam, rebuild a lit village in the forest, and rekindle the Heartlight at the deepest root.

### 1.2 Design pillars

| Pillar | What it means in practice |
|---|---|
| **Light is life** | Light is a gameplay system, not just decoration. It decides where enemies spawn, where the Gloam spreads, how plants grow, and what you can see. |
| **The world is alive** | Plants react to you and to light. Critters scatter. The Gloam spreads. Weather changes the world. |
| **Matter behaves** | Silt and gravel fall, water flows, lava cools into obsidian, fire spreads through wood and grass. |
| **The forest is enchanted** | Everything magical glows, drifts or hums: motes in the air, pulsing mushrooms, runes that wake as you approach. |
| **Every action has feel** | Every dig, hit and landing gives feedback: particles, sound, screen shake, hit-stop. |

### 1.3 Core loop

```
Explore (darkness, caves) → Mine (ores, Lumen crystals) → Craft (tools, lenses, light sources)
   ↑                                                                              ↓
Progress (bosses unlock depths) ← Fight (shades, bosses) ← Build & light (beacons, homes)
```

### 1.4 What makes it different from Terraria

1. **The Lantern and its lenses.** The lantern is your main tool. It uses Lumen, and lenses change the color of its light and what that light does:
   - **Amber:** warm and safe. Slowly heals you and calms the area.
   - **Azure:** "true sight". Shows hidden ores, secret passages and invisible platforms.
   - **Crimson:** burns. Damages Gloam creatures in its cone and makes shades flee.
   - **Verdant:** growth. Plants and crops in the light grow faster, and glowmoss spreads.
   Switch lenses with `Q` or the mouse wheel. Lumen drains faster with stronger lenses.
2. **The Gloam spreads through darkness.** It slowly creeps across tiles whose light level is below a threshold, turning them into Gloam-veined versions that spawn shades. Placing light (torches, beacons, glowing plants) stops it and gradually cleanses it. **The lighting system is gameplay data.**
3. **Shades only exist in darkness.** They take damage in bright light and dissolve into particles. Light is both your defense and your weapon.
4. **Beacons.** Large structures you craft. Each one makes a permanent safe radius, works as a fast-travel point, and lets NPCs move into lit homes nearby.
5. **Dimming nights.** Every few in-game days the sun dims further. The sky goes dark, auroras appear, the Gloam spreads faster, and waves of shades attack. Surviving them moves the story forward.
6. **Bosses built around light:**
   - **The Moth Matriarch** (Glowcap Grottos) is drawn to light. Turn off your lantern to make her lose track of you, and use lures to bait her.
   - **The Mire Sovereign** (Weeping Mire) floods the arena with dark water. Manage the water level and keep your light above it.
   - **The Hollow Warden** (Moonstone Hollows) reflects your lantern beam off crystals. Aim the reflections back at it.
   - **The Gloam Heart** (wrapped around the World Tree's deepest root) is the final fight, where you light up its arena piece by piece until the Heartlight reignites.
7. **Photo Mode.** Pause, hide the UI, move the camera freely, change the time of day and filters, and save a PNG. Built for a game that focuses on visuals.

### 1.5 Interactivity: the world reacts to you

- **Grass and foliage** sway in the wind and bend when you walk through them.
- **Shy vines** pull back when you come close.
- **Lumen blooms** open in light and close in the dark. Harvest them while they're open.
- **Fireflies** drift in clusters at dusk. Catch them in jars to make light sources you can place.
- **Bats** scatter from cave ceilings when you shine light at them.
- **Fish** swim in water and flee from you.
- **Footsteps** throw up dust or splashes depending on the tile type.
- **Tiles crack** in stages as you mine them, and broken tiles drop debris particles in their own color.
- **NPCs** wander, react to the time of day, and get scared during Dimming nights if their home isn't lit.
- **Wind** is a single global value that affects rain angle, particles, foliage sway and clouds.
- **Wisps** (small spirits of light) drift toward secrets and points of interest. Follow one and it may lead you to a hidden shrine.
- **Glowcap mushrooms** brighten and release a puff of glowing spores when you touch or jump on them. Big ones work as bouncy platforms.
- **Runes** carved into ruins light up one by one as you walk past, and fade after you leave.
- **Fairy rings** (circles of small mushrooms) give a short buff at night if you stand inside them.
- **Hitting a tree** shakes its leaves loose; they fall and drift with the wind.

### 1.6 Biomes (from the surface down)

| Depth | Biome | Visual identity | Signature resources and features |
|---|---|---|---|
| Surface (center) | **Elderglade** | Giant ancient trees several screens tall, golden light shafts through the canopy, floating motes | Elderwood, fiber, fireflies, the first village |
| Surface (side) | **Moonpetal Vale** | Silver-blue meadows, flowers that glow and open at night, soft mist | Moonpetals (Lumen at night), silverbark |
| Surface (side) | **Weeping Mire** | Willow curtains, thick fog, still reflective pools, will-o'-wisps | Mud, reeds, peat (fuel), the Mire Sovereign |
| Shallow | **Glowcap Grottos** | Giant bioluminescent mushrooms, teal and rose glow, drifting spores | Glowcaps, Lumen blooms, the Moth Matriarch |
| Mid | **Rootdeep** | The World Tree's huge roots, overgrown ruins with glowing runes, underground waterfalls | Rootwood, runestone, hidden shrines (Azure lens) |
| Mid-deep | **Moonstone Hollows** | Pale crystals humming with cold light, prismatic reflections | Lumen crystals, moonsilver, the Hollow Warden |
| Deep | **Ember Roots** | Roots smoldering above lava rivers, embers, heat haze | Obsidian, metal ores, fire hazards |
| Bottom | **The Gloam Heart** | Ink-black violet, pulsing veins choking the World Tree's taproot | Final area and final boss |

### 1.7 Settlements and folk

The Gloam has cut the surviving forest folk off from each other. Each settlement is either holding on or already lost. **A town's light level is its health:** it decides how its NPCs feel, how good its trades are, and whether it's safe on Dimming nights.

| Settlement | Where | Look | Role | Phase |
|---|---|---|---|---|
| **Your village** | Elderglade (surface) | Starts as a campfire, grows into a lantern-lit village | Your base. NPCs move in as you build lit homes | Main |
| **Canopyhold** | Branches of a giant tree | Rope bridges, lift baskets, lanterns among the leaves, light shafts | Main trading town, story hub, the Old Dryad lives nearby | Main |
| **Rootdeep Citadel** | Rootdeep | A huge ancient city carved into the World Tree's roots | **Lost to the Gloam.** A dungeon: relight its beacons district by district and its people return | Main |
| **Sporehaven** | Glowcap Grottos | Homes carved into giant glowing mushrooms | Alchemy, potions, glowcap farming | Later |
| **Mirewatch** | Weeping Mire | Stilt village above the water, foggy boardwalks | Fishing, boats; half-flooded, threatened by the Mire Sovereign | Later |

**Town life:**

- **Routines:** NPCs follow a daily schedule (shop by day, inn and home at night) and act scared during Dimming nights if the town is poorly lit.
- **Dialogue** changes with story flags and with how much of the forest has been cleansed.
- **Quests (four types only):** deliver an item, escort someone through the dark, light a route, find something or someone (wisps help). Rewards: items, lenses, recipes, new NPCs.
- **Lit trade roads:** once you light a road between two towns, caravan NPCs travel it and trade prices improve.
- **Street lamps** in towns slowly dim and can be refueled; a dark street invites shades.
- **Festivals** after each boss: lantern release into the sky, music, fireworks, special stalls for one in-game night.
- **Ambient townsfolk:** wandering villagers, children chasing fireflies, background chatter.

**Technical approach:**

- Town layouts are drawn by hand in **Tiled** and stored as prefabs (`src/data/prefabs/`). World generation stamps them into the world and marks their area as protected (no caves, no Gloam spread inside a lit town).
- Each prefab includes a **waypoint graph** (doors, stairs, bridges, lifts) placed in Tiled. NPCs move between waypoints rather than using general tile pathfinding. Outside towns, NPCs only travel along lit roads (caravans) or follow the player (escorts).
- Town state (light level, reclaimed districts, residents, quest progress) is saved with the world.

---

## 2. Visual direction (top priority)

### 2.0 Visual identity: a mystical fantasy forest

**Mood:** ancient, enchanted, quiet and a little melancholic. The forest should feel old and alive at the same time: huge trees, light falling through leaves, magic glowing softly in the dark. The darkness (the Gloam) feels like ink spreading into a painting.

**Mood references (for feel, not for copying):** the soft glow and layered depth of *Ori and the Blind Forest*, the quiet ruins of *Hollow Knight*, Studio Ghibli forests (*Princess Mononoke*'s kodama woods), and the readable tile world of *Terraria*.

**Signature visuals.** These are what make Gloamdeep look like Gloamdeep. Each one must be in the game:

| Element | What the player sees | How to build it |
|---|---|---|
| **Giant ancient trees** | Trunks several screens tall, branches you can walk on, roots that break through the ground | Built by world generation as structures: trunk as background walls, branches as platforms, a canopy that blocks the sky |
| **Canopy light shafts** | Golden beams falling through gaps in the leaves, with dust sparkling inside them | Additive gradient sprites placed under canopy gaps (found when a chunk loads), angled by the sun, brightness tied to time of day, gentle sway; motes emitted inside each shaft |
| **Foreground canopy** | Dark leaf and branch silhouettes passing in front of the camera | A foreground parallax layer moving faster than the world, dark and slightly blurred |
| **Layered mist** | Mist pooling in valleys, over water and between tree layers | 2–3 `NoiseSimplex2D` layers at different depths, scrolling with wind, low alpha, thicker at dawn and in the Mire |
| **Floating motes** | Tiny glowing specks drifting everywhere | Ambient particle emitter around the camera; color and density set by biome |
| **Bioluminescence** | Mushrooms, moss and flowers glowing and slowly pulsing | Emissive tiles/decorations that add light to the light grid; a sine-wave pulse with a random offset per object; brighten when touched |
| **Glowing runes** | Carved symbols on ruins lighting up as you approach | Emissive overlay tiles whose brightness follows distance to the player |
| **Wisps** | Small spirits of light drifting and trailing sparkles | Entities with a light emitter, a particle trail and wandering AI |
| **Falling leaves and petals** | Leaves drifting down with the wind; petals in Moonpetal Vale | Particle emitters near tree canopies, driven by global wind |
| **Reflective water** | Still pools mirroring the forest; waterfalls with spray | `CaptureFrame` of the scene above the water, flipped and drawn into the pool with a displacement filter for ripples; waterfall tiles + spray particles |
| **Night magic** | Silver moonlight, glowing flowers, falling stars | Night color grade, Moonpetal blooms opening, occasional star streaks across the sky |

### 2.1 Art rules

- **Tile size:** 16×16 px. Player and humanoid NPCs about 20×40 px. Full style rules in 2.9.1.
- **Internal resolution:** **960×540**, scaled ×2 to 1920×1080 (about 60×34 tiles visible). Smaller screens use ×1 or the nearest whole-number scale that fits. Use `pixelArt: true` and `roundPixels: true`. Scale with letterboxing, never with stretching.
- **Palette:** one master palette of about 64 colors with hue-shifted ramps, stored in `src/data/palette.ts` and used by the placeholder art generator:
  - **Forest base:** deep teal and emerald shadows, moss and leaf greens, warm brown bark.
  - **Sunlight:** soft gold and honey tones.
  - **Magic:** cyan, mint, soft rose and moon-silver. Everything magical uses these.
  - **The Gloam:** ink black and desaturated violet. No other part of the world uses this, so it always reads as a threat.
- **Color contrast:** warm gold light against cool teal shadow. Magic glows in cool, clean colors; corruption is dull and drains color from what it touches.
- **Depth:** objects farther back are lighter, bluer and less saturated (atmospheric perspective). The playable layer has the most contrast.
- **Readability:** in full darkness, the player, enemy eyes, dropped items and interactable objects still glow faintly (emissive pixels). The player should never feel blind.

### 2.2 Render layers (back to front)

| # | Layer | Implementation |
|---|---|---|
| 1 | Sky | Phaser `Gradient` object driven by time of day + stars + sun and moon sprites |
| 2 | Aurora (Dimming nights) | `NoiseSimplex2D` object with a gradient-map filter, blended additively |
| 3 | Far parallax (4–5 layers per biome) | `TileSprite` layers of distant tree silhouettes, each lighter and bluer than the one in front |
| 4 | Back mist | `NoiseSimplex2D`, low alpha, between parallax layers |
| 5 | Background walls | Tilemap chunk layers, darker tinted (includes giant tree trunks) |
| 6 | Background decorations | `SpriteGPULayer` (vines, roots, hanging moss, crystals) |
| 7 | Light shafts | Additive gradient sprites under canopy gaps |
| 8 | Foreground tiles | `TilemapGPULayer` per chunk |
| 9 | Foliage and decorations | `SpriteGPULayer` with wave animation for sway |
| 10 | Entities | Sprites (player, NPCs, enemies, wisps, items, projectiles) |
| 11 | Liquids | A separate tile layer + surface waves + reflections |
| 12 | Particles | Motes, leaves, spores, sparks, debris |
| 13 | **Light map** | Low-resolution light texture, upscaled with smoothing, multiply blend |
| 14 | **Glow pass** | Bright and emissive objects, additive blend, with bloom/glow |
| 15 | Front mist | Thin mist layer in front of the world, lowest alpha |
| 16 | Foreground canopy | Dark leaf silhouettes, faster parallax, slightly blurred |
| 17 | Camera filters | Color grading, vignette, heat haze, Gloam distortion |
| 18 | UI | HTML/DOM overlay above the canvas |

### 2.3 Lighting (the core of the visuals)

**Light grid (simulation side):**

- Each tile stores light as three channels (R, G, B), each 0–15 or 0–255.
- **Sunlight:** goes straight down from the sky through empty tiles and background walls, then spreads sideways. Its strength depends on the time of day and how dim the sun is.
- **Light sources:** torches, Lumen crystals, glowmoss, lava, the player's lantern, glowing projectiles. They are defined in `src/data/lights.ts` (color, radius, flicker).
- **Spread:** breadth-first flood fill. Each tile reduces light by an amount set by its material (air reduces a little, solid tiles a lot, water reduces red/green more than blue so underwater looks blue).
- **When it updates:** only in the region around the screen (plus a margin), and only when something changed (a tile edit, a moving light, time of day). It runs in a **Web Worker** using typed arrays sent back and forth (transferables).
- **Gameplay reads the same grid:** Gloam spread, shade spawning and damage, plant growth and NPC comfort all use these values.

**Light map (render side):**

- The worker returns a small RGBA buffer with one pixel per visible tile, which is uploaded to a texture each time it changes.
- The texture uses **LINEAR** filtering (the rest of the game is NEAREST). Scaled up to world size, this gives soft gradients between tiles.
- It's drawn over the world with a **MULTIPLY** blend.
- **Flicker:** fire-based light sources have small random variation in intensity, smoothed over time.
- **Lantern cone:** the lantern adds a cone of light in the direction of the mouse. Its color comes from the active lens. Use Phaser point lights for nearby highlights on lit sprites (`setLighting(true)`), so the player and enemies get rim lighting.

**Glow and bloom:**

- Emissive things (torch flames, crystals, lava, eyes, Lumen) are drawn a second time on a glow layer with an additive blend and a Glow or blur filter. This gives the soft halo.
- On Low quality, skip this pass.

### 2.4 Sky, time and weather

- **Day cycle:** about 20 real minutes. Keyframes for sky colors, sun angle, light strength and camera color grade, interpolated smoothly.
- **Weather:** soft rain (angled by wind, drips from leaves, splashes on tiles), morning mist (thick at dawn, burning off by midday), pollen and petal drifts in Moonpetal Vale, dense fog with will-o'-wisps in the Weeping Mire, embers in the Ember Roots, starfall on clear nights.
- **Lightning:** a full-screen flash, then a delayed thunder sound, and the light map briefly brightens.
- **Dimming night:** the sky turns purple-black, an aurora appears, colors desaturate, a slow pulsing vignette is added, and the Gloam's veins pulse.

### 2.5 Color grading per biome

The camera uses a color-matrix or gradient-map filter. Each biome defines a grade (tint, saturation, contrast). When the player crosses a biome boundary, the grade blends to the new one over about 2 seconds. Underwater adds a teal tint plus a gentle displacement wobble. The Ember Roots add heat haze (displacement with scrolling noise). Suggested grades: Elderglade warm gold and green; Moonpetal Vale cool silver-blue; Weeping Mire muted green-grey; Glowcap Grottos deep teal with rose highlights; Rootdeep mossy and dim; Moonstone Hollows pale cyan; Ember Roots orange and smoky; Gloam Heart nearly colorless except the violet.

### 2.6 Tiles

- **Autotiling:** use 8-neighbor bitmask "blob" tiling (47 variants per material), with merge rules (e.g. grass blends into dirt).
- **Variants:** 3 random variants per tile shape. Choose one from a hash of the tile position, so the same tile always looks the same.
- **Crack overlay:** 4 crack stages drawn over a tile while it's being mined.
- **Background walls** use the same tiles, drawn darker and desaturated.
- **One tileset per GPU layer:** `TilemapGPULayer` supports only one tileset image, so every material goes into **one atlas** built from the data files.

### 2.7 Liquids

- Water and lava use semi-transparent tiles. The level in each tile (0–255) sets how full the tile is drawn.
- **Surface:** a wave effect on the top tile of a liquid body, plus bubbles and splashes when something enters.
- **Light:** water lets blue light through; lava gives off strong orange light.
- **Lava + water → obsidian**, with a burst of steam particles and a hiss.
- **Still pools** reflect the scene above them (see 2.0). **Waterfalls** are animated tiles with spray particles and mist where they land.

### 2.8 Particles and game feel

| Event | Feedback |
|---|---|
| Mining a tile | Particles in the tile's color, crack stages, small screen shake on break |
| Landing | Dust puff, squash animation on the player |
| Hit | Hit-stop (~60 ms freeze), flash, knockback, damage number |
| Shade dying | Dissolves into purple wisps that drift up |
| Picking up an item | Item flies to the player, small pop sound |
| Placing light | A ring of light expands outward, nearby Gloam visibly shrinks back |
| Dimming night starts | Low rumble, screen darkens slowly, aurora fades in |

**Camera:** follows the player smoothly, looks ahead in the direction of movement, and supports screen shake with falloff and slight zoom on boss intros.

### 2.9 Art pipeline

Claude Code builds all the visual technology (lighting, filters, particles, autotiling). The art images come from an **AI-assisted pipeline**: images generated with Nano Banana (Gemini), cleaned up by scripts in this repo, touched up by hand, and approved by the user.

#### 2.9.1 Target style

Chunky, readable fantasy pixel art in the tradition of classic 2D sandbox games:

- 16×16 px tiles; player and humanoid NPCs about 20×40 px.
- **Dark colored outlines** (1 px, a dark shade of the object's own color, not pure black).
- **Flat shading:** 2–3 tones per material, light from the top-left. No gradients or soft blending inside sprites; the engine adds lighting.
- **Saturated fantasy colors** from the master palette; strong, simple silhouettes.
- No anti-aliasing. Every pixel is a deliberate color.

#### 2.9.2 What comes from where

| Asset | Source | Notes |
|---|---|---|
| Parallax backgrounds | Nano Banana | Best results. Must tile horizontally. |
| Trees, giant tree parts, foliage, mushrooms, crystals, flowers | Nano Banana | Generate several variants per type. |
| Items, weapons, tools, furniture, icons | Nano Banana | Generate as sheets on a grid, then slice. |
| Simple enemies (slimes, bats, wisps) | Nano Banana | 1–4 frames; most motion comes from code (squash, bob, flap). |
| Terrain tiles | Nano Banana **base texture** + `gen-autotiles` script | Generate one seamless texture per material; the script builds all 47 edge variants. Never generate each variant. |
| Player and NPCs | Nano Banana design → **split into parts** | Animated in code from parts (see 2.9.6). |
| Bosses | Nano Banana design → parts | Segments, wings, limbs animated in code, plus a few frames. |
| Particles, light shafts, mist, gradients | Code | No images needed. |
| Placeholders | `gen-placeholder-art` | Used for anything not yet approved, so the game always runs. |
| UI panels and icons | Nano Banana or hand-made | 9-slice panels drawn by hand are often faster. |

#### 2.9.3 Folder layout and manifest

```
art/
├─ reference/      # approved style-reference images + palette.png
├─ prompts/        # prompt templates per asset type (Markdown)
├─ raw/<category>/ # untouched AI output, dropped here by the user
├─ clean/          # output of the import tool (true pixel size, palette-matched)
└─ manifest.json   # one entry per asset
assets/            # final packed atlases used by the game
```

Each `manifest.json` entry: `id`, `category`, `raw` file, `targetSize` (or frame grid), `anchor` (e.g. bottom-center for trees and characters), `source` (nano-banana / hand / procedural / pack + license), `prompt` (which template + specifics) and `status` (`raw` → `cleaned` → `approved`). **The game only loads approved assets; anything else falls back to its placeholder.**

#### 2.9.4 Style reference first

1. Generate a small **style-reference scene** (a forest clearing with a tree, ground tiles, a mushroom and a small character) using the base prompt below.
2. The user picks the best result and saves it to `art/reference/style-reference.png`.
3. Extract its colors into the master palette (`tools/extract-palette.ts` suggests a 64-color palette with ramps; the user adjusts it).
4. **Attach the style reference to every later prompt.** This is what keeps assets consistent with each other.

#### 2.9.5 Prompt templates

Stored in `art/prompts/` so every asset can be regenerated the same way. Never name existing games in prompts, and never upload screenshots of other games as references; describe the style in words.

**Base (append to every prompt):**
> Pixel art game asset for a 2D side-view fantasy sandbox game. Chunky pixels, dark colored 1-pixel outlines, flat 2–3 tone shading lit from the top-left, saturated mystical-forest colors, no anti-aliasing, no gradients, no text, no shadows on the ground. Match the style and colors of the attached reference image exactly.

| Asset type | Template (+ base) |
|---|---|
| Single object | "A single [glowing teal mushroom, about 2 tiles tall], centered, side view, on a solid flat #FF00FF magenta background with nothing else." |
| Object sheet | "A sprite sheet of [8 different forest flowers], arranged in a 4×2 grid with equal spacing, each item separate, on a solid flat #FF00FF magenta background." |
| Tree | "A single [ancient pink-blossom tree with a thick twisted trunk], full tree from roots to crown, side view, on a solid flat #FF00FF magenta background." |
| Tile texture | "A seamless, tileable square texture of [mossy forest soil with small stones and roots], viewed from the side as underground terrain, fills the whole image edge to edge." |
| Parallax layer | "A wide horizontal background layer of [distant misty blue pine forest silhouettes], seamless and tileable left to right, [far / mid / near] layer, [lighter and bluer for far layers], fills the full width, [transparent sky area as solid #FF00FF magenta]." |
| Character design | "A front-facing and side-facing character design of [a young lamplighter in a hooded green cloak carrying a lantern], full body, arms slightly away from the body, legs apart, on a solid flat #FF00FF magenta background." |
| Enemy | "[A small round moss slime with big eyes], side view, [2] animation frames side by side ([idle, squashed]), on a solid flat #FF00FF magenta background." |

#### 2.9.6 Import tool (`tools/import-art.ts`)

A Node script (using `sharp`) that turns raw AI images into true pixel art. Run with `npm run art:import [id|category]`. Steps:

1. **Remove the background:** chroma-key the magenta with a tolerance, then remove leftover magenta-tinted fringe pixels.
2. **Detect the pixel grid:** AI images are upscaled with uneven "pixels" (e.g. some 6 px wide, some 7). Estimate the block size from the lengths of same-color runs in rows and columns (use the most common value), or use `targetSize` from the manifest.
3. **Downscale to true size:** for each block, take the **most common color** in the block's center (never average, which creates new colors).
4. **Match the palette:** map every color to the nearest master-palette color in a perceptual color space (OKLab). No dithering. Report colors that were far from every palette color; they may point to a missing palette ramp.
5. **Trim and anchor:** crop to the content, pad to the target size, and record the anchor.
6. **Slice sheets** by the grid in the manifest.
7. **Tile checks:** for textures and parallax layers, check that the left/right (and top/bottom for textures) edges line up; flag any seam for manual fixing.
8. **Previews:** write each result to `art/clean/` plus a 4× preview image next to the raw image, for review.
9. Set the manifest status to `cleaned`.

`npm run art:pack` packs approved assets into atlases in `assets/` (one dedicated atlas for all tiles, because `TilemapGPULayer` supports one tileset image).

The import tool's core steps (chroma key, grid detection, palette matching) get unit tests with small fixture images.

#### 2.9.7 Terrain tiles (`tools/gen-autotiles.ts`)

- Input: one cleaned seamless base texture per material (e.g. 64×64) plus the material's edge rules from `src/data/tiles.ts` (outline color, top decoration like grass or moss overhang, which materials it blends into).
- Output: the 47 blob-autotile variants × 3 variations, cut from different areas of the base texture, with outlines and top decorations applied by rule.
- This keeps every tile consistent and means one generated image covers a whole material.

#### 2.9.8 Characters from parts

- Player and humanoid NPCs are built from layered parts: back arm, legs, body, head, hair, front arm, held item.
- Generate the character design, then cut it into parts (by hand in LibreSprite/Aseprite, or by a script using a part-layout template).
- Animation is done in code: 3–4 small leg frames for walking (small enough to draw by hand), arm rotation for swinging and using items, body bob, hair and cloak trailing behind with a small delay.
- Colors for hair, skin and clothes use palette ramps, so recolored NPC variants and player customization come almost for free.
- Bosses use the same idea: separate segments and limbs moved by code.

#### 2.9.9 Review loop

1. The user generates images in the Gemini app and drops them into `art/raw/<category>/`, named after the manifest id.
2. Claude Code runs `art:import`, looks at the previews and reports problems (wrong size, seams, off-palette colors, broken outlines).
3. The user touches up in LibreSprite (free) or Aseprite if needed.
4. Claude Code places the asset in a test scene and takes Playwright screenshots next to the style reference.
5. The user approves → `status: approved` → `art:pack`.

#### 2.9.10 Production order

Style reference → palette → parallax layers per biome → trees and giant-tree parts → foliage and decorations → terrain base textures → player parts → items and tools → enemies → NPCs → bosses → UI.

The forest look depends most on **parallax layers, giant trees and foliage**, so they come first. Tiles matter less than you'd expect once lighting and mist are on top.

### 2.10 Performance budget

- 60 FPS on an ordinary laptop with integrated graphics, at 1080p.
- Light update ≤ 4 ms per frame (spread across frames if needed).
- Under 100 draw calls per frame.
- Initial download under 10 MB; show a loading screen during world generation.
- **Quality settings:** Low / Medium / High switch the glow pass, weather density, parallax layers and camera filters.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ UI (DOM overlay, Preact)  — HUD, inventory, crafting,    │
│                             menus, photo mode            │
├──────────────────────────────────────────────────────────┤
│ Render (Phaser 4)         — scenes, chunk layers, sprites│
│                             light map, glow, particles   │
├──────────────────────────────────────────────────────────┤
│ Simulation (pure TS)      — world grid, entities,        │
│                             physics, systems, events     │
├──────────────────────────────────────────────────────────┤
│ Data (registries)         — tiles, items, recipes,       │
│                             enemies, biomes, lights      │
├──────────────────────────────────────────────────────────┤
│ Workers                   — world generation, lighting   │
│ Persistence               — IndexedDB + gzip             │
└──────────────────────────────────────────────────────────┘
```

**How the layers talk to each other:**

- The simulation runs at a **fixed 60 Hz timestep**. Rendering interpolates between steps.
- The simulation sends events (`tileChanged`, `entityDamaged`, `itemPickedUp`, `bossPhase`, ...) on a typed event bus. Rendering, audio and the UI listen to these events. **The simulation never calls rendering code.**
- The UI reads the simulation's state and sends **commands** back (`craft(recipeId)`, `moveItem(from, to)`), never changing the state directly.
- Input is turned into **actions** (`moveLeft`, `jump`, `useItem`, `switchLens`), so controls can be rebound.

### 3.1 World data

| Array | Type | Contents |
|---|---|---|
| `fg` | `Uint16Array` | Foreground tile IDs |
| `bg` | `Uint16Array` | Background wall IDs |
| `liquid` | `Uint8Array` | Liquid amount (0–255) |
| `liquidType` | `Uint8Array` | Water / lava / ... |
| `light` | `Uint8Array` × 3 | R, G, B light levels |
| `gloam` | `Uint8Array` | Gloam infection level (0–255) |
| `damage` | `Map<index, number>` | Mining progress (only for tiles being mined) |

- **World size:** 4200 × 1200 tiles (a medium Terraria-sized world). The size is set in config.
- **Chunks:** 128 × 128 tiles. Each chunk has a "dirty" flag. Rendering only uploads changed chunks and only keeps chunks around the camera loaded as GPU layers.
- Every tile access goes through `world.get(x, y)` / `world.set(x, y, id)`, which mark the chunk dirty and send `tileChanged`.

### 3.2 World generation

Runs in a worker. Seeded random generator (e.g. mulberry32 or a small PCG). Each step is a separate function `(world, rng, config) => void`, run in order with progress updates:

1. Terrain height (layered simplex noise)
2. Biome placement (horizontal surface biomes, depth layers underground)
3. Dirt/stone layers
4. Caves (noise-based worms plus open caverns)
5. Ores and Lumen crystals (by depth and biome)
6. Liquids (water pools, flooded halls, lava at depth)
7. Structures (giant ancient trees, overgrown ruins with runes, shrines, fairy rings, boss arenas, the World Tree's central trunk and roots, the starting glade) and **town prefabs** (Canopyhold, Rootdeep Citadel, later Sporehaven and Mirewatch), with their protected areas
8. Background walls
9. Decorations and flora
10. Initial Gloam (strongest near the bottom)
11. Settle liquids and falling tiles
12. Validation (spawn point is safe, arenas can be reached)

**Same seed → same world.** Test this.

### 3.3 Entities and physics

- **Entities:** plain objects with components (`Transform`, `Velocity`, `Collider`, `Health`, `AI`, `Sprite`, `LightEmitter`, `Inventory`, ...). Systems loop over the entities that have the components they need. Keep it simple; no ECS library.
- **Collision:** custom axis-aligned box vs. tile grid. Move along X then Y, resolving against solid tiles. Supports half-tile slopes, one-way platforms (fall through with Down), and swimming (lower gravity and speed in liquid).
- **Feel parameters** (all in config): coyote time ~100 ms, jump buffer ~100 ms, variable jump height, acceleration and friction curves.

### 3.4 Game systems

| System | Responsibility |
|---|---|
| `InputSystem` | Keys/mouse → actions |
| `PlayerSystem` | Movement, actions, cursor reach |
| `MiningSystem` | Tile hardness, tool tiers, cracks, drops |
| `BuildingSystem` | Placement rules, walls, furniture, rotation |
| `InventorySystem` | Slots, stacks, hotbar, item pickup |
| `CraftingSystem` | Recipes, stations within range, crafting |
| `LanternSystem` | Lumen fuel, lenses, light cone, lens effects |
| `LightSystem` | Sends lighting jobs to the worker, keeps the light grid updated |
| `GloamSystem` | Spreading and cleansing based on light, Gloam tile variants |
| `CombatSystem` | Damage, knockback, invulnerability frames, death and respawn |
| `AISystem` | State machines: walker, flyer, burrower, shade, critter, NPC, boss scripts |
| `SpawnSystem` | Spawning by biome, depth, light, time and Dimming state |
| `LiquidSystem` | Cell-based fluid flow, liquid interactions, only near the player |
| `FallingSystem` | Silt and gravel fall when unsupported |
| `FireSystem` | Fire spreading through burnable tiles, burning out |
| `FloraSystem` | Growth, Lumen blooms opening and closing, glowmoss spreading |
| `TimeSystem` | Day–night cycle, Dimming schedule, weather |
| `SettlementSystem` | Valid lit homes, NPC arrival, beacons |
| `TownSystem` | Town light level, street lamps, reclaimed districts, festivals |
| `NavSystem` | NPC movement along prefab waypoint graphs and lit roads |
| `ScheduleSystem` | NPC daily routines and reactions to time, light and Dimming nights |
| `DialogueSystem` | Data-driven dialogue lines with conditions (story flags, cleansed %) |
| `QuestSystem` | The four quest types, progress tracking, rewards |
| `TradeSystem` | Shops and caravans; prices affected by town light and lit roads |
| `ProgressionSystem` | Boss kills unlocking things, story flags |
| `SaveSystem` | Autosave, save slots |

### 3.5 Saving

- Save = world arrays + entities + player + world state (time, flags, seed).
- Compressed with `CompressionStream('gzip')` and stored in **IndexedDB** (via the small `idb` library).
- Autosave every 2 minutes and when leaving the page (`visibilitychange`). Keep 3 rotating backups per world.
- Save format has a version number, with migrations between versions.

### 3.6 Audio

- Phaser sound. Music per biome with crossfades. An ambient layer (wind, cave drips, lava rumble). Short sound effects for every action. Sounds positioned and muffled underwater and in deep caves.
- Browsers block autoplay, so start audio on the first click (on the title screen).

---

## 4. Content (first pass)

- **Tiles (~40):** forest soil, grass (Elderglade, Moonpetal, Mire), moss, mud, peat, silt, gravel, stone, mossy stone, runestone, glowcap flesh, rootwood, living bark, moonstone crystal, obsidian, ash, basalt, Gloam-veined variants, elderwood planks, carved stone bricks, leaded glass, vine and branch platforms, ores (copper, iron, moonsilver, Lumen crystal, gold, emberite).
- **Tool tiers:** elderwood → copper → iron → moonsilver → heartwood (crafted from the World Tree after the final boss path opens).
- **Light sources:** torch, firefly jar, glowcap lamp, Lumen lantern-post, moonstone lamp, beacon (tiers 1–3), flare (thrown).
- **Lenses:** Amber (start), Azure, Crimson, Verdant. Each found or crafted in a different biome.
- **Weapons:** sword, spear, bow, sling, Lumen staff (beam), thorn whip, flares.
- **Enemies:** bramble sprites and moss slimes (surface), shades (wherever it's dark), dusk bats, spore crawlers (Grottos), mire lurkers, root wyrms (Rootdeep), crystal mites, ember imps, Gloam hounds.
- **Critters:** fireflies, moths, forest deer (surface, flee from you), owls at night, frogs in the Mire, glowfish in pools.
- **NPCs:** Tinker (tools), Herbalist (potions, seeds), Glassblower (lenses, lamps), Archivist (lore, world map), and the **Old Dryad** (a tree spirit who guides the story and reacts to how much of the forest you've cleansed).

---

## 5. UI

- **HUD:** health, Lumen gauge (lantern-shaped), active lens icon, hotbar (10 slots), minimap (optional).
- **Inventory:** grid, drag and drop, sorting, tooltips with stats.
- **Crafting:** recipes filtered by nearby stations, with a search box.
- **Menus:** title screen with an animated background scene, world select and create (name, seed, size), settings (quality, keybinds, volume, scale), pause.
- **Photo mode:** hide UI, free camera, time-of-day slider, filter presets, save PNG.
- **Style:** pixel font, 9-slice panels matching the palette, every element scaled by whole numbers.

---

## 6. Tech stack

| Purpose | Choice |
|---|---|
| Engine | Phaser 4.2.x |
| Language | TypeScript (strict) |
| Build | Vite |
| UI overlay | Preact (small and fast) |
| Tests | Vitest |
| Saving | IndexedDB through `idb` |
| Noise | `simplex-noise` (in workers) or `Phaser.Math.HashSimplex` |
| Lint/format | ESLint + Prettier |
| Prefab editor | Tiled (towns, ruins, arenas; exported as JSON) |
| Visual checks | Playwright screenshots (`npm run shot`) |
| Deploy | Static build → itch.io / GitHub Pages / Netlify |

---

## 7. Project structure and conventions

```
gloamdeep/
├─ CLAUDE.md
├─ PROGRESS.md
├─ GLOAMDEEP_PLAN.md
├─ index.html
├─ assets/              # real art & audio (later)
├─ art/                # art pipeline (Section 2.9): reference/, prompts/, raw/, clean/, manifest.json
├─ tools/
│  ├─ gen-placeholder-art.ts
│  ├─ extract-palette.ts
│  ├─ import-art.ts
│  ├─ gen-autotiles.ts
│  └─ pack-atlases.ts
├─ src/
│  ├─ main.ts           # boot: Phaser game + UI overlay
│  ├─ config.ts         # tunable values (physics, world size, day length, quality)
│  ├─ data/             # registries: tiles, items, recipes, enemies, biomes, lights, palette
│  │  ├─ prefabs/       # Tiled JSON: towns, ruins, arenas (with waypoint graphs)
│  │  ├─ dialogue/      # NPC dialogue lines with conditions
│  │  └─ quests/        # quest definitions
│  ├─ sim/              # NO Phaser imports
│  │  ├─ world/         # World, Chunk, tile access, autotile bitmask
│  │  ├─ entities/      # components, entity factories
│  │  ├─ systems/       # one file per system
│  │  ├─ physics/       # collision against tiles
│  │  ├─ events.ts      # typed event bus
│  │  └─ Simulation.ts  # fixed timestep loop
│  ├─ workers/
│  │  ├─ worldgen/      # generation steps
│  │  └─ lighting/      # light flood fill
│  ├─ render/           # Phaser scenes & renderers
│  │  ├─ scenes/        # Boot, Title, WorldGen, Game, PhotoMode
│  │  ├─ ChunkRenderer.ts
│  │  ├─ LightMapRenderer.ts
│  │  ├─ GlowRenderer.ts
│  │  ├─ SkyRenderer.ts
│  │  ├─ ParallaxRenderer.ts
│  │  ├─ WeatherRenderer.ts
│  │  ├─ ParticleFX.ts
│  │  └─ CameraDirector.ts   # follow, shake, grading, filters
│  ├─ ui/               # Preact components
│  ├─ audio/
│  └─ persistence/
└─ tests/               # Vitest, mirrors src/sim and src/workers
```

**Conventions:**

- TypeScript `strict`. No `any` without a comment explaining it.
- All tunable numbers live in `config.ts` or `src/data/`, never hard-coded in a system.
- Every simulation system gets unit tests. World generation gets a determinism test (same seed → same world).
- Add a **debug overlay** (F3): FPS, draw calls, chunk borders, light values, entity count, current biome, Gloam level.
- Add **debug keys:** set time of day, give items, teleport to a depth, start a Dimming night.

---

## 8. Main risks

| Risk | Mitigation |
|---|---|
| Phaser v3 APIs creep into the code | Section 0 rule + check against `node_modules/phaser/skills/` |
| `TilemapGPULayer` limits (one tileset, re-uploading data after edits) | One atlas; 128×128 chunks; if it doesn't fit, fall back to normal `TilemapLayer` per chunk for that case |
| Lighting too slow | Worker, only the visible region, only on change, spread across frames |
| Liquid simulation too slow | Only update an "active area" near the player; sleeping liquid bodies |
| Placeholder art makes it hard to judge the look | Start the art pipeline early (style reference and parallax first) and produce art alongside the code milestones |
| AI art is inconsistent between assets | Style reference attached to every prompt, one master palette enforced by the import tool, tiles generated from base textures, characters from parts |
| Scope too large | Every milestone produces something playable; cut late content before cutting systems |

---

## 9. Milestones

Each milestone ends with something you can play in the browser.

### M0 — Project setup
- Vite + TypeScript + Phaser 4.2.x + Preact + Vitest + ESLint/Prettier.
- Folder structure from Section 7, `PROGRESS.md`.
- npm scripts: `dev`, `build`, `test`, `typecheck`, `lint`, and `shot` (Playwright opens the built game, waits, and saves screenshots to `screenshots/` so visual changes can be checked).
- Game config: 960×540, integer scaling, `pixelArt: true`, `roundPixels: true`.
- `art/` folder structure, empty `manifest.json`, and the prompt templates from 2.9.5 written into `art/prompts/`.
- Empty scenes: Boot → Title → Game. A DOM overlay mounts above the canvas.
- Fixed-timestep simulation loop + typed event bus.
- Placeholder art generator producing a first tile atlas from the palette.

**Done when:** `npm run dev` shows a title screen; clicking starts an empty Game scene; `npm test` runs one sample test; `npm run build` succeeds.

### M1 — World rendering and player movement
- `World` and `Chunk` classes with the arrays from 3.1.
- A simple test world (flat ground + hills + a few caves).
- `ChunkRenderer`: one `TilemapGPULayer` per visible chunk, loaded and unloaded around the camera.
- Player entity with custom tile collision, coyote time, jump buffer, variable jump height.
- `CameraDirector`: smooth follow + look-ahead.
- F3 debug overlay.

**Done when:** the player runs and jumps smoothly across a 4200×1200 world with steady 60 FPS, and chunks load and unload without visible pop-in.

### M2 — Mining, building and tile visuals
- Cursor with reach limit, mining progress with crack overlay, block placement, background walls.
- 8-neighbor autotiling with merge rules and position-based variants; only neighbors of an edited tile get recalculated.
- Item drops, pickup animation, basic inventory + hotbar (DOM UI).
- Particles on mining and placing, screen shake on break.

**Done when:** digging and building feel responsive; tile edges join correctly after every edit; mined blocks show up in the hotbar.

### M2b — Art pipeline tools
- `extract-palette`, `import-art`, `gen-autotiles`, `pack-atlases` (Section 2.9), with unit tests on fixture images.
- npm scripts `art:palette`, `art:import`, `art:autotiles`, `art:pack`.
- Asset loading from the manifest: approved assets load, everything else falls back to placeholders.
- Player rendered from parts (2.9.8) with code-driven walk, jump and swing animations, using placeholder parts.
- A test scene (`?scene=art-test&id=<asset>`) that shows one asset in the world under day and night lighting, for Playwright screenshots.

**Done when:** a raw Nano Banana image dropped into `art/raw/` comes out of `art:import` as clean, palette-matched pixel art at the right size; one base texture becomes a full autotile set in the game; and the player animates from parts.

**In parallel (user):** create and approve the style reference (2.9.4), then start on parallax layers and trees. Art production keeps running alongside the code milestones from here on.

### M3 — Lighting (visual milestone)
- Lighting worker: sunlight, flood fill, colored light, material absorption.
- `LightMapRenderer`: smooth upscaled light texture, multiply blend.
- Torches (placeable), flickering, emissive tiles.
- Player lantern with Amber lens: a cone toward the mouse, Lumen use.
- `GlowRenderer`: additive glow pass with bloom.
- Day–night cycle: sky gradient keyframes, sun and moon, sunlight strength.
- Quality setting (Low turns off the glow pass).

**Done when:** caves are dark; torches and the lantern light them with soft, colored light; sunset visibly turns everything warm; the light update stays under 4 ms on average.

### M4 — World generation, biomes and saving
- Worldgen worker with the 12 steps from 3.2 and a progress screen.
- Surface biomes + depth layers with their own tiles and decorations.
- Lumen crystals and ores placed by depth.
- Save/load (IndexedDB + gzip), world select/create screen, autosave.

**Done when:** creating a world with a seed shows progress and finishes in under 15 s; the same seed gives the same world (tested); quitting and reloading restores the world exactly.

### M5 — The mystical forest look (visual milestone)
- Giant ancient trees in world generation (trunks, walkable branches, canopy).
- Canopy light shafts with motes, foreground canopy layer, layered mist.
- Parallax tree layers per biome (4–5 layers, atmospheric perspective), blending at biome borders.
- Color grade per biome with smooth transitions; underwater and heat-haze filters.
- Weather: rain with leaf drips, morning mist, petal drifts, Mire fog, embers, starfall, lightning; global wind.
- Foliage sway (`SpriteGPULayer` wave animation) and bending when the player passes; falling leaves.
- Bioluminescent pulsing on mushrooms, moss and flowers; runes that wake near the player.
- Reflective still pools and waterfalls.
- Ambient particles: motes, spores in grottos, fireflies at dusk.
- Ambient audio layer (birds, wind in leaves, drips, distant chimes) + music per biome.

**Done when:** standing still in the Elderglade at sunrise looks like a fantasy painting (light shafts, mist, motes, swaying grass); walking from the surface down to the Moonstone Hollows feels like passing through different places; and a screenshot of each biome is easy to tell apart.

### M6 — Items, crafting and UI
- Item and recipe registries, crafting stations, tool tiers and mining hardness.
- Full inventory (drag and drop, stacking, sorting, tooltips), crafting screen with search.
- Health, Lumen gauge, lens indicator.

**Done when:** you can progress from wood tools to iron tools purely by mining and crafting.

### M7 — The Lantern and the Gloam (core identity)
- All four lenses with their effects (Azure reveals hidden tiles, Crimson damages, Verdant grows).
- `GloamSystem`: spreading in darkness, cleansing in light, Gloam tile variants with pulsing veins.
- Light-ring effect when placing light; Gloam visibly pulls back.
- Flares (thrown light).

**Done when:** leaving an area dark lets the Gloam take it over, lighting it pushes the Gloam back, and each lens changes how you play.

### M8 — Combat and enemies
- Melee, ranged and magic weapons; hitboxes, knockback, invulnerability frames, hit-stop, damage numbers.
- AI state machines: walker, flyer, burrower, shade.
- Shades: only spawn below a light threshold, take damage in light, dissolve into wisps.
- `SpawnSystem` by biome, depth, light and time. Death and respawn.

**Done when:** fighting feels punchy, and you can clearly see that light changes where and when shades appear.

### M9 — Materials
- Liquids: water and lava flow, swimming, surface waves, splashes, water dimming light.
- Lava + water → obsidian with steam.
- Falling silt and gravel.
- Fire spreading through wood, grass and leaves, then burning out.

**Done when:** you can flood a cave, turn lava into obsidian, set a patch of forest on fire, and trigger a gravel cave-in, all without the frame rate dropping below 55 FPS.

### M10 — A living world
- Flora: Lumen blooms that open in light, shy vines, glowmoss spreading, bouncy glowcaps, fairy rings.
- Critters: fireflies (catchable), moths, bats, deer, owls, frogs, glowfish.
- Wisps that lead the player to secrets.
- The Old Dryad and her reactions to how much of the forest has been cleansed.
- Your village: checking for valid lit homes, NPCs arriving, beacons (safe radius + fast travel).

**Done when:** the surface village has 4 NPCs living in lit homes, and caves feel alive with critters that react to you.

### M11 — Towns & Folk
- Prefab pipeline: load Tiled JSON, stamp into the world during generation, protected areas, waypoint graphs.
- `NavSystem`, `ScheduleSystem`, `DialogueSystem`, `QuestSystem`, `TradeSystem`, `TownSystem` (Section 3.4).
- **Canopyhold:** rope bridges, lifts, shops, inn, the Old Dryad's grove nearby, ambient townsfolk.
- **Rootdeep Citadel:** a Gloam-infested city in districts; relighting each district's beacon cleanses it and brings its residents back.
- Lit trade roads with caravans; street lamps that need refueling; first festival after the first boss.
- Town state saved with the world.

**Done when:** Canopyhold feels lived-in (NPCs follow routines, talk, trade, hand out all four quest types), at least two Citadel districts can be reclaimed, and lighting a road makes a caravan start traveling it.

### M12 — Bosses and Dimming nights
- Dimming night event: sky, aurora, filters, faster Gloam, shade waves, towns reacting based on their light level.
- The four bosses from 1.4, with arenas, intros (camera zoom + title card) and multiple phases.
- Progression: each boss unlocks the next depth, a lens or an NPC, and triggers a festival.

**Done when:** you can play from a new world to defeating the Gloam Heart.

### M13 — Polish and release
- Photo mode.
- Settings menu complete (quality, keybinds, volume, scale).
- Performance pass against Section 2.10 on a low-end laptop.
- Final art check: every asset in `art/manifest.json` is `approved`; no placeholders left in the build.
- Loading screen, title-screen scene, credits.
- Static build deployed to itch.io.

**Done when:** a new player can open the link, play for an hour without bugs that break the game, and the game holds 60 FPS on integrated graphics.

### M14 — More towns (after release)
- **Sporehaven** (Glowcap Grottos) and **Mirewatch** (Weeping Mire), using the same prefab, NPC and quest systems from M11.
- New NPCs, quests and trade goods for each.

**Done when:** both towns are reachable, lived-in, and connected to the trade-road network.

---

## 10. Kickoff prompt for Claude Code

Set up the folder like this, then open Claude Code inside `gloamdeep/`:

```
gloamdeep/
├─ GLOAMDEEP_PLAN.md
├─ CLAUDE.md
└─ .claude/
   ├─ agents/
   │  ├─ phaser-scout.md
   │  ├─ check-runner.md
   │  ├─ implementer.md
   │  └─ reviewer.md
   └─ skills/
      └─ art-import/
         └─ SKILL.md
```

Then send:

> Read `GLOAMDEEP_PLAN.md` fully, especially Section 0, and follow `CLAUDE.md`. Build **Milestone 0** completely, verify every "Done when" item, update `PROGRESS.md`, and stop and show me the result before starting Milestone 1.

For each later milestone:

> Continue with Milestone N from `GLOAMDEEP_PLAN.md`. Follow `CLAUDE.md`. Verify every "Done when" item, update `PROGRESS.md`, then stop and show me.
