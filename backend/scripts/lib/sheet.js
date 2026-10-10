// THE SHELL EVERY REVIEW SHEET SHARES: document, palette, light/dark bands.
//
// Three sheets now exist — the body-map proof (§153), the per-indicator design
// directions and the combined indicator diagram (§156 already pulled out their
// "where do samples live" and "open it in a browser"). What was left duplicated
// was the bigger half: the same `<style>` block, the same two-theme banding, the
// same header and warning-note markup, written out three times with small
// drifts between them.
//
// The drift is the argument, not the line count. These sheets exist so a human
// can COMPARE things, and three private palettes meant the same risk amber was
// three slightly different ambers depending on which sheet you opened. A review
// tool whose own colours wander is a poor instrument for judging colour.
//
// Deliberately NOT shared with the app's globals.css. These are throwaway
// review pages; binding them to the production stylesheet would make a styling
// change able to break a diagnostic, and make the diagnostic a reason not to
// change the styling.
const { openInBrowser, samplePath } = require('./openSheet');

// One palette. Light values first, dark overrides under `.dark` — the same
// structure as the app, so a sheet's dark band is comparable to the real thing.
const STYLE = `
  :root { --bg:#eef2f6; --card:#fff; --text:#15324a; --muted:#5a6b7d; --line:#d9e0e8;
          --ghost:#cdd7e2; --body:#c8d2e0; --bodyink:#8ea3bb;
          --low:#4a8f5b; --moderate:#c89b3c; --high:#c0504a;
          --lowink:#397342; --moderateink:#8a6818; --highink:#a63b35; }
  .dark { --bg:#0b1726; --card:#13263a; --text:#e8edf2; --muted:#9fb3c8; --line:#24405c;
          --ghost:#2d4258; --body:#2d3f56; --bodyink:#50688a;
          --low:#5fae72; --moderate:#dcab54; --high:#d9635b;
          --lowink:#6fbf7f; --moderateink:#e0ad55; --highink:#e8766c; }
  * { box-sizing:border-box }
  body { margin:0; font:14px/1.55 system-ui,Segoe UI,sans-serif; background:#e6ebf1; color:#15324a }
  header { padding:20px 26px; background:#15324a; color:#fff }
  header h1 { margin:0 0 5px; font-size:19px }
  header p { margin:0; opacity:.82; font-size:13px; max-width:78ch }
  .band { background:var(--bg); color:var(--text); padding:22px 26px 28px }
  .bandhead { font:600 11px system-ui; letter-spacing:.1em; text-transform:uppercase;
              color:var(--muted); margin-bottom:14px }
  .row { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px;
          padding:18px 20px 16px }
  .card h2 { margin:0 0 4px; font-size:15px; display:flex; align-items:center; gap:9px }
  .tag { background:var(--text); color:var(--card); width:22px; height:22px; border-radius:6px;
         display:grid; place-items:center; font-size:12px; font-weight:700 }
  .note { margin:0 0 14px; color:var(--muted); font-size:12.5px }
  .legend { display:flex; gap:14px; margin-top:12px; font-size:11.5px; color:var(--muted);
            justify-content:center }
  .legend i { width:10px; height:10px; border-radius:3px; display:inline-block;
              vertical-align:-1px; margin-right:5px }
  .legend i.low { background:var(--low) } .legend i.moderate { background:var(--moderate) }
  .legend i.high { background:var(--high) }
  .warn { padding:14px 26px; background:#fff6e5; color:#5c4813; font-size:13px;
          border-top:1px solid #e8d9b5 }
`;

/**
 * Wrap a sheet's content in the shared document.
 *
 * `body(themeClass)` is called ONCE PER THEME rather than rendered once and
 * duplicated, because a sheet may need to know which band it is drawing — the
 * body-map proof labels its reference panel "(dark surround)".
 */
function sheet({ title, heading, intro, warn, body }) {
  const bands = ['', 'dark'].map((cls) => `
<div class="band ${cls}">
  <div class="bandhead">${cls ? 'Dark theme' : 'Light theme'}</div>
  ${body(cls)}
</div>`).join('');

  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>${STYLE}</style>
<header>
  <h1>${heading}</h1>
  ${intro ? `<p>${intro}</p>` : ''}
</header>
${warn ? `<div class="warn">${warn}</div>` : ''}
${bands}
`;
}

module.exports = { sheet, STYLE, openInBrowser, samplePath };
