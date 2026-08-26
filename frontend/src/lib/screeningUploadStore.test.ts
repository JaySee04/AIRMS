import { parseNameFromFilename } from './screeningUploadStore';

// The athlete is resolved from this name — roster first, then the ISN directory
// — so anything left clinging to it (a batch number, a hash) makes the lookup
// miss and pushes the operator back to searching by hand. These are the real
// filename shapes ISN's exports have produced.
describe('parseNameFromFilename', () => {
  it('reads the plain "Name_phone.pdf" shape', () => {
    expect(parseNameFromFilename('thung jin seng_0122663031.pdf')).toBe('thung jin seng');
  });

  it('strips a leading rpt_<date>_ prefix and a trailing hash', () => {
    expect(parseNameFromFilename('rpt_2025-08-13_muhammad nazwan bin abdullah_9f8e7d6c.pdf'))
      .toBe('muhammad nazwan bin abdullah');
  });

  // The bug JC hit: ISN exports a screening run as a numbered set, so the index
  // rode into the name and every lookup missed.
  //
  // This is the verbatim filename of the real export (supplied 2026-08-09), not
  // a reconstruction — 32-char hex suffix and all. The index is in the report
  // BODY too ("Name：14. MOHAMED ELFFIE DANISH BIN"), which confirms it is ISN's
  // own numbering rather than something the download added.
  it('strips a leading batch number — the real ISN export shape', () => {
    expect(parseNameFromFilename('rpt_2025-07-29_14. MOHAMED ELFFIE DANISH BIN KHIR JOHARI_db5744c82170455099020c5ccdce32f3.pdf'))
      .toBe('MOHAMED ELFFIE DANISH BIN KHIR JOHARI');
  });

  it('strips the batch number in the other punctuations ISN might use', () => {
    const NAME = 'MOHAMED ELFFIE DANISH BIN KHIR JOHARI';
    for (const prefix of ['14. ', '14 ', '14) ', '(14) ', '#14 ', '14 - ', '14- ', '1.', '007. ']) {
      expect(parseNameFromFilename(`${prefix}${NAME}.pdf`)).toBe(NAME);
    }
  });

  it('handles a batch number with no rpt_ prefix and no hash', () => {
    expect(parseNameFromFilename('3. Aisha Ahmad.pdf')).toBe('Aisha Ahmad');
  });

  // The three reports JC hands to Dr Thung and Dr Hoo. Their names must survive
  // the parser intact, because the athletes are not in the roster: the ONLY way
  // they resolve is an exact hit in the ISN directory, and matchInIsn accepts
  // nothing ambiguous. A stray "12." would silently make that lookup miss.
  it.each([
    ['rpt_2025-07-29_12. nurin syazwani binti rusli_e52fec0f97a949b39aa431d5803c3c51.pdf',
      'nurin syazwani binti rusli'],
    ['rpt_2025-07-29_14. NUR BATRISYIA BINTI YUSOF_ed1880dee45c420f8e55ad63c38b488c.pdf',
      'NUR BATRISYIA BINTI YUSOF'],
    // Note the space before the underscore - this one is in the real filename.
    ['rpt_2025-07-29_12. nur aina danish _c1c39c42d2774c47a513e4d2b856a1ee.pdf',
      'nur aina danish'],
  ])('reads the 2025-07-29 session file %#', (filename, expected) => {
    expect(parseNameFromFilename(filename)).toBe(expected);
  });

  it('strips a long alphanumeric digest that is not pure hex', () => {
    expect(parseNameFromFilename('zara tan_a1b2z9k4m7q3.pdf')).toBe('zara tan');
  });

  it('leaves a name that needs no cleaning alone', () => {
    expect(parseNameFromFilename('John Doe.pdf')).toBe('John Doe');
    expect(parseNameFromFilename('Mohamed Elffie Danish Bin Khir Johari.pdf'))
      .toBe('Mohamed Elffie Danish Bin Khir Johari');
  });

  it('does not eat digits that are not a leading index', () => {
    // Only a LEADING number is an index. A digit anywhere else is left alone,
    // so nothing is trimmed off the front of a name that happens to contain one.
    expect(parseNameFromFilename('athlete 2 of 3.pdf')).toBe('athlete 2 of 3');
    expect(parseNameFromFilename('Siti 2 Rahman.pdf')).toBe('Siti 2 Rahman');
  });

  it('never strips into the name itself', () => {
    // Whatever the prefix, the alphabetic part must survive intact.
    for (const f of [
      '14. MOHAMED ELFFIE.pdf',
      'rpt_2025-01-01_2. MOHAMED ELFFIE_deadbeef.pdf',
      'MOHAMED ELFFIE_0123456789.pdf',
    ]) {
      expect(parseNameFromFilename(f)).toContain('MOHAMED ELFFIE');
    }
  });

  it('survives degenerate input without throwing', () => {
    expect(parseNameFromFilename('.pdf')).toBe('');
    expect(parseNameFromFilename('')).toBe('');
    expect(parseNameFromFilename('14.pdf')).toBe('');
    expect(parseNameFromFilename('rpt_2025-07-25_.pdf')).toBe('');
  });
});
