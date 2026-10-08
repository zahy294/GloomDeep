/**
 * `npm run art:import [id|category] [--art dir]`: turns raw AI images listed in the manifest into
 * true pixel art in `<art>/clean/` (plan 2.9.6). Never touches raw images except for writing a
 * 4x `.preview.png` next to them.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PALETTE_COLORS } from '../src/data/palette';
import { toHex } from './lib/color';
import { describeSeams, importImage, type ImportResult } from './lib/importArt';
import { readPng, upscale, writePng } from './lib/image';
import {
  parseArtArgs,
  readManifest,
  selectEntries,
  writeManifest,
  type ArtPaths,
} from './lib/manifest';

const PREVIEW_SCALE = 4;
/** Far-from-palette colours listed per asset before summarising the rest. */
const MAX_FAR_LISTED = 6;

export interface ImportSummary {
  ok: boolean;
  imported: string[];
  skipped: string[];
  failed: string[];
}

function formatReport(id: string, r: ImportResult): string[] {
  const lines = [
    `${id}: ${r.image.width}x${r.image.height}, pitch ${r.pitch.usedX.toFixed(2)}x${r.pitch.usedY.toFixed(2)} (detected ${r.pitch.detectedX.toFixed(2)}x${r.pitch.detectedY.toFixed(2)}), background removed ${(r.removedFraction * 100).toFixed(1)}%`,
  ];
  if (r.far.length) {
    const listed = r.far
      .slice(0, MAX_FAR_LISTED)
      .map((f) => `${toHex(f.color)} x${f.count} (nearest ${toHex(f.nearest)})`);
    const more = r.far.length - listed.length;
    lines.push(`  far from palette: ${listed.join(', ')}${more > 0 ? `, +${more} more` : ''}`);
  }
  for (const s of describeSeams(r.seams)) lines.push(`  SEAM ${s}`);
  for (const w of r.warnings) lines.push(`  WARN ${w}`);
  return lines;
}

export async function runImport(
  art: ArtPaths,
  selector?: string,
  log: (line: string) => void = console.log,
): Promise<ImportSummary> {
  const manifest = await readManifest(art);
  const entries = selectEntries(manifest, selector);
  const summary: ImportSummary = { ok: true, imported: [], skipped: [], failed: [] };
  if (!entries.length) log(`No manifest entries match "${selector ?? ''}".`);

  for (const entry of entries) {
    if (entry.status === 'approved') {
      log(`${entry.id}: approved, skipped`);
      summary.skipped.push(entry.id);
      continue;
    }
    const rawPath = resolve(art.raw, entry.raw);
    if (!existsSync(rawPath)) {
      log(`${entry.id}: WARN raw file missing (${entry.raw}), skipped`);
      summary.skipped.push(entry.id);
      continue;
    }
    try {
      const result = importImage(await readPng(rawPath), entry, PALETTE_COLORS);
      await writePng(resolve(art.clean, `${entry.id}.png`), result.image);
      await writePng(
        resolve(dirname(rawPath), `${basename(entry.id)}.preview.png`),
        upscale(result.image, PREVIEW_SCALE),
      );
      entry.status = 'cleaned';
      summary.imported.push(entry.id);
      for (const line of formatReport(entry.id, result)) log(line);
    } catch (error) {
      summary.ok = false;
      summary.failed.push(entry.id);
      log(`${entry.id}: FAILED ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (summary.imported.length) await writeManifest(art, manifest);
  log(
    `Imported ${summary.imported.length}, skipped ${summary.skipped.length}, failed ${summary.failed.length}.`,
  );
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { art, positional } = parseArtArgs(process.argv.slice(2));
  const summary = await runImport(art, positional[0]);
  if (!summary.ok) process.exitCode = 1;
}
