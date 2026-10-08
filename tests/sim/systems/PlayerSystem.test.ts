import { describe, expect, it } from 'vitest';
import { PLAYER, TILE_SIZE } from '../../../src/config';
import { createPlayer, type Player } from '../../../src/sim/entities/Player';
import { ActionState } from '../../../src/sim/input';
import { updatePlayer } from '../../../src/sim/systems/PlayerSystem';
import { World } from '../../../src/sim/world/World';

const STONE = 4;
const DT = 1 / 60;
const T = TILE_SIZE;
/** Top of the main floor in pixels. */
const FLOOR_Y = 30 * T;
/** Top of the ledge in pixels. */
const LEDGE_Y = 20 * T;

/** 40x40 world with a stone floor from row 30 down, optionally a raised ledge on columns 0..9. */
function makeWorld(withLedge = false): World {
  const world = new World({ width: 40, height: 40, chunkSize: 10 });
  for (let y = 30; y < 40; y++) for (let x = 0; x < 40; x++) world.set(x, y, STONE);
  if (withLedge) {
    for (let y = 20; y < 30; y++) for (let x = 0; x < 10; x++) world.set(x, y, STONE);
  }
  return world;
}

function step(p: Player, input: ActionState, world: World, n = 1): void {
  for (let i = 0; i < n; i++) updatePlayer(p, input, world, DT);
}

function standingPlayer(world: World, input: ActionState, x = 300): Player {
  const p = createPlayer(x, FLOOR_Y);
  step(p, input, world, 10);
  expect(p.onGround).toBe(true);
  return p;
}

/** Walks right off the ledge; returns once the player has just become airborne. */
function walkOffLedge(world: World, input: ActionState): Player {
  const p = createPlayer(8 * T, LEDGE_Y);
  step(p, input, world, 5);
  expect(p.onGround).toBe(true);
  input.setHeld('moveRight', true);
  for (let i = 0; i < 200; i++) {
    step(p, input, world);
    if (!p.onGround) return p;
  }
  throw new Error('never left the ledge');
}

describe('updatePlayer', () => {
  it('spawns with feet at the spawn point and settles on the floor', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = standingPlayer(world, input);
    expect(p.body.y + p.body.height).toBeCloseTo(FLOOR_Y, 6);
    expect(p.body.x).toBeCloseTo(300 - PLAYER.width / 2, 6);
  });

  it('reaches but never exceeds max run speed', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = standingPlayer(world, input);
    input.setHeld('moveRight', true);
    let max = 0;
    for (let i = 0; i < 60; i++) {
      step(p, input, world);
      max = Math.max(max, Math.abs(p.body.vx));
    }
    expect(max).toBe(PLAYER.maxRunSpeed);
    expect(p.facing).toBe(1);
  });

  it('stops after releasing and faces the last direction', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = standingPlayer(world, input);
    input.setHeld('moveLeft', true);
    step(p, input, world, 30);
    expect(p.facing).toBe(-1);
    input.setHeld('moveLeft', false);
    step(p, input, world, 20);
    expect(p.body.vx).toBe(0);
  });

  it('treats both directions held as no input', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = standingPlayer(world, input);
    input.setHeld('moveLeft', true);
    input.setHeld('moveRight', true);
    step(p, input, world, 10);
    expect(p.body.vx).toBe(0);
  });

  it('jumps from the ground', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = standingPlayer(world, input);
    const y0 = p.body.y;
    input.setHeld('jump', true);
    step(p, input, world, 5);
    expect(p.body.y).toBeLessThan(y0);
    expect(p.onGround).toBe(false);
  });

  it('allows a coyote jump shortly after walking off a ledge', () => {
    const world = makeWorld(true);
    const input = new ActionState();
    const p = walkOffLedge(world, input);
    step(p, input, world, 2);
    expect(p.onGround).toBe(false);
    input.setHeld('jump', true);
    step(p, input, world);
    expect(p.body.vy).toBeLessThan(0);
  });

  it('does not allow a jump after coyote time has expired', () => {
    const world = makeWorld(true);
    const input = new ActionState();
    const p = walkOffLedge(world, input);
    step(p, input, world, Math.ceil(PLAYER.coyoteTime / DT) + 3);
    expect(p.onGround).toBe(false);
    input.setHeld('jump', true);
    step(p, input, world);
    expect(p.body.vy).toBeGreaterThan(0);
  });

  it('triggers a jump buffered just before landing', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = createPlayer(300, FLOOR_Y - 60);
    while (FLOOR_Y - (p.body.y + p.body.height) > 8) step(p, input, world);
    expect(p.onGround).toBe(false);
    input.setHeld('jump', true);
    let landed = false;
    let jumpedAfterLanding = false;
    for (let i = 0; i < 30; i++) {
      step(p, input, world);
      if (p.onGround) landed = true;
      if (landed && p.body.vy < 0) jumpedAfterLanding = true;
    }
    expect(jumpedAfterLanding || p.body.y + p.body.height < FLOOR_Y - 1).toBe(true);
  });

  it('jumps lower when the button is tapped than when held', () => {
    function apex(releaseAtStep: number): number {
      const world = makeWorld();
      const input = new ActionState();
      const p = standingPlayer(world, input);
      let minY = p.body.y;
      input.setHeld('jump', true);
      for (let i = 0; i < 120; i++) {
        if (i === releaseAtStep) input.setHeld('jump', false);
        step(p, input, world);
        minY = Math.min(minY, p.body.y);
      }
      return minY;
    }
    const held = apex(1000);
    const tapped = apex(1);
    expect(tapped).toBeGreaterThan(held);
  });

  it('does not allow a double jump in the air', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = standingPlayer(world, input);
    input.setHeld('jump', true);
    step(p, input, world, 10);
    input.setHeld('jump', false);
    step(p, input, world);
    input.setHeld('jump', true);
    step(p, input, world, 3);
    expect(p.body.vy).toBeGreaterThan(-PLAYER.jumpSpeed * 0.9);
  });

  it('stores the previous position for interpolation', () => {
    const world = makeWorld();
    const input = new ActionState();
    const p = standingPlayer(world, input);
    input.setHeld('moveRight', true);
    const x0 = p.body.x;
    step(p, input, world);
    expect(p.prevX).toBe(x0);
    expect(p.body.x).toBeGreaterThan(x0);
  });
});
