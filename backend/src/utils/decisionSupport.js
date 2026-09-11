// "What should I do next?" — the one question every dashboard existed beside
// rather than answered.
//
// WHY THIS IS ONE MODULE AND NOT FOUR FEATURES.
//
// The four things asked for — name the next action, show what changed, work a
// triage queue, compare athletes — are four *views of one ranking*. Built
// separately they would each grow their own idea of "worst first", and this
// project has already paid for that: the band vocabulary ended up defined four
// ways, and `SMALL_COHORT` five. So the ranking lives here once, and every
// surface reads it.
//
// WHAT IT WILL NOT DO, and these are the load-bearing refusals:
//
//   * It does not predict injury. It ORDERS a worklist. The wording throughout
//     is "see this athlete next", never "this athlete will be injured" — the
//     §33 / Bahr line, applied to a recommendation rather than a badge.
//   * It never invents a reason. Every entry carries the rules that put it
//     there, drawn from the same `factors` the hero shows, so a clinician can
//     disagree with the ordering on the evidence rather than on faith.
//   * Never-screened is ranked, but NEVER as a band. An athlete nobody has
//     assessed is not low risk; they are unknown, and collapsing those is the
//     §33 reassurance failure.
const { effectiveBand, BAND_RANK } = require('./bands');
const { screeningAgeDays, recallState } = require('./recall');

// How the worklist is ordered, worst first. Exported because the test asserts
// on THIS rather than on a hand-written duplicate of it.
//
// Band dominates, because a red athlete who was seen yesterday still outranks
// an amber nobody has seen for a year — the question is "who needs a clinician",
// not "whose record is oldest". Staleness breaks ties, because between two
// equal bands the one whose information is older is the one you know least
// about.
const PRIORITY = {
  red: 0,
  amber: 1,
  never: 2, // unknown, NOT low risk — deliberately above green
  green: 3,
  none: 4,
};

/**
 * Why one athlete is on the list, in the clinician's words.
 *
 * Reasons come from the screening's own persisted `factors` where they exist —
 * the same two-sided evidence the hero prints — so the worklist cannot disagree
 * with the record it points at.
 */
function reasonsFor({ band, screening, ageDays, recall }) {
  const out = [];
  if (band === 'never') {
    out.push('never screened — no assessment on record');
    return out;
  }
  const factors = Array.isArray(screening && screening.factors) ? screening.factors : [];
  // The rules that fired, verbatim. Capped: a worklist entry that runs to six
  // lines stops being scannable, and the full list is one click away.
  for (const f of factors.slice(0, 3)) {
    if (typeof f === 'string' && f.trim()) out.push(f.trim());
  }
  if (screening && screening.overrideBand) {
    out.push(`clinician override in force (${screening.overrideBand})`);
  }
  if (recall === 'overdue') out.push(`screening is ${ageDays} days old — overdue for rescreen`);
  else if (recall === 'due-soon') out.push(`screening is ${ageDays} days old — rescreen due soon`);
  if (!out.length) out.push('flagged by the cohort comparison');
  return out;
}

/**
 * Rank a roster into a worklist.
 *
 * `rows` are athletes each carrying `{ athleteId, name, sport, isInjured }` and
 * an optional `screening` (the indicator payload). `dueDays` is the
 * institution's rescreen interval.
 */
