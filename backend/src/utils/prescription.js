// The Training Prescription HoloMotion prints at the back of its report.
//
// Pages 1–6 — the ones AIRMS has always ingested — are rendered graphics with
// no text layer, which is why extraction there is a vision problem. The
// prescription pages are not: they carry real text, so this needs no model, no
// tokens and no extra pages sent to any third party. It is the cheapest data in
// the report and was the only part nobody was reading.
//
// What it contains is the instrument's own answer to "so what do we DO about
// it": a two-week programme, grouped by day, each exercise with reps, sets and
// a rest interval, derived by HoloMotion from the same screening AIRMS already
// scores. That distinction matters — AIRMS's existing "suggested focus" card is
// a region-frequency heuristic this project wrote, and is careful to talk about
// load rather than treatment. This is not that. It is prescription the
// institution's own instrument issued, reproduced rather than invented.
//
// Parsed strictly. A row is accepted only when it matches the printed table's
// shape exactly; anything else is dropped rather than guessed at, because a
// half-read exercise ("Half Squat 10x") silently loses the sets and would be
// followed by an athlete as though complete.

/** The heading that opens the section, and the per-day sub-heading. */
const SECTION_RE = /Training Prescription/i;
const DAY_RE = /Day\s+(\d+)\s+Training Recommendation/gi;

/**
 * One printed row: number, name, reps, sets, rest.
 *
 * Reps carry their unit from the report — `10x` for repetitions, `30s` for a
 * held stretch — and are kept as printed rather than parsed into a number and a
 * unit, because "10x" and "30s" are what the athlete is meant to read and
 * splitting them invites a UI that renders "30 x" for a stretch.
 *
 * The name is lazy and may contain spaces, brackets and the report's own "-2"
 * variant suffixes ("Latissimus Dorsi Stretch (L) -2"), so it is bounded by the
 * reps token rather than by whitespace.
 */
const ROW_RE = /(\d{1,2})\s+(.+?)\s+(\d+\s*[xs])\s+(\d+)\s+(\d+)/gi;

/** Collapse the runs of whitespace pdfjs leaves between text items. */
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * @param {string} text  concatenated text layer of the WHOLE report
 * @returns {{ note: string|null, days: Array<{ day: number, exercises: Array<{
 *            no: number, name: string, reps: string, sets: number, rest: number }> }> }
 *          | null}  null when the report carries no prescription section at all
 *          (the compact layout does not), which is different from one that has
 *          the heading and no readable rows.
 */
function parsePrescription(text) {
  const flat = tidy(text);
  if (!SECTION_RE.test(flat)) return null;

  // The parenthetical caveat HoloMotion prints with the heading. Reproduced
  // verbatim: it is the instrument's own hedge about how long the programme
  // stands, and paraphrasing somebody else's clinical caveat is not our place.
  const noteMatch = flat.match(/Training Prescription\s*\(([^)]*)\)/i);
  const note = noteMatch ? tidy(noteMatch[1]) : null;

  // Slice the document into per-day chunks, so an exercise cannot be attributed
  // to the wrong day by a regex that ran past a heading.
  const marks = [];
  let m;
  DAY_RE.lastIndex = 0;
  while ((m = DAY_RE.exec(flat)) !== null) marks.push({ day: Number(m[1]), at: m.index, end: DAY_RE.lastIndex });
  if (!marks.length) return { note, days: [] };

  const days = [];
  for (let i = 0; i < marks.length; i += 1) {
    const from = marks[i].end;
    const to = i + 1 < marks.length ? marks[i + 1].at : flat.length;
    let chunk = flat.slice(from, to);
    // Drop the column headings so "Reps Sets Rest Interval" cannot be read as a row.
    chunk = chunk.replace(/No\.\s*Exercises\s*Reps\s*Sets\s*Rest Interval/gi, ' ');

    const exercises = [];
    let r;
    ROW_RE.lastIndex = 0;
    while ((r = ROW_RE.exec(chunk)) !== null) {
      const name = tidy(r[2]);
      if (!name || name.length > 80) continue;
      exercises.push({
        no: Number(r[1]),
        name,
        reps: tidy(r[3]).replace(/\s+/g, ''),
        sets: Number(r[4]),
        rest: Number(r[5]),
      });
    }
    if (exercises.length) days.push({ day: marks[i].day, exercises });
  }

  return { note, days };
}

/** Total exercises across the programme — for a one-line summary. */
const prescriptionSize = (p) => (p && p.days ? p.days.reduce((n, d) => n + d.exercises.length, 0) : 0);


/**
 * Pull the whole text layer out of a PDF buffer and parse the prescription.
 *
 * Separate from the vision pipeline on purpose. That path renders pages to
 * images because the data pages have no text; this one needs no rendering, no
 * model and no network — so a report that fails vision extraction entirely can
 * still yield its programme, and a deployment with no AI provider configured
 * still gets this.
 */
async function prescriptionFromPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    const content = await (await doc.getPage(p)).getTextContent();
    text += ` ${content.items.map((i) => i.str).join(' ')}`;
  }
  return parsePrescription(text);
}

module.exports = { parsePrescription, prescriptionSize, prescriptionFromPdf };
