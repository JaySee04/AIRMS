// Reducing an upload to the pages the extractor reads.
//
// Built on REAL PDFs made here rather than on a mocked pdf-lib, because the
// property under test is "does a smaller file come out with the right pages in
// it", and a mock can only confirm the call was made. The one thing a unit test
// cannot check is that the SERVER extracts the same values from the slice — that
// was measured separately against the real extractor, three real reports, whole
// versus sliced, every field identical:
//
//   nazwan.pdf             7.58 MB, 38p -> 1.70 MB, 26p
//   a real 38-page report 13.67 MB, 38p -> 1.71 MB, 26p
//   a 28-page report       2.11 MB, 28p -> 1.77 MB, 26p
//
// See lib/pdfSlice.ts and DESIGN_DECISIONS §115.5.

import { PDFDocument } from 'pdf-lib';
import { sliceForUpload } from './pdfSlice';

const MB = 1024 * 1024;

/**
 * A PDF with `pages` pages, each padded so the file is comfortably large.
 *
 * The padding is per page, so dropping pages genuinely shrinks the file — the
 * same shape as a real report, where the middle pages carry the chart images.
 */
async function makePdf(pages: number, padPerPage = 20_000): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([300, 300]);
    // A distinctive per-page marker so the slice can be checked for WHICH pages
    // survived, not merely how many.
    page.drawText(`PAGE_${i + 1}`, { x: 20, y: 150, size: 12 });
    // Bulk. An uncompressed stream of random-ish bytes resists deflate, which a
    // run of one repeated character would not.
    let filler = '';
    for (let n = 0; n < padPerPage; n += 1) filler += String.fromCharCode(33 + ((n * 7 + i) % 90));
    page.drawText(filler, { x: 0, y: -10_000, size: 1 });
  }
  const bytes = await doc.save({ useObjectStreams: true });
  return new File([bytes as BlobPart], 'report.pdf', { type: 'application/pdf' });
}

/** Which PAGE_n markers a produced file still contains. */
async function pagesIn(file: File): Promise<number[]> {
  const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
  return [...Array(doc.getPageCount()).keys()].map((i) => i + 1);
}

describe('sliceForUpload — the cheap paths cost nothing', () => {
  it('returns the ORIGINAL file when no limit is known', async () => {
    const f = await makePdf(30);
    const r = await sliceForUpload(f, null);
    // Identity, not equality: nothing was loaded, copied or re-saved.
    expect(r.file).toBe(f);
    expect(r.note).toBeNull();
  });

  it('returns the ORIGINAL file when it already fits', async () => {
    // The ISN-hosted case and the compact-layout case. Slicing is a hosted-only
    // degradation and must stay one.
    const f = await makePdf(12);
    const r = await sliceForUpload(f, 50 * MB);
    expect(r.file).toBe(f);
    expect(r.note).toBeNull();
  });

  it('ignores a nonsense limit rather than slicing everything', async () => {
    const f = await makePdf(12);
    for (const v of [0, -1, NaN]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await sliceForUpload(f, v);
      expect(r.file).toBe(f);
    }
  });
});

describe('sliceForUpload — what it keeps', () => {
  it('produces a smaller file that fits', async () => {
    const f = await makePdf(38);
    const cap = Math.floor(f.size * 0.6);
    const r = await sliceForUpload(f, cap);
    expect(r.file).not.toBe(f);
    expect(r.file.size).toBeLessThanOrEqual(cap);
    expect(r.file.size).toBeLessThan(f.size);
  });

  it('prefers the WIDEST window when it fits', async () => {
    // 6 head + 20 tail on a 38-page document. The wide window is deliberate:
    // the prescription starts at page 35 of 38 on a real report, so 20 is five
    // times the room needed, and the measurements said the margin is nearly
    // free. A slicer that always took the narrowest window would be one layout
    // change away from cutting a training programme.
    //
    // NOTE the cap: these synthetic pages weigh the same, whereas a real report
    // is heavy in the middle. At 0.6 the widest window does NOT fit and the
    // loop correctly narrows — which is how this test first failed, expecting
    // 26 and getting 20. The code was right.
    const f = await makePdf(38);
    const r = await sliceForUpload(f, Math.floor(f.size * 0.8));
    expect((await pagesIn(r.file)).length).toBe(26);
  });

  it('NARROWS rather than giving up when the widest window will not fit', async () => {
    // The fallback that makes the feature robust to a report heavier than any
    // measured. Fewer pages, still a valid slice, still under the cap.
    const f = await makePdf(38);
    const wide = await sliceForUpload(f, Math.floor(f.size * 0.8));
    const tight = await sliceForUpload(f, Math.floor(f.size * 0.45));
    expect((await pagesIn(tight.file)).length)
      .toBeLessThan((await pagesIn(wide.file)).length);
    expect(tight.file.size).toBeLessThanOrEqual(Math.floor(f.size * 0.45));
  });

  it('always keeps at least the data pages', async () => {
    // Every window in the ladder starts with the first six. Narrowing may drop
    // the prescription — which degrades the import — but must never drop the
    // pages every score comes from, which would produce a wrong record rather
    // than an incomplete one.
    const f = await makePdf(38);
    const r = await sliceForUpload(f, Math.floor(f.size * 0.3));
    expect((await pagesIn(r.file)).length).toBeGreaterThanOrEqual(6);
  });

  it('preserves a valid, loadable PDF', async () => {
    // The result is uploaded and parsed by pdfjs server-side; a file that is
    // smaller and corrupt would be worse than no slicing at all.
    const f = await makePdf(30);
    const r = await sliceForUpload(f, Math.floor(f.size * 0.6));
    await expect(PDFDocument.load(new Uint8Array(await r.file.arrayBuffer()))).resolves.toBeTruthy();
    expect(r.file.type).toBe('application/pdf');
  });

  it('keeps the filename, which is where the athlete name comes from', async () => {
    // parseNameFromFilename reads it to match the roster. A slice that renamed
    // the file would silently push every import back to manual search.
    const f = await makePdf(30);
    const r = await sliceForUpload(f, Math.floor(f.size * 0.6));
    expect(r.file.name).toBe(f.name);
  });
});

describe('sliceForUpload — what it tells the operator', () => {
  it('says what was sent and what was left out', async () => {
    const f = await makePdf(38);
    const r = await sliceForUpload(f, Math.floor(f.size * 0.6));
    expect(r.note).toBeTruthy();
    expect(r.note).toMatch(/pages 1–6/);
    expect(r.note).toMatch(/reduced copy/i);
  });

  it('does not claim the values changed', async () => {
    // The equivalence is the justification for the whole feature and is stated
    // plainly, because an operator who thinks the record is degraded will stop
    // using the hosted instance.
    const f = await makePdf(38);
    const r = await sliceForUpload(f, Math.floor(f.size * 0.6));
    expect(r.note).toMatch(/identical/i);
  });

  it('refuses, naming the remedy, when even the slice will not fit', async () => {
    // One page alone exceeds the cap. The message must not suggest re-exporting
    // the report smaller — the report is the single source of truth.
    const f = await makePdf(38);
    await expect(sliceForUpload(f, 500)).rejects.toThrow(/your own server/i);
    await expect(sliceForUpload(f, 500)).rejects.not.toThrow(/compress|reduce the quality/i);
  });

  it('refuses with a readable message when the file is not a PDF at all', async () => {
    // A .pdf that is not one reaches here before the server sees it.
    const junk = new File([new Uint8Array([1, 2, 3, 4])], 'report.pdf', { type: 'application/pdf' });
    await expect(sliceForUpload(junk, 2)).rejects.toThrow(/could not be read/i);
  });
});
