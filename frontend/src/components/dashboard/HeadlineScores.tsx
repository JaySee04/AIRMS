'use client';

// The two numbers every dashboard now opens on: HoloMotion's Total Score and
// its Exercise Risks.
//
// Asked for on 2026-09-04 — they were computed everywhere and led nowhere. The
// admin dashboard opened on a per-region Focus card, so the two figures a
// clinician can check against the printed report in their hand were several
// scrolls down, under a heading about something else.
//
// It follows §21, which already decided that Total Score — not the cohort-normed
// indicator — is the headline, because it is the one value that can be verified
// against the PDF. This puts the layout where the reasoning already was.
//
// ONE component rather than three copies, deliberately. Three dashboards showing
// "the same" pair of numbers from three implementations is how the band
// vocabulary came to say "Safe" on two screens and something else on a third
// (§33). If the wording or the banding changes, it changes here.
//
// The two are NOT interchangeable and the card says so: Total Score is the mean
// of the 25-cell subitem table and higher is better; Exercise Risks is a count
// of flagged indicators and lower is better. Printing them side by side without
// that would invite reading 74.9 and 16.4 as if they pointed the same way.
import { BAND_SHORT, BAND_COLOR, type Band } from '@/lib/bands';

interface Props {
  /** HoloMotion Total Score — the mean of the subitem table. Higher is better. */
  totalScore: number | null | undefined;
  /** HoloMotion Exercise Risks. Lower is better. */
  exerciseRisks: number | null | undefined;
  /** Optional context line under the scores, e.g. "56 of 62 screened". */
  scope?: string;
  /** Optional band split, rendered as a compact strip beside the numbers. */
  bands?: Partial<Record<Band, number>> | null;
  /** "Squad", "Institute", "Your" — what the numbers describe. */
  subject?: string;
}

const fmt = (v: number | null | undefined) => (
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1).replace(/\.0$/, '') : '—'
);

export default function HeadlineScores({
  totalScore, exerciseRisks, scope, bands, subject = 'Squad',
}: Props) {
  const bandRows = bands
    ? (['green', 'amber', 'red'] as Band[])
      .map((b) => ({ b, n: bands[b] ?? 0 }))
      .filter((r) => r.n > 0)
    : [];
  const bandTotal = bandRows.reduce((a, r) => a + r.n, 0);

  return (
    <div className="card headline-scores" style={{ marginBottom: 20 }}>
      <div className="headline-scores-row">
        <div className="headline-score">
          <div className="headline-score-label">{subject} Total Score</div>
          <div className="headline-score-value">{fmt(totalScore)}</div>
          <div className="headline-score-hint">
            HoloMotion mean · higher is better
          </div>
        </div>

        <div className="headline-score">
          <div className="headline-score-label">Exercise Risks</div>
          <div className="headline-score-value">{fmt(exerciseRisks)}</div>
          <div className="headline-score-hint">
            flagged indicators · lower is better
          </div>
        </div>

        {bandTotal > 0 && (
          <div className="headline-bands">
            <div className="headline-score-label">Risk bands</div>
            <div className="headline-band-strip" aria-hidden="true">
              {bandRows.map((r) => (
                <div
                  key={r.b}
                  style={{ width: `${(r.n / bandTotal) * 100}%`, background: BAND_COLOR[r.b] }}
                  title={`${BAND_SHORT[r.b]}: ${r.n}`}
                />
              ))}
            </div>
            <div className="headline-score-hint">
              {bandRows.map((r) => `${r.n} ${BAND_SHORT[r.b].toLowerCase()}`).join(' · ')}
            </div>
          </div>
        )}
      </div>

      {scope && <div className="headline-scores-scope">{scope}</div>}
    </div>
  );
}
