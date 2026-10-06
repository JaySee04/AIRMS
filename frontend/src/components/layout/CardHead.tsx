// ONE DEFINITION OF A CARD HEADER.
//
// The shape below was hand-written at 88 call sites:
//
//   <div className="card-header"><div>
//     <h2 className="card-title">…</h2>
//     <span className="card-sub">…</span>
//   </div></div>
//
// and the hand-writing had already drifted — some wrap the title block in a
// <div> and some do not, which changes whether `justify-content: space-between`
// has two children to separate or one; some close as `</div></div>` on one line,
// which is how a slice edit took a span of JSX out in §68.4. The INFO control
// (§131) would have been an 89th thing to remember to place consistently.
//
// WHY A COMPONENT RATHER THAN A CSS FIX. The alignment could have been solved
// with `.card-header > :first-child { flex: 1 }` and nothing else. What CSS
// cannot do is make the info slot IMPOSSIBLE TO PUT IN THE WRONG PLACE — and
// the placement is the whole §131 design: the tip belongs on the header beside
// the title, never inside the body where it competes with the data, and never
// below it where it is a block disclosure again.
//
// `h2` is not configurable, deliberately. Card titles are <h2> app-wide and
// `npm run verify:a11y` fails on an h1 -> h3 jump; a `level` prop would make
// that an invitation.

import type { ReactNode } from 'react';

export default function CardHead({
  title, sub, info, actions, id,
}: {
  title: ReactNode;
  /**
   * The LABEL line: units, sort order, what the rows are. One clause.
   * Method and teaching belong in `info` — the three-way split is in InfoTip.tsx.
   */
  sub?: ReactNode;
  /** An <InfoTip>. Sits beside the title, out of the reading line. */
  info?: ReactNode;
  /** Buttons and pickers. Pushed to the far end of the row. */
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="card-header">
      <div className="card-head-main">
        <h2 className="card-title" id={id}>
          {title}
          {info}
        </h2>
        {sub ? <span className="card-sub">{sub}</span> : null}
      </div>
      {actions ? <div className="card-head-actions">{actions}</div> : null}
    </div>
  );
}
