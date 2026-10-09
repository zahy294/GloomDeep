import type * as Phaser from 'phaser';
import { CHUNK_RENDER, FOLIAGE, TILE_SIZE } from '../config';
import { TILES, type DecorDef } from '../data/tiles';
import type { EventBus, SimEvents } from '../sim/events';
import type { World } from '../sim/world/World';
import { chunkRangeFor, inRange, rangeSize, type ChunkRange, type Rect } from './chunkMath';
import type { PreloadBudget } from './ChunkRenderer';
import {
  bendTarget,
  decorPlacement,
  pivotSign,
  swayRotation,
  swayTiming,
  type DecorPlacement,
} from './foliageMath';
import { spriteFrame } from './spriteFrames';

type Member = Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member>;
type MemberAnimation = Phaser.Types.GameObjects.SpriteGPULayer.MemberAnimation;

const DECOR: readonly (DecorDef | undefined)[] = TILES.map((t) => t.decor);
/** Verified in node_modules/phaser/src/gameobjects/spritegpulayer/EasingEncoding.js. */
const SWAY_EASE = 'Sine.easeInOut';
/** Word offsets inside a member's raw data: rotation is the third animated value (4 words each). */
const ROTATION_BASE_WORD = 8;
const ROTATION_AMPLITUDE_WORD = 9;
/** `patchMember` only copies the words whose mask entry is 1. */
const ROTATION_MASK: number[] = Array.from({ length: ROTATION_AMPLITUDE_WORD + 1 }, (_, i) =>
  i === ROTATION_BASE_WORD || i === ROTATION_AMPLITUDE_WORD ? 1 : 0,
);
/** Member word holding the static scaleY (no animation on it): shy vines curl by patching it. */
const SCALE_Y_WORD = 16;
const SCALE_MASK: number[] = Array.from({ length: SCALE_Y_WORD + 1 }, (_, i) =>
  i === SCALE_Y_WORD ? 1 : 0,
);
const scalePatch = new Uint32Array(SCALE_Y_WORD + 1);
/** Float32/Uint32 views of the same 4 bytes, to write floats into raw member data. */
const floatBits = new Float32Array(1);
const wordBits = new Uint32Array(floatBits.buffer);

interface Slot {
  index: number;
  layer: Phaser.GameObjects.SpriteGPULayer;
  chunkIndex: number;
  /** Per member: sway, pivot sign and current bend (radians) with its goal. */
  sway: Float32Array;
  sign: Int8Array;
  bend: Float32Array;
  bendGoal: Float32Array;
  /** 1 while the member is in the bent list. */
  bent: Uint8Array;
  /** Shy vines: 1 if shy; how curled (0..1) and the goal; 1 while in the curling list. */
  shy: Uint8Array;
  curl: Float32Array;
  curlGoal: Float32Array;
  curling: Uint8Array;
  /** Member index per tile of the chunk (row-major), −1 where there is no decoration. */
  memberAt: Int32Array;
  count: number;
  dirty: boolean;
  /** Reused raw data for `patchMember`. */
  patch: Uint32Array;
}

/**
 * Draws decoration tiles (grass, ferns, vines, saplings...; tiles with `decor`) as one
 * SpriteGPULayer per loaded chunk (plan 2.2 layer 9), from a pool like ChunkRenderer's. One layer
 * per chunk keeps each buffer small and lets a chunk be refilled when it is re-pointed or edited;
 * each layer is one draw call and at most 2×2 chunks touch the view.
 *
 * Sway runs entirely on the GPU: each plant has a sine-in-out rotation animation about its pivot
 * (base for ground plants, top for hanging ones) with a per-tile period and phase. The wind only
 * changes the swing's centre and amplitude, so members are re-patched when the wind has moved
 * noticeably (rate-limited), not every frame. Plants near the player lean away: only that handful
 * of members is patched per frame, and each springs back once the player has passed.
 */
