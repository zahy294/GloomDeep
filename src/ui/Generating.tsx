export function Generating({ stage, progress }: { stage: string; progress: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div class="screen-backdrop interactive">
      <div class="menu-panel">
        <h2 class="menu-title">Growing the forest…</h2>
        <div class="gen-stage" aria-live="polite">
          {stage}
        </div>
        <div
          class="gen-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div class="gen-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
