# Phaser 4 API reference for M5 (looked up in node_modules/phaser; delete with M5_PLAN.md)

Items marked UNVERIFIED were not confirmed in source. Verify those before relying on them.

## Already used in the repo

TilemapGPULayer (ChunkRenderer), camera `setForceComposite(true)` (GameScene), `textures.createCanvas` (LightMapRenderer, BootScene), `add.particles` (ParticleFX), `add.gradient` (SkyScene).

## NoiseSimplex2D (extends Shader)

- Factory: `this.add.noisesimplex2d(config?, x?, y?, width?, height?)`. Source: `src/gameobjects/noise/noisesimplex2d/NoiseSimplex2D.js`.
- Properties:
  - `noiseOffset [x,y]`: scroll it by writing every frame.
  - `noiseFlow`: evolves the pattern.
  - `noiseCells [x,y]`: default 32×32.
  - `noiseIterations`, `noiseWarpAmount`, `noisePeriod`.
  - `noiseValueFactor` (0.5) and `noiseValueAdd` (0.5).
  - `noiseColorStart`, `noiseColorEnd`: `Phaser.Display.Color` with alpha, set via `setNoiseColor(start, end)`. A two-colour ramp.
- No time uniform: animate by writing `noiseOffset` / `noiseFlow` in `update()`.
- **`noiseSeed` is not read by the source.** Vary `noiseOffset` instead.
- Has BlendMode, Depth, Origin, ScrollFactor, Transform and Visible. **No Tint.**
- Each noise object is its own draw call and breaks batching.

## SpriteGPULayer

- Factory: `this.add.spriteGPULayer(textureKey, size)`, where `size` is the maximum member count. Grow it with `resize(count, clear?)`.
- **The layer itself has no Transform, Origin or ScrollFactor.** Position and scroll factor are per member. It has Alpha, BlendMode, Depth and Lighting.
- Member fields:
  - `x, y, rotation, scaleX, scaleY, alpha`: each a number or a MemberAnimation.
  - `originX/originY` (default 0.5), `frame` (required), `scrollFactorX/Y`.
  - Tints: `tintMode`, `tintBlend`, `tintTopLeft…`; corner alphas `alphaTopLeft…`.
  - `creationTime`.
- **MemberAnimation:** `{ base, ease, amplitude, duration (ms), delay (ms), loop=true, yoyo=true }`. Example: `{ base: 0, ease: 'Sine.easeInOut', amplitude: 0.1, duration: 2000, delay: 300 }`. There is no phase property: use `delay`. Check that the ease name exists in `EasingEncoding.js`.
- Methods: `addMember(m)` (a no-op when full), `editMember(i, m)`, `patchMember`, `getMember`, `removeMembers(i, n)`, `setSegmentNeedsUpdate`.
- **Buffer updates are expensive: fill once, edit rarely.** To hide a member, set its scale or alpha to 0. Members draw in buffer order. Supports lighting.

## Filters (WebGL)

- Game objects need `enableFilters()` first; cameras already have `camera.filters`.
- `filters.internal` runs in local space and is cheaper. `filters.external` runs in screen space, full screen.
- FilterList: `add / remove / clear / getActive`. Each controller has `active` / `setActive(bool)`.
- Factories:
  - `addBlur(quality, x, y, strength, color, steps)`
  - `addColorMatrix()`
  - `addDisplacement(texture, x, y)`
  - `addGlow(...)`
  - `addGradientMap(config)`
  - `addThreshold`, `addMask`
  - `addVignette(x, y, radius, strength, color, blendMode)` (confirm it exists)
- **ColorMatrix:**
  - `filter.colorMatrix`: `set(20 values)`, `reset()`, `getData()`, `multiply(a, multiply)`, plus presets `brightness / saturate / hue / contrast / grayscale / sepia` (each with an optional multiply flag).
  - No blend between two settings: lerp the 20 values yourself and call `set()`.
- **Displacement:** properties `x, y` (scale), `setTexture`. It has no scroll offset; moving the distortion needs a changing texture (UNVERIFIED).
- **Cost:** each filter is an extra full-target pass.

## CaptureFrame

- `this.add.captureFrame(key)` captures what was rendered before it in the display list into texture `key`. It draws nothing itself.
- Needs `camera.setForceComposite(true)`, which GameScene already sets.
- Show the texture with an Image. For a reflection, flip it with a negative scaleY (UNVERIFIED but standard).

## TileSprite

- `this.add.tileSprite(x, y, w, h, key, frame?)`.
- Properties: `tilePositionX/Y`, `tileScaleX/Y`.
- Has ScrollFactor, Tint and Lighting. A canvas texture key should work (untested). Prefer standalone textures over atlas frames for repeating.

## Gradient

- A Shader: one draw call each, and it breaks batching. **For many light shafts, use a canvas gradient texture on batched Images instead.**

## Particles

- `this.add.particles(x, y, texture, config)` returns a ParticleEmitter.
- Config keys:
  - `emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(...) }`
  - `gravityX/Y`, `speed`, `lifespan`
  - `alpha/scale: { start, end, ease }`, `tint`, `color`, `blendMode`
  - `frequency`, `quantity`, `maxParticles`, `reserve`, `follow`, `emitting`
- Methods: `setConfig`, `updateConfig`, `startFollow`, `setEmitZone`, `setParticleTint/Alpha`, `setFrequency/Quantity`, `explode`, `flow`, `start/stop`, `killAll`, `setScrollFactor`, `setBlendMode`.

## Camera

- `camera.flash(duration, r, g, b, force)`.
- `camera.ignore(objects)`.
- `setForceComposite` costs a framebuffer.

## Sound

- `this.sound.context` is the AudioContext (WebAudio only; check that it exists).
- Phaser unlocks audio itself on the first mousedown or keydown. `sound.locked` and the `'unlocked'` event are available.
