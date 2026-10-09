import type * as Phaser from 'phaser';
import { COMBAT_VIEW, PLAYER_ANIM, PLAYER_VIEW } from '../config';
import { ARM_LENGTH, PART_FRAME, PART_RIG, type PartPlacement } from '../data/playerParts';
import type { Player } from '../sim/entities/Player';
import { approach, clampAbs } from './cameraMath';
import { Depth } from './depth';
import {
  armAngleTowards,
  computePose,
  type ArmUse,
  type Pose,
  type PoseInput,
} from './playerAnimation';
import { spriteAsset } from '../data/spriteAssets';
import { spriteFrame } from './spriteFrames';
import type { ItemIconRef } from './itemIcons';

const ASSET = 'player-parts';
const FRAME_SIZE = spriteAsset(ASSET)?.frameWidth ?? 16;

/** What the player is doing with their hands this frame (decided by the scene from sim state). */
export interface PlayerActivity {
  /** `attack`: a melee swing (see `swing`); `aim`: holding a bow or staff towards the cursor. */
  use: ArmUse | 'attack' | 'aim';
  /** Melee swing progress 0..1 while `use` is 'attack'. */
  swing: number;
  /** Invulnerable after a hit: the player blinks. Dead: hidden until respawning. */
  invulnerable: boolean;
  dead: boolean;
  /** Cursor in world pixels. */
  aimX: number;
  aimY: number;
  /** Icon of the pickaxe or weapon in the front hand (mining, attacking, aiming), or null. */
  tool: ItemIconRef | null;
}

/** Grip of a tool icon (bottom-left of the handle), in icon pixels. */
const TOOL_GRIP = { x: 2, y: 13 } as const;
/** Tool icons point up-right from the grip; this turns them to continue the arm's direction. */
const TOOL_ALONG_ARM = (3 * Math.PI) / 4;

/**
 * Draws the player from separate parts (plan 2.9.8) and animates them in code: walk cycle from
 * distance travelled, body bob, swinging arms, a trailing hood, a mining swing and an arm that
 * points where you build. The lantern hangs from the back hand. Purely visual — nothing here
 * feeds back into the simulation.
 */
export class PlayerRenderer {
  private readonly root: Phaser.GameObjects.Container;
  private readonly legs: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly hood: Phaser.GameObjects.Image;
  private readonly backArm: Phaser.GameObjects.Image;
  private readonly frontArm: Phaser.GameObjects.Image;
  private readonly lantern: Phaser.GameObjects.Image;
  private readonly tool: Phaser.GameObjects.Image;
  /** Visual-only vertical lag after an auto step-up, decaying to 0 (px, positive = lower). */
  private stepOffsetY = 0;
  private seenSteppedUp: number;
  private walkDistance = 0;
  private time = 0;
  private hoodTrail = 0;
  private facing: 1 | -1 = 1;
  /** Reused every frame so animating allocates nothing. */
  private readonly poseInput: PoseInput = {
    vx: 0,
    vy: 0,
    onGround: true,
    walkDistance: 0,
    time: 0,
    use: 'none',
    aimAngle: 0,
  };
  private readonly pose: Pose = { legsFrame: 0, bodyOffsetY: 0, backArmAngle: 0, frontArmAngle: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly player: Player,
    textureKey: string,
  ) {
    this.seenSteppedUp = player.steppedUpTotal;
    const part = (frame: number, rig: PartPlacement) =>
      scene.add
        .image(rig.x, rig.y, textureKey, spriteFrame(ASSET, frame))
        .setOrigin(rig.pivotX / FRAME_SIZE, rig.pivotY / FRAME_SIZE);
    // Back to front: back arm (with lantern), legs, body, head, hood, front arm.
    this.backArm = part(PART_FRAME.backArm, PART_RIG.backArm);
    this.lantern = part(PART_FRAME.lantern, PART_RIG.lantern);
    this.legs = part(PART_FRAME.legsIdle, PART_RIG.legs);
    this.body = part(PART_FRAME.body, PART_RIG.body);
    this.head = part(PART_FRAME.head, PART_RIG.head);
    this.hood = part(PART_FRAME.hood, PART_RIG.hood);
    this.frontArm = part(PART_FRAME.frontArm, PART_RIG.frontArm);
    this.tool = scene.add
      .image(0, 0, textureKey, spriteFrame(ASSET, 0))
      .setOrigin(TOOL_GRIP.x / FRAME_SIZE, TOOL_GRIP.y / FRAME_SIZE)
      .setVisible(false);
    this.root = scene.add
      .container(0, 0, [
        this.backArm,
        this.lantern,
        this.legs,
        this.body,
        this.head,
        this.hood,
        this.tool, // under the front arm, so the hand covers the grip
        this.frontArm,
      ])
      .setDepth(Depth.entities);
  }

