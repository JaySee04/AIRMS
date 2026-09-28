// HOW BIG A REPORT THIS INSTALLATION CAN ACCEPT, and what it says when it cannot.
//
// MEASURED, and the numbers are why this exists. Real HoloMotion exports:
//
//   thung.pdf (compact 12p)   1.02 MB
//   the three demo reports    2.05 – 2.11 MB
//   nazwan.pdf (38p)          7.58 MB
//   a real 38p report        13.67 MB
//
// 12 of the 15 expanded reports measured are 7.7–13.2 MB. The hosted deployment
// caps a request body at 4.5 MB in the PLATFORM, before any code here runs —
// so the reports ISN actually produces cannot be imported on the demo instance
// and import fine on the server they will actually run. That difference was a
// line in DEPLOY.md and an uninterpretable error page.
//
// See utils/uploadLimits.js and DESIGN_DECISIONS §115.

const {
  maxUploadBytes, tooLargeMessage, mb, VERCEL_BODY_LIMIT, SELF_HOSTED_LIMIT,
} = require('../src/utils/uploadLimits');

const REAL_REPORT_BYTES = {
  'thung.pdf (compact)': 1.02 * 1024 * 1024,
  'a demo report': 2.11 * 1024 * 1024,
  'nazwan.pdf': 7.58 * 1024 * 1024,
  'the largest measured': 13.67 * 1024 * 1024,
};

describe('the cap follows the platform, not a guess', () => {
  it('is the platform limit when deployed to Vercel', () => {
    // Not because we chose it — because the request is refused before AIRMS
    // sees it, so any larger number here would be a lie the UI repeats.
    expect(maxUploadBytes({ VERCEL: '1' })).toBe(VERCEL_BODY_LIMIT);
  });

  it('is the multer limit on a server of our own', () => {
    expect(maxUploadBytes({})).toBe(SELF_HOSTED_LIMIT);
  });

  it('can be overridden for a reverse proxy with its own limit', () => {
    // nginx defaults `client_max_body_size` to 1 MB, which refuses every
    // report, and an institution's IT department is likelier to set that than
    // to mention it.
    expect(maxUploadBytes({ AIRMS_MAX_UPLOAD_BYTES: '1048576' })).toBe(1048576);
  });

  it('ignores a nonsense override rather than capping at zero', () => {
    // `Number('')` is 0 and `Number('lots')` is NaN. Either, taken literally,
    // refuses every upload — a typo in an env var would disable ingestion with
    // a message blaming the file.
    for (const v of ['', 'lots', '0', '-5', 'NaN']) {
      expect(maxUploadBytes({ AIRMS_MAX_UPLOAD_BYTES: v })).toBe(SELF_HOSTED_LIMIT);
    }
  });

  it('lets the override win on Vercel too', () => {
    // If the platform limit ever moves, the deployment can say so without a
    // release.
    expect(maxUploadBytes({ VERCEL: '1', AIRMS_MAX_UPLOAD_BYTES: '9000000' })).toBe(9000000);
  });
});

describe('which real reports fit where', () => {
  it('every measured report fits on a server of our own', () => {
    const limit = maxUploadBytes({});
    for (const [name, size] of Object.entries(REAL_REPORT_BYTES)) {
      expect([name, size <= limit]).toEqual([name, true]);
    }
  });

  it('only the small ones fit on the hosted instance', () => {
    // Pinned as a FACT about the deployment, not as an aspiration. If this ever
    // starts failing because the platform limit rose, that is the good news
    // this file should be updated for.
    const limit = maxUploadBytes({ VERCEL: '1' });
    expect(REAL_REPORT_BYTES['thung.pdf (compact)']).toBeLessThan(limit);
    expect(REAL_REPORT_BYTES['a demo report']).toBeLessThan(limit);
    expect(REAL_REPORT_BYTES['nazwan.pdf']).toBeGreaterThan(limit);
    expect(REAL_REPORT_BYTES['the largest measured']).toBeGreaterThan(limit);
  });

  it('the three demo reports fit everywhere', () => {
    // The stakeholder walkthrough depends on this: Dr Thung and Dr Hoo upload
    // these to the HOSTED instance.
    expect(REAL_REPORT_BYTES['a demo report']).toBeLessThan(maxUploadBytes({ VERCEL: '1' }));
  });
});

describe('the refusal tells the operator what to do about it', () => {
  const size = REAL_REPORT_BYTES['the largest measured'];

  it('names both numbers', () => {
    const m = tooLargeMessage(size, maxUploadBytes({ VERCEL: '1' }), { VERCEL: '1' });
    expect(m).toContain('13.7 MB');
    expect(m).toContain('4.5 MB');
  });

  it('says the limit is the platform\'s, not the report\'s', () => {
    // The failure this guards is somebody re-exporting the report at lower
    // quality to fit, and losing data, because the message said only "too
    // large". The remedy is a different install, not a smaller file.
    const m = tooLargeMessage(size, maxUploadBytes({ VERCEL: '1' }), { VERCEL: '1' });
    expect(m).toMatch(/your own server/i);
    expect(m).toMatch(/platform/i);
  });

  it('gives a self-hosted operator the knob instead', () => {
    // Different reader, different remedy: here it IS in their gift to raise it.
    const m = tooLargeMessage(size, maxUploadBytes({}), {});
    expect(m).toContain('AIRMS_MAX_UPLOAD_BYTES');
    expect(m).toMatch(/proxy/i);
    expect(m).not.toMatch(/your own server/i);
  });

  it('never tells anyone to shrink the report', () => {
    // A HoloMotion export is the source of truth (the mission statement). No
    // message here may suggest degrading it.
    for (const env of [{ VERCEL: '1' }, {}]) {
      const m = tooLargeMessage(size, maxUploadBytes(env), env);
      expect(m).not.toMatch(/compress|reduce the quality|re-?export at/i);
    }
  });
});

describe('mb — the number a human reads', () => {
  it('keeps one decimal, because 0.1 MB matters at this scale', () => {
    // 4 MB and 4.5 MB are different answers to "will this upload".
    expect(mb(4.5 * 1024 * 1024)).toBe('4.5 MB');
    expect(mb(13.67 * 1024 * 1024)).toBe('13.7 MB');
  });

  it('never prints a too-large file as the same size as the limit', () => {
    // THE DEFECT THIS FOUND. At one decimal, 4.54 MB renders "4.5 MB" — against
    // a 4.5 MB cap the sentence read "This report is 4.5 MB and this server
    // accepts 4.5 MB", which is a refusal that contradicts itself and sends the
    // operator to report a bug in the uploader. Size rounds UP, limit DOWN.
    const limit = VERCEL_BODY_LIMIT;
    for (const over of [1, 1024, 0.04 * 1024 * 1024, 0.09 * 1024 * 1024]) {
      const m = tooLargeMessage(limit + over, limit, { VERCEL: '1' });
      const [, said, accepts] = m.match(/is ([\d.]+) MB and this server accepts ([\d.]+) MB/);
      expect([over, Number(said) > Number(accepts)]).toEqual([over, true]);
    }
  });
});