export class FoliageRenderer {
  private readonly slots: Slot[] = [];
  private readonly loaded = new Map<number, Slot>();
  private readonly chunkPx: number;
  private readonly needed: ChunkRange = { cx0: 0, cy0: 0, cx1: 0, cy1: 0 };
  private readonly visible: ChunkRange = { cx0: 0, cy0: 0, cx1: 0, cy1: 0 };
  /** Atlas frame name per tile id; empty when the sprite sheet is not in the atlas. */
  private readonly frameNames: string[];
  private readonly unsubscribe: () => void;
  private readonly placement: DecorPlacement = { x: 0, y: 0, originX: 0.5, originY: 0.5 };
  private readonly rotation = { base: 0, amplitude: 0 };
  /** Reused member description: addMember reads it synchronously. */
  private readonly member: Member = { creationTime: 0 };
  private readonly swing: MemberAnimation = { ease: SWAY_EASE };
  /** Members currently bent or recovering, as slot index * capacity + member index. */
  private readonly activeBends = new Int32Array(FOLIAGE.bend.maxActive);
  private activeCount = 0;
  /** Shy vines currently curled or unfurling, encoded like activeBends. */
  private readonly activeCurls = new Int32Array(FOLIAGE.shy.maxActive);
  private curlCount = 0;
  private appliedWind = 0;
  private sinceWindPatch = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    events: EventBus<SimEvents>,
    textureKey: string,
    depth: number,
  ) {
    this.chunkPx = world.chunkSize * TILE_SIZE;
    const texture = scene.textures.get(textureKey);
    this.frameNames = TILES.map((t) => {
      if (!t.decor) return '';
      const name = spriteFrame(t.decor.sprite, t.decor.frame);
      return texture.has(name) ? name : '';
    });
    const tilesPerChunk = world.chunkSize * world.chunkSize;
    const capacity = FOLIAGE.layerCapacity;
    for (let index = 0; index < CHUNK_RENDER.poolSize; index++) {
      const layer = scene.add
        .spriteGPULayer(textureKey, capacity)
        .setDepth(depth)
        .setVisible(false);
      this.slots.push({
        index,
        layer,
        chunkIndex: -1,
        sway: new Float32Array(capacity),
        sign: new Int8Array(capacity),
        bend: new Float32Array(capacity),
        bendGoal: new Float32Array(capacity),
        bent: new Uint8Array(capacity),
        shy: new Uint8Array(capacity),
        curl: new Float32Array(capacity),
        curlGoal: new Float32Array(capacity),
        curling: new Uint8Array(capacity),
        memberAt: new Int32Array(tilesPerChunk).fill(-1),
        count: 0,
        dirty: false,
        patch: new Uint32Array(ROTATION_AMPLITUDE_WORD + 1),
      });
    }
    this.unsubscribe = events.on('tileChanged', (e) => {
      if (e.layer !== 'fg') return;
      if (DECOR[e.id] === undefined && DECOR[e.previous] === undefined) return;
      const size = world.chunkSize;
      const slot = this.loaded.get(Math.floor(e.y / size) * world.chunksX + Math.floor(e.x / size));
      if (slot) slot.dirty = true;
    });
  }

  /** Call once per frame with the camera view, the wind (−1..1) and the player's feet (px). */
  update(
    view: Rect,
    budget: PreloadBudget,
    wind: number,
    playerX: number,
    playerY: number,
    dt: number,
  ): void {
    const { chunksX, chunksY } = this.world;
    const needed = chunkRangeFor(
      view,
      CHUNK_RENDER.preloadMarginPx,
      this.chunkPx,
      chunksX,
      chunksY,
      this.needed,
    );
    const visible = chunkRangeFor(view, 0, this.chunkPx, chunksX, chunksY, this.visible);
    if (rangeSize(needed) > this.slots.length) {
      throw new Error(`Foliage pool too small: need ${rangeSize(needed)} layers`);
    }

    for (const [index, slot] of this.loaded) {
      if (inRange(needed, index % chunksX, Math.floor(index / chunksX))) continue;
      this.release(slot);
      this.loaded.delete(index);
    }
    // The first frame has no wind history: start the swing already leaning the right way.
    if (this.loaded.size === 0) this.appliedWind = wind;
    this.load(visible, Infinity);
    budget.remaining -= this.load(needed, budget.remaining);

    for (const slot of this.loaded.values()) {
      if (slot.dirty) this.fill(slot, slot.chunkIndex);
    }

    this.sinceWindPatch += dt;
    if (
      Math.abs(wind - this.appliedWind) >= FOLIAGE.windPatchThreshold &&
      this.sinceWindPatch >= FOLIAGE.windPatchIntervalSeconds
    ) {
      this.applyWind(wind);
    }
    this.updateBends(playerX, playerY, dt);
    this.updateCurls(playerX, playerY, dt);
  }

  destroy(): void {
    this.unsubscribe();
    for (const slot of this.slots) slot.layer.destroy();
  }

  get stats(): { loaded: number; members: number; bent: number } {
    let members = 0;
    for (const slot of this.loaded.values()) members += slot.count;
    return { loaded: this.loaded.size, members, bent: this.activeCount };
  }

  private load(range: ChunkRange, budget: number): number {
    const { chunksX } = this.world;
    let loadedNow = 0;
    for (let cy = range.cy0; cy <= range.cy1; cy++) {
      for (let cx = range.cx0; cx <= range.cx1; cx++) {
        const index = cy * chunksX + cx;
        if (this.loaded.has(index)) continue;
        if (budget <= 0) return loadedNow;
        const slot = this.slots.find((s) => s.chunkIndex === -1);
        if (!slot) return loadedNow; // Unreachable: update() checks the pool size first.
        this.loaded.set(index, slot);
        this.fill(slot, index);
        loadedNow++;
        budget--;
      }
    }
    return loadedNow;
  }

  private release(slot: Slot): void {
    this.dropBends(slot);
    slot.layer.setVisible(false);
    slot.chunkIndex = -1;
    slot.count = 0;
    slot.dirty = false;
  }

  /** Rebuilds a slot's members from the world (chunk load, or an edit that touched decorations). */
  private fill(slot: Slot, chunkIndex: number): void {
    const { world, member, placement, swing } = this;
    const size = world.chunkSize;
    const x0 = (chunkIndex % world.chunksX) * size;
    const y0 = Math.floor(chunkIndex / world.chunksX) * size;
    this.dropBends(slot);
    slot.chunkIndex = chunkIndex;
    slot.layer.memberCount = 0;
    slot.memberAt.fill(-1);
    let count = 0;
    for (let ty = y0; ty < y0 + size && ty < world.height; ty++) {
      const row = ty * world.width;
      for (let tx = x0; tx < x0 + size && tx < world.width; tx++) {
        const id = world.fg[row + tx] ?? 0;
        const decor = DECOR[id];
        const frame = this.frameNames[id];
        if (!decor || !frame || count >= FOLIAGE.layerCapacity) continue;
        decorPlacement(decor.support, tx, ty, placement);
        const sign = pivotSign(decor.support);
        member.x = placement.x;
        member.y = placement.y;
        member.originX = placement.originX;
        member.originY = placement.originY;
        member.frame = frame;
        if (decor.sway > 0) {
          const timing = swayTiming(tx, ty);
          const rot = swayRotation(decor.sway, this.appliedWind, sign, 0, this.rotation);
          swing.base = rot.base;
          swing.amplitude = rot.amplitude;
          swing.duration = timing.periodMs;
          swing.delay = timing.delayMs;
          member.rotation = swing;
        } else {
          member.rotation = 0;
        }
        slot.layer.addMember(member);
        slot.sway[count] = decor.sway;
        slot.sign[count] = sign;
        slot.bend[count] = 0;
        slot.bendGoal[count] = 0;
        slot.bent[count] = 0;
        slot.shy[count] = decor.shy ? 1 : 0;
        slot.curl[count] = 0;
        slot.curlGoal[count] = 0;
        slot.curling[count] = 0;
        slot.memberAt[(ty - y0) * size + (tx - x0)] = count;
        count++;
      }
    }
    slot.count = count;
    slot.dirty = false;
    slot.layer.setVisible(true);
  }

  /** Wind moved: re-centre and re-scale every swinging plant. Cheap (a few hundred patches). */
  private applyWind(wind: number): void {
    this.appliedWind = wind;
    this.sinceWindPatch = 0;
    for (const slot of this.loaded.values()) {
      for (let i = 0; i < slot.count; i++) {
        if ((slot.sway[i] ?? 0) > 0) this.patchRotation(slot, i);
      }
    }
  }

  private patchRotation(slot: Slot, i: number): void {
    const rot = swayRotation(
      slot.sway[i] ?? 0,
      this.appliedWind,
      slot.sign[i] === -1 ? -1 : 1,
      slot.bend[i] ?? 0,
      this.rotation,
    );
    floatBits[0] = rot.base;
    slot.patch[ROTATION_BASE_WORD] = wordBits[0] ?? 0;
    floatBits[0] = rot.amplitude;
    slot.patch[ROTATION_AMPLITUDE_WORD] = wordBits[0] ?? 0;
    slot.layer.patchMember(i, slot.patch, ROTATION_MASK);
  }

  /** Plants near the player get a lean goal; every bent plant eases towards its goal. */
  private updateBends(playerX: number, playerY: number, dt: number): void {
    const { world } = this;
    const cfg = FOLIAGE.bend;
    const capacity = FOLIAGE.layerCapacity;
    for (let a = 0; a < this.activeCount; a++) {
      const id = this.activeBends[a] ?? 0;
      const slot = this.slots[Math.floor(id / capacity)];
      if (slot) slot.bendGoal[id % capacity] = 0;
    }

    const size = world.chunkSize;
    const tileX = Math.floor(playerX / TILE_SIZE);
    const feetRow = Math.floor((playerY - 1) / TILE_SIZE);
    for (let ty = feetRow - cfg.rowsAboveFeet; ty <= feetRow; ty++) {
      for (let tx = tileX - cfg.columns; tx <= tileX + cfg.columns; tx++) {
        if (!world.inBounds(tx, ty)) continue;
        const cx = Math.floor(tx / size);
        const cy = Math.floor(ty / size);
        const slot = this.loaded.get(cy * world.chunksX + cx);
        const i = slot?.memberAt[(ty - cy * size) * size + (tx - cx * size)] ?? -1;
        if (!slot || i < 0) continue;
        const goal = bendTarget(
          (tx + 0.5) * TILE_SIZE,
          playerX,
          slot.sway[i] ?? 0,
          slot.sign[i] === -1 ? -1 : 1,
        );
        slot.bendGoal[i] = goal;
        if (goal !== 0 && slot.bent[i] === 0 && this.activeCount < this.activeBends.length) {
          slot.bent[i] = 1;
          this.activeBends[this.activeCount++] = slot.index * capacity + i;
        }
      }
    }

    for (let a = this.activeCount - 1; a >= 0; a--) {
      const id = this.activeBends[a] ?? 0;
      const slot = this.slots[Math.floor(id / capacity)];
      const i = id % capacity;
      if (!slot) {
        this.removeActive(a);
        continue;
      }
      const goal = slot.bendGoal[i] ?? 0;
      const current = slot.bend[i] ?? 0;
      const rate = Math.abs(goal) > Math.abs(current) ? cfg.pushRate : cfg.recoverRate;
      let next = goal + (current - goal) * Math.exp(-rate * dt);
      const settled = goal === 0 && Math.abs(next) < cfg.releaseRadians;
      if (settled) next = 0;
      if (next !== current) {
        slot.bend[i] = next;
        this.patchRotation(slot, i);
      }
      if (settled) {
        slot.bent[i] = 0;
        this.removeActive(a);
      }
    }
  }

  /** Shy vines near the player curl up towards their support; they unfurl slowly once it leaves. */
  private updateCurls(playerX: number, playerY: number, dt: number): void {
    const { world } = this;
    const cfg = FOLIAGE.shy;
    const capacity = FOLIAGE.layerCapacity;
    for (let a = 0; a < this.curlCount; a++) {
      const id = this.activeCurls[a] ?? 0;
      const slot = this.slots[Math.floor(id / capacity)];
      if (slot) slot.curlGoal[id % capacity] = 0;
    }
    const size = world.chunkSize;
    const tileX = Math.floor(playerX / TILE_SIZE);
    const feetRow = Math.floor((playerY - 1) / TILE_SIZE);
    for (let ty = feetRow - cfg.rowsAboveFeet; ty <= feetRow; ty++) {
      for (let tx = tileX - cfg.columns; tx <= tileX + cfg.columns; tx++) {
        if (!world.inBounds(tx, ty)) continue;
        const cx = Math.floor(tx / size);
        const cy = Math.floor(ty / size);
        const slot = this.loaded.get(cy * world.chunksX + cx);
        const i = slot?.memberAt[(ty - cy * size) * size + (tx - cx * size)] ?? -1;
        if (!slot || i < 0 || slot.shy[i] !== 1) continue;
        slot.curlGoal[i] = 1;
        if (slot.curling[i] === 0 && this.curlCount < this.activeCurls.length) {
          slot.curling[i] = 1;
          this.activeCurls[this.curlCount++] = slot.index * capacity + i;
        }
      }
    }
    for (let a = this.curlCount - 1; a >= 0; a--) {
      const id = this.activeCurls[a] ?? 0;
      const slot = this.slots[Math.floor(id / capacity)];
      const i = id % capacity;
      if (!slot) {
        this.removeCurl(a);
        continue;
      }
      const goal = slot.curlGoal[i] ?? 0;
      const current = slot.curl[i] ?? 0;
      const rate = goal > current ? cfg.curlRate : cfg.unfurlRate;
      let next = goal + (current - goal) * Math.exp(-rate * dt);
      const settled = goal === 0 && next < cfg.release;
      if (settled) next = 0;
      if (next !== current) {
        slot.curl[i] = next;
        floatBits[0] = 1 - next * (1 - cfg.minScale);
        scalePatch[SCALE_Y_WORD] = wordBits[0] ?? 0;
        slot.layer.patchMember(i, scalePatch, SCALE_MASK);
      }
      if (settled) {
        slot.curling[i] = 0;
        this.removeCurl(a);
      }
    }
  }

  private removeCurl(a: number): void {
    this.activeCurls[a] = this.activeCurls[this.curlCount - 1] ?? 0;
    this.curlCount--;
  }

  private removeActive(a: number): void {
    this.activeBends[a] = this.activeBends[this.activeCount - 1] ?? 0;
    this.activeCount--;
  }

  /** Forgets bent plants of a slot that is being refilled or released. */
  private dropBends(slot: Slot): void {
    for (let a = this.activeCount - 1; a >= 0; a--) {
      if (Math.floor((this.activeBends[a] ?? 0) / FOLIAGE.layerCapacity) === slot.index) {
        this.removeActive(a);
      }
    }
    slot.bent.fill(0);
    for (let a = this.curlCount - 1; a >= 0; a--) {
      if (Math.floor((this.activeCurls[a] ?? 0) / FOLIAGE.layerCapacity) === slot.index) {
        this.removeCurl(a);
      }
    }
    slot.curling.fill(0);
  }
}
