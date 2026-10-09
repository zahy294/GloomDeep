# M6 art batch: tools, bars and crafting stations

For each prompt:

1. Copy the whole block into Gemini (Nano Banana).
2. **Attach `art/reference/style-reference.png`.**
3. Save the best result as `art/raw/<raw path>`.

Then tell Claude Code to import the batch.

Icons are drawn at 16×16. Keep them chunky and readable at 1×: a strong silhouette matters more than detail. Each icon sits in its own cell on the magenta background.

## `items` → `art/raw/item/items.png`
Target: 7 icons, 16×16 each, in one row (7×1 grid). The order matters: the game looks icons up by position.

```
A sprite sheet of 7 small inventory item icons in a single row, each in its own square cell with equal spacing, each item separate, on a solid flat #FF00FF magenta background, in this exact order: a pickaxe with a carved pale-brown wooden head and a dark wooden handle; a pickaxe with a burnished orange-copper head and a wooden handle; a pickaxe with a dark grey iron head and a wooden handle; a pickaxe with a gleaming pale silver-blue moonsilver head and a wooden handle; a copper ingot bar; a grey iron ingot bar; a pale silver-blue moonsilver ingot bar with a faint cool shine. Every pickaxe points the same way: handle running from the bottom-left corner, head across the top-right. Ingots lie flat, seen slightly from above; final size of each cell 16×16 pixels.

Pixel art game asset for a 2D side-view fantasy sandbox game. Chunky pixels, dark colored 1-pixel outlines, flat 2–3 tone shading lit from the top-left, saturated mystical-forest colors, no anti-aliasing, no gradients, no text, no shadows on the ground. Match the style and colors of the attached reference image exactly.
```

## `stations` → `art/raw/furniture/stations.png`
Target: 3 objects, 16×16 each, in one row (3×1 grid), standing on the bottom edge of their cell.

```
A sprite sheet of 3 small crafting stations in a single row, each in its own square cell with equal spacing, each item separate, on a solid flat #FF00FF magenta background, side view, each standing on the bottom edge of its cell, in this exact order: a sturdy wooden workbench with a thick plank top and four legs; a squat stone furnace with a glowing orange fire mouth in its front and a short chimney; a moonsilver-grey anvil with a horn on one side on a short base. Final size of each cell 16×16 pixels.

Pixel art game asset for a 2D side-view fantasy sandbox game. Chunky pixels, dark colored 1-pixel outlines, flat 2–3 tone shading lit from the top-left, saturated mystical-forest colors, no anti-aliasing, no gradients, no text, no shadows on the ground. Match the style and colors of the attached reference image exactly.
```

Note: the stations are one-tile objects in the tile atlas, like the torch. The packer only places approved **terrain** into the tile atlas today, so importing this sheet works but the game keeps the placeholder stations until fixed-look tiles get a pack path (logged in PROGRESS.md).
