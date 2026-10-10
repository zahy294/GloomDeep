const CREDITS: readonly { readonly role: string; readonly names: string }[] = [
  { role: 'Design & development', names: 'zahy294, built with Claude (Anthropic)' },
  { role: 'Made with', names: 'Phaser 4, TypeScript, Vite, Preact, idb' },
  { role: 'Tools', names: 'Tiled, Playwright, Vitest' },
  { role: 'Art', names: 'Placeholder pixel art generated from code (final art to come)' },
  { role: 'Sound', names: 'Procedural Web Audio' },
];

export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <div class="screen-backdrop dim interactive">
      <div class="menu-panel credits-panel">
        <h2 class="menu-title">Gloamdeep</h2>
        <p class="credits-tagline">A game about light, in a forest where light is life.</p>
        {CREDITS.map((c) => (
          <div class="credits-row" key={c.role}>
            <div class="credits-role">{c.role}</div>
            <div>{c.names}</div>
          </div>
        ))}
        <p class="credits-thanks">Thank you for playing.</p>
        <button type="button" class="menu-button" onClick={onClose}>
          Back
        </button>
      </div>
    </div>
  );
}
