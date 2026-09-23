// READ THE REPORT INSTEAD OF LOOKING AT IT.
//
// Module 3 has always sent rendered page images to a vision model, on a premise
// stated all over this codebase: "pages 1-6 are rendered graphics with no text
// layer, which is why they need one."
//
// THAT PREMISE IS TRUE OF ONE LAYOUT AND FALSE OF THE OTHERS. Measured
// 2026-09-21 across 17 real HoloMotion reports:
//
//     12 pages (compact)   0 text items on any page   -> vision required
//     28 pages             full text layer            -> 3 of 3
//     38 pages             full text layer            -> 12 of 12
//
// scripts/samples/thung.pdf is the 12-page compact report. It was the FIRST
// sample, the pipeline was built around it, and its property was generalised to
// the format. scripts/samples/nazwan.pdf — this project's own 38-page fixture,
// verified 1:1 by hand in 2025-08-13 — has carried a complete text layer the
// whole time, and every one of its 38 ground-truth values is simply sitting in
// it, labelled and column-aligned.
//
// WHAT THIS BUYS, none of which is a micro-optimisation:
//   * no third-party quota (utils/visionThrottle.js exists only because that
//     endpoint draws one), and no tokens at ~11,400 per report;
//   * THE PDF NEVER LEAVES THE MACHINE. DEPLOY.md records honestly that hosted,
//     "on-device redaction" degrades to "pre-provider redaction" — the
//     un-redacted PDF traverses a third-party host. Reading the text layer
//     removes the transfer, not just the exposure;
//   * exact values rather than model-read ones.
//
// WHAT IT DOES NOT DO, and must not pretend to: it cannot read the compact
// layout at all, and it cannot read the Summary from ANY layout (see
// looksLetterSpaced). This is a FAST PATH, not a replacement.
//
// THE GATE IS THE RETURN VALUE, not a separate probe. `{ ok: false, reason:
// 'no-text-layer' }` means the caller must use vision. A standalone
// `hasTextLayer()` was written first and deleted: it duplicated the check
// `extractFromTextLayer` already does, and shipped exported-and-uncalled, which
// is the winAnsiSafe defect exactly — tests/codebaseHygiene.test.js caught it
// within the hour.
//
// The technique is not new here — utils/prescription.js already reads the
// prescription pages from the text layer, for the same reason and with the same
// pdfjs. It was simply never pointed at the data pages.
const { RISK_INDICATORS } = require('../shared/facts');

// The data section, as verify-holomotion-extract.js documents it: Info+Summary
// p1, Muscle Imbalance p3, Risk Screening + Subitems p5, Exercise Risk p6.
// (p4 is Posture, which AIRMS stopped extracting on 2026-08-01.)
const DATA_PAGES = 6;

// Below this, pages 1-6 carry no usable text and the caller must use vision.
// The compact layout scores 0; every text-layer report measured scored >2700.
const MIN_TEXT_CHARS = 400;

/**
 * HoloMotion's printed label for each stored indicator.
 *
 * Built from the SHARED fact rather than written out again — §31 reduced eight
 * hand-maintained copies of this list to one per package, and a ninth here
 * would be the same defect wearing a new hat. `reportLabel` exists precisely
 * because it is "HoloMotion's own printed wording".
 *
 * Lumbar Disc Herniation is appended explicitly and is NOT an oversight in the
 * shared list: it is in EXCLUDED_RISK_KEYS because Dr Thung's instruction is
 * that it is never scored, charted, printed or named. It is still STORED, so
 * the extractor must still READ it — "excluded from every derived view" is not
 * "absent from the report".
 */
const LABEL_TO_KEY = new Map([
  ...RISK_INDICATORS.map((i) => [i.reportLabel.toLowerCase(), i.key]),
  ['lumbar disc herniation', 'spinalDiscHerniation'],
]);

/** Region label as printed -> the subitem key AIRMS stores. */
const REGION_TO_KEY = new Map([
  ['neck', 'neck'],
  ['shoulder and upper limbs', 'shoulder'],
  ['torso', 'torso'],
  ['pelvis', 'pelvis'],
  ['lower limbs', 'lowerLimbs'],
]);

