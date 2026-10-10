import * as Phaser from 'phaser';
import { PHOTO } from '../config';

/** Keys that pan the photo camera, by direction. */
const PAN_KEYS = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
} as const;

/**
 * Photo mode (plan 1.4 #7, plan 5): the world holds still, the UI hides, and the camera flies
 * free — WASD/arrows (Shift for faster) or dragging with the mouse. The time of day and a filter
 * preset can be changed; leaving puts the clock back as it was. The scene owns the camera and the
 * snapshot; this class only keeps the photo state and moves the viewpoint.
 */
export class PhotoMode {
  active = false;
  /** Camera centre, world pixels. */
  x = 0;
  y = 0;
  dayFraction = 0;
  /** The game's time of day when photo mode began (restored on leaving). */
  savedFraction = 0;
  preset = 'none';
  panelHidden = false;
  private readonly keys: Record<keyof typeof PAN_KEYS, Phaser.Input.Keyboard.Key[]>;
  private readonly fast: Phaser.Input.Keyboard.Key;
  private dragX: number | null = null;
  private dragY = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is disabled in the game config');
    // No capture: these keys also move the player outside photo mode.
    const add = (names: readonly string[]) => names.map((n) => keyboard.addKey(n, false));
    this.keys = {
      left: add(PAN_KEYS.left),
      right: add(PAN_KEYS.right),
      up: add(PAN_KEYS.up),
      down: add(PAN_KEYS.down),
    };
    this.fast = keyboard.addKey('SHIFT', false);
  }

  enter(x: number, y: number, dayFraction: number): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.dayFraction = dayFraction;
    this.savedFraction = dayFraction;
    this.preset = 'none';
    this.panelHidden = false;
    this.dragX = null;
  }

  exit(): void {
    this.active = false;
    this.dragX = null;
  }

  /** Moves the viewpoint (keys and mouse drag), kept inside the world. */
  update(
    dt: number,
    zoom: number,
    worldWidthPx: number,
    worldHeightPx: number,
    /** False while the mouse is over the panel: its slider and buttons must not drag the view. */
    pointerOnWorld: boolean,
  ): void {
    const speed = PHOTO.panSpeed * (this.fast.isDown ? PHOTO.fastFactor : 1) * dt;
    if (held(this.keys.left)) this.x -= speed;
    if (held(this.keys.right)) this.x += speed;
    if (held(this.keys.up)) this.y -= speed;
    if (held(this.keys.down)) this.y += speed;
    const pointer = this.scene.input.activePointer;
    if (pointerOnWorld && pointer.isDown && !pointer.rightButtonDown()) {
      if (this.dragX !== null) {
        this.x -= (pointer.x - this.dragX) / zoom;
        this.y -= (pointer.y - this.dragY) / zoom;
      }
      this.dragX = pointer.x;
      this.dragY = pointer.y;
    } else {
      this.dragX = null;
    }
    this.x = Math.max(0, Math.min(worldWidthPx, this.x));
    this.y = Math.max(0, Math.min(worldHeightPx, this.y));
  }
}

function held(list: readonly Phaser.Input.Keyboard.Key[]): boolean {
  for (let i = 0; i < list.length; i++) if (list[i]?.isDown) return true;
  return false;
}

/** Saves an image's pixels scaled up by a whole number, crisp, as a PNG download. */
export function downloadScaledPng(image: HTMLImageElement, scale: number, name: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = image.width * scale;
  canvas.height = image.height * scale;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.drawImage(image, 0, 0, canvas.width, canvas.height);
  const link = document.createElement('a');
  link.download = name;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
