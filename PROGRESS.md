# Gloamdeep — Progress Log

Running log per `CLAUDE.md`. Newest milestone at the top.

---

## M9 — Materials ✅ (2026-10-09)

### Built

- **Fix first (playtest bug):** dropped items no longer orbit the player. The pull steered only by adding acceleration, so a drop moving sideways circled at top speed. A pulled drop now flies straight at the player and is collected when the next step reaches them. There is a regression test.
- **Liquids** (`src/sim/systems/LiquidSystem.ts`):
  - Water and lava flow cell by cell (0–255 per cell) in a 96×64-tile region around the view, 20 ticks a second; lava moves every 4th tick.
  - Rows are processed bottom-up so liquid falls first, then evens out sideways, alternating direction so it doesn't drift.
  - Where real amounts of water and lava meet, the lava cools to **obsidian** with steam.
  - A block placed into liquid displaces it. Lava sets flammable neighbours alight.
- **Light through liquids:** water cells dim light per channel (red first, so deep water turns blue); lava cells glow. Liquid cells reach the light job as two extra ids.
- **Swimming:** in water you sink slowly, move at about half speed and swim up by holding jump. Lava hurts on every touch.
- **Buckets** (crafted from iron at the anvil): right-click scoops a full cell of water or lava, and pours it back into an open cell. Nothing is created or lost.
- **Falling silt and gravel** (`src/sim/systems/FallingSystem.ts`):
  - When the block under them is mined, they fall as blocks and land as tiles again, so a whole column follows (a cave-in).
  - A fast block hurts what it hits, and never lands inside the player or a creature (it becomes a drop instead).
  - Blocks still falling when the game saves are kept as item drops.
- **Fire** (`src/sim/systems/FireSystem.ts`):
  - Wood, leaves, grass, plants, peat and workbenches burn, as blocks and as walls. Each burns for its own time, spreads to neighbours and leaves what it burns down to (grass leaves soil, peat leaves ash, wood leaves nothing).
  - Water on or next to a fire puts it out; rain puts out fires open to the sky.
  - Started by lava and by flares at rest. Touching fire hurts.
  - At most 400 cells burn at once; the 48 nearest light the area.
- **Render:**
  - Liquid cells draw their fill level, and surfaces ripple (two phases that move along the surface).
  - Animated flames with a glow, embers rising from them.
  - Splashes when entering liquid, steam where lava meets water, dust where a block lands, and the falling blocks themselves.
  - Bucket icons; sounds for splash, hiss, ignition and thud.
- **Debug kit** `?kit=materials`.
- **Shots:**
  - `flood-pit`: dig a pit beside the spawn and flood it.
  - `lava-obsidian`: lava in a pit, water on top.
  - `forest-fire`: a flare thrown into the glade.
  - `gravel-cave-in`: mine the support under a gravel column.
- **Tests** (474 in total): flow and conservation, flooding through a breached dam, obsidian, displacement, swimming, lava damage, buckets, cave-ins and crushing, fire spread, burn-out, water and rain putting it out, flares igniting, and water dimming red light faster than blue.

### Done-when check

| Item | Result |
|---|---|
| Flood a cave | ✅ Tested: breaching a dam floods the cave behind it. `flood-pit`: 4 buckets flood a dug pit (5 cells of water, with ripples). |
| Turn lava into obsidian | ✅ Tested; `lava-obsidian` leaves an obsidian block where the water lands (and the lava sets the grass beside the pit alight). |
| Set a patch of forest on fire | ✅ `forest-fire`: a thrown flare sets the glade burning, up to 14 cells at once in the shot. Tested: grass and a wooden column burn down. |
| Trigger a gravel cave-in | ✅ `gravel-cave-in`: mining the block under a 4-high gravel column drops it one tile. Tested: whole columns fall and land as tiles. |
| Frame rate stays above 55 FPS | ✅ On the real GPU (headed Chromium, d3d11): 165 FPS (the display cap) with 312 cells burning; simulation CPU 0.2–0.25 ms per frame. A liquid tick costs 0.21 ms with a 96×64 lake in full flow. |

### Decisions and deviations

- **Liquids flow only near the view,** like the Gloam. Far-away liquid waits until you return.
- **Buckets hold exactly one full cell,** so they can't create or destroy liquid.
- **Water and lava react only above a thin-film amount (8),** so a trickle can't turn a whole lake into obsidian.
- **Fires aren't saved;** they go out when a world is reloaded.
- **Ignition:** lava and resting flares start fires. Lightning doesn't; it always comes with rain, which would put the fire out at once.
- **Splashes** only come from the player entering liquid. Creatures and dropped items don't splash yet.

### Reviewer pass

