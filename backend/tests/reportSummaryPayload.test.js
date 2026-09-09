// HoloMotion's Summary text on the indicator payload — and, more importantly,
// where it must NOT appear.
//
// The contract has two halves and both fail silently if broken:
//
//   1. The SINGLE-athlete paths must carry it, or the dashboard card that
//      reproduces the instrument's own words renders nothing and looks like a
//      report that had no summary. Indistinguishable, on screen, from working.
//
//   2. The ROSTER path must not. It fetches one screening per athlete, and
//      summary_text is a TEXT column nothing on a roster renders. Adding it
//      there would be a payload regression that no test would notice and no
//      user would report — it would just get slower as the institute grows.
//
// The mechanism is that `toIndicator` omits the key entirely when the row does
// not carry the column, so a roster payload is byte-identical to before the
// feature existed. That is asserted here rather than assumed.

const { INDICATOR_ATTRS, DETAIL_ATTRS, toIndicator } = require('../src/utils/indicatorPayload');

// A row as Sequelize returns it with `raw: true` for the DETAIL attribute list.
const detailRow = (over = {}) => ({
  id: 1, assessedAt: '2026-07-29T02:00:00.000Z', totalScore: 77, overallIndicator: 41,
  overallBand: 'green', escalations: 0, factors: [], reasonsAgainst: [],
  cohortZ: 0.2, cohortRank: 3, cohortSize: 7, cohortLabel: 'Badminton / Female',
  cohortDeltas: [], subitems: null, prescription: null,
  overrideBand: null, overrideNote: null, overrideBy: null, overrideAt: null,
  summaryText: '1. Cervical rotation limited on the left. 2. Retest in 1.5 months.',
  ...over,
});

// The same row as the ROSTER query returns it: the column was never selected,
// so the property is absent — not null.
const rosterRow = () => {
  const r = detailRow();
  delete r.summaryText;
  return r;
};

describe('summary text on the indicator payload', () => {
  describe('the two attribute lists', () => {
    it('DETAIL_ATTRS is INDICATOR_ATTRS plus summaryText, and nothing else', () => {
      // Pinned as a set difference rather than a written-out list, so adding a
      // field to INDICATOR_ATTRS does not need this test edited — only a change
      // to what DETAIL adds would fail here, which is exactly the change worth
      // stopping to think about.
      const extra = DETAIL_ATTRS.filter((a) => !INDICATOR_ATTRS.includes(a));
      expect(extra).toEqual(['summaryText']);
    });

    it('INDICATOR_ATTRS does not select summaryText', () => {
      // The roster query's whole cost argument rests on this one line.
      expect(INDICATOR_ATTRS).not.toContain('summaryText');
    });
  });

  describe('the detail path carries the instrument\'s words', () => {
    it('passes the text through verbatim', () => {
      const out = toIndicator(detailRow(), 180);
      expect(out.summaryText).toBe('1. Cervical rotation limited on the left. 2. Retest in 1.5 months.');
    });

    it('a report with no Summary section gives null, not absent', () => {
      // Different fact from "this payload does not carry summaries": the
      // compact HoloMotion layout genuinely has no Summary section. The card
      // renders nothing either way, but only one of them is a missing feature.
      const out = toIndicator(detailRow({ summaryText: null }), 180);
      expect('summaryText' in out).toBe(true);
      expect(out.summaryText).toBeNull();
    });

    it('an empty string is normalised to null', () => {
      // An empty summary is not a summary. Left as '', the card's truthiness
      // check would hide it anyway — but null says which of the two it is.
      expect(toIndicator(detailRow({ summaryText: '' }), 180).summaryText).toBeNull();
    });
  });

  describe('the roster path is unchanged, byte for byte', () => {
    it('omits the key entirely rather than sending null', () => {
      const out = toIndicator(rosterRow(), 180);
      expect('summaryText' in out).toBe(false);
    });

    it('serialises without the field appearing anywhere', () => {
      // The assertion that actually protects the wire. `'key' in obj` would
      // still pass if the value were undefined; this checks what is sent.
      const json = JSON.stringify(toIndicator(rosterRow(), 180));
      expect(json).not.toContain('summaryText');
    });

    it('is otherwise identical to the detail payload', () => {
      // Everything except the one key must match, so a future edit cannot
      // quietly diverge the two shapes and leave the roster missing a field
      // the dashboard needs.
      const detail = toIndicator(detailRow(), 180);
      const roster = toIndicator(rosterRow(), 180);
      const { summaryText, ...detailRest } = detail;
      expect(summaryText).toEqual(expect.any(String));
      expect(roster).toEqual(detailRest);
    });
  });

  it('a null row is still null', () => {
    expect(toIndicator(null, 180)).toBeNull();
  });
});
