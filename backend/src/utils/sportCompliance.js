// Screening compliance, sport by sport (§104).
//
// WHAT THIS MEASURES, AND WHAT IT DOES NOT — and the distinction is the whole
// reason the panel is named the way it is.
//
// It measures whether SCREENINGS HAPPENED: how much of each squad has ever been
// tested, how much of it is still current, and how many athletes have come back
// for a repeat. Those are facts about the programme.
//
// It does NOT measure how cooperative a squad's athletes are, and must never be
// labelled as though it does. A screening happens only when several things line
// up — ISN schedules the session, the coach releases the athlete from training,
// the athlete attends, and the report is imported. A sport that was simply never
// booked produces exactly the same numbers as one whose athletes refuse to turn
// up. Nothing in this dataset separates them.
//
// That matters more than the usual caveat because of who reads it. A panel
// headed "least cooperative squads" hands a coach a number that looks like an
// indictment of their athletes and is, at least as often, a record of the
// institution's own scheduling. The caveat is therefore carried in the payload
// rather than left to the page, so every surface that draws this — screen or
// PDF — has to render it.
//
// RANKED BY THE SHARE THAT IS CURRENT, not by the count. Badminton has 16
// athletes and Swimming 7; ranking on headcount would sort by squad size and
// call it compliance. Same rule as seasonality (§71), which ranks by share for
// the identical reason.

const { median } = require('./num');

/** Squads smaller than this caveat themselves — a percentage of 3 is noise. */
const MIN_SQUAD = 5;

/**
 * Compliance per sport.
 *
 * @param {Array} recallAthletes rows from rescreenRecall: { sport, status, ageDays, athleteId }
 * @param {Map<string, number>} screeningCounts athleteId -> how many screenings they have
 */
function sportCompliance(recallAthletes = [], screeningCounts = new Map()) {
  const bySport = new Map();

  for (const a of recallAthletes) {
    if (!a) continue;
    // An athlete with no sport recorded is counted in NO squad rather than in a
    // bucket called "Unknown". A made-up squad would appear in the ranking
    // beside real ones and be compared against them.
    const sport = a.sport;
    if (!sport) continue;

    if (!bySport.has(sport)) {
      bySport.set(sport, {
        sport, rostered: 0, current: 0, dueSoon: 0, overdue: 0, never: 0, repeat: 0, ages: [],
      });
    }
    const s = bySport.get(sport);
    s.rostered += 1;
    if (a.status === 'never') s.never += 1;
    else if (a.status === 'overdue') s.overdue += 1;
    else if (a.status === 'due-soon') s.dueSoon += 1;
    else s.current += 1;
    if (typeof a.ageDays === 'number' && Number.isFinite(a.ageDays)) s.ages.push(a.ageDays);
    // "Came back at least once" — the closest thing here to sustained
    // engagement, and still a programme fact rather than an athlete one.
    if ((screeningCounts.get(a.athleteId) || 0) >= 2) s.repeat += 1;
  }

  const sports = [...bySport.values()].map((s) => {
    const screened = s.rostered - s.never;
    return {
      sport: s.sport,
      rostered: s.rostered,
      screened,
      current: s.current,
      dueSoon: s.dueSoon,
      overdue: s.overdue,
      never: s.never,
      repeat: s.repeat,
      // Shares, because squads differ in size by more than 2x.
      //
      // null rather than 0 on an empty squad: a sport with nobody on the roster
      // has no compliance rate, and 0% would rank it worst (§71's rule).
      coverage: s.rostered ? screened / s.rostered : null,
      currentShare: s.rostered ? s.current / s.rostered : null,
      // Of those EVER screened — asking what share of an unscreened squad came
      // back twice is a question with no meaning.
      repeatShare: screened ? s.repeat / screened : null,
      medianAgeDays: s.ages.length ? Math.round(median(s.ages)) : null,
      // Below MIN_SQUAD a percentage swings ~20 points per athlete, so the row
      // says so rather than being silently dropped — a squad omitted from a
      // comparison is a squad nobody asks about.
      small: s.rostered < MIN_SQUAD,
    };
  });

  // Worst first: the point of the table is which squad needs chasing. Ties break
  // on squad size so the order is stable between requests rather than shifting
  // with whatever order the roster came back in.
  sports.sort((a, b) => {
    const av = a.currentShare ?? -1;
    const bv = b.currentShare ?? -1;
    if (av !== bv) return av - bv;
    return b.rostered - a.rostered;
  });

  return {
    sports,
    minSquad: MIN_SQUAD,
    // Carried in the PAYLOAD, not left to the page. Every surface that draws
    // this has to render the limit with it — see the note at the top of this
    // file for why this one is not optional.
    caveat: 'Measures whether screenings happened, which depends on scheduling, '
      + 'squad release and attendance together. It cannot separate them, and a squad '
      + 'that was never booked looks the same as one that did not attend.',
  };
}

module.exports = { sportCompliance, MIN_SQUAD };