No blockers. Fixed:
- A falling block could land inside the player and entomb them.
- Rain never reached burning grass, because the grass row counted as "under" the sky.
- Fire spreading into walls skipped the burning cap and its event.
- The fire light list was rebuilt and sorted every step, counted cells twice and followed the player instead of the view.
- Buckets created liquid: you could scoop 96 and pour 255.
- One-unit films made obsidian.
- An array was allocated on every ignition.

Not changed (minor):
- Loose blocks that start unsupported only fall once something next to them changes.
- A water cell hides the light of glowing plants under it.
- Emitter angles and flame-drawing constants are local to the placeholder art.

### Known issues

- Liquid, flame and steam art is placeholder.
- Liquid in a cell where a block lands disappears.

### Next step

**M10 — A living world:** reactive flora (Lumen blooms, shy vines, spreading glowmoss, bouncy glowcaps, fairy rings), critters, wisps that lead to secrets, the Old Dryad, and the first village (lit homes, arriving NPCs, beacons).

---

## M8 — Combat and enemies ✅ (2026-10-09)

### Built

- **Creatures** (`src/data/enemies.ts`): nine creatures with five AI types (`src/sim/systems/EnemyAI.ts`).

  | AI | Creatures | Behaviour |
  |---|---|---|
  | Hopper | Moss slime | Hops towards you |
  | Walker | Bramble sprite, spore crawler, crystal mite, gloam hound | Wanders, chases, jumps at steps and towards a higher player |
  | Flyer | Dusk bat, ember imp | Bobs towards you; bats scatter from bright light |
  | Burrower | Root wyrm | Tunnels through rock under you, then lunges up out of the ground |
  | Shade | Shade | Drifts through anything towards you; shrinks back from bright light |

  Each has health, contact damage, size, speed, knockback resistance, drops and spawn rules (places, time, darkness, weight).
- **Spawning** (`src/sim/systems/SpawnSystem.ts`):
  - A few times a second it tries random cells of the lit region just outside the view, so nothing appears on screen.
  - It matches creatures by surface biome or depth layer and by day or night.
  - **Shades** spawn only where the light is at most 16, weighted up to 4× by the Gloam on the cell. They hunt from up to 40 tiles.
  - Caps: 10 creatures, 6 shades, 3 of any other kind. Burrowers spawn in rock next to a cave. Creatures more than 70 tiles away despawn.
- **Combat** (`src/sim/systems/CombatSystem.ts`):
  - **Weapons:** with a weapon selected, left click attacks instead of mining.
    - Sword swings hit everything in an arc in front once per swing.
    - The bow shoots arrows from your bag, which drop over distance.
    - The Lumen staff spends Lumen on a piercing beam that hits shades twice as hard.
  - **Hits:** knockback, a short stun and invulnerability, and 60 ms of hit-stop (the game freezes) whenever a hit lands.
  - **Shades and light:** shades burn in light of 70 or more, and burn faster in a Crimson cone.
  - **Getting hurt:** touching a creature hurts the player, with knockback, loss of control and 0.8 s of invulnerability.
  - **Death:** at 0 health you lose a quarter of your Lumen and respawn at the spawn after 4 s. A save made while dead loads you alive at the spawn.
- **Weapons and recipes:**
  - Elderwood sword, bow and arrows at the workbench.
  - Copper and iron swords and the Lumen staff at the anvil.
  - Debug kit `?kit=combat`.
- **Render:**
  - Creatures from the `enemies` sheet: a two-frame animation, hop squash, a white flash when hit (Phaser 4: `setTint` + `setTintMode(FILL)`), and glowing eyes that show in the dark (shades get a large cold glow).
  - Arrows and glowing beams.
  - Damage numbers (pooled).
  - Dying creatures dissolve into wisps; shades into more of them.
  - The player swings the selected weapon or aims the bow or staff, blinks while invulnerable and disappears behind a "The light left you… Rekindling in N" overlay.
  - The camera shakes when you're hurt.
- **Audio:** procedural sounds for swings, shots, beams, hits, getting hurt, kills, shades dissolving and respawning.
- **Debug and shots:**
  - `?spawns=0` and `?enemy=<key>`; creatures appear in the probe.
  - The shot suite turns spawns off unless a shot asks for them.
  - New shots: `combat-sword`, `shades-in-the-dark`, `shades-burn-in-light`.
- **Placeholder art:** weapons and creatures.
- **Tests** (458 in total):
  - Melee arc and once-per-swing hits, hit-stop, kills and drops, weapons instead of mining.
  - Bow ammo, staff Lumen cost and beam bonus.
  - Contact damage and invulnerability, death and respawn.
  - Nothing happens while dead, and a save made while dead loads safely.
  - Shades burn in light and stay whole in the dark.
  - Shades spawn only in darkness and never on screen.
  - Walkers, flyers, shades and burrowers move as they should.

