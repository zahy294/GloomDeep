import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../../../src/config';
import {
  createCollisionResult,
  moveAndCollide,
  type Body,
} from '../../../src/sim/physics/tileCollision';
import { tileId } from '../../../src/data/tiles';
import { World } from '../../../src/sim/world/World';

const STONE = 4;
const DT = 1 / 60;
const T = TILE_SIZE;

function makeWorld(): World {
  return new World({ width: 20, height: 20, chunkSize: 10 });
}

function fill(world: World, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) world.set(x, y, STONE);
}

function body(x: number, y: number, vx = 0, vy = 0): Body {
  return { x, y, width: 12, height: 38, vx, vy };
}

const freshResult = createCollisionResult;

describe('moveAndCollide', () => {
  it('lands on a floor and stays put over many steps', () => {
    const world = makeWorld();
    fill(world, 0, 15, 19, 19);
    const b = body(100, 100);
    const out = createCollisionResult();
    for (let i = 0; i < 120; i++) {
      b.vy += 1500 * DT;
      moveAndCollide(world, b, DT, out);
    }
    const floorTop = 15 * T;
    expect(b.y + b.height).toBeCloseTo(floorTop, 6);
    for (let i = 0; i < 300; i++) {
      b.vy += 1500 * DT;
      moveAndCollide(world, b, DT, out);
      expect(out.onGround).toBe(true);
      expect(b.y + b.height).toBeCloseTo(floorTop, 6);
    }
  });

  it('reports ground when resting with zero velocity', () => {
    const world = makeWorld();
    fill(world, 0, 15, 19, 19);
    const b = body(100, 15 * T - 38);
    const out = createCollisionResult();
    moveAndCollide(world, b, DT, out);
    expect(out.onGround).toBe(true);
    expect(b.y).toBe(15 * T - 38);
  });

  it('stops against a wall from the left side', () => {
    const world = makeWorld();
    fill(world, 10, 0, 10, 19);
    const b = body(100, 100, 200, 0);
    const out = createCollisionResult();
    for (let i = 0; i < 30; i++) moveAndCollide(world, b, DT, out);
    expect(b.x + b.width).toBeCloseTo(10 * T, 6);
    expect(b.vx).toBe(0);
  });

  it('flags a wall hit on the step it happens', () => {
    const world = makeWorld();
    fill(world, 10, 0, 10, 19);
    const b = body(10 * T - 14, 100, 200, 0);
    const out = createCollisionResult();
    moveAndCollide(world, b, DT, out);
    expect(out.hitWallRight).toBe(true);
    expect(out.hitWallLeft).toBe(false);
  });

  it('stops against a wall from the right side', () => {
    const world = makeWorld();
    fill(world, 5, 0, 5, 19);
    const b = body(150, 100, -200, 0);
    const out = createCollisionResult();
    for (let i = 0; i < 30; i++) moveAndCollide(world, b, DT, out);
    expect(b.x).toBeCloseTo(6 * T, 6);
    expect(b.vx).toBe(0);
  });

  it('stops against a ceiling', () => {
    const world = makeWorld();
    fill(world, 0, 0, 19, 4);
    const b = body(100, 150, 0, -300);
    const out = createCollisionResult();
    let hit = false;
    for (let i = 0; i < 30; i++) {
      moveAndCollide(world, b, DT, out);
      hit ||= out.hitCeiling;
    }
    expect(hit).toBe(true);
    expect(b.y).toBeCloseTo(5 * T, 6);
    expect(b.vy).toBe(0);
  });

  it('resolves a diagonal move into a floor/wall corner', () => {
    const world = makeWorld();
    fill(world, 0, 15, 19, 19);
    fill(world, 10, 0, 10, 14);
    const b = body(100, 100, 200, 300);
    const out = createCollisionResult();
    for (let i = 0; i < 60; i++) moveAndCollide(world, b, DT, out);
    expect(b.x + b.width).toBeCloseTo(10 * T, 6);
    expect(b.y + b.height).toBeCloseTo(15 * T, 6);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('does not snag when flush against a wall and moving vertically', () => {
    const world = makeWorld();
    fill(world, 10, 0, 10, 19);
    const b = body(10 * T - 12, 20, 0, 100);
    const out = createCollisionResult();
    for (let i = 0; i < 30; i++) {
      moveAndCollide(world, b, DT, out);
      expect(out.hitWallRight).toBe(false);
    }
    expect(b.y).toBeCloseTo(20 + 100 * DT * 30, 6);
    expect(b.vy).toBe(100);
  });

  it('does not tunnel through a one-tile wall at very high speed', () => {
    const world = makeWorld();
    fill(world, 10, 0, 10, 19);
    const b = body(100, 100, 5000, 0);
    const out = createCollisionResult();
    moveAndCollide(world, b, DT, out);
    expect(b.x + b.width).toBeCloseTo(10 * T, 6);
    expect(out.hitWallRight).toBe(true);
  });

  it('does not tunnel through a thin floor when falling fast', () => {
    const world = makeWorld();
    fill(world, 0, 15, 19, 15);
    const b = body(100, 150, 0, 6000);
    const out = createCollisionResult();
    moveAndCollide(world, b, DT, out);
    expect(b.y + b.height).toBeCloseTo(15 * T, 6);
    expect(out.onGround).toBe(true);
  });

  it('treats world edges as solid', () => {
    const world = makeWorld();
    const out = createCollisionResult();
    const left = body(5, 100, -500, 0);
    moveAndCollide(world, left, DT, out);
    expect(left.x).toBe(0);
    expect(out.hitWallLeft).toBe(true);
    const right = body(20 * T - 17, 100, 500, 0);
    moveAndCollide(world, right, DT, out);
    expect(right.x + right.width).toBeCloseTo(20 * T, 6);
    const top = body(100, 5, 0, -500);
    moveAndCollide(world, top, DT, out);
    expect(top.y).toBe(0);
    expect(out.hitCeiling).toBe(true);
    const bottom = body(100, 20 * T - 40, 0, 500);
    moveAndCollide(world, bottom, DT, out);
    expect(bottom.y + bottom.height).toBeCloseTo(20 * T, 6);
    expect(out.onGround).toBe(true);
  });
  it('steps up a one-tile ledge while walking on ground', () => {
    const world = makeWorld();
    fill(world, 0, 15, 19, 19);
    fill(world, 10, 14, 19, 14); // one-tile ledge
    const b = body(10 * T - 12 - 1, 15 * T - 38, 150, 0);
    for (let i = 0; i < 10; i++) moveAndCollide(world, b, DT, freshResult(), T, true);
    expect(b.x).toBeGreaterThan(10 * T);
    expect(b.y + b.height).toBeCloseTo(14 * T, 6);
  });

  it('does not step up two-tile walls, or when airborne', () => {
    const world = makeWorld();
    fill(world, 0, 15, 19, 19);
    fill(world, 10, 13, 19, 14); // two tiles high
    const tall = body(10 * T - 12 - 1, 15 * T - 38, 150, 0);
    moveAndCollide(world, tall, DT, freshResult(), T, true);
    expect(tall.x + tall.width).toBeCloseTo(10 * T, 6);

    const world2 = makeWorld();
    fill(world2, 0, 15, 19, 19);
    fill(world2, 10, 14, 19, 14);
    const airborne = body(10 * T - 12 - 1, 15 * T - 38, 150, 0);
    moveAndCollide(world2, airborne, DT, freshResult(), T, false);
    expect(airborne.x + airborne.width).toBeCloseTo(10 * T, 6);
  });
});

describe('one-way platforms (branches)', () => {
  const BRANCH = tileId('branch');
  const GRAVITY = 1500;

  function platformWorld(): World {
    const world = makeWorld();
    for (let x = 4; x <= 12; x++) world.set(x, 10, BRANCH);
    fill(world, 0, 19, 19, 19);
    return world;
  }

  function fall(world: World, b: Body, steps: number, dropThrough = false) {
    const out = createCollisionResult();
    for (let i = 0; i < steps; i++) {
      b.vy += GRAVITY * DT;
      moveAndCollide(world, b, DT, out, 0, false, dropThrough);
    }
    return out;
  }

  it('lands on a platform from above and stands on it', () => {
    const world = platformWorld();
    const b = body(7 * T, 2 * T);
    const out = fall(world, b, 120);
    expect(b.y + b.height).toBeCloseTo(10 * T, 6);
    expect(out.onGround).toBe(true);
  });

  it('reports ground when resting on a platform with zero velocity', () => {
    const world = platformWorld();
    const b = body(7 * T, 10 * T - 38);
    const out = createCollisionResult();
    moveAndCollide(world, b, DT, out);
    expect(out.onGround).toBe(true);
  });

  it('lets a body jump up through it from below and land on top', () => {
    const world = platformWorld();
    const b = body(7 * T, 12 * T - 38, 0, -700); // head just under the platform, rising fast
    const out = createCollisionResult();
    let wentAbove = false;
    for (let i = 0; i < 120; i++) {
      b.vy += GRAVITY * DT;
      moveAndCollide(world, b, DT, out);
      if (b.y + b.height < 10 * T) wentAbove = true;
    }
    expect(wentAbove).toBe(true);
    expect(b.y + b.height).toBeCloseTo(10 * T, 6);
  });

  it('drops through while Down is held, then lands on the floor below', () => {
    const world = platformWorld();
    const b = body(7 * T, 10 * T - 38);
    fall(world, b, 120, true);
    expect(b.y + b.height).toBeCloseTo(19 * T, 6);
  });

  it('never blocks sideways movement', () => {
    const world = platformWorld();
    const b = body(1 * T, 9 * T, 300, 0); // body spans the platform row
    for (let i = 0; i < 60; i++) moveAndCollide(world, b, DT, createCollisionResult());
    expect(b.x).toBeGreaterThan(13 * T);
  });

  it('catches a fast fall (no tunnelling through the thin top edge)', () => {
    const world = platformWorld();
    const b = body(7 * T, 0, 0, 2000);
    moveAndCollide(world, b, 0.25, createCollisionResult());
    expect(b.y + b.height).toBeCloseTo(10 * T, 6);
  });
});
