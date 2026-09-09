// Splitting HoloMotion's Summary text back into the numbered points it was
// printed as.
//
// The extractor is told to "join the numbered points with spaces", so what
// reaches the database is one line like:
//
//   "1. Poor cervical mobility. 2. Left shoulder is 12.5 degrees short. 3. ..."
//
// The report prints those as a numbered list, and reading them as a wall of
// prose is measurably worse — but this is SOMEBODY ELSE'S CLINICAL TEXT, so the
// only acceptable transformation is one that provably changes no characters.
//
// THE RULE: if the pieces do not rejoin to the original exactly, we did not
// understand the text, and it is rendered as one paragraph instead. A split
// that drops or alters a clause would be the silent-failure class this project
// keeps finding — a wrong answer that looks like a right one, and here the
// wrong answer is a clinician's reading of a patient's report.
//
// Why the pattern is narrow: a marker is 1-2 digits, a period, then whitespace.
// Requiring the whitespace is what keeps "12.5 degrees" and "1.5 cm" intact —
// a decimal has no space after its point. Requiring the marker to sit at a
// boundary keeps "Grade 3. " inside a sentence from starting a new point only
// when it genuinely begins one.

// A point marker: start of string, or following whitespace, then 1-2 digits,
// then '.' or ')', then at least one space.
//
// Held as a STRING and compiled with `new RegExp`, deliberately. A literal here
// would be one editing pass away from the 2026-09-06 defect where `\b` became a
// raw backspace byte and a guard silently matched nothing (SILENT_FAILURES 3l).
// tests/sourceHygiene now catches that, but this file is exactly the shape that
// produced it.
const MARKER_SRC = '(?:^|\\s)(\\d{1,2})[.)]\\s+';

export interface SummaryPoint {
  /** The printed marker, e.g. "1" — kept so the list can show what the report showed. */
  marker: string;
  /** The point's text, with the marker removed and ends trimmed. */
  text: string;
}

/**
 * Split HoloMotion's joined Summary text into its numbered points.
 *
 * Returns `[]` when the text is absent, blank, or does not parse as a numbered
 * list — the caller then renders the original string as a single paragraph.
 * Never returns a partial or lossy split.
 */
export function splitSummaryPoints(raw: string | null | undefined): SummaryPoint[] {
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];

  const re = new RegExp(MARKER_SRC, 'g');
  const found: Array<{ marker: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // m.index points at the leading whitespace when there is one; the point's
    // body starts after the whole match.
    found.push({ marker: m[1], start: m.index, end: m.index + m[0].length });
    // Zero-length matches cannot occur (the pattern requires \s+ at the end),
    // so exec always advances.
  }

  // Fewer than two markers is prose that happens to contain a number, not a
  // list. One "point" would also render identically to a paragraph.
  //
  // This also catches back-to-back markers ("1. 2. text"): the pattern's
  // trailing \s+ is greedy, so the second marker has no whitespace left to
  // match against and only one is found.
  if (found.length < 2) return [];

  // The markers must run 1, 2, 3 … — HoloMotion prints them in order. Anything
  // else means the pattern matched something that is not a list marker.
  const ordered = found.every((f, i) => Number(f.marker) === i + 1);
  if (!ordered) return [];

  const points: SummaryPoint[] = found.map((f, i) => {
    const stop = i + 1 < found.length ? found[i + 1].start : text.length;
    return { marker: f.marker, text: text.slice(f.end, stop).trim() };
  });

  // Rebuild the original from the parts; if it does not match character for
  // character, we mis-parsed and must not show a rearranged version of a
  // clinician's report.
  //
  // THIS IS THE LOAD-BEARING CHECK, and it took mutation testing to establish
  // that. The first draft had three more guards beside it — an explicit
  // preamble check, an ordered-markers check and an empty-point check — and
  // disabling any ONE of the three changed no test result, because the slices
  // are contiguous and each case was already caught by another line. Two of
  // them were unreachable outright: whitespace before a marker is consumed
  // greedily, so two adjacent markers always have a non-space character
  // between them and a point can never come out empty.
  //
  // They were removed rather than kept as reassurance. A guard that cannot
  // fire still reads as protection, and this project has already been bitten
  // by a check that looked load-bearing and matched nothing
  // (SILENT_FAILURES 3l). With them gone, this line now genuinely catches the
  // preamble case — verified by disabling it and watching that test fail.
  //
  // What it protects: any future change that makes the slicing non-contiguous
  // would silently shorten a clinician's summary. This turns that into a
  // refusal to split at all, which renders the original text whole.
  const rebuilt = points.map((p) => `${p.marker}. ${p.text}`).join(' ');
  if (normalise(rebuilt) !== normalise(text)) return [];

  return points;
}

// Compare ignoring only the things the join itself cannot preserve: the runs of
// whitespace between points, and whether a marker was printed "1." or "1)".
// Everything else — every word, digit and punctuation mark — must survive.
function normalise(s: string): string {
  return s.replace(/(\d{1,2})\)/g, '$1.').replace(/\s+/g, ' ').trim();
}
