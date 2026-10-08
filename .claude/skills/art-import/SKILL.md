---
name: art-import
description: Process new art for Gloamdeep. Use when the user drops images into art/raw/, asks to import, clean up, review or approve art, or asks for a Nano Banana prompt for a new asset.
---

# Gloamdeep art import

The full pipeline is in `GLOAMDEEP_PLAN.md` Section 2.9. Follow it; this is the checklist.

## When the user wants a prompt for a new asset

1. Pick the matching template from `art/prompts/` (single object, sheet, tree, tile texture, parallax layer, character, enemy).
2. Fill in the specifics, append the **base prompt**, and remind the user to **attach `art/reference/style-reference.png`**.
3. Never put the name of an existing game in a prompt.
4. Add a manifest entry with `status: "raw"`, the target size/grid, anchor and the prompt used.

## When new raw images arrive

1. Check each file in `art/raw/<category>/` has a manifest entry (create one if missing; ask the user for the target size if it isn't obvious).
2. Run `npm run art:import <id>` (or the category).
3. Look at every 4× preview yourself. Report, per asset:
   - wrong size or crop, cut-off parts
   - magenta fringe left over
   - seams on textures/parallax layers
   - colors the tool flagged as far from the palette
   - outlines broken or missing, blurry areas (grid detection failed)
4. For terrain textures, also run `npm run art:autotiles <material>` and check the result.
5. Show the asset in the game: `?scene=art-test&id=<id>`, take Playwright screenshots in day and night lighting, and show them next to the style reference.
6. Tell the user what needs manual touch-up (be specific: "left edge of the trunk, rows 30–34"). Don't mark anything approved yourself.

## When the user approves

1. Set `status: "approved"` in `art/manifest.json`.
2. Run `npm run art:pack`, then `npm run build`.
3. Note the asset in `PROGRESS.md`.

## Rules

- Never edit files in `art/raw/`. They're the originals.
- Never hand-edit pixels in `art/clean/` with code to "fix" art; flag it for the user instead. Fixing tooling bugs is fine.
- If many assets fail grid detection the same way, fix the tool (with a test), not the images.
- Record a license for anything not generated or drawn for this project.
