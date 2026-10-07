'use client';

// Medical · Sport Assessment — one sport, read clinically (§123, 2026-10-05).
//
// THE QUESTION THIS ANSWERS. Until now a clinician could read one athlete at a
// time (the medical dashboard) or download a whole squad as a PDF (the team
// report). What they could not do on screen was ask "what is actually wrong with
// this sport?" — which body parts keep coming up, how much of the squad is
// elevated, which of the tracked indicators fire most often, and who to see
// first. That is a real clinical question and the data for it was already being
// computed; nothing rendered it for this role.
//
// IT READS THE SAME ENDPOINT THE ADMIN ANALYTICS PAGE DOES, with `?sport=`.
// That is the design and not an economy. A second sport-scoped aggregator would
// be a second set of numbers for the same squad, and then this screen, the
// admin's analytics and the team PDF could disagree about how many Badminton
// athletes are elevated with nothing to say which was right. One definition,
// three readers (DD §123, SILENT_FAILURES "rules" 8).
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   - no norm editing and no import: this role no longer reaches either, and
//     the page is a reading surface;
//   - no verdict about the SPORT. It reports what the squad's screenings say.
//     "Badminton has a hip problem" is a clinician's conclusion to draw, and the
//     copy is careful to present counts and means rather than a diagnosis — the
//     same line the worklist holds ("the rules that fired, not a diagnosis");
//   - no averaging of what must not be averaged. Every mean panel carries the
//     caveat that a mean of 50 is produced equally by everyone at 50 and by half
//     at 30 and half at 70 (§23's flattening mistake), and the band mix is shown
//     as counts so the shape survives.
import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CardHead from '@/components/layout/CardHead';
import InfoTip from '@/components/ui/InfoTip';
import { api, isAuthError } from '@/lib/api';
import { BANDS, BAND_LABEL, BAND_COLOR, type Band } from '@/lib/bands';
import { SMALL_COHORT } from '@/lib/shared/facts';
import { TIER_COLOR, TIER_INK, TIER_LABEL, tierOf } from '@/lib/holomotionTiers';

type Cell = { key: string; label: string; value: number | null; n: number };
type Region = { key: string; label: string; cells: Cell[] };
type AsymMetric = {
  metric: string; n: number; meanGap: number | null; meanGapPct: number | null;
  meanSigned: number | null; weakerSide: 'left' | 'right' | null; notable: number;
  meanLeft: number | null; meanRight: number | null;
};
type AsymRegion = { key: string; label: string; metrics: AsymMetric[] };
type Indicator = { key: string; label: string; ok: number; watch: number; high: number };
type Point = {
  athleteId: string; name: string; sport: string | null;
  totalScore: number | null; exerciseRisks: number | null;
  indicator: number | null; band: Band | null; programme: string | null;
};
type Analytics = {
  totalAthletes: number;
  screened: number;
  unscreened: number;
  indicators: Indicator[];
  topMyodynamia: Array<{ muscle: string; count: number }>;
  topTension: Array<{ muscle: string; count: number }>;
  bandDistribution: Partial<Record<Band | 'none', number>>;
  subitems: {
    n: number; matrix: Region[]; asymmetry: AsymRegion[];
    worstCell: (Cell & { region: string }) | null;
    worstAsymmetry: (AsymMetric & { region: string }) | null;
    notableGapPct: number;
  } | null;
  points: Point[];
};

const METRIC_LABEL: Record<string, string> = { rom: 'Range of motion', stab: 'Stability' };

