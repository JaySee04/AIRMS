// The Training Prescription parser (utils/prescription.js).
//
// Guards a silent failure of the worst kind here: this output is an exercise
// programme an athlete may actually follow. A row parsed loosely — the right
// name against the wrong sets, or an exercise attributed to the wrong day —
// produces something that looks complete and is wrong, and nothing downstream
// can tell. So the parser is strict, and these tests pin the strictness rather
// than merely proving it can read a good report.
//
// The fixtures are lifted verbatim from the text layer of a real HoloMotion
// report (Nazwan's 38-page expanded layout), including its spacing quirks and
// its "-2" variant suffixes, so they fail if the printed format assumptions
// stop holding.

const { parsePrescription, prescriptionSize } = require('../src/utils/prescription');

const REAL = 'Training Prescription (Discretion is advised for your training, which may last for two weeks) '
  + 'Day 1 Training Recommendation No. Exercises Reps Sets Rest Interval '
  + '1 Knee Joint Warm-up 10x 1 30 '
  + '2 Lateral Position Leg Back Kick (L) 10x 1 30 '
  + '3 Half Squat 10x 3 30 '
  + '4 Static Hip Bridge 20s 3 30 '
  + 'Day 3 Training Recommendation No. Exercises Reps Sets Rest Interval '
  + '1 Supine Shoulder Flexion And Extension 15x 1 30 '
  + '7 Latissimus Dorsi Stretch (L) -2 30s 1 10 ';

describe('reading a real report', () => {
  const p = parsePrescription(REAL);

  it('keeps HoloMotion’s own caveat verbatim', () => {
    expect(p.note).toBe('Discretion is advised for your training, which may last for two weeks');
  });

  it('groups exercises under the day they were printed under', () => {
    expect(p.days.map((d) => d.day)).toEqual([1, 3]);
    expect(p.days[0].exercises).toHaveLength(4);
    expect(p.days[1].exercises).toHaveLength(2);
  });

  it('reads a row exactly, units included', () => {
    expect(p.days[0].exercises[0]).toEqual({
      no: 1, name: 'Knee Joint Warm-up', reps: '10x', sets: 1, rest: 30,
    });
  });

  it('keeps reps as printed, so a held stretch is not rendered as repetitions', () => {
    const bridge = p.days[0].exercises.find((e) => e.name === 'Static Hip Bridge');
    expect(bridge.reps).toBe('20s');
  });

  it('survives names with side markers and the report’s "-2" variant suffix', () => {
    expect(p.days[0].exercises[1].name).toBe('Lateral Position Leg Back Kick (L)');
    expect(p.days[1].exercises[1].name).toBe('Latissimus Dorsi Stretch (L) -2');
  });

  it('never reads the column headings as an exercise', () => {
    const names = p.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(names.some((n) => /Rest Interval|Exercises/i.test(n))).toBe(false);
  });

  it('counts the whole programme', () => {
    expect(prescriptionSize(p)).toBe(6);
  });
});

describe('reports that carry no programme', () => {
  it('returns null when the section is absent — the compact layout has none', () => {
    // Distinct from "present but unreadable": null means do not show the panel
    // at all, where an empty object would invite one saying "no exercises".
    expect(parsePrescription('Report of Physical Quality and Exercise Risks Information Name : X')).toBeNull();
    expect(parsePrescription('')).toBeNull();
    expect(parsePrescription(null)).toBeNull();
  });

  it('returns the heading with no days when the section is there but empty', () => {
    const p = parsePrescription('Training Prescription (two weeks)');
    expect(p).not.toBeNull();
    expect(p.days).toEqual([]);
  });
});

describe('strictness — a partial row is dropped, not guessed', () => {
  it('ignores a row missing its sets and rest', () => {
    const p = parsePrescription(
      'Training Prescription Day 1 Training Recommendation 1 Half Squat 10x 3 30 2 Broken Row 10x',
    );
    expect(p.days[0].exercises.map((e) => e.name)).toEqual(['Half Squat']);
  });

  it('does not let one day’s exercises leak into the next', () => {
    const p = parsePrescription(
      'Training Prescription '
      + 'Day 1 Training Recommendation 1 Alpha 10x 1 30 '
      + 'Day 2 Training Recommendation 1 Beta 10x 1 30',
    );
    expect(p.days[0].exercises.map((e) => e.name)).toEqual(['Alpha']);
    expect(p.days[1].exercises.map((e) => e.name)).toEqual(['Beta']);
  });
});

// A name that wrapped across a page boundary. Lifted verbatim from the text
// layer of Nazwan's report, where Day 2 straddles pages 35 and 36 — the one
// wrap in 48 rows, and the reason this block exists. HoloMotion emits the
// numeric cells BEFORE the wrapped tail of the name, so the row parses cleanly
// with a name that is short by three words and reads as though it were whole.
describe('a name wrapped across a page break', () => {
  const WRAPPED = 'Training Prescription Day 2 Training Recommendation '
    + 'No. Exercises Reps Sets Rest Interval '
    + '6 Close Stance Kneeling Push-Up 10x 3 30 '
    + '7 Middle Trapezius Bundle And Rhomboid Muscle 30s 1 10 Stretch (R) -2 '
    + '8 Seated Calf Stretch 30s 1 10';
  const rows = parsePrescription(WRAPPED).days[0].exercises;

  it('reassembles the printed name instead of keeping the short one', () => {
    // "…Rhomboid Muscle" is a different exercise from "…Rhomboid Muscle Stretch
    // (R)", and drops the side it applies to.
    expect(rows[1].name).toBe('Middle Trapezius Bundle And Rhomboid Muscle Stretch (R) -2');
  });

  it('does not read the stranded "-2" as the next row number', () => {
    expect(rows[2]).toEqual({ no: 8, name: 'Seated Calf Stretch', reps: '30s', sets: 1, rest: 10 });
  });

  it('leaves the numbering as printed', () => {
    expect(rows.map((e) => e.no)).toEqual([6, 7, 8]);
  });
});

describe('text after the last row is left alone', () => {
  it('does not append an unbounded trailing fragment to the last name', () => {
    // A fragment between two rows is inside the table body and can only be the
    // preceding cell. One after the LAST row has nothing closing it and could be
    // page furniture, so it is not treated as part of the exercise.
    const p = parsePrescription(
      'Training Prescription Day 1 Training Recommendation 1 Half Squat 10x 3 30 Page 36 of 38',
    );
    expect(p.days[0].exercises[0].name).toBe('Half Squat');
  });
});
