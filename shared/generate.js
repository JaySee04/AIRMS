#!/usr/bin/env node
// Writes shared/facts.js into both packages. Run `npm run sync:shared`.
//
// The generated files are COMMITTED and the packages import those, never this
// directory — see the header of facts.js for why (Vercel builds each package
// from its own Root Directory, so the repository root is not in either build
// context). Nothing at build or run time depends on this script; it is a
// developer tool, and the freshness tests in each package are what stop the
// committed copies going stale.
//
// Exported rather than only executed so those tests can render in memory and
// compare against what is on disk, without writing anything.

const fs = require('fs');
const path = require('path');

const F = require('./facts');

const ROOT = path.join(__dirname, '..');
const BACKEND_OUT = path.join(ROOT, 'backend', 'src', 'shared', 'facts.js');
const FRONTEND_OUT = path.join(ROOT, 'frontend', 'src', 'lib', 'shared', 'facts.ts');

/** A single-quoted source literal, escaped. Matches both packages' style. */
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const list = (arr) => `[${arr.map(q).join(', ')}]`;

const union = (arr) => arr.map(q).join(' | ');

const banner = (source) => `// GENERATED — do not edit. Source: ${source}
//
// Edit shared/facts.js at the repository root and run:
//
//     npm run sync:shared
//
// A test in this package regenerates this file in memory and fails if what is
// committed here disagrees, so an edit made directly to this file is reverted
// by the next sync and an unsynced source change is a red suite.`;

function renderBackend() {
  const ageRows = F.AGE_GROUPS.map((g) => {
    const parts = [`label: ${q(g.label)}`];
    if (g.min !== undefined) parts.push(`min: ${g.min}`);
    if (g.max !== undefined) parts.push(`max: ${g.max}`);
    return `  { ${parts.join(', ')} },`;
  }).join('\n');

  const indicatorRows = F.RISK_INDICATORS.map(
    (i) => `  { key: ${q(i.key)}, region: ${q(i.region)}, reportLabel: ${q(i.reportLabel)} },`,
  ).join('\n');

  const bandLabelRows = F.BANDS.map((b) => `  ${b}: ${q(F.BAND_LABEL[b])},`).join('\n');
  const bandRankRows = F.BANDS.map((b, i) => `${b}: ${i}`).join(', ');

  return `${banner('shared/facts.js')}

/** ISN's calendar. Periods bucket in it; the frontend dates rows in it. */
const INSTITUTION_TZ = ${q(F.INSTITUTION_TZ)};

/** The risk bands, worst LAST — the order is what BAND_RANK indexes. */
const BANDS = ${list(F.BANDS)};

/** Ordering for "worse than" comparisons. Higher = worse. Derived from BANDS. */
const BAND_RANK = { ${bandRankRows} };

/** Wording shown to humans. GREEN IS NOT "SAFE" — see facts.js. */
const BAND_LABEL = {
${bandLabelRows}
};

/** Athlete.gender enum. */
const GENDERS = ${list(F.GENDERS)};

/** Athlete.program enum. */
const PROGRAMMES = ${list(F.PROGRAMMES)};

/** Age bands for the focus breakdown and the PDF report. */
const AGE_GROUPS = [
${ageRows}
];

/** Period grains, coarsest last. */
const GRAINS = ${list(F.GRAINS)};

/** Display axis for every risk strip, printed and on screen. */
const RISK_AXIS_MAX = ${F.RISK_AXIS_MAX};

/** Stored but NEVER shown, per Dr Thung. Named so it can be asserted. */
const EXCLUDED_RISK_KEYS = ${list(F.EXCLUDED_RISK_KEYS)};

/** The seven shown indicators, in canonical order. */
const RISK_INDICATORS = [
${indicatorRows}
];

/** Peer count below which a cohort caveats itself, on every surface. */
const SMALL_COHORT = ${F.SMALL_COHORT};

module.exports = {
  INSTITUTION_TZ,
  BANDS,
  BAND_RANK,
  BAND_LABEL,
  GENDERS,
  PROGRAMMES,
  AGE_GROUPS,
  GRAINS,
  RISK_AXIS_MAX,
  EXCLUDED_RISK_KEYS,
  RISK_INDICATORS,
  SMALL_COHORT,
};
`;
}

