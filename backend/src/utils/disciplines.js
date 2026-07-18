// Normalise an athlete's event ("discipline") list: trim, drop blanks, and
// de-duplicate. Shared by the athletes route (syncDisciplines) and the upload
// commit so both apply exactly the same cleaning before hitting the unique
// (athlete_id, discipline) index. Pure — does no I/O.
function cleanDisciplineList(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((d) => String(d).trim()).filter(Boolean))];
}

module.exports = { cleanDisciplineList };