### Done-when check

| Item | Result |
|---|---|
| Fighting feels punchy | The parts are in place: hit-stop, white flash, knockback and stun, damage numbers, hurt shake and blink, death wisps and a sound for every action. `combat-sword`: one iron sword swing takes a gloam hound 60 → 42. **Needs your playtest:** "feel" can't be measured by a script. |
| You can clearly see that light changes where and when shades appear | ✅ Shades spawn only in darkness (tested: none in a fully lit region, several in a dark one). `shades-in-the-dark`: with the lantern out in a Rootdeep cave, 6 shades gather within 40 s. `shades-burn-in-light`: lighting the Crimson lantern at them pushes the nearest from 5.9 to 7.7 tiles away and burns them, with burn numbers trailing and wisps as they dissolve. |

### Decisions and deviations

- **Shades and burrowers pass through rock** (shades are darkness itself; burrowers tunnel). They can only be lit where the light reaches, so a shade deep in a wall is safe until it comes out.
- **Weapons in the plan not built yet:** spear, sling and thorn whip. Swords, bow and staff cover melee, ranged and magic for M8.
- **Creatures aren't saved;** they come back by the spawn rules, like most sandbox games.
- **Spawning is off by default in the Simulation** and on in the game. Tests stay deterministic, and screenshots use `?spawns=0` unless a shot needs creatures.

### Reviewer pass

No blockers. Fixed:
- A dead player still picked up drops, could throw flares, burned the lantern and healed (Amber).
- Damage numbers created a new Text per hit; they're pooled now.
- A save made while dead loaded you alive where you died.
- Two tuning numbers in the sim moved to `SPAWN`.
- A swing in progress survived death.
- Burrowers above the world's top treated the sky as rock.
- Small render literals moved to config.
- The missing contrast shot (shades in light) is added.

Not changed (minor):
- Arrows check hits at the end of each step, so a fast falling arrow can pass a very small creature.
- A kill during a swing can skip another creature for one step; it is hit on the next step.

### Known issues

- Creature, weapon and effect art is placeholder (two frames per creature).
- Health has no regeneration boost or armour yet; balancing of damage, spawn rates and Lumen costs needs playtesting.
- Damage numbers use the browser's monospace font until a pixel font arrives with UI art.

### Next step

**M9 — Materials:** flowing water and lava, swimming, lava + water → obsidian, falling silt and gravel, fire spreading through wood, grass and leaves.

---

## M7 — The Lantern and the Gloam ✅ (2026-10-09)

### Built

- **The Gloam** (`src/sim/systems/GloamSystem.ts`; `GLOAM` in config):
  - A 0–255 level per cell, held by solid blocks and background walls (`world.gloam`, already saved).
  - Ticks 4 times a second over the area where the light grid is current. In darkness it thickens and creeps outwards from cells with enough Gloam; in light it burns away in proportion to the light.
  - Placing a light burns a ring of it at once.
  - Mining a cell clear (no block, no wall) removes its Gloam.
- **The four lenses** (lens items you carry; `Q` cycles them; the HUD shows a gem for each lens you own):
  - **Amber** heals you while the lantern burns.
  - **Azure** (true sight) reveals veiled tiles in its light. Worldgen hides 35% of the lumen and moonsilver veins as plain-looking stone (they drop only stone if mined unrevealed). It also cuts pits into cave floors, spanned flush with the floor by unseen, untouchable spirit platforms: without Azure you fall in.
  - **Crimson** burns the Gloam in its cone much faster (and damages shades, M8).
  - **Verdant** grows things in its light: grass on soil, flowers on grass, moss on stone, glowmoss on moss (rules in `src/data/flora.ts`).
  - Lenses are crafted at the anvil, each from another depth: Verdant from Grottos glowcaps, Azure from Hollows moonstone, Crimson from gold.
- **Flares:** crafted at the workbench and thrown with the right button. They bounce, come to rest and burn for 40 s as a point light, so they also push the Gloam back. At most 12 burn at once.
- **Render:**
  - The Gloam as pulsing violet veins over an ink wash, drawn above the light map so the living darkness shows even where nothing is lit.
  - The camera grade loses colour as the Gloam covers the view.
  - A light ring expands when a light is placed; a small cyan ring marks a revealed tile.
  - Flares draw with a flickering halo.
- **Placeholder art** for gold bars, the lenses and flares; spirit platforms in cyan. Debug kit `?kit=lenses`.
- **Tests** (445 in total):
  - Gloam spreading, the spread threshold, light burning, the Crimson cone, the burst on placing a light, and which cells hold Gloam.
  - A simulation run where a dark tunnel is taken over in a minute and a torch clears it.
  - Lens ownership and cycling, Amber, Azure reveals, intangible platforms, Verdant growth, flares.
  - Worldgen secrets.

