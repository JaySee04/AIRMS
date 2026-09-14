// A landmark in a long stack of cards. See DESIGN_DECISIONS §98.2.
//
// /admin/dashboard renders twelve full-width cards in one column — 5,570px of
// page — with every `.card-title` at the same size and weight as the last.
//
// It is an EYEBROW, not a larger heading: the rule does the work, so grouping
// costs no new step on the §29 type scale and no re-weighting of card titles.
//
// ACCESSIBILITY, as a limitation rather than a claim. This renders an <h2>, and
// so do the card titles it groups, so the outline gains a heading in the right
// place but not a true nesting level. The correct markup is
// <section aria-labelledby>, which means wrapping every group's cards — a
// structural edit across four pages to fix an outline nobody has reported. A
// screen-reader user still gets a heading per group, which beats twelve flat
// siblings. Recorded here so the next person finds it rather than assuming it
// was handled.

type Props = {
  /** The group's label. Short — it sits on a rule, not on its own line. */
  children: React.ReactNode;
  /**
   * One line saying WHY these panels are together. Worth writing: the grouping
   * is an editorial claim, and a heading that only names a category ("Charts")
   * makes the reader do the work the heading exists to do.
   */
  note?: React.ReactNode;
};

export default function SectionHeading({ children, note }: Props) {
  return (
    <div className="section-head">
      <h2 className="section-head-title">{children}</h2>
      {note ? <span className="section-head-note">{note}</span> : null}
    </div>
  );
}