  /** Feet-centre at the interpolated position between the last two simulation steps. */
  feetX(alpha: number): number {
    const { body, prevX } = this.player;
    return prevX + (body.x - prevX) * alpha + body.width / 2;
  }

  /** Includes the step-up smoothing, so the camera follows the eased position too. */
  feetY(alpha: number): number {
    const { body, prevY } = this.player;
    return prevY + (body.y - prevY) * alpha + body.height + this.stepOffsetY;
  }

  update(alpha: number, dt: number, activity: PlayerActivity): void {
    const { player } = this;
    const climbed = player.steppedUpTotal - this.seenSteppedUp;
    this.seenSteppedUp = player.steppedUpTotal;
    this.stepOffsetY = approach(this.stepOffsetY + climbed, 0, PLAYER_VIEW.stepUpSmoothRate, dt);
    this.time += dt;
    if (player.onGround) this.walkDistance += Math.abs(player.body.vx) * dt;

    const x = Math.round(this.feetX(alpha));
    const y = Math.round(this.feetY(alpha));
    // Face the cursor while using something, otherwise the movement direction.
    this.facing = activity.use !== 'none' ? (activity.aimX >= x ? 1 : -1) : player.facing;

    const shoulderX = x + PART_RIG.frontArm.x * this.facing;
    const shoulderY = y + PART_RIG.frontArm.y;
    const input = this.poseInput;
    input.vx = player.body.vx;
    input.vy = player.body.vy;
    input.onGround = player.onGround;
    input.walkDistance = this.walkDistance;
    input.time = this.time;
    input.use = activity.use === 'attack' || activity.use === 'aim' ? 'none' : activity.use;
    input.aimAngle = armAngleTowards(
      shoulderX,
      shoulderY,
      activity.aimX,
      activity.aimY,
      this.facing,
    );
    const pose = computePose(input, this.pose);
    if (activity.use === 'aim') pose.frontArmAngle = input.aimAngle;
    if (activity.use === 'attack') {
      // One swing from raised-back, through the aim, to past it (eased in like the mining hack).
      const t = activity.swing * activity.swing;
      pose.frontArmAngle =
        input.aimAngle +
        PLAYER_ANIM.swingBack -
        t * (PLAYER_ANIM.swingBack + PLAYER_ANIM.swingForward);
    }

    const trailTarget = -clampAbs(
      Math.abs(player.body.vx) * PLAYER_ANIM.hoodTrailPerSpeed,
      PLAYER_ANIM.hoodTrailMax,
    );
    this.hoodTrail = approach(this.hoodTrail, trailTarget, PLAYER_ANIM.hoodTrailRate, dt);

    const bob = pose.bodyOffsetY;
    const blink = activity.invulnerable && Math.floor(this.time * COMBAT_VIEW.blinkRate) % 2 === 0;
    this.root
      .setPosition(x, y)
      .setScale(this.facing, 1)
      .setVisible(!activity.dead)
      .setAlpha(blink ? COMBAT_VIEW.blinkAlpha : 1);
    this.legs.setFrame(spriteFrame(ASSET, pose.legsFrame));
    this.body.setY(PART_RIG.body.y + bob);
    this.head.setY(PART_RIG.head.y + bob);
    this.hood.setPosition(PART_RIG.hood.x + Math.round(this.hoodTrail), PART_RIG.hood.y + bob);
    // Forward-positive arm angles → screen rotation (y down, clockwise positive).
    this.backArm.setPosition(PART_RIG.backArm.x, PART_RIG.backArm.y + bob);
    this.backArm.setRotation(-pose.backArmAngle);
    this.frontArm.setPosition(PART_RIG.frontArm.x, PART_RIG.frontArm.y + bob);
    this.frontArm.setRotation(-pose.frontArmAngle);
    this.lantern.setPosition(
      Math.round(PART_RIG.backArm.x + Math.sin(pose.backArmAngle) * ARM_LENGTH),
      Math.round(PART_RIG.backArm.y + bob + Math.cos(pose.backArmAngle) * ARM_LENGTH),
    );
    const holding = activity.use === 'mine' || activity.use === 'attack' || activity.use === 'aim';
    const tool = holding ? activity.tool : null;
    this.tool.setVisible(tool !== null);
    if (tool) {
      if (
        this.tool.texture.key !== tool.texture ||
        String(this.tool.frame.name) !== String(tool.frame)
      ) {
        this.tool.setTexture(tool.texture, tool.frame);
      }
      this.tool
        .setPosition(
          Math.round(PART_RIG.frontArm.x + Math.sin(pose.frontArmAngle) * ARM_LENGTH),
          Math.round(PART_RIG.frontArm.y + bob + Math.cos(pose.frontArmAngle) * ARM_LENGTH),
        )
        .setRotation(-pose.frontArmAngle + TOOL_ALONG_ARM);
    }
  }
}