function rankRoster(rows, { dueDays = null, now = Date.now() } = {}) {
  return (rows || [])
    .map((r) => {
      const screening = r.screening || null;
      const band = screening ? (effectiveBand(screening) || 'none') : 'never';
      const ageDays = screening ? screeningAgeDays(screening.assessedAt, now) : null;
      const recall = (dueDays !== null && ageDays !== null) ? recallState(ageDays, dueDays) : null;
      return {
        athleteId: r.athleteId,
        name: r.name ?? null,
        sport: r.sport ?? null,
        isInjured: Boolean(r.isInjured),
        band,
        ageDays,
        recall,
        priority: PRIORITY[band] ?? PRIORITY.none,
        reasons: reasonsFor({ band, screening, ageDays, recall }),
      };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Older information first within a band — see the note on PRIORITY.
      const aAge = a.ageDays === null ? Number.MAX_SAFE_INTEGER : a.ageDays;
      const bAge = b.ageDays === null ? Number.MAX_SAFE_INTEGER : b.ageDays;
      if (aAge !== bAge) return bAge - aAge;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

// How far back a caller may reach, however stale their stored marker is.
const MAX_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Resolve the "what changed" cutoff, and say WHICH rule produced it.
 *
 * The basis is returned rather than inferred by the caller, because the panel
 * prints a different sentence for each ("moved since you last looked" vs "moved
 * in the last 7 days") and a page that guessed would eventually claim the
 * marker was honoured on a request where it was not — a clinician reading
 * "since you last looked" over a fixed window is being told something false
 * about what they are and are not seeing.
 *
 * Three outcomes:
 *   'since'   — the caller's marker was used as given
 *   'clamped' — the marker was older than MAX_LOOKBACK_MS and was pulled forward
 *   'window'  — no usable marker; the rolling window applied
 */
function resolveCutoff({ windowDays = 7, since = null, now = Date.now() } = {}) {
  const asked = since === null || since === undefined ? NaN : new Date(since).getTime();
  // Unusable markers fall back to the window rather than throwing or being
  // taken at face value, because a corrupt browser store must not be able to
  // EMPTY a clinical panel. Two kinds are unusable:
  //
  //   * unparseable — cleared storage, a half-written value, a hand edit;
  //   * in the FUTURE — a machine with a wrong clock, which is common enough on
  //     shared terminals. Trusting it would set the cutoff ahead of every real
  //     screening, so the panel would report "nothing moved" while an athlete
  //     went red today. That is the silent-failure shape exactly: a confident
  //     empty list that looks like good news.
  //
  // Both resolve toward showing MORE than necessary. That direction is chosen:
  // a noisy panel is a nuisance, a quiet one is a missed athlete.
  if (!Number.isFinite(asked) || asked > now) {
    return { cutoff: now - windowDays * 24 * 60 * 60 * 1000, basis: 'window' };
  }
  const floor = now - MAX_LOOKBACK_MS;
  if (asked < floor) return { cutoff: floor, basis: 'clamped' };
  return { cutoff: asked, basis: 'since' };
}

/**
 * What moved — since the caller last looked, or over a rolling window.
 *
 * THE PROBLEM THIS SOLVES, and the first version did not.
 *
 * "Since you last looked" needs somebody to remember when that was, and
 * remembering it server-side is a WRITE. `coach` is read-only by a LOCKED
 * decision (MASTER_CLARIFICATIONS §12) — the watchlist hit exactly this wall,
 * `npm run audit:access` failed with "a read-only role completed a write", and
 * the lock was kept in preference to the feature.
 *
 * So the first version shipped a fixed window for everybody, and said so
 * honestly: a per-user marker would have worked for medical and admin and been
 * silently absent for coach, giving the role that most needs a squad summary
 * the worst version of it.
 *
 * The resolution is that the marker does not have to live on the server at all.
 * **The caller remembers it** — the browser holds the timestamp per user and
 * sends it — and the server only filters by it. No write anywhere, so every
 * role gets a genuine "since you last looked", including the read-only one the
 * compromise was penalising.
 *
 * The trade is honest and stated in the manual: it is per-DEVICE, and clearing
 * browser storage forgets it. The window remains the fallback, so the panel
 * degrades to its old behaviour rather than to nothing.
 */
function changesSince(pairs, { windowDays = 7, since = null, now = Date.now() } = {}) {
  // `since` is the caller's OWN "I last looked at this" moment, and it wins over
  // the window when supplied. Accepting a timestamp from the client discloses
  // nothing: it only NARROWS a set the caller can already request in full with
  // `windowDays`, and the scope is still derived from their session.
  const { cutoff } = resolveCutoff({ windowDays, since, now });
  const moved = [];
  for (const { athleteId, name, previous, latest } of pairs || []) {
    if (!latest || !latest.assessedAt) continue;
    if (new Date(latest.assessedAt).getTime() < cutoff) continue;
    const to = effectiveBand(latest) || 'none';
    const from = previous ? (effectiveBand(previous) || 'none') : null;
    if (from === to) continue;
    moved.push({
      athleteId,
      name: name ?? null,
      from,
      to,
      // Worse is what a clinician acts on; better is what a programme reports.
      direction: from === null ? 'new'
        : (BAND_RANK[to] > BAND_RANK[from] ? 'worse' : 'better'),
      at: latest.assessedAt,
    });
  }
  // Worsening first, then newest.
  const order = { worse: 0, new: 1, better: 2 };
  return moved.sort((a, b) => (order[a.direction] - order[b.direction])
    || (new Date(b.at) - new Date(a.at)));
}

/**
 * One sentence naming the decision, for the top of a dashboard.
 *
 * Returns null when there is nothing to act on — deliberately, so the panel
 * disappears rather than printing "0 athletes need attention", which reads as
 * reassurance and is the §33 failure in a different costume.
 */
function headline(worklist, role) {
  const actionable = (worklist || []).filter((w) => w.priority <= PRIORITY.never);
  if (!actionable.length) return null;
  const red = actionable.filter((w) => w.band === 'red').length;
  const amber = actionable.filter((w) => w.band === 'amber').length;
  const never = actionable.filter((w) => w.band === 'never').length;

  const bits = [];
  if (red) bits.push(`${red} needing immediate assessment`);
  if (amber) bits.push(`${amber} needing attention`);
  if (never) bits.push(`${never} never screened`);

  const verb = role === 'coach' ? 'Review before selecting' : 'See next';
  return { verb, count: actionable.length, parts: bits };
}

module.exports = {
  PRIORITY, MAX_LOOKBACK_MS, rankRoster, resolveCutoff, changesSince, headline, reasonsFor,
};
