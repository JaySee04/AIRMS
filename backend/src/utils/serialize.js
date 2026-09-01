// API response shaper for Athlete rows. Both helpers here:
//   - expose the athleteId as a stringified `_id` field too, so the frontend
//     has a stable string identifier to use as a React key
//   - reassemble Athlete's flat risk-indicator columns into a nested
//     `risks` object, and split muscle_flags rows by flag_type into
//     myodynamia[] / tension[] arrays for the frontend to consume
//   - strip the clinician's injury note unless the viewer may read it
//
// The `_id` field name is the only piece of legacy nomenclature on the wire;
// it has no engine semantics — it is just a string version of the row id.
//
// It previously also exported serializeGeneric / serializeMany / withStringId
// under a header claiming "every route emits its rows through one of these
// helpers". No route did: all three had zero callers anywhere, including the
// tests. A comment asserting a convention nothing follows is worse than no
// comment, because the next person extends the dead branch.

const { CLINICIAN_NOTE_FIELDS, readsClinicianNotes } = require('./permissions');

// Strip the clinician's injury note, its author and its timestamp unless the
// caller may read them. Applied to the athlete serialisers because both build
// their result by SPREADING the row, which grants every column by omission —
// the note, injuryBy and injuryAt were going to coach and executive payloads on
// that basis. `isInjured` deliberately stays: it is a roster fact, not a note.
//
// `viewer` is required in practice and optional in the signature, and the
// omitted case withholds. A call site that forgets to say who is asking should
// under-disclose, not over-disclose.
function withoutClinicianNotes(obj, viewer) {
  if (!obj || readsClinicianNotes(viewer)) return obj;
  for (const key of CLINICIAN_NOTE_FIELDS) delete obj[key];
  return obj;
}

function plainOf(instance) {
  if (instance == null) return instance;
  return typeof instance.get === 'function' ? instance.get({ plain: true }) : instance;
}

function serializeAthlete(instance, viewer) {
  const plain = plainOf(instance);
  if (!plain) return plain;

  const muscleFlags = plain.muscleFlags || [];
  const myodynamia = muscleFlags
    .filter((m) => m.flagType === 'myodynamia')
    .map(({ muscle, side }) => ({ muscle, side }));
  const tension = muscleFlags
    .filter((m) => m.flagType === 'tension')
    .map(({ muscle, side }) => ({ muscle, side }));

  const {
    neckInjuryRisk = 0,
    shoulderInjuryRisk = 0,
    scoliosis = 0,
    spinalDiscHerniation = 0,
    lumbarPelvisInjury = 0,
    jointPain = 0,
    kneeInjuryRisk = 0,
    ankleInjuryRisk = 0,
    muscleFlags: _drop,
    disciplines: disciplineRows,
    ...rest
  } = plain;

  return withoutClinicianNotes({
    ...rest,
    _id: rest.athleteId, // athleteId is the cross-table identifier
    risks: {
      neckInjuryRisk: Number(neckInjuryRisk) || 0,
      shoulderInjuryRisk: Number(shoulderInjuryRisk) || 0,
      scoliosis: Number(scoliosis) || 0,
      spinalDiscHerniation: Number(spinalDiscHerniation) || 0,
      lumbarPelvisInjury: Number(lumbarPelvisInjury) || 0,
      jointPain: Number(jointPain) || 0,
      kneeInjuryRisk: Number(kneeInjuryRisk) || 0,
      ankleInjuryRisk: Number(ankleInjuryRisk) || 0,
    },
    myodynamia,
    tension,
    // Only surface disciplines when the association was actually loaded — an
    // omitted field means "not fetched", an empty array means "no events".
    ...(Array.isArray(disciplineRows) ? { disciplines: disciplineRows.map((d) => d.discipline) } : {}),
  }, viewer);
}

function serializeAthleteList(rows, viewer) {
  // List view omits the heavy muscle arrays anyway, so just collapse risks.
  return rows.map((r) => {
    const plain = plainOf(r);
    const {
      neckInjuryRisk = 0, shoulderInjuryRisk = 0, scoliosis = 0,
      spinalDiscHerniation = 0, lumbarPelvisInjury = 0, jointPain = 0,
      kneeInjuryRisk = 0, ankleInjuryRisk = 0, muscleFlags: _drop,
      disciplines: disciplineRows, ...rest
    } = plain;
    return withoutClinicianNotes({
      ...rest,
      _id: rest.athleteId,
      risks: {
        neckInjuryRisk: Number(neckInjuryRisk) || 0,
        shoulderInjuryRisk: Number(shoulderInjuryRisk) || 0,
        scoliosis: Number(scoliosis) || 0,
        spinalDiscHerniation: Number(spinalDiscHerniation) || 0,
        lumbarPelvisInjury: Number(lumbarPelvisInjury) || 0,
        jointPain: Number(jointPain) || 0,
        kneeInjuryRisk: Number(kneeInjuryRisk) || 0,
        ankleInjuryRisk: Number(ankleInjuryRisk) || 0,
      },
      ...(Array.isArray(disciplineRows) ? { disciplines: disciplineRows.map((d) => d.discipline) } : {}),
    }, viewer);
  });
}

module.exports = {
  serializeAthlete,
  serializeAthleteList,
};
