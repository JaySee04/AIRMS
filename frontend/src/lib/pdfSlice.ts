// SEND THE PAGES THE EXTRACTOR READS, WHEN THE WHOLE FILE WILL NOT FIT.
//
// THE PROBLEM. A HoloMotion export runs 7.6–13.7 MB; 12 of the 15 expanded
// reports measured are 7.7–13.2 MB. A Vercel serverless function's request body
// is capped at 4.5 MB by the PLATFORM, which refuses the request before any
// AIRMS code runs — so on the hosted instance the reports ISN actually produces
// could not be imported at all, while importing fine on the server they will
// actually run (docs/DEPLOY_ISN.md). §115.3 made that legible; this makes it
// work.
//
// WHERE THE BYTES ARE. Not spread evenly: the middle of an expanded report is
// Angle Change Tendency and Deviation Within Recommended Angle Range — dozens of
// chart images, and nothing in AIRMS reads any of them. The extractor reads the
// DATA pages at the front (every scalar, indicator, subitem cell, muscle flag)
// and the TRAINING PRESCRIPTION at the back. Measured:
//
//   nazwan.pdf            7.58 MB, 38p  ->  1.70 MB, 26p
//   a real 38-page report 13.67 MB, 38p  ->  1.71 MB, 26p
//   a 28-page report       2.11 MB, 28p  ->  1.77 MB, 26p
//
// AND THE EXTRACTION IS UNCHANGED. Each of those three was run through the real
// extractor twice, whole and sliced, and every field matched: both headline
// scores, the movement components, all indicators, all 25 subitem cells, muscle
// flags with sides, the verbatim Summary, and the prescription at 6 days / 48
// exercises. That equivalence is the entire justification for this file — a
// smaller upload that changed one value would be worthless.
//
// WHEN IT RUNS: only when the file does not already fit. An ISN-hosted install
// accepts 20 MB and slices nothing; the compact 12-page layout is ~1 MB and is
// never touched. Slicing is a hosted-only degradation and stays one.
//
// WHAT IT COSTS: `pdf-lib`, imported DYNAMICALLY so it is a lazy chunk that a
// normal import never downloads. It is the only frontend dependency outside the
// framework and chart.js, and it earns its place by making the deployed demo
// able to ingest the institution's real files.

/** Data pages: every value the extractor reads lives in the first six. */
const HEAD_PAGES = 6;

/**
 * Tail windows, tried widest first.
 *
 * The prescription starts at page 35 of 38 and 25 of 28 in the reports measured
 * — the last four — so 20 is five times the room needed. It is deliberately
 * generous rather than tight: cutting the prescription would silently drop a
 * clinical programme, and the measurements say the wide window costs almost
 * nothing (1.70 MB at 20 pages against 1.62 MB at 14).
 *
 * Narrower windows follow so an unusually heavy report still gets under the cap
 * instead of being refused outright. The first that fits wins.
 */
const TAIL_WINDOWS = [20, 14, 10, 6, 4];

export interface SliceResult {
  /** What to upload. The ORIGINAL file when it already fits. */
  file: File;
  /** Null when nothing was done; otherwise a sentence for the operator. */
  note: string | null;
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Reduce `file` to something the server will accept, or throw.
 *
 * THROWS rather than returning the oversize file: handing back something known
 * to be refused would push the failure to the server and lose the reason. The
 * caller turns the message into the row's error, which is where the operator
 * is looking.
 */
export async function sliceForUpload(file: File, maxBytes: number | null): Promise<SliceResult> {
  // The common case, and the one that must cost nothing: no limit known, or the
  // file already fits. pdf-lib is not even loaded here.
  if (maxBytes === null || !Number.isFinite(maxBytes) || maxBytes <= 0) return { file, note: null };
  if (file.size <= maxBytes) return { file, note: null };

  let PDFDocument;
  try {
    ({ PDFDocument } = await import('pdf-lib'));
  } catch {
    throw new Error(
      `This report is ${mb(file.size)} and this server accepts ${mb(maxBytes)}. `
      + 'It could not be reduced because a browser component failed to load — reload the page and try again, '
      + 'or import it on an installation running on your own server.',
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let src;
  try {
    src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new Error(
      `This report is ${mb(file.size)} and this server accepts ${mb(maxBytes)}, and it could not be read `
      + 'well enough to send a reduced copy. Import it on an installation running on your own server.',
    );
  }

  const total = src.getPageCount();
  for (const tail of TAIL_WINDOWS) {
    const keep = new Set<number>();
    for (let i = 0; i < Math.min(HEAD_PAGES, total); i += 1) keep.add(i);
    for (let i = Math.max(0, total - tail); i < total; i += 1) keep.add(i);
    const pages = [...keep].sort((a, b) => a - b);
    // Everything already fits in one window on every report measured; the loop
    // exists for the one that does not.
    // eslint-disable-next-line no-await-in-loop
    const out = await PDFDocument.create();
    // eslint-disable-next-line no-await-in-loop
    const copied = await out.copyPages(src, pages);
    copied.forEach((p) => out.addPage(p));
    // eslint-disable-next-line no-await-in-loop
    const saved = await out.save({ useObjectStreams: true });
    if (saved.length <= maxBytes) {
      const sliced = new File([saved as BlobPart], file.name, { type: 'application/pdf' });
      return {
        file: sliced,
        // Says what was sent and what was left out, in page numbers the operator
        // can check against the PDF in their hand. Not an apology and not
        // hidden: the upload genuinely differed from the file they chose.
        note: `Sent a reduced copy — pages 1–${Math.min(HEAD_PAGES, total)} and `
          + `${total - tail + 1}–${total} (${mb(saved.length)} of ${mb(file.size)}), because this server `
          + `accepts ${mb(maxBytes)}. The omitted pages are angle-trajectory charts, which AIRMS does not read; `
          + 'every extracted value is identical.',
      };
    }
  }

  throw new Error(
    `This report is ${mb(file.size)} and this server accepts ${mb(maxBytes)}. Even reduced to its data and `
    + 'prescription pages it does not fit. Import it on an installation running on your own server.',
  );
}
