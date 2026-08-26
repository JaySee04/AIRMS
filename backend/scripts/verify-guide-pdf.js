// Read the RENDERED guide back and check it is actually readable.
//
// Exists because the generator was shipped three times without anyone opening
// the output. Every fault in that document was a property of the rendered page,
// not of the markdown: leaked markup, and text laid outside the printable area.
// Both are checkable, so they are checked.
//
//   node scripts/verify-guide-pdf.js
const path = require('path');

const PDF = path.join(__dirname, '..', '..', 'AIRMS-System-Guide.pdf');
const MARGIN = 62;
const SLACK = 2;            // rounding in the text-item transform

(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(require('fs').readFileSync(PDF)), useSystemFonts: true }).promise;

  const leaks = [];
  const overflow = [];
  let pageText = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const width = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    let text = '';
    for (const it of content.items) {
      text += it.str;
      const x = it.transform[4];
      const right = x + (it.width || 0);
      // Anything drawn past the right margin was clipped on the page.
      if (right > width - MARGIN + SLACK && it.str.trim()) {
        overflow.push(`p${p}: x=${x.toFixed(0)} right=${right.toFixed(0)} > ${(width - MARGIN).toFixed(0)}  ${JSON.stringify(it.str.slice(0, 42))}`);
      }
    }
    pageText.push(text);

    // Markdown that reached the page instead of being rendered.
    for (const [re, what] of [
      [/\*\*/g, 'bold markers **'],
      // Heading hashes only - a run of '#' with no following space is the
      // redaction example, where winAnsiSafe maps the block character to '#'.
      [/#{1,6}\s\S/g, 'heading hashes'],
      [/`/g, 'backtick'],
      [/\*(?=\S)/g, 'emphasis asterisk'],
    ]) {
      const hits = text.match(re);
      if (hits) leaks.push(`p${p}: ${hits.length}x ${what}`);
    }
  }

  const all = pageText.join(' ').replace(/\s+/g, ' ');

  // Sentences that were truncated or column-wrapped in the broken build. Each
  // must now appear whole.
  const MUST = [
    'Running the programme - norms, people, settings, the trail',
    'The athlete data is entirely fabricated',
    'The left rail searches by name or IC number',
    'The three sample reports',
    'Drop all three in at once',
    'The arrow only calls a change real when it exceeds the detectable-change',
    'The holistic report is also attached to the monthly digest email',
    'Large HoloMotion PDFs are rejected',
    'Small things are the easiest to fix',
  ];
  const missing = MUST.filter((s) => !all.includes(s));

  const fail = leaks.length || overflow.length || missing.length;
  console.log(`pages: ${doc.numPages}`);
  console.log(`markdown leaked into the page : ${leaks.length ? 'FAIL' : 'none'}`);
  leaks.slice(0, 12).forEach((l) => console.log(`   ${l}`));
  console.log(`text outside the right margin : ${overflow.length ? `FAIL (${overflow.length})` : 'none'}`);
  overflow.slice(0, 12).forEach((l) => console.log(`   ${l}`));
  console.log(`sentences intact              : ${missing.length ? 'FAIL' : `all ${MUST.length} present`}`);
  missing.forEach((m) => console.log(`   MISSING: ${JSON.stringify(m)}`));
  console.log(fail ? '\nVERDICT: the document is still broken' : '\nVERDICT: clean');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
