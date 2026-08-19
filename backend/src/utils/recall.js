// Is what we hold on this athlete still current?
//
// WHY THIS IS ITS OWN MODULE
// The classification lived inline inside `rescreenRecall`, which is a DB-backed
// aggregate over the whole roster. The dashboards need the same answer for ONE
// athlete, at the point where a clinician is actually deciding something — and
// the one thing that must not happen is the hero calling an athlete current while
// the monthly recall email calls them overdue. That is the same argument the
// reminder itself is built on: it reports against `rescreen_due_days` and
// nothing else, because a second threshold is how the email and the dashboard
// come to disagree.
//
// So the rule lives here, pure and DB-free, and both callers read it.
//
// WHY THE DASHBOARDS NEED IT AT ALL
// The band is rendered in the present tense. Before this, the assessment date
// appeared only inside the screening-date dropdown, so an athlete last screened
// eight months ago presented exactly like one screened last week — while the
// system already knew the difference and was emailing it monthly to
// administrators. See docs/DESIGN_DECISIONS.md §33.

/** Whole days between a screening date and now. Null if unparseable. */
function screeningAgeDays(assessedAt, now = Date.now()) {
  if (!assessedAt) return null;
  const t = new Date(assessedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

// "Due soon" is the last fifth of the interval — enough warning to schedule,
// short enough that it is not permanently amber. Identical to the share
// `rescreenRecall` applies, because it is now the same code.
const DUE_SOON_SHARE = 0.8;

/**
 * current | due-soon | overdue | never
 * `never` is deliberately its own state rather than an extreme of overdue: it
 * calls for a first assessment, not a call-back.
 */
function recallState(ageDays, dueDays) {
  if (ageDays === null || ageDays === undefined) return 'never';
  const due = Number(dueDays);
  if (!Number.isFinite(due) || due <= 0) return 'current';
  // `>=`, not `>`: this matches the boundary `rescreenRecall` already applied, so
  // extracting the rule could not shift a single athlete between states.
  if (ageDays >= due) return 'overdue';
  if (ageDays >= due * DUE_SOON_SHARE) return 'due-soon';
  return 'current';
}

/** Wording for the state, so the dashboards and the reports read alike. */
const RECALL_LABEL = {
  current: 'Screening current',
  'due-soon': 'Rescreen due soon',
  overdue: 'Rescreen overdue',
  never: 'Never screened',
};

module.exports = {
  screeningAgeDays, recallState, RECALL_LABEL, DUE_SOON_SHARE,
};