function renderFrontend() {
  const ageRows = F.AGE_GROUPS.map((g) => {
    const parts = [`label: ${q(g.label)}`];
    if (g.min !== undefined) parts.push(`min: ${g.min}`);
    if (g.max !== undefined) parts.push(`max: ${g.max}`);
    return `  { ${parts.join(', ')} },`;
  }).join('\n');

  const indicatorRows = F.RISK_INDICATORS.map(
    (i) => `  { key: ${q(i.key)}, region: ${q(i.region)}, reportLabel: ${q(i.reportLabel)} },`,
  ).join('\n');

  const bandLabelRows = F.BANDS.map((b) => `  ${b}: ${q(F.BAND_LABEL[b])},`).join('\n');
  const bandRankRows = F.BANDS.map((b, i) => `${b}: ${i}`).join(', ');

  const keys = F.RISK_INDICATORS.map((i) => i.key);
  const regions = [...new Set(F.RISK_INDICATORS.map((i) => i.region))];

  return `${banner('shared/facts.js')}

/** ISN's calendar. Periods bucket in it; dates render in it. */
export const INSTITUTION_TZ = ${q(F.INSTITUTION_TZ)};

export type Band = ${union(F.BANDS)};

/** The risk bands, worst LAST — the order is what BAND_RANK indexes. */
export const BANDS: Band[] = ${list(F.BANDS)};

/** Ordering for "worse than" comparisons. Higher = worse. Derived from BANDS. */
export const BAND_RANK: Record<Band, number> = { ${bandRankRows} };

/** Full clinical wording. GREEN IS NOT "SAFE" — see shared/facts.js. */
export const BAND_LABEL: Record<Band, string> = {
${bandLabelRows}
};

export type Gender = ${union(F.GENDERS)};

/** Athlete.gender enum. A filter offering anything else returns nothing. */
export const GENDERS: Gender[] = ${list(F.GENDERS)};

export type Programme = ${union(F.PROGRAMMES)};

/** Athlete.program enum. */
export const PROGRAMMES: Programme[] = ${list(F.PROGRAMMES)};

export interface AgeGroup { label: string; min?: number; max?: number }

/**
 * Age bands for the focus breakdown and the PDF report.
 *
 * The filter dropdown prepends its own "All ages" entry — a filter option
 * rather than a band, which is why it is not here.
 */
export const AGE_GROUPS: AgeGroup[] = [
${ageRows}
];

export type Grain = ${union(F.GRAINS)};

/** Period grains, coarsest last. */
export const GRAINS: Grain[] = ${list(F.GRAINS)};

/** Display axis for every risk strip, printed and on screen. */
export const RISK_AXIS_MAX = ${F.RISK_AXIS_MAX};

/** Stored but NEVER shown, per Dr Thung. Named so it can be asserted. */
export const EXCLUDED_RISK_KEYS: string[] = ${list(F.EXCLUDED_RISK_KEYS)};

export type RiskKey = ${union(keys)};

export type BodyRegion = ${union(regions)};

export interface RiskIndicator { key: RiskKey; region: BodyRegion; reportLabel: string }

/**
 * The seven shown indicators, in canonical order.
 *
 * \`reportLabel\` is HoloMotion's OWN printed wording, so a clinician can check a
 * line against the PDF in their hand. Each package adds its own display label.
 */
export const RISK_INDICATORS: RiskIndicator[] = [
${indicatorRows}
];

/** Peer count below which a cohort caveats itself, on every surface. */
export const SMALL_COHORT = ${F.SMALL_COHORT};
`;
}

const TARGETS = [
  { file: BACKEND_OUT, render: renderBackend },
  { file: FRONTEND_OUT, render: renderFrontend },
];

/** Files whose committed contents disagree with what would be generated now. */
function stale() {
  return TARGETS.filter((t) => {
    const want = t.render();
    if (!fs.existsSync(t.file)) return true;
    return fs.readFileSync(t.file, 'utf8').replace(/\r\n/g, '\n') !== want;
  });
}

function write() {
  const written = [];
  for (const t of TARGETS) {
    const want = t.render();
    fs.mkdirSync(path.dirname(t.file), { recursive: true });
    const before = fs.existsSync(t.file) ? fs.readFileSync(t.file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (before !== want) {
      fs.writeFileSync(t.file, want);
      written.push(t.file);
    }
  }
  return written;
}

module.exports = { renderBackend, renderFrontend, TARGETS, stale, write, BACKEND_OUT, FRONTEND_OUT };

if (require.main === module) {
  const written = write();
  if (!written.length) {
    console.log('shared: already in sync');
  } else {
    for (const f of written) console.log(`shared: wrote ${path.relative(ROOT, f)}`);
  }
}