/**
 * THE SUMMARY CANNOT BE READ FROM THIS TEXT LAYER, AND THAT IS A FINDING RATHER
 * THAN A BUG TO WORK AROUND.
 *
 * HoloMotion letter-spaces the Summary. pdfjs returns the whole line as ONE
 * item whose string is "A c c o r d i n g t o s c o r e s o f R O M ,", and —
 * measured — EVERY gap in it is a single space: the 44 space-runs on that line
 * are all length 1. The boundary between "According" and "to" is encoded
 * exactly like the boundary between "A" and "c".
 *
 * So the word boundaries are not recoverable from the string. Verified that no
 * pdfjs option changes this: disableCombineTextItems, disableNormalization and
 * both together all return the same single item. The information is in the
 * content stream as different kern widths, and pdfjs flattens every kern above
 * its threshold to one space before we ever see it.
 *
 * The first version of this function guessed, collapsing runs of single
 * characters — and produced "AccordingtoscoresofROM , stability". §70 requires
 * this text REPRODUCED VERBATIM and attributed to the instrument: it is the
 * instrument's own clinical verdict about a person. Mangled is worse than
 * absent, because absent is visibly absent.
 *
 * So this detects the condition and the caller returns null. Recovering it
 * needs per-glyph positions — the Rust engine behind pdf-inspector keeps them,
 * which is how the reference prototype reconstructs the sentences — and that is
 * a dependency decision, not something to fake here.
 */
function looksLetterSpaced(text) {
  const tokens = String(text).trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 8) return false;
  const singles = tokens.filter((t) => t.length === 1).length;
  return singles / tokens.length > 0.6;
}

function toNumOrNull(s) {
  const m = String(s).trim().match(/^-?\d+(?:\.\d+)?$/);
  return m ? Number(m[0]) : null;
}

/**
 * pdfjs refuses a Node `Buffer` by name — and `buffer instanceof Uint8Array` is
 * TRUE for one, because Buffer extends it. So the obvious guard passes a Buffer
 * straight through to a library that rejects it, which is a type check that
 * looks right and tests nothing. Copy unconditionally.
 */
function toBytes(buffer) {
  return Uint8Array.from(buffer);
}

/**
 * Group positioned items into visual rows, tolerating sub-point drift.
 *
 * Each cell carries its CENTRE (`cx`) as well as its left edge. pdfjs reports
 * `transform[4]` as the left edge, and this report centres a label under its
 * score — so on page 6 the score "14" sits at left edge 188 while its label
 * "Neck Pain" starts at 70. Comparing left edges puts them 118pt apart and the
 * label is missed; comparing centres puts the label column at a constant 100pt
 * offset in BOTH columns, which is the actual layout. Measured, after an x
 * window on left edges silently returned no labels at all.
 *
 * The tolerance is 1.5pt, not 2.5: on page 1 the Total Score VALUE row (y=513)
 * and the "Gender ／ Age" row (y=511) are two points apart, and merging them
 * put "78 14" into the gender field.
 */
function toRows(items, tol = 1.5) {
  const rows = [];
  for (const it of items) {
    const x = it.transform[4];
    const y = it.transform[5];
    const s = String(it.str).trim();
    if (!s) continue;
    const w = Number(it.width) || 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= tol);
    if (!row) { row = { y, cells: [] }; rows.push(row); }
    row.cells.push({ x, w, cx: x + w / 2, s });
  }
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

/** The cell whose CENTRE is nearest an anchor, if it is near enough to mean it. */
function nearestByCentre(cells, anchorCx, maxDistance) {
  if (!cells.length) return null;
  const best = cells.reduce((a, b) => (Math.abs(b.cx - anchorCx) < Math.abs(a.cx - anchorCx) ? b : a));
  return Math.abs(best.cx - anchorCx) <= maxDistance ? best : null;
}

const rowText = (row) => row.cells.map((c) => c.s).join(' ');

