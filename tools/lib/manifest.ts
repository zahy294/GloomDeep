/** Reading/writing art/manifest.json and resolving the art folder layout (plan 2.9.3). */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArtManifest, ArtManifestEntry } from '../../src/data/artManifest';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Folder layout of an art root (the real `art/`, or a test fixture root). */
export interface ArtPaths {
  root: string;
  manifest: string;
  raw: string;
  clean: string;
  reference: string;
  prompts: string;
  /** Generated autotile sets: `<clean>/autotiles/<material>.png`. */
  autotiles: string;
}

export function artPaths(root = resolve(REPO_ROOT, 'art')): ArtPaths {
  return {
    root,
    manifest: resolve(root, 'manifest.json'),
    raw: resolve(root, 'raw'),
    clean: resolve(root, 'clean'),
    reference: resolve(root, 'reference'),
    prompts: resolve(root, 'prompts'),
    autotiles: resolve(root, 'clean', 'autotiles'),
  };
}

/**
 * Common CLI flags for the art tools: `--art <dir>` (art root, default `art/`), `--out <dir>`
 * (pack output, default `assets/packed/`), and the remaining positional arguments.
 */
export function parseArtArgs(argv: readonly string[]): {
  art: ArtPaths;
  out: string;
  positional: string[];
} {
  let artRoot: string | undefined;
  let out = resolve(REPO_ROOT, 'assets/packed');
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--art') artRoot = resolve(argv[++i] ?? '');
    else if (arg === '--out') out = resolve(argv[++i] ?? '');
    else positional.push(arg);
  }
  return { art: artPaths(artRoot), out, positional };
}

export async function readManifest(paths: ArtPaths): Promise<ArtManifest> {
  const manifest = JSON.parse(await readFile(paths.manifest, 'utf8')) as ArtManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error(`${paths.manifest}: unsupported manifest format`);
  }
  const ids = new Set<string>();
  for (const entry of manifest.assets) {
    if (ids.has(entry.id)) throw new Error(`${paths.manifest}: duplicate id "${entry.id}"`);
    ids.add(entry.id);
  }
  return manifest;
}

export async function writeManifest(paths: ArtPaths, manifest: ArtManifest): Promise<void> {
  await writeFile(paths.manifest, JSON.stringify(manifest, null, 2) + '\n');
}

/** Entries matching an id or a category (or all entries when `selector` is undefined). */
export function selectEntries(
  manifest: ArtManifest,
  selector: string | undefined,
): ArtManifestEntry[] {
  if (!selector) return manifest.assets;
  const byId = manifest.assets.filter((a) => a.id === selector);
  if (byId.length) return byId;
  return manifest.assets.filter((a) => a.category === selector);
}