export default function SportAssessmentPage() {
  const [sports, setSports] = useState<string[]>([]);
  const [sport, setSport] = useState('');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The sport list comes from the ROSTER rather than a constant: a sport an
  // administrator adds by importing a report has to appear here without a code
  // change, and offering a sport with nobody in it would be a dead option.
  // THE SPORT LIST COMES FROM ITS OWN ENDPOINT (§139).
  //
  // This fetched `/athletes?limit=500` — the entire roster — and reduced it to a
  // set of distinct sport names. `/athletes/meta/sports` already existed for
  // exactly this ("distinct sports, for filter dropdowns") with the same rbac.
  //
  // MEASURED on the seeded database: 45,261 bytes against 56, and 19.9ms against
  // 5.1ms locally — a gap that widens on a serverless instance with a cold start.
  //
  // IT IS NOT ONLY SIZE. The two calls are SERIAL by construction: the analytics
  // request below cannot start until this one returns and sets `sport`. So the
  // roster download sat on the critical path of a page that never used it, and
  // the effect was visible — `verify:contrast` twice reported this page as "did
  // not render" under concurrent load, which is a could-not-measure rather than a
  // finding, and twice would have been waved through as flakiness.
  //
  // And the payload it no longer pulls is every athlete's IC number, band and
  // injury flag — fetched to extract five strings.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const rows = await api.get<string[]>('/athletes/meta/sports');
        if (!live) return;
        const uniq = (Array.isArray(rows) ? rows : []).filter((s): s is string => !!s).sort();
        setSports(uniq);
        setSport((cur) => cur || uniq[0] || '');
      } catch (e) {
        if (!live) return;
        setError(isAuthError(e) ? 'You are not permitted to read the roster.' : 'Could not load the sport list.');
        setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const j = await api.get<Analytics>(`/athletes/analytics/screening?sport=${encodeURIComponent(s)}`);
      setData(j);
    } catch (e) {
      setError(isAuthError(e)
        ? 'You are not permitted to read this.'
        : 'Could not load the assessment for this sport.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (sport) load(sport); }, [sport, load]);

  const bandCounts = data?.bandDistribution ?? {};
  const screened = data?.screened ?? 0;

  // WORST FIRST, and the ordering is the clinical one: band before score.
  //
  // Sorting on a number alone would put a red athlete with a middling indicator
  // below an amber one with a poor indicator, which inverts the only question
  // this list exists to answer. Band is the verdict; the indicator breaks ties
  // within a band.
  const shortlist = useMemo(() => {
    const rank: Record<string, number> = { red: 0, amber: 1, green: 2 };
    return [...(data?.points ?? [])]
      .filter((p) => p.band === 'red' || p.band === 'amber')
      .sort((a, b) => {
        const d = (rank[a.band ?? ''] ?? 9) - (rank[b.band ?? ''] ?? 9);
        if (d !== 0) return d;
        return (a.indicator ?? 999) - (b.indicator ?? 999);
      });
  }, [data]);

  // Indicators that are actually firing, worst first. An indicator with nobody
  // above the watch line is not a finding and is left out rather than printed
  // as a row of zeros — the page is about what is wrong with this sport.
  const firing = useMemo(() => [...(data?.indicators ?? [])]
    .filter((i) => i.high > 0 || i.watch > 0)
    .sort((a, b) => (b.high - a.high) || (b.watch - a.watch)), [data]);

  const small = screened > 0 && screened < SMALL_COHORT;

  return (
    <DashboardLayout allowedRoles={['medical']} requiredPermission="viewRecords" title="Sport Assessment">
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-md)', alignItems: 'flex-end' }}>
        <div>
          <label htmlFor="sport-pick" className="sport-field-label">Sport</label>
          <select
            id="sport-pick"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            disabled={!sports.length}
          >
            {sports.length === 0 && <option value="">No sports on the roster</option>}
            {sports.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        {data && (
          <p className="text-muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
            {screened} of {data.totalAthletes} athlete{data.totalAthletes === 1 ? '' : 's'} in {sport}
            {' '}have a screening on record
            {data.unscreened > 0 && <> · <strong>{data.unscreened} never screened</strong></>}
          </p>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="text-muted">Loading {sport}…</p>}

      {!loading && data && screened === 0 && (
        // Nothing to assess is a legitimate answer and is said plainly, rather
        // than drawing five empty panels that look like a squad with no problems.
        <div className="card">
          <h2 className="card-title">Nothing screened yet in {sport}</h2>
          <p className="text-muted" style={{ marginBottom: 0 }}>
            {data.totalAthletes === 0
              ? 'No athletes are on the roster for this sport.'
              : `All ${data.totalAthletes} athlete${data.totalAthletes === 1 ? '' : 's'} in this sport are awaiting a first assessment. `
                + 'There is nothing to read until a report is imported.'}
          </p>
        </div>
      )}

      {!loading && data && screened > 0 && (
        <>
          {small && (
            <div className="alert alert-warning">
              Only {screened} athlete{screened === 1 ? '' : 's'} in {sport} have been screened.
              Every count and mean below rests on that, and one athlete moves the
              picture noticeably.
            </div>
          )}

          {/* ── 1. Level of risk ─────────────────────────────────────────── */}
          <div className="card">
            <CardHead
              title={<>Level of risk across {sport}</>}
              sub={<>Each athlete&rsquo;s latest screening, clinician overrides applied</>}
              info={(
                <InfoTip label="Why counts and not percentages">
                  <p>
                    A squad of 14 drawn as shares reads like a squad of 140: &ldquo;21%
                    elevated&rdquo; sounds like a programme-level finding when it is three
                    people. Counts keep the denominator in view.
                  </p>
                  <p>
                    <strong>Never screened</strong> is counted apart from every band, green
                    included. Folding it into low risk would turn an athlete nobody has assessed
                    into an athlete who came back clean.
                  </p>
                </InfoTip>
              )}
            />
            <div className="sport-bands">
              {BANDS.map((b) => {
                const v = bandCounts[b] ?? 0;
                return (
                  <div key={b} className={`sport-band-tile sport-band-tile--${b}`}>
                    <span className="sport-band-count" style={{ color: BAND_COLOR[b] }}>{v}</span>
                    {/* The WORD, never the colour alone — a reader who cannot
                        distinguish the hues must still get the verdict
                        (WCAG 1.4.1, SILENT_FAILURES 3i). */}
                    <span className="sport-band-label">{BAND_LABEL[b]}</span>
                  </div>
                );
              })}
              {/* NEVER SCREENED IS COUNTED APART from every band, including
                  green. Folding it into "low risk" is the §33 reassurance
                  failure: it calls for a first assessment, not a clean bill. */}
              <div className="sport-band-tile sport-band-tile--neutral">
                <span className="sport-band-count">{data.unscreened}</span>
                <span className="sport-band-label">Never screened</span>
              </div>
            </div>
            {(bandCounts.none ?? 0) > 0 && (
              <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 0 }}>
                {bandCounts.none} screened athlete{(bandCounts.none ?? 0) === 1 ? ' has' : 's have'} no
                band yet — their cohort is too small to score against. They are not low risk; they
                are unscored.
              </p>
            )}
          </div>

          {/* ── 2. Body parts: the instrument's own muscle flags ─────────── */}
          <div className="card">
            <CardHead
              title="Which body parts keep coming up"
              /* The second clause is a CAVEAT and stays: a bar read as severity
                 rather than prevalence is a wrong conclusion, not a missing one. */
              sub={(
                <>
                  HoloMotion&rsquo;s own muscle flags across {screened} screened athlete
                  {screened === 1 ? '' : 's'}, most frequent first — a count is how many
                  athletes carry the flag, <strong>not how severe it is</strong>.
                </>
              )}
              info={(
                <InfoTip label="How these are counted">
                  <p>
                    Counted per athlete across both sides, so a muscle flagged left and right on
                    one athlete counts once per flag the report carries.
                  </p>
                  <p>
                    The side is deliberately not shown here — at squad level &ldquo;how many of my
                    athletes have an iliopsoas problem&rdquo; is one per athlete, not one per side.
                    Open an athlete on the Medical Dashboard to see which side.
                  </p>
                </InfoTip>
              )}
            />
            <div className="sport-flag-cols">
              <div>
                <h3 className="sport-flag-head">Myodynamia deficiency</h3>
                {data.topMyodynamia.length === 0
                  ? <p className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>None flagged in this sport.</p>
                  : (
                    <ul className="sport-flag-list">
                      {data.topMyodynamia.map((m) => (
                        <li key={m.muscle}>
                          <span>{m.muscle}</span>
                          <span className="sport-flag-bar" aria-hidden>
                            <span style={{ width: `${Math.round((m.count / screened) * 100)}%` }} />
                          </span>
                          <span className="sport-flag-count">{m.count} of {screened}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
              <div>
                <h3 className="sport-flag-head">Muscle tension</h3>
                {data.topTension.length === 0
                  ? <p className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>None flagged in this sport.</p>
                  : (
                    <ul className="sport-flag-list">
                      {data.topTension.map((m) => (
                        <li key={m.muscle}>
                          <span>{m.muscle}</span>
                          <span className="sport-flag-bar" aria-hidden>
                            <span style={{ width: `${Math.round((m.count / screened) * 100)}%` }} />
                          </span>
                          <span className="sport-flag-count">{m.count} of {screened}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          </div>

          {/* ── 3. Body parts: the five measured regions ──────────────────── */}
          {data.subitems && data.subitems.n > 0 && (
            <div className="card">
              <CardHead
                title="How each region measures, squad mean"
                sub={(
                  <>
                    The mean of the subitem table across {data.subitems.n} athlete
                    {data.subitems.n === 1 ? '' : 's'} — <strong>a mean is not the squad</strong>.
                  </>
                )}
                info={(
                  <InfoTip label="What a mean hides here">
                    <p>
                      70 is produced equally by everyone sitting at 70 and by half the squad at 55
                      and half at 85. Read this for <em>where to look</em> rather than as a
                      description of anybody in it.
                    </p>
                    <p>
                      Cells are banded on HoloMotion&rsquo;s own 60 / 75 / 85 boundaries, and a
                      region with no reading is dashed rather than tier-coloured — an unknown value
                      stays unknown instead of being drawn at one end of the scale.
                    </p>
                  </InfoTip>
                )}
              />
              <div className="sport-region-grid">
                <div className="sport-region-head">
                  <span>Region</span>
                  {data.subitems.matrix[0]?.cells.map((c) => (<span key={c.key}>{c.label}</span>))}
                </div>
                {data.subitems.matrix.map((r) => (
                  <div key={r.key} className="sport-region-row">
                    <span className="sport-region-name">{r.label}</span>
                    {r.cells.map((c) => {
                      if (c.value === null || !Number.isFinite(c.value)) {
                        return <span key={c.key} className="sport-region-cell sport-region-cell--none">—</span>;
                      }
                      const t = tierOf(c.value);
                      return (
                        <span
                          key={c.key}
                          className="sport-region-cell"
                          style={{ background: TIER_COLOR[t], color: TIER_INK[t] }}
                          title={`${r.label} ${c.label}: ${c.value} (${TIER_LABEL[t]})`}
                        >
                          {c.value}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
              {data.subitems.worstCell && (
                <p style={{ fontSize: 'var(--fs-sm)', marginBottom: 0 }}>
                  Weakest cell: <strong>{data.subitems.worstCell.region} {data.subitems.worstCell.label}</strong>
                  {' '}at {data.subitems.worstCell.value}.
                </p>
              )}
            </div>
          )}

          {/* ── 4. Left vs right ─────────────────────────────────────────── */}
          {data.subitems && data.subitems.asymmetry.length > 0 && (
            <div className="card">
              <CardHead
                title="Left versus right"
                sub={<>Athletes with a gap of at least {data.subitems.notableGapPct}% — a count, not an average</>}
                info={(
                  <InfoTip label="Why a count rather than the mean gap">
                    <p>
                      This is the only bilateral measurement the report carries, so it is the only
                      place a one-sided problem can show up at all.
                    </p>
                    <p>
                      The <strong>mean</strong> gap is flat at 3&ndash;6 points across every region
                      and hides exactly the athletes worth finding; the number past the threshold
                      separates them. A side is only named when the squad tips the same way — a mix
                      of left- and right-dominant athletes is a different finding, not a squad-wide
                      weakness.
                    </p>
                  </InfoTip>
                )}
              />
              {/* .table-wrap, or this four-column table takes the whole PAGE
                  sideways on a phone — measured 546px of content in a 390px
                  viewport before it was added. Wide content scrolls inside its
                  own container; the body never does. */}
              <div className="table-wrap">
              <table className="sport-table">
                <thead>
                  <tr>
                    <th scope="col">Region</th>
                    <th scope="col">Measure</th>
                    <th scope="col">Athletes with a notable gap</th>
                    <th scope="col">Mean gap</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subitems.asymmetry.flatMap((r) => r.metrics.map((m) => (
                    <tr key={`${r.key}-${m.metric}`}>
                      <td>{r.label}</td>
                      <td>{METRIC_LABEL[m.metric] ?? m.metric}</td>
                      <td>
                        <strong>{m.notable}</strong> of {m.n}
                        {m.weakerSide && <> · weaker on the <strong>{m.weakerSide}</strong></>}
                      </td>
                      <td>{m.meanGapPct === null ? '—' : `${m.meanGapPct}%`}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* PAIRED (§134). Both are "who/what is above a line", one by
              indicator and one by athlete, and each is a narrow table that wasted
              two-thirds of a 1440px card. Side by side they answer the same
              question from the two directions a clinician asks it. */}
          <div className="card-row card-row--wide">
          {/* ── 5. Which tracked problems fire ───────────────────────────── */}
          <div className="card">
            <CardHead
              title="Which tracked risks are firing"
              /* "rules that fired, not a diagnosis" is a CAVEAT and stays. */
              sub={<>By how many athletes sit above each line — the rules that fired, <strong>not a diagnosis</strong></>}
              info={(
                <InfoTip label="What is in this table, and what is left out">
                  <p>
                    Indicators with nobody above the watch line are omitted rather than printed as
                    a row of zeros — a screen of zeros reads as reassurance, and a long list of
                    them buries the two that matter.
                  </p>
                  <p>
                    One indicator the instrument reports is deliberately never scored, charted or
                    named anywhere in AIRMS, on the stakeholder&rsquo;s instruction.
                  </p>
                </InfoTip>
              )}
            />
            {firing.length === 0 ? (
              <p className="text-muted" style={{ marginBottom: 0 }}>
                No tracked indicator is above its watch line for any screened athlete in {sport}.
                That is not a clean bill of health — it is the absence of a flag.
              </p>
            ) : (
              <div className="table-wrap">
              <table className="sport-table">
                <thead>
                  <tr>
                    <th scope="col">Indicator</th>
                    <th scope="col">{BAND_LABEL.red}</th>
                    <th scope="col">{BAND_LABEL.amber}</th>
                    <th scope="col">{BAND_LABEL.green}</th>
                  </tr>
                </thead>
                <tbody>
                  {firing.map((i) => (
                    <tr key={i.key}>
                      <td>{i.label}</td>
                      <td><strong style={{ color: i.high ? BAND_COLOR.red : undefined }}>{i.high}</strong></td>
                      <td>{i.watch}</td>
                      <td className="text-muted">{i.ok}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* ── 6. Who to see ───────────────────────────────────────────── */}
          <div className="card">
            <CardHead
              title={<>Who to see first in {sport}</>}
              sub="Above the low band, worst band first · open a name for their record"
              info={(
                <InfoTip label="How this list is ordered">
                  <p>
                    Sorted by <strong>band first</strong>, then by the indicator inside each band.
                    Ordering on the number alone puts an athlete the system calls elevated below
                    one it calls watch, because the two scales are not the same question.
                  </p>
                  <p>
                    A name links to the Medical Dashboard rather than opening a detail view here,
                    so reading the record goes through the one audited path.
                  </p>
                </InfoTip>
              )}
            />
            {shortlist.length === 0 ? (
              <p className="text-muted" style={{ marginBottom: 0 }}>
                No athlete in {sport} is currently above the low band.
              </p>
            ) : (
              <ul className="quick-list">
                {shortlist.map((p) => (
                  <li key={p.athleteId}>
                    {/* The record is opened through the dashboard, which is the
                        audited path (`athlete.view`) and the only place the
                        clinical controls live. A second detail view here would
                        be a second place to read a record from. */}
                    <a className="sport-shortlist-row" href={`/medical/dashboard?athlete=${encodeURIComponent(p.athleteId)}`}>
                      <span
                        className={`decision-band decision-band--${p.band}`}
                      >
                        {p.band ? BAND_LABEL[p.band] : 'Unscored'}
                      </span>
                      <span className="quick-list-name">{p.name}</span>
                      <span className="quick-list-meta">
                        {p.programme ?? '—'}
                        {p.indicator !== null && <> · indicator {p.indicator}/100</>}
                        {p.exerciseRisks !== null && <> · exercise risks {p.exerciseRisks}</>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
