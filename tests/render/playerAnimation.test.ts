import { describe, expect, it } from 'vitest';
import { PLAYER_ANIM } from '../../src/config';
import { PART_FRAME } from '../../src/data/playerParts';
import { armAngleTowards, computePose, type PoseInput } from '../../src/render/playerAnimation';

const base: PoseInput = {
  vx: 0,
  vy: 0,
  onGround: true,
  walkDistance: 0,
  time: 0,
  use: 'none',
  aimAngle: 0,
};

describe('computePose', () => {
  it('stands idle with the idle legs when not moving', () => {
    const pose = computePose(base);
    expect(pose.legsFrame).toBe(PART_FRAME.legsIdle);
    expect(pose.frontArmAngle).toBe(0);
  });

  it('cycles the four walk frames as distance accumulates, bobbing on passing frames', () => {
    const frames: number[] = [];
    const bobs: number[] = [];
    for (let i = 0; i < 8; i++) {
      const pose = computePose({ ...base, vx: 150, walkDistance: i * PLAYER_ANIM.strideFramePx });
      frames.push(pose.legsFrame);
      bobs.push(pose.bodyOffsetY);
    }
    expect(frames).toEqual([...PART_FRAME.legsWalk, ...PART_FRAME.legsWalk]);
    expect(bobs).toEqual([0, -1, 0, -1, 0, -1, 0, -1].map((b) => b * PLAYER_ANIM.walkBob));
  });

  it('swings the arms in opposite directions while walking', () => {
    const pose = computePose({ ...base, vx: 150, walkDistance: PLAYER_ANIM.strideFramePx });
    expect(pose.frontArmAngle).toBeGreaterThan(0);
    expect(pose.backArmAngle).toBeCloseTo(-pose.frontArmAngle, 6);
  });

  it('treats slow drift as standing', () => {
    expect(computePose({ ...base, vx: PLAYER_ANIM.walkSpeedThreshold / 2 }).legsFrame).toBe(
      PART_FRAME.legsIdle,
    );
  });

  it('uses the jump legs and raised arms in the air', () => {
    const rising = computePose({ ...base, onGround: false, vy: -300 });
    const falling = computePose({ ...base, onGround: false, vy: 300 });
    expect(rising.legsFrame).toBe(PART_FRAME.legsJump);
    expect(rising.frontArmAngle).toBeGreaterThan(falling.frontArmAngle);
  });

  it('points the front arm at the cursor while placing', () => {
    expect(computePose({ ...base, use: 'place', aimAngle: 1.1 }).frontArmAngle).toBe(1.1);
  });

  it('swings through an arc around the aim while mining', () => {
    const aim = Math.PI / 2;
    const angles: number[] = [];
    for (let t = 0; t < 1; t += 0.01) {
      angles.push(computePose({ ...base, use: 'mine', aimAngle: aim, time: t }).frontArmAngle);
    }
    expect(Math.max(...angles)).toBeCloseTo(aim + PLAYER_ANIM.swingBack, 1);
    expect(Math.min(...angles)).toBeLessThan(aim - PLAYER_ANIM.swingForward * 0.8);
  });
});

describe('armAngleTowards', () => {
  it('is 0 straight down, π/2 forward and mirrors with facing', () => {
    expect(armAngleTowards(0, 0, 0, 10, 1)).toBeCloseTo(0, 6);
    expect(armAngleTowards(0, 0, 10, 0, 1)).toBeCloseTo(Math.PI / 2, 6);
    expect(armAngleTowards(0, 0, -10, 0, -1)).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.abs(armAngleTowards(0, 0, 0, -10, 1))).toBeCloseTo(Math.PI, 6);
  });
});
