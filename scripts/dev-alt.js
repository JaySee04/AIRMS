// `npm run dev:alt` — a SECOND dev instance, beside the one on :3000/:5000.
//
// For when somebody else's instance already holds the default pair and freeing
// it is the wrong move: two people on one checkout, or a person inspecting the
// app while an agent runs e2e. The preflight names this command when it refuses.
//
// A FILE rather than an inline `node -e` in package.json, deliberately: the
// one-liner needs nested single and double quotes to survive npm, PowerShell
// and cmd, and CLAUDE.md gotcha 9 is four separate defects caused by exactly
// that kind of quoting. This is unambiguous on every shell.
//
// Ports are overridable (`AIRMS_WEB_PORT=3300 npm run dev:alt`) so a THIRD
// instance is possible without another script.
//
// 3100/5100 rather than 3001/5001: `next dev` bumps to :3001 on its own when
// :3000 is taken, which is the precise confusion CLAUDE.md gotcha 1 exists to
// stop. A pair nothing auto-selects cannot be mistaken for that bump. 3210 is
// also avoided — `npm run verify:csp` uses it.
process.env.AIRMS_WEB_PORT = process.env.AIRMS_WEB_PORT || '3100';
process.env.AIRMS_API_PORT = process.env.AIRMS_API_PORT || '5100';

require('./dev.js');
