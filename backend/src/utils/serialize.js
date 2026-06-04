// Frontend-compatibility shim for the SQL backend.
//
// The Next.js client was written against Mongoose responses, which expose
// documents with a string `_id` field. Sequelize returns rows with a numeric
// `id`. To avoid touching the frontend at all, every route response goes
// through one of these helpers, which:
//   - aliases id → _id (stringified, so React keys behave the same)
//   - keeps id available too (some places use both)
//   - re-assembles Athlete's nested `risks` object and splits muscle_flags
//     back into the myodynamia[] / tension[] arrays the frontend expects.
//
// When the migration is complete and Mongo is retired, the frontend can be
// gradually moved off `_id` and this layer deleted — but until then it's
// what keeps the SQL backend a drop-in replacement.

function plainOf(instance) {
  if (instance == null) return instance;
  return typeof instance.get === 'function' ? instance.get({ plain: true }) : instance;
}

function withMongoId(obj) {
  if (obj == null) return obj;
  if (obj.id !== undefined && obj._id === undefined) {
    obj._id = String(obj.id);
  }
  return obj;
}

function serializeGeneric(instance) {
  return withMongoId(plainOf(instance));
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
    _id: rest.athleteId, // Mongo used ObjectId here; athleteId is the cross-table key
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
