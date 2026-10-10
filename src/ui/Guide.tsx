import { useEffect, useState } from 'preact/hooks';
import type { UiBridge } from './bridge';
import { GUIDE } from './guideContent';

/**
 * The guide (H, or from the pause menu): what to do in Gloamdeep and how. Pages on the left,
 * the chosen page on the right. Closing it releases the pointer guard (unmounting under the
 * cursor fires no mouseleave).
 */
export function Guide({ bridge }: { bridge: UiBridge }) {
  const [page, setPage] = useState(GUIDE[0]?.key ?? '');
  useEffect(() => {
    bridge.commands.emit('pointerOverUi', { over: true });
    return () => bridge.commands.emit('pointerOverUi', { over: false });
  }, [bridge]);
  const current = GUIDE.find((p) => p.key === page) ?? GUIDE[0];
  return (
    <div class="screen-backdrop dim interactive">
      <div class="guide-panel">
        <div class="panel-header">
          <span class="panel-title">The Lamplighter’s Guide</span>
          <button class="panel-button" onClick={() => bridge.commands.emit('toggleGuide', {})}>
            Close
          </button>
        </div>
        <div class="guide-body">
          <nav class="guide-pages">
            {GUIDE.map((p) => (
              <button
                key={p.key}
                class={`guide-tab${p.key === current?.key ? ' active' : ''}`}
                onClick={() => setPage(p.key)}
              >
                {p.title}
              </button>
            ))}
          </nav>
          {current && (
            <div class="guide-page">
              <div class="guide-title">{current.title}</div>
              {current.lines.map((line, i) => (
                <p key={i} class="guide-line">
                  {line}
                </p>
              ))}
              {current.keys && (
                <table class="guide-keys">
                  <tbody>
                    {current.keys.map(([key, what]) => (
                      <tr key={key}>
                        <td class="guide-key">{key}</td>
                        <td>{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        <div class="panel-hint">H or Esc to close</div>
      </div>
    </div>
  );
}
