import type * as Phaser from 'phaser';
import type { SpriteAtlasInfo } from '../data/artManifest';

/** Frame name of frame `index` of sprite asset `id` inside the packed sprite atlas. */
export function spriteFrame(id: string, index: number): string {
  return `${id}:${index}`;
}

/**
 * Registers every frame listed in `sprites.json` on the loaded atlas texture, so sprites can use
 * `spriteFrame(id, n)`. Assets missing from the pack simply have no frames (callers fall back).
 */
export function registerSpriteFrames(
  texture: Phaser.Textures.Texture,
  info: SpriteAtlasInfo,
): void {
  for (const [id, frames] of Object.entries(info.frames)) {
    frames.forEach((f, i) => {
      const name = spriteFrame(id, i);
      if (!texture.has(name)) texture.add(name, 0, f.x, f.y, f.width, f.height);
    });
  }
}