### Done-when check

| Item | Result |
|---|---|
| Leaving an area dark lets the Gloam take it over | ✅ In `GloamSystem.test.ts`, a dark walled tunnel gains Gloam steadily over a minute from Gloam at its far end. In real worlds every depth layer starts with traces of Gloam: 0.06 strength in the Grottos, rising to full in the Gloam Heart. Dark areas thicken and spread where a trace is strong enough. |
| Lighting it pushes the Gloam back | ✅ Same test: a torch clears the tunnel around it within 10 s. In the browser (`gloam-pushback`, Ember Roots), Gloam within 4 tiles of a placed torch went 7,060 → 305 in 3 s, and the veins visibly clear around it. |
| Each lens changes how you play | ✅ Amber heals; Azure finds hidden ore and the only safe way over spirit pits; Crimson clears Gloam fast (and fights shades in M8); Verdant grows the world. |

### Decisions and deviations

- **The Gloam only changes where the light grid is current** (around the camera). Rule 7 makes light the input, and the light grid only exists near the player, so the Gloam is frozen elsewhere until you come back. This is like the planned "liquids only near the player"; a catch-up on return can come later if it matters.
- **Light timing:** results from the light worker are applied when its message arrives, which is always between simulation steps but depends on timing. So the step at which new light reaches the Gloam isn't deterministic across machines. Acceptable for a single-player game; resolves the M3 open note.
- **Gloam is an overlay, not tile variants:** the plan's "Gloam-veined versions" are the vein overlay on any block or wall, so every material corrupts without a variant atlas per tile.
- **Azure's secrets:** hidden ore and spirit platforms. No "secret passages" yet; those fit with the ruins and shrines later (M11).
- **Q only:** the mouse wheel stays on the hotbar, so it doesn't also switch lenses.
- **Crimson burns Gloam:** until shades arrive in M8 it needs something to burn. It damages shades in M8.
- **Initial Gloam raised** in the upper layers (Grottos 0, Rootdeep 0.05, Hollows 0.15 → 0.06, 0.15, 0.25) so Gloam actually appears above the deep layers.
- **Flares aren't saved;** they burn out.

### Reviewer pass

No blockers. Fixed:
- A hidden spirit platform counted as building support, which revealed it.
- Gloam couldn't grow in the upper half of the world.
- Spirit pits could open into another cave below or beside them (the bottom row and the side walls are now checked).
- `ownedLenses` allocated every step.
- Live flares had no limit.
- Flare sprites were not destroyed with the renderer.
- A stale config comment.

The reviewer's note that the lens isn't saved was wrong (it is saved and restored).

Not changed:
- Reveal and the Crimson burn use light plus cone shape, so a veiled tile lit through a thin wall can be revealed. They don't trace rays; minor.
- The Gloam rounding tick counter isn't saved; it only matters for replays.

### Known issues

- Gloam veins, lenses and flares are placeholder art.
- The Gloam Heart's thick violet fog makes the deepest layer murky; the fog strength needs tuning.
- The Crimson cone's red light is faint against the Ember Roots haze.

### Next step

**M8 — Combat and enemies.**

---

## M6 — Items, crafting and UI ✅ (2026-10-09)

### Built

- **Data:**
  - Items have categories, tooltip text and icons. New items: four pickaxes (elderwood → copper → iron → moonsilver, with tier and power), copper/iron/moonsilver bars, and three stations.
  - Recipes live in `src/data/recipes.ts`: wood and the workbench by hand; pickaxe, furnace and anvil at the workbench; bars at the furnace; metal pickaxes at the anvil.
  - Tiles gain `tier` (lowest pickaxe that mines them), `station`, `needsGround` and `choppable`. New tiles 50–52 are the workbench (also a platform), the furnace (gives light) and the anvil.
  - New worlds start with 10 torches and nothing else. `?kit=build|crafting` adds a debug kit.
- **Mining:**
  - Uses the best pickaxe anywhere in the inventory. Bare hands mine tier-0 tiles (soil, plants, wood) at power 0.6.
  - Tiles above your tier don't crack, and a notice names the pickaxe you need.
  - Tree-trunk walls are chopped with a plain click when nothing is in front, so wood is the first thing you can get.
  - The block under a station can't be mined while the station stands.
