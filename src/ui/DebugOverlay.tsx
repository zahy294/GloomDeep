import type { DebugInfo } from './bridge';

const fmt = (n: number, digits = 0) => n.toFixed(digits);

export function DebugOverlay({ info }: { info: DebugInfo }) {
  const rows: [string, string][] = [
    ['FPS', fmt(info.fps)],
    ['Draw calls', info.drawCalls === null ? 'n/a (canvas)' : String(info.drawCalls)],
    ['CPU / frame', `${fmt(info.frameCpuAvgMs, 2)} ms avg · ${fmt(info.frameCpuMaxMs, 2)} max`],
    ['Chunks', `${info.chunksLoaded} loaded · ${info.lateChunkLoads} late loads`],
    ['Entities', String(info.entities)],
    ['Tile', `${info.playerTileX}, ${info.playerTileY}`],
    ['Chunk', `${info.chunkX}, ${info.chunkY}`],
    ['Light', info.light],
    ['Biome', info.biome],
    ['Gloam', info.gloam],
  ];
  return (
    <div class="debug-overlay">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span class="label">{label}</span> {value}
        </div>
      ))}
    </div>
  );
}