/** Read pages 1..n as rows of positioned cells. */
async function readPages(pdfjs, data, pageCount = DATA_PAGES) {
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await task.promise;
  try {
    const pages = [];
    const n = Math.min(doc.numPages, pageCount);
    for (let i = 1; i <= n; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push({ number: i, rows: toRows(content.items), items: content.items });
    }
    return { pages, totalPages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

/**
 * Does this report carry a text layer on its DATA pages?
 *
 * The gate, and it answers about pages 1-6 specifically. A report whose
 * PRESCRIPTION pages have text (all of them do — that is what prescription.js
 * reads) but whose data pages do not is exactly the compact layout, and
 * answering "yes" for it would route a vision-only report down this path and
 * return a confident, empty result.
 */
function textLayerScore(pages) {
  return pages.reduce((sum, p) => sum + p.rows.reduce((s, r) => s + rowText(r).length, 0), 0);
}

// ---------------------------------------------------------------- page 1

function parseCover(page) {
  const out = { name: null, gender: null, age: null, assessedAt: null, summary: null };
  if (!page) return out;

  // "Name ： <value>" — the colon is its own item, and it is the FULLWIDTH
  // colon U+FF1A, not ':'. Matching ASCII here returns nothing at all.
  //
  // TWO FIELDS SHARE A ROW: "Gender ： Male   Age ： 21". So the value is every
  // cell after the colon UP TO THE NEXT FIELD LABEL — taking the rest of the
  // row gave gender "Male Age 21" and an age of null, which is the shape of
  // mistake that reads as a parser working until somebody looks at the output.
  const FIELDS = new Set(['name', 'gender', 'age', 'time']);
  const labelled = (label) => {
    for (const row of page.rows) {
      const cells = row.cells;
      const i = cells.findIndex((c) => c.s.toLowerCase() === label);
      if (i === -1) continue;
      const value = [];
      for (const cell of cells.slice(i + 1)) {
        const s = cell.s;
        if (s === '：' || s === ':') continue;
        if (FIELDS.has(s.toLowerCase())) break;
        value.push(s);
      }
      if (value.length) return value.join(' ').trim();
    }
    return null;
  };

  out.name = labelled('name');
  out.gender = labelled('gender');
  const age = labelled('age');
  out.age = age == null ? null : toNumOrNull(age);
  out.assessedAt = labelled('time');

  // Total Score / Exercise Risks: the header row, then the value directly
  // BENEATH each header rather than beside it. Matched by x-proximity, which is
  // what makes this robust to the two columns swapping or moving.
  const header = page.rows.find((r) => /total score/i.test(rowText(r)) && /exercise risk/i.test(rowText(r)));
  if (header) {
    const below = page.rows
      .filter((r) => r.y < header.y && header.y - r.y < 40)
      .flatMap((r) => r.cells)
      .filter((c) => toNumOrNull(c.s) !== null);
    const nearest = (label) => {
      const h = header.cells.find((c) => new RegExp(label, 'i').test(c.s));
      if (!h) return null;
      const cell = nearestByCentre(below, h.cx, 60);
      return cell ? toNumOrNull(cell.s) : null;
    };
    out.overallActivityScore = nearest('total score');
    out.injuryRiskIndex = nearest('exercise risk');
  }

  // Everything under the "Summary" heading, down to the page footer.
  const head = page.rows.find((r) => /^summary$/i.test(rowText(r).trim()));
  if (head) {
    const body = page.rows
      .filter((r) => r.y < head.y)
      .map((r) => rowText(r))
      .filter(Boolean);
    const joined = body.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (looksLetterSpaced(joined)) {
      // Read, and deliberately NOT returned. See looksLetterSpaced.
      out.summary = null;
      out.summaryUnavailable = 'letter-spaced';
    } else {
      out.summary = joined.length > 20 ? joined : null;
    }
  }
  return out;
}

// ---------------------------------------------------------------- page 3

/**
 * "Gluteus medius L" -> { muscle: 'Gluteus Medius', side: 'L' }.
 * Title-cased to match how AIRMS stores muscle names everywhere else.
 */
function parseMuscle(line) {
  const m = String(line).trim().match(/^(.*?)\s+([LRB])$/);
  if (!m) return null;
  const muscle = m[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return muscle ? { muscle, side: m[2] } : null;
}

function parseMuscleImbalance(page) {
  const out = { myodynamia: [], tension: [] };
  if (!page) return out;
  // The two headings are themselves split across rows ("Myodynamia" /
  // "Deficiency ："), so the section is decided by the y of whichever heading
  // was seen last while walking down the page.
  let bucket = null;
  for (const row of page.rows) {
    const text = rowText(row);
    if (/myodynamia/i.test(text)) { bucket = 'myodynamia'; continue; }
    if (/deficiency/i.test(text)) { bucket = 'myodynamia'; continue; }
    if (/muscle tension/i.test(text)) { bucket = 'tension'; continue; }
    if (!bucket) continue;
    const parsed = parseMuscle(text);
    if (parsed) out[bucket].push(parsed);
  }
  return out;
}

// ---------------------------------------------------------------- page 5

function parseRiskScreening(page) {
  const out = { mobility: null, stability: null, symmetry: null, subitems: {} };
  if (!page) return out;

  // ROM / Stability / Symmetry headline trio, value beneath each header.
  const head = page.rows.find((r) => {
    const t = rowText(r);
    return /\brom\b/i.test(t) && /stability/i.test(t) && /symmetry/i.test(t) && r.cells.length === 3;
  });
  if (head) {
    const below = page.rows
      .filter((r) => r.y < head.y && head.y - r.y < 90)
      .flatMap((r) => r.cells)
      .filter((c) => toNumOrNull(c.s) !== null);
    const pick = (label, key) => {
      const h = head.cells.find((c) => new RegExp(`^${label}$`, 'i').test(c.s));
      if (!h) return;
      const cell = nearestByCentre(below, h.cx, 45);
      if (cell) out[key] = toNumOrNull(cell.s);
    };
    pick('ROM', 'mobility');
    pick('Stability', 'stability');
    pick('Symmetry', 'symmetry');
  }

  // The 25-cell subitem table. Each region's label sits just ABOVE its row of
  // five numbers — [romL, romR, stabL, stabR, sym], left to right — so the
  // numbers are taken in x order and never matched to a column header. That is
  // deliberate: the header row is split ("ROM"/"Stability"/"Symmetry" over
  // "L"/"R"/"L"/"R"), and reconstructing it buys nothing the x order does not
  // already give, while adding a way to be silently wrong.
  for (const row of page.rows) {
    const key = REGION_TO_KEY.get(rowText(row).trim().toLowerCase());
    if (!key) continue;
    const values = page.rows
      .filter((r) => r.y < row.y && row.y - r.y < 14)
      .flatMap((r) => r.cells)
      .map((c) => ({ x: c.x, v: toNumOrNull(c.s) }))
      .filter((c) => c.v !== null)
      .sort((a, b) => a.x - b.x)
      .map((c) => c.v);
    if (values.length === 5) {
      out.subitems[key] = {
        romL: values[0], romR: values[1], stabL: values[2], stabR: values[3], sym: values[4],
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------- page 6

/**
 * Eight indicators in two columns. Each score sits ABOVE its own label, and the
 * label is itself wrapped over up to three rows ("Lumbar" / "Disc" /
 * "Herniation"). So: collect the scores, then gather the words beneath each one
 * within its column, join them, and look the phrase up in the SHARED label map.
 *
 * Matching the printed phrase rather than a position is what makes this survive
 * the layout reflowing — and an unrecognised phrase is DROPPED rather than
 * guessed at, so a relabelled report under-reports instead of mis-reporting.
 */
function parseExerciseRisk(page) {
  const out = {};
  if (!page) return out;

  // The legend row ("Low Risk (0-15) Medium Risk (16-55) High Risk (56-100)")
  // is full of numbers that are not scores. Everything above it is heading.
  const legend = page.rows.find((r) => /low risk/i.test(rowText(r)) && /high risk/i.test(rowText(r)));
  const top = legend ? legend.y : Infinity;

  const scores = page.rows
    .filter((r) => r.y < top)
    .flatMap((r) => r.cells.map((c) => ({ ...c, y: r.y })))
    .filter((c) => toNumOrNull(c.s) !== null && !/^\d+-\d+$/.test(c.s));
  if (!scores.length) return out;

  // TWO COLUMNS, SPLIT BETWEEN THE SCORES — not at the page midpoint.
  //
  // The label block sits a constant 100pt left of its own score (measured: left
  // column scores centre 200 / labels 100, right column 421 / 321). The right
  // column's labels therefore centre at ~321, which is LEFT of an A4 page's
  // midpoint of ~306 by only a hair — so splitting on the page would file
  // "Herniation" under the left column. Splitting midway between the two score
  // columns puts the boundary at ~310 with every label 10pt clear of it.
  const columns = [...new Set(scores.map((s) => Math.round(s.cx / 20) * 20))].sort((a, b) => a - b);
  const split = columns.length >= 2 ? (columns[0] + columns[columns.length - 1]) / 2 : Infinity;
  const columnOf = (cx) => (cx < split ? 'left' : 'right');

  for (const score of scores) {
    const side = columnOf(score.cx);
    const words = page.rows
      // Beneath this score, and not far enough to reach the next block: the
      // gap to the next score is ~104pt and its labels start ~122pt below.
      .filter((r) => r.y < score.y && score.y - r.y < 60)
      .flatMap((r) => r.cells.map((c) => ({ ...c, y: r.y })))
      .filter((c) => columnOf(c.cx) === side)
      .filter((c) => !/^(low|medium|high)\s*risk$/i.test(c.s))
      .filter((c) => !/^[（）()::：]$/.test(c.s))
      .filter((c) => toNumOrNull(c.s) === null)
      // Reading order: down the page, then left to right.
      .sort((a, b) => b.y - a.y || a.x - b.x);

    if (!words.length) continue;
    const phrase = words.map((c) => c.s).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
    for (const [label, key] of LABEL_TO_KEY) {
      if (phrase === label || phrase.startsWith(`${label} `)) {
        if (out[key] == null) out[key] = toNumOrNull(score.s);
        break;
      }
    }
  }
  return out;
}

// WHAT A HOLOMOTION REPORT MUST YIELD BEFORE THE FAST PATH IS TRUSTED.
//
// Pure and exported so it can be tested without opening a PDF — the jest
// transform rewrites the dynamic `import()` this file needs for pdfjs, so
// anything that reads a real document is verified in scripts/ instead. This is
// the part worth pinning, and it is reachable.
//
// The list is the fields a clinician's screen and the cohort scorer both need,
// and nothing more:
//
//   * the two HEADLINE scores, because they are what the hero prints and what
//     §21 rests on (Total Score and Exercise Risks, as HoloMotion spells them);
//   * the three MOVEMENT components, which Total Score is the mean of;
//   * ALL EIGHT indicators — they share one page and one table, so seven means
//     the parse is drifting, not that the report omitted one. LDH is included
//     here deliberately: it is STORED and never shown (§31), so its absence is
//     evidence about the parse even though nothing displays it;
//   * assessedAt, without which the screening cannot be placed in a period and
//     the idempotent (athleteId, assessedAt) commit key collapses (§45).
//
// Subitems are NOT required. They are a 25-cell table on the same page as the
// movement trio, so the trio already covers that page, and requiring them would
// send a report to vision over a table the dashboards degrade gracefully
// without.
//
// A value of 0 is a real reading and must pass — hence `== null` rather than a
// falsy test. §54: an unknown value stays unknown, and 0 is not unknown.
function completenessShortfall({ cover, screening, risks }) {
  const missing = [];
  const need = (label, value) => { if (value == null) missing.push(label); };

  need('totalScore', cover.overallActivityScore);
  need('exerciseRisks', cover.injuryRiskIndex);
  need('assessedAt', cover.assessedAt);
  need('mobility', screening.mobility);
  need('stability', screening.stability);
  need('symmetry', screening.symmetry);
  for (const ind of RISK_INDICATORS) need(ind.key, risks[ind.key]);
  // spinalDiscHerniation is excluded from RISK_INDICATORS by §31 but is still
  // parsed and stored, so it is checked by name rather than left unasserted.
  need('spinalDiscHerniation', risks.spinalDiscHerniation);

  return missing;
}

// ---------------------------------------------------------------- public

/**
 * Extract a HoloMotion report from its embedded text layer.
 *
 * Returns the SAME shape the vision path returns, so it is a drop-in for
 * verify-holomotion-extract.js and for the commit route.
 *
 * `athlete.name` is deliberately left EMPTY even though the text layer hands it
 * over in plain text. The commit backfills the name server-side from the roster
 * row the operator attached, exactly as it does for the vision path, and the
 * redaction contract is easier to keep than to re-argue: nothing downstream has
 * ever needed the printed name. The name IS read — it is how `nameFound` can
 * report whether the page was understood at all — and then dropped.
 */
async function extractFromTextLayer(buffer, { pdfjs } = {}) {
  const lib = pdfjs || await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = toBytes(buffer);
  const { pages, totalPages } = await readPages(lib, data);

  const score = textLayerScore(pages);
  if (score < MIN_TEXT_CHARS) {
    return {
      ok: false,
      reason: 'no-text-layer',
      textLayerChars: score,
      totalPages,
    };
  }

  const byNumber = (n) => pages.find((p) => p.number === n);
  const cover = parseCover(byNumber(1));
  const muscles = parseMuscleImbalance(byNumber(3));
  const screening = parseRiskScreening(byNumber(5));
  const risks = parseExerciseRisk(byNumber(6));

  // DID WE ACTUALLY READ A HOLOMOTION REPORT, or just a PDF with words in it?
  //
  // Until 2026-09-22 the only gate was `textLayerChars >= MIN_TEXT_CHARS`, and
  // everything after it returned `ok: true` unconditionally. Measured against
  // two text-bearing PDFs sitting in this repository:
  //
  //   AIRMS-System-Guide.pdf   ok: true, 21,017 chars, every value null
  //   reports/FYP-I-Report.pdf ok: true,  3,622 chars, every value null
  //
  // `ok: true` is what suppresses the vision fallback, so the model — which
  // would have read the thing correctly — never ran. The operator got a
  // confident, complete-looking preview of nothing.
  //
  // The real hazard is not somebody uploading a dissertation. It is that the
  // page numbers and label wordings below are read off the layouts ISN produces
  // TODAY. A HoloMotion release that keeps its text layer and moves the data
  // one page would land exactly here: text present, parsers silent, nulls
  // committed to an athlete's clinical record, and no error anywhere.
  //
  // So completeness is checked, and failing it returns `ok: false` — which
  // costs a vision call and is precisely the behaviour before this file
  // existed. STRICT ON PURPOSE, the same argument utils/prescription.js makes:
  // a report read loosely looks complete and is wrong. A false negative spends
  // ~11,400 tokens; a false positive puts nulls in a clinical record.
  const shortfall = completenessShortfall({ cover, screening, risks });
  if (shortfall.length) {
    return {
      ok: false,
      reason: 'text-layer-incomplete',
      missing: shortfall,
      textLayerChars: score,
      totalPages,
    };
  }

  return {
    ok: true,
    method: 'text-layer',
    textLayerChars: score,
    totalPages,
    nameFound: Boolean(cover.name),
    athlete: {
      name: '',
      age: cover.age,
      gender: cover.gender,
      overallActivityScore: cover.overallActivityScore ?? null,
      injuryRiskIndex: cover.injuryRiskIndex ?? null,
      mobility: screening.mobility,
      stability: screening.stability,
      symmetry: screening.symmetry,
      ...risks,
    },
    assessedAt: cover.assessedAt,
    myodynamia: muscles.myodynamia,
    tension: muscles.tension,
    subitems: screening.subitems,
    summary: cover.summary,
    summaryUnavailable: cover.summaryUnavailable || null,
  };
}

module.exports = {
  extractFromTextLayer,
  // exported for tests
  looksLetterSpaced,
  parseMuscle,
  completenessShortfall,
  MIN_TEXT_CHARS,
  LABEL_TO_KEY,
};
