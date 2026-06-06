// API response shaper. Every route emits its rows through one of these
// helpers, which:
//   - expose Sequelize's numeric `id` as a stringified `_id` field too,
//     so the frontend has a stable string identifier to use as a React key
//   - reassemble Athlete's flat risk-indicator columns into a nested
//     `risks` object, and split muscle_flags rows by flag_type into
//     myodynamia[] / tension[] arrays for the frontend to consume.
//
// The `_id` field name is the only piece of legacy nomenclature on the wire;
// it has no engine semantics — it is just a string version of the row id.

function plainOf(instance) {
  if (instance == null) return instance;
  return typeof instance.get === 'function' ? instance.get({ plain: true }) : instance;
}

function withStringId(obj) {
  if (obj == null) return obj;
  if (obj.id !== undefined && obj._id === undefined) {
    obj._id = String(obj.id);
  }
  return obj;
}

function serializeGeneric(instance) {
  return withStringId(plainOf(instance));
}

function serializeMany(rows) {
  return rows.map(serializeGeneric);
}

function serializeAthlete(instance) {
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
    ...rest
  } = plain;

  return {
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
  };
}

function serializeAthleteList(rows) {
  // List view omits the heavy muscle arrays anyway, so just collapse risks.
  return rows.map((r) => {
    const plain = plainOf(r);
    const {
      neckInjuryRisk = 0, shoulderInjuryRisk = 0, scoliosis = 0,
      spinalDiscHerniation = 0, lumbarPelvisInjury = 0, jointPain = 0,
      kneeInjuryRisk = 0, ankleInjuryRisk = 0, muscleFlags: _drop, ...rest
    } = plain;
    return {
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
    };
  });
}

module.exports = {
  serializeGeneric,
  serializeMany,
  serializeAthlete,
  serializeAthleteList,
};
