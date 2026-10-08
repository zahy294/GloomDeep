/** RGBA image buffers and PNG I/O shared by the art tools. Pure helpers + thin sharp wrappers. */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Index of pixel (x, y) in `data`. */
export function px(img: RgbaImage, x: number, y: number): number {
  return (y * img.width + x) * 4;
}

export function getRgb(img: RgbaImage, x: number, y: number): number {
  const i = px(img, x, y);
  return ((img.data[i] ?? 0) << 16) | ((img.data[i + 1] ?? 0) << 8) | (img.data[i + 2] ?? 0);
}

export function getAlpha(img: RgbaImage, x: number, y: number): number {
  return img.data[px(img, x, y) + 3] ?? 0;
}

export function setPixel(img: RgbaImage, x: number, y: number, rgb: number, alpha = 255): void {
  const i = px(img, x, y);
  img.data[i] = (rgb >> 16) & 0xff;
  img.data[i + 1] = (rgb >> 8) & 0xff;
  img.data[i + 2] = rgb & 0xff;
  img.data[i + 3] = alpha;
}

/** Copies a rectangle of `src` into `dst` at (dx, dy). Out-of-range pixels are skipped. */
export function blit(
  src: RgbaImage,
  sx: number,
  sy: number,
  width: number,
  height: number,
  dst: RgbaImage,
  dx: number,
  dy: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tx = dx + x;
      const ty = dy + y;
      const fx = sx + x;
      const fy = sy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      if (fx < 0 || fy < 0 || fx >= src.width || fy >= src.height) continue;
      const si = px(src, fx, fy);
      const di = px(dst, tx, ty);
      for (let c = 0; c < 4; c++) dst.data[di + c] = src.data[si + c] ?? 0;
    }
  }
}

export async function readPng(path: string): Promise<RgbaImage> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

export async function writePng(path: string, img: RgbaImage): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
    .png()
    .toFile(path);
}

/** Nearest-neighbour upscale (for 4× previews). */
export function upscale(img: RgbaImage, factor: number): RgbaImage {
  const out = createImage(img.width * factor, img.height * factor);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const si = px(img, Math.floor(x / factor), Math.floor(y / factor));
      const di = px(out, x, y);
      for (let c = 0; c < 4; c++) out.data[di + c] = img.data[si + c] ?? 0;
    }
  }
  return out;
}
