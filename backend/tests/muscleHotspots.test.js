// Which muscles come up most often across a group — counted in ATHLETES.
//
// WHY THIS FILE EXISTS. The counting lived inline in routes/athletes.js and
// counted flag ROWS, while the admin dashboard labels the figure "athletes
// flagged" and renders it as `segments: [{ label: 'athletes', value: m.count }]`.
// A HoloMotion report carrying one muscle for LEFT and RIGHT produces two rows,
// so an athlete was counted twice under a label that said otherwise.
//
// Measured on the seeded data when the util was extracted (2026-10-06, §124):
//
//   Badminton myodynamia   Piriformis  9 rows  ->  6 athletes   (of 16)
//   Institute tension      Biceps Brachii 39   ->  34 athletes
//                          Iliopsoas      39   ->  36 athletes
//
// The second pair is the one that matters: the RANKING changed. Biceps Brachii
// and Iliopsoas tied at 39 rows, so the institute's "top tension muscle" — the
// headline on the admin dashboard, and the kind of figure a squad focus gets
// built on — was decided by sort order. Counted per athlete they separate
// cleanly and the answer is Iliopsoas.
//
// The team PDF's `squadMuscleHotspots` had counted distinct athletes since it
// was written, so the endpoint and the report had been disagreeing about one
// number with nothing to say which was right. That is rules-8 drift, and it is
// why this is a module with a test rather than four lines in a route.
const { topFlaggedMuscles } = require('../src/utils/muscleHotspots');

const flag = (athleteId, flagType, muscle) => ({ athleteId, flagType, muscle });

describe('topFlaggedMuscles', () => {
  it('counts ATHLETES, not flag rows', () => {
    // One athlete, one muscle, both sides -> two rows, one athlete.
    const flags = [
      flag('a1', 'myodynamia', 'Piriformis'),
      flag('a1', 'myodynamia', 'Piriformis'),
      flag('a2', 'myodynamia', 'Piriformis'),
    ];
    expect(topFlaggedMuscles(flags, 'myodynamia')).toEqual([{ muscle: 'Piriformis', count: 2 }]);
  });

  it('keeps the two flag KINDS apart', () => {
    // A weak muscle and a tight one are different findings on the same muscle,
    // and a clinician acts on the difference. Merging them would report one
    // athlete as two.
    const flags = [
      flag('a1', 'myodynamia', 'Iliopsoas'),
      flag('a1', 'tension', 'Iliopsoas'),
    ];
    expect(topFlaggedMuscles(flags, 'myodynamia')).toEqual([{ muscle: 'Iliopsoas', count: 1 }]);
    expect(topFlaggedMuscles(flags, 'tension')).toEqual([{ muscle: 'Iliopsoas', count: 1 }]);
  });

  it('ranks by count, breaking ties by NAME so the order is stable', () => {
    // Without a tie-break two muscles on the same count can swap between
    // requests, which reads as the squad changing when nothing has — and a
    // silent re-ordering of a "top muscle" headline is exactly the defect this
    // util was extracted to fix.
    const flags = [
      flag('a1', 'tension', 'Zygomaticus'), flag('a2', 'tension', 'Zygomaticus'),
      flag('a3', 'tension', 'Abductor'), flag('a4', 'tension', 'Abductor'),
      flag('a5', 'tension', 'Iliopsoas'), flag('a6', 'tension', 'Iliopsoas'),
      flag('a7', 'tension', 'Iliopsoas'),
    ];
    expect(topFlaggedMuscles(flags, 'tension').map((m) => m.muscle))
      .toEqual(['Iliopsoas', 'Abductor', 'Zygomaticus']);
  });

  it('honours the limit', () => {
    const flags = ['A', 'B', 'C', 'D'].map((m, i) => flag(`a${i}`, 'tension', m));
    expect(topFlaggedMuscles(flags, 'tension', 2)).toHaveLength(2);
  });

  it('counts a row with no athleteId once, rather than collapsing them', () => {
    // Callers that have already narrowed to one athlete have nothing to
    // de-duplicate. Keying those rows on a shared constant would report three
    // flags as one.
    const flags = [
      { flagType: 'tension', muscle: 'Iliopsoas' },
      { flagType: 'tension', muscle: 'Iliopsoas' },
    ];
    expect(topFlaggedMuscles(flags, 'tension')).toEqual([{ muscle: 'Iliopsoas', count: 2 }]);
  });

  it('survives rubbish without throwing', () => {
    // It runs on database rows inside a response path; a malformed row must not
    // take the endpoint down.
    expect(topFlaggedMuscles(null, 'tension')).toEqual([]);
    expect(topFlaggedMuscles([null, undefined, {}, { flagType: 'tension' }], 'tension')).toEqual([]);
  });
});
