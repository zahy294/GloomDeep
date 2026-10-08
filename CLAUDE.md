# Gloamdeep

2D fantasy sandbox game for the browser, set in a mystical forest where light is life. Single-player, finite world, 16px pixel art.
**Stack:** Phaser 4.2.x · TypeScript (strict) · Vite · Preact (UI overlay) · Vitest · Playwright (screenshots) · IndexedDB.

`GLOAMDEEP_PLAN.md` is the source of truth for design, architecture and milestones. `PROGRESS.md` is the running log. Read both at the start of every session.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build (must pass before a milestone is done)
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run lint       # ESLint + Prettier check
npm run shot       # Playwright screenshots of the built game → screenshots/
```

## Hard rules

1. **Phaser 4 only.** Training data and most tutorials are Phaser 3. Before using any Phaser API you haven't already used in this repo, look it up in `node_modules/phaser/skills/` or `node_modules/phaser/types/` (delegate to `phaser-scout`). Never guess an API.
   - Removed in v4, never use: `setPipeline`, pipelines, `preFX`, `postFX`, `BitmapMask`, WebGL `GeometryMask`, `Mesh`, `Plane`, `Phaser.Geom.Point`.
   - Use: `setLighting(true)`, `enableFilters()` + `filters.internal` / `filters.external`, filter masks, `Vector2`, `TilemapGPULayer`, `SpriteGPULayer`.
2. **`src/sim/` never imports Phaser.** The simulation is plain TypeScript and runs in Vitest without a browser.
3. **The simulation never calls rendering, UI or audio code.** It emits typed events on the event bus. The UI sends commands; it never changes state directly.
4. **Content is data.** Tiles, items, recipes, enemies, biomes, lights, dialogue, quests and prefabs live in `src/data/`. Adding content must not need engine code.
5. **No magic numbers in systems.** Tunable values go in `src/config.ts` or `src/data/`.
6. **TypeScript strict.** No `any` or `@ts-ignore` without a comment explaining why. A type error on a Phaser call usually means a hallucinated or v3 API: look it up instead of casting it away.
7. **Lighting is gameplay data.** The light grid lives in the simulation; Gloam spread, spawning, plants and towns all read it.

## Workflow

- Work **one milestone at a time**, in order. Break it into small tasks before writing code.
- A milestone is done only when: every "Done when" item is met, `typecheck`, `test`, `lint` and `build` pass, and (for anything visual) `npm run shot` screenshots have been looked at.
- After each milestone, update `PROGRESS.md` (what was built, deviations from the plan and why, known issues, next step), then **stop and show the user**.
- If the plan doesn't cover a decision, choose the simplest option that keeps later milestones possible and log it in `PROGRESS.md`.
- If the plan seems wrong or a Phaser 4 feature doesn't work as described, stop and explain rather than quietly working around it.

## Subagents

Use the agents in `.claude/agents/`. The main session plans, makes design decisions and integrates the work.

| Agent | Model | Use for |
|---|---|---|
| `phaser-scout` | Haiku | Looking up exact Phaser 4 APIs in `node_modules/phaser`; finding files in the repo. Read-only. |
| `check-runner` | Haiku | Running typecheck/test/lint/build/shot and summarizing failures. |
| `implementer` | Sonnet | Implementing one well-defined task (a system, a renderer, a data file, tests) with a clear spec. |
| `reviewer` | Opus | Reviewing a finished task or milestone against the plan and these rules before it's marked done. |

Rules:
- Give subagents a **specific, self-contained task**: the files involved, the expected behavior, the relevant plan section, and how to verify it. They start without this conversation's context.
- Keep design decisions, cross-system changes, lighting/worldgen algorithms and anything touching several layers in the main session (or give them to `implementer` only with a detailed spec).
- Don't delegate tiny edits; doing them directly is cheaper than briefing a subagent.
- Every milestone gets a `reviewer` pass before it's reported as done.

## Testing

- Every simulation system has unit tests in `tests/`, mirroring `src/sim/` and `src/workers/`.
- World generation: same seed → identical world (test it).
- Lighting: test flood fill, absorption and colored light on small hand-made grids.
- Collision: test slopes, platforms, corners and high-speed movement against tiles.

## Visual checks

- The game accepts debug URL parameters so screenshots are repeatable: `?seed=42&time=dawn&x=2100&y=300&biome=elderglade&ui=0`.
- `npm run shot` captures a fixed set of scenes (each biome, day/night, underwater, a town). Look at them after visual work.
- F3 toggles the debug overlay: FPS, draw calls, chunk borders, light values, entity count, biome, Gloam level.

## Art

- Pipeline: `GLOAMDEEP_PLAN.md` Section 2.9. Use the `art-import` skill for anything art-related.
- Commands: `npm run art:palette`, `art:import [id|category]`, `art:autotiles [material]`, `art:pack`.
- The game loads only `approved` assets from `art/manifest.json`; everything else uses placeholders. Code must never depend on a specific asset existing.
- Never modify `art/raw/`. Never approve art yourself; the user approves.
- Internal resolution 960×540, 16px tiles, `pixelArt: true`.

## Performance budget

60 FPS on integrated graphics at 1080p · light update ≤ 4 ms · < 100 draw calls · initial download < 10 MB.

## Style

- Small files, one system per file. Clear names over comments; comment the *why*, not the *what*.
- Prefer typed arrays for world data. Avoid allocating objects in per-frame loops.
- Commit after each completed task with a clear message.
