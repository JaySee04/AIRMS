// The two things every REVIEW SHEET in scripts/ needs, defined once.
//
// WHY THIS EXISTS (2026-10-09, §156). Three sheets now exist — the body-map
// proof, the per-indicator designs, the combined indicator diagram — and each
// had grown its own copy of "where do samples live" and "open it in the default
// browser", including the same three-platform switch and the same try/catch.
// The second copy is duplication; the third is a decision with three homes.
//
// The open is wrapped on purpose: a headless box has no browser, and OPENING IS
// A CONVENIENCE, NEVER THE RESULT. A sheet that rendered correctly must not
// report failure because nothing could display it — that would be rule 2
// pointing the wrong way, failing a check that DID measure.
const path = require('path');
const { execFileSync } = require('child_process');

// scripts/samples/ is gitignored: sheets are regenerated, never committed.
const SAMPLES = path.join(__dirname, '..', 'samples');

const samplePath = (name) => path.join(SAMPLES, name);

function openInBrowser(file) {
  if (process.argv.includes('--no-open')) return false;
  try {
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', file], { stdio: 'ignore' });
    else if (process.platform === 'darwin') execFileSync('open', [file], { stdio: 'ignore' });
    else execFileSync('xdg-open', [file], { stdio: 'ignore' });
    return true;
  } catch {
    console.log('  (could not open a browser — open the path above)');
    return false;
  }
}

module.exports = { SAMPLES, samplePath, openInBrowser };
