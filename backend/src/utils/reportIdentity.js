// IS THIS EVEN A HOLOMOTION REPORT?
//
// THE DEFECT THIS CLOSES, measured 2026-09-30. Upload any PDF at all — a 51-page
// university report, 10.8 MB, carrying the author's own name and supervisor —
// and the importer accepted it (200), fell through to the vision path, and SENT
// ITS PAGES TO GEMINI. One provider call, quota spent, and an arbitrary document
// off the machine to a third party.
//
// The name-redaction pass is no protection there: it blanks a fixed region of
// page 1 of a HoloMotion report. On an unrelated document it blanks something
// meaningless and ships the rest.
//
// WHY THE EXISTING SIGNAL WAS NOT ENOUGH, though it was nearly there.
// `extractFromTextLayer` already returns two distinct refusals, and the caller
// collapsed them into one:
//
//   no-text-layer          0 chars. The compact 12-page layout. Vision is the
//                          only way to read it — a legitimate fallback.
//   text-layer-incomplete  text IS present but required fields are missing.
//
// Treating the second as "use vision" is what sent the university report to the
// model. But it cannot simply be refused either: that reason ALSO fires for a
// genuine report where one field failed to parse, and those must still reach the
// vision fallback rather than be rejected out of hand.
//
// So the question is not "is anything missing" but HOW MUCH OF A REPORT IS THIS.
// Measured on real documents:
//
//   nazwan.pdf (real, 38pp)      0 of 17 required fields missing
//   synthetic fixture            0 of 17
//   FYP-I-Report.pdf (unrelated) 14 of 17   — and the 3 it "found" are numbers
//                                             matched out of unrelated prose
//
// TWO INDEPENDENT SIGNALS, because either alone fails in a way the other covers.
// A marker test alone would reject a report whose title line failed to extract;
// a field count alone would accept any document that happens to contain enough
// stray numbers. Both are cheap, local, and run BEFORE anything is rendered or
// transmitted.
//
// WHAT THIS DELIBERATELY DOES NOT DO. A PDF with NO text layer that is not a
// HoloMotion report — a scanned document, a photo — still reaches vision, because
// at 0 characters there is nothing local left to test. Closing that needs OCR on
// page 1, which the redaction pass already performs but currently only over the
// name region. It is a smaller hole than the one being closed (it takes a
// deliberately odd upload rather than any ordinary PDF) and it is stated here
// rather than left to be discovered.

/**
 * Phrases HoloMotion prints and an unrelated document will not.
 *
 * Taken from the real reports rather than invented: nazwan.pdf's page 1 opens
 * "Report of Physical Quality and Exercise Risks Information Name ： …". The
 * fullwidth colon (U+FF1A) is itself a strong signal — it is how the instrument
 * separates every cover label from its value, and ordinary English documents do
 * not contain it.
 */
const MARKERS = [
  'physical quality',
  'exercise risk',
  'total score',
  'myodynamia',
  'muscle tension',
  'physical fitness',
  'rom',
];

/** How many required fields completenessShortfall checks. */
const REQUIRED_FIELDS = 17;

/**
 * Below this many recognised fields, a text-bearing PDF is not a report.
 *
 * 4 of 17, chosen from the measurement above with room either side: the
 * unrelated document reached 3 by accident, and a genuine report missing enough
 * fields to fall under 4 is so badly damaged that refusing it — with a message
 * naming what was missing — beats guessing at it with a model.
 */
const MIN_FIELDS = 4;

/** Markers needed before text is accepted as a report on marker evidence alone. */
const MIN_MARKERS = 2;

/**
 * Decide whether a text-bearing PDF is a HoloMotion report.
 *
 * @param {object} arg
 * @param {string} arg.text     concatenated text of the data pages
 * @param {string[]} arg.missing completenessShortfall's list
 * @returns {{ relevant: boolean, markers: string[], fieldsFound: number, why: string }}
 */
function identifyReport({ text = '', missing } = {}) {
  const haystack = String(text || '').toLowerCase();
  const markers = MARKERS.filter((m) => haystack.includes(m));
  // The fullwidth colon counts as a marker in its own right.
  if (haystack.includes('：')) markers.push('fullwidth colon');

  // FAILS CLOSED ON ABSENT EVIDENCE, and it did not at first.
  //
  // `missing = []` as a default reads as "no fields are missing" when what it
  // actually means is "nothing was checked" — so identifyReport() with no
  // arguments returned 17/17 fields found and relevant:true. For a gate whose
  // whole job is deciding what may leave the machine, an unknown that resolves
  // to "yes, send it" is the one failure direction that must not exist. Caught
  // by this module's own test before it shipped.
  const fieldsFound = Array.isArray(missing)
    ? Math.max(0, REQUIRED_FIELDS - missing.length)
    : 0;
  const relevant = markers.length >= MIN_MARKERS || fieldsFound >= MIN_FIELDS;

  return {
    relevant,
    markers,
    fieldsFound,
    why: relevant
      ? `${markers.length} marker(s), ${fieldsFound}/${REQUIRED_FIELDS} fields`
      : `no HoloMotion markers (${markers.length}) and only ${fieldsFound}/${REQUIRED_FIELDS} fields recognised`,
  };
}

module.exports = {
  identifyReport, MARKERS, MIN_FIELDS, MIN_MARKERS, REQUIRED_FIELDS,
};