- **Crafting system:** checks for stations within 5 tiles. It crafts one, or as many as the materials allow (capped at 99). Inputs are taken from the bag before the hotbar, and output that doesn't fit drops at the player.
- **Inventory model** (sim, driven by commands):
  - A stack held on the cursor; left click picks up or puts down (merge, swap); right click takes half or puts down one.
  - Shift-click moves between hotbar and bag; Sort merges and orders the bag by category.
  - With a stack held, a click in the world throws it (it can't be picked up for 2 s). Closing the screen puts the stack back.
- **Health:** 100 HP with slow regeneration. Damage sources come in M8.
- **Save format v2:** player health, the cursor stack (put back into the bag on load) and a per-drop pickup delay. Version-1 saves migrate.
- **UI:**
  - The inventory screen (E) has the 40-slot grid with drag and drop and tooltips, and a crafting panel with search, the stations in reach, have/need counts per input and an "All" toggle that shows recipes for stations you're not near.
  - HUD: a health bar, a lantern-shaped Lumen gauge whose glass fills with light, a lens gem and the clock.
  - Notices above the hotbar ("Needs an Elderwood Pickaxe", "Crafted 4 × Elderwood Planks").
  - The swung pickaxe shows in the player's hand.
- **Art:** placeholder icons for pickaxes and bars (new `items` sprite sheet) and placeholder station tiles. Nano Banana prompts are in `art/prompts/batches/m6-items.md`, with manifest entries `items` and `stations` (status raw).
- **Tests:** 431 in total, including:
  - a scripted run from bare hands to an iron pickaxe using only mining and craft commands;
  - inventory drag and drop, splitting, quick-move, sorting and stowing;
  - crafting, plus data checks that every pickaxe tier is craftable from materials the tier below can mine;
  - mining tiers, chopping and station support;
  - the v1→v2 migration and restoring the cursor stack;
  - the UI helpers;
  - a check that a generated world has trunk wood, copper and iron near the spawn.

### Done-when check

| Item | Result |
|---|---|
| You can progress from wood tools to iron tools purely by mining and crafting | ✅ `tests/sim/progression.test.ts`: from bare hands, chop 7 trunk logs → planks → workbench → elderwood pickaxe → mine stone and copper → furnace → copper bars → anvil → copper pickaxe → mine iron → iron bars → iron pickaxe. Real worlds have the resources: within 150 columns of spawn there are 100+ trunk tiles, 500+ copper ore in the top 80 rows and 90+ iron ore in the top 120 rows (tested; the reviewer checked 8 seeds). In the browser, `game-inventory-crafting` crafts with real clicks, and `game-needs-pickaxe` shows ore holding against bare hands. |

### Decisions and deviations

- **Mining uses the best pickaxe carried, not the selected slot.** Left click always mines and right click places (the M2 scheme), so the hotbar stays free for blocks. Weapons in M8 may make the selected item matter for left click.
- **Stations are single tiles** (like the torch), not multi-tile furniture. This is the simplest version that keeps furniture possible later. They must stand on ground, and protect the block they stand on.
- **Shallow iron in the Glowcap Grottos** (density 0.012). Rootdeep starts about 260 rows down, which made the copper → iron step a very long dig.
- **Tree trunks are background walls in worldgen**, so they're "choppable" without wall mode. Other walls still need Shift.
- **Two bars from two ore.** Totals for the climb: 7 logs, 20 stone, 28 copper ore, 20 iron ore.
- **Item icons come from either atlas.** Blocks and stations use the tile atlas; tools and bars use the sprite atlas. GameScene publishes CSS rectangles for the DOM UI.
- **The packer only places approved terrain into the tile atlas.** Approved art for one-tile objects (torch, branch, stations) has no pack path yet, so they keep their placeholders. The `stations` manifest entry is ready for when that path is added.

### Reviewer pass

No blockers. Fixed:
- After throwing a held stack with a click in the world, the same press went on to mine or place. The mouse now stays blocked until it's released.
- A press that picked nothing up followed by a release on another slot picked that slot's stack up. Only a press that picks up a stack now starts a drag.
- A stack held on the cursor at save time came back hidden after loading. It's now put back into the bag.
- Drops re-set their texture every frame (numeric frame names).
- The search box swallowed key releases, which could leave the player walking.
- A wrong comment.

Not fixed: `sinceDamage` isn't saved. It doesn't matter until damage exists in M8.

### Checks

- `typecheck`, `lint`, `test` (431) and `build` pass.
- `npm run shot` passes. The four demo-pack shots failed once because the reviewer's `build` emptied `dist/` mid-run; they pass when rerun.

### Known issues

- All M6 art is placeholder. The station art needs a pack path for one-tile objects first (see above).
- No sound effects for crafting or blocked mining yet (the plan lists sound effects for every action; they come with the audio pass).
- Health has no damage sources until M8.
- Recipes are a first pass: no lenses, light sources beyond the torch, or furniture yet (M7, M10 and M11).

### Next step

**M7 — The Lantern and the Gloam:** the four lenses and their effects, `GloamSystem` spreading in darkness and cleansing in light, Gloam tile variants, the light-ring effect and flares.

---

## M5 — The mystical forest look ✅ (2026-10-09)

### Built

- **Display:** short windows crop rows instead of dropping to ×1, so a windowed 1080p browser (~950 px tall) runs at ×2 with 474 rows (down to `DISPLAY.minHeight` 432). Title, sky and art-test scenes follow the live height.
- **World structures and flora** (world generation, all data-driven):
  - **Giant trees** (`src/data/trees.ts`), three species: elder, moonbirch and willow.
    - Living-wood trunk walls you walk in front of, and one-way branches with leaf clumps and vines.
    - A lumpy canopy with noise gaps and full-height shaft columns; willows get leaf curtains.
    - Root flares and roots in the ground. One giant tree stands west of the starting glade, so morning light falls through its canopy onto the spawn.
  - **Flora** (`src/data/flora.ts`): grass, ferns, flowers, saplings, moonpetals, reeds and toadstools on the surface; glowcaps, glowmoss, crystals, ember blooms and hanging moss and vines in caves.
  - **Small rune ruins**, one on the glade.
  - **Waterfalls:** a cut ledge with a basin and a falling-water column.
- **Simulation:**
  - **One-way platforms:** land from above, jump up through, hold Down to drop through.
  - **Decorations (flora):** removed when their support goes, and whole vine chains fall together. Blocks can replace them but can't be built off them.
  - **Leaf canopies filter sunlight** (`sunTransmit`): the World keeps a canopy shade per column for the light worker, floored at 0.4, so forests are dappled rather than black.
  - **Weather and wind** (`src/sim/weather.ts`): wind, rain spells, storms and lightning (a `lightning` event; rain dims the sun, flashes brighten it) and morning mist.
    - It is a pure function of seed and time, so nothing extra is saved.
    - New worlds start with 10 dry minutes.
  - **Glowing lights:** bioluminescent ones pulse, runes wake as the player approaches, and touching a glowing plant brightens it.
- **Render** (data per biome and depth layer in `src/data/biomeVisuals.ts`, blended by camera position over ~2 s through `VisualState`):
  - **Sky:** 4 parallax tree layers per surface biome, tinted with atmospheric perspective and cross-faded at borders, plus back mist and starfall. Rain greys the sky and hides the sun and moon; lightning flashes it.
  - **Game:**
    - Swaying foliage (`SpriteGPULayer` per chunk, GPU sway with the wind, bending as the player passes).
    - Rain with splashes, leaf drips, falling leaves and petals.
    - Pool reflections (`CaptureFrame`, High quality) and animated waterfalls with spray and mist.
  - **Glow:** light shafts through canopy gaps, angled by the sun and strongest at golden hours; motes in the shafts; ambient motes, fireflies, spores and embers.
  - **Front:** front mist (`NoiseSimplex2D`) and a dark foreground canopy.
  - **Camera:** a per-biome colour grade (ColorMatrix on the Sky and Game cameras), underwater teal with a wobble, heat haze in the Ember Roots, and a vignette.
  - **Camera framing:** outdoors the camera frames more forest above the player.
- **Audio** (procedural Web Audio until recordings are approved):
  - Wind, rain and rumble beds; birds, crickets, drips and chimes, all blended by place, time and weather.
  - Thunder after lightning.
  - Generative music per place (pads plus a sparse melody in the place's scale), cross-fading between the two most present places.
- **Quality settings:** Low turns off camera filters, mist, reflections, glow and shaft motes, and cuts parallax and particles.
- **Art pipeline:** placeholder flora, saplings, particles, parallax layers and foreground canopy, as seamless white silhouettes tinted at runtime. Standalone pack images for anything that repeats. Nano Banana prompts are in `art/prompts/style-reference.md` and `art/prompts/batches/m5-forest-look.md`.
- **Tests:** 401, covering:
  - platforms;
  - decoration support and cascades;
  - canopy shade and the light falloff through leaves;
  - weather determinism, dry start and flash;
  - pulse, proximity and touch;
  - giant trees, flora, ruins and waterfalls in a medium world;
  - the biome blend, colour grade matrix, shaft detection, foliage, weather, atmosphere and audio mixing maths.

### Done-when check

| Item | Result |
|---|---|
| Standing still in the Elderglade at sunrise looks like a fantasy painting (light shafts, mist, motes, swaying grass) | ✅ `forest-sunrise.png`, `forest-morning.png`: golden shafts through the giant tree's canopy onto the glade, hazy tree lines, mist, motes, swaying grass and flowers, a rune arch, the dark foreground canopy with vines |
| Walking from the surface down to the Moonstone Hollows feels like passing through different places | ✅ each depth layer has its own flora glow, fog colour, particles, grade and music (`biome-glowcap_grottos/rootdeep/moonstone_hollows.png`); the look cross-fades with depth |
| A screenshot of each biome is easy to tell apart | ✅ `biome-*.png`: warm gold Elderglade, silver-blue Vale, muted grey-green Mire; teal and pink Grottos, mossy Rootdeep, pale silver-blue Hollows, smoky red Ember Roots, violet Gloam Heart |

### Decisions and deviations

- **Leaves filter sunlight instead of blocking it.** Canopies sit about 100 rows up, outside the light worker's region, so the World carries per-column canopy shade.
- **The spawn tree stands west of the glade**, so the morning light slants toward the spawn. The shaft lean is limited to 0.32 because the canopy is far above.
- **Back mist is a baked fog texture, not `NoiseSimplex2D`.** The noise object can't fade at its top edge. The front mist uses the noise object.
- **The camera grade is on the Sky and Game cameras only.** A filter covers one camera; the glow stays ungraded so light colours stay vivid. The vignette sits on the last camera.
- **Caves stay dark for gameplay.** Each layer reads as its own place through glowing flora and a mist colour drawn over the lit result, not through fill light. The M3 darkness check now samples cells away from glowing plants. The depth-layer shots aim the lantern into the cave.
- **Waterfalls are static**, a carved ledge plus a column of waterfall tiles, until liquids flow in M9.
- **Real parallax art is fully coloured.** Approved layers skip the biome tint and get only time-of-day light.
- **Audio is procedural** until recordings exist.
- **The new tile ids 27–49 are appended**, so the save format is unchanged.
- **The shot suite runs the west-run test on Low quality**, because software rendering in headless Chromium is slow. `SHOT_DIST` and `SHOT_EXTRA` were added for ad-hoc shots.

### Reviewer pass

No blockers. Fixed from the review:
- Pool reflections froze after Save & quit and reopening a world (CaptureFrame refuses a texture key in use).
- A burst of music after unpausing (missed beats are now skipped).
- A stale light-shaft listener after a restart.
- Unnamed tuning numbers in renderers and audio moved to config/data.
- Per-frame allocations in the audio mix and the biome blend closures.
- Blocks could be built off a flower or vine.
- Root flares recorded a ground row they hadn't placed.
- A stale step label.

### Performance

- **Real GPU (headed Chromium):** about 164 FPS at every quality level, with about 0.13 ms of CPU per frame and 28–33 draw calls (budget 100).
- **Headless SwiftShader** (software, not representative): about 19 FPS on High and 44 on Low.

### Known issues

- All M5 art is code-drawn placeholder. The look depends heavily on the real parallax, tree and foliage art; prompts are ready.
- Mire pools are shallow (1–3 rows), so reflections are small. The reflections show no sky, since the sky is another scene.
- Lava doesn't emit light yet (M9). Waterfalls don't fill pools (M9).
- Placing a block on a flower destroys the flower without a drop (no decoration has a drop yet). A plant in front of a wall is mined before the wall.
- The audio has been listened to (2026-10-09): the user liked the music.

### Next step

**M6 — Items, crafting and UI:** item and recipe registries, crafting stations, tool tiers and mining hardness, the full inventory with drag and drop, the crafting screen, health and the Lumen and lens HUD.

---

## M4 — World generation, biomes and saving ✅ (2026-10-09)

### Built

- **World generation in a Web Worker** (`src/workers/worldgen/`): the 12 steps of plan 3.2 in order (terrain height, biomes, soil/stone, caves, ores and Lumen, liquids, structures, background walls, decorations, initial Gloam, settle, validation), each with its own seeded stream, so the same seed always gives the same arrays. Falls back to the main thread if the worker fails (including unreadable messages). Medium (4200×1200) generates in ~0.6 s in Node; a large world (6400×1800) is created through the UI in ~2 s.
- **Biomes as data** (`src/data/biomes.ts`): three surface biomes (Elderglade in the middle, Moonpetal Vale and Weeping Mire on the sides), each with its own grass and pool chance; five depth layers (Glowcap Grottos, Rootdeep, Moonstone Hollows, Ember Roots, Gloam Heart), each with its own rock, ores, cave density, liquid, signature feature and Gloam strength. 16 new tiles with items and lights (glowcaps, emberite).
- **Ores and Lumen crystals by depth:** random-walk veins per layer from data densities (copper high up, emberite deep).
- **Liquids:** surface pools in dips (the Mire is wet) and underground lakes (water above, lava in Ember Roots), resting on floors. **Drawn** by a third chunk renderer (`liquidFrames.ts`, a canvas sheet made in BootScene): translucent water and near-opaque lava, with a lighter top on surface cells.
- **Saving** (`src/persistence/`): a binary `GLDP` format (JSON header + aligned typed arrays), gzip via `CompressionStream`, IndexedDB via `idb`, 3 rotating backups per world, falling back to an older backup if one is corrupt. Migrations receive the header *and* arrays, so later versions can add or convert arrays. Saved: tiles, walls, liquids, Gloam, biomes, layer tops, player (incl. jump/coyote state), inventory, time of day, drops (position, velocity, age), the gameplay random state, spawn.
- **World flow** (`src/flow/WorldFlow.ts`): title → world list (play / delete with confirmation / create with name, seed, size) → "Growing the forest…" progress screen → game. Esc pauses (Resume, Save & quit). Autosave every 2 min, save when the tab is hidden, first save right after creation; saves never overlap.
- **Debug starts** on a real generated world: `?scene=game` (seed `DEBUG.defaultSeed`), `seed=`, `size=small|medium|large`, `biome=<surface biome or depth layer>`, `spot=cave`, plus `x=&y=` as before. The F3 overlay shows the biome/layer at the player.
- **Shots:** each biome and layer, water and lava, the empty world list, the generating screen, a large world created through the UI (timed), and a **browser save → quit → reload → play** check. `SHOT_ONLY=a,b npm run shot` reruns selected shots.
- **Tests:** 276 (determinism of every array, step order and progress, spawn safety, biome/layer placement, ores by depth, liquids resting on something, surface pools, generation time; save format round trip, corruption, migrations incl. adding an array; IndexedDB store with backups and backup spacing; save → restore → identical simulation and random sequence; WorldFlow with fakes; debug spawns; seed parsing).

### Done-when check

| Item | Result |
|---|---|
| Creating a world with a seed shows progress and finishes in under 15 s | ✅ large world via the UI in ~2 s with the progress screen (`worlds-generating.png`, `worlds-created-large.png`); medium ~0.6 s |
| The same seed gives the same world (tested) | ✅ `tests/workers/worldgen/generateWorld.test.ts` hashes every array for two runs |
- Light results are applied when the worker answers (between steps, but timing-dependent); light outside the current region goes stale when the camera leaves. Resolved in M7: logged as accepted (see M7 decisions).

### Decisions and deviations

- **Liquids are static until M9** (flow, swimming, lava light). Placing a block into a liquid cell leaves the liquid drawn over it until then; lava does not emit light yet, so unlit lava looks dark.
- **Settle is one bottom-up compaction pass per column**, which is exact for a world at rest; the real falling/liquid simulations come in M9.
- **`TEST_WORLD` and the hand-made test world are gone**: every start, including `?scene=game`, uses the real generator. Screenshot positions (cave, biomes, liquids, torch spots) are found at runtime instead of hard-coded coordinates.
- **Structures (step 7) only clear the starting glade** for now; trees, ruins and towns plug in from M5 on.
- **Surface pools are shallow and fairly rare**: the hills are gentle, so dips are 1–3 tiles deep.
- **Backups are spaced:** the latest save becomes a backup only when it is at least `SAVE.backupSpacingSeconds` (2 min) newer than the previous backup, so tab-switch saves can't push out all the older ones.
- **Mining damage is not saved**: it is cleared whenever you stop mining a tile anyway.
- **Save version stays 1**: nothing was released before the format settled.

### Reviewer pass

No blockers. Fixed from the review: surface pools never generated (the rim search walked the wrong way); unnamed numbers in worldgen moved to `WORLDGEN`; migrations can now change arrays, and a save with the wrong number of depth layers is rejected instead of half-loaded; the scene manager no longer keeps a second copy of the world (tens of MB) for the session; drops keep their age/velocity and the random generator resumes its sequence; the header layout fixpoint is checked; a worker message error falls back to the main thread; seeds above 32 bits are hashed instead of wrapping onto another seed; hot-loop allocations in decorations removed.

### Known issues

- `toSaveState` returns live views of the world arrays; it is correct because `SaveStore.save` encodes synchronously before its first `await`. Keep it that way (commented in `Simulation.toSaveState`).
- Worm tunnels use `Math.sin/cos`, whose last bits may differ between JS engines; saves store the arrays, so only sharing a seed across browsers could give a slightly different world.
- Still open from M0: windowed 1080p falls back to ×1 zoom (your call: accept, or crop rows to keep ×2).

### Next step

**M5 — The mystical forest look (visual milestone):** giant ancient trees in world generation, canopy light shafts and mist, parallax tree layers per biome, per-biome colour grading, weather, swaying foliage, bioluminescence, reflective pools and waterfalls, ambient particles.

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
