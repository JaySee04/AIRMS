# FYP II status and handoff (as of 2026-11-24)

Read this first in a new session. It records what was produced in the Week 7–8
session, the decisions JC made in it, and what is still open. Deliverables are
stored **outside the repo**, in `C:\Users\posei\Downloads\FYP II - SPIRiT\`.

## Decisions in force

### Project objectives (report draft v4, §1.3)

Keep JC's **FYP I objectives**. Objectives 1 and 3 are unchanged, and Objective 2
has one phrase swapped. Dr Hoo warned that changing objectives invites the
panel to probe the reason, so the change is kept as small as possible.

1. To identify the requirements for an athlete injury risk management system
   through stakeholder collaboration with ISN.
2. To develop a centralised platform that integrates **athlete screening data,
   injury status** and role-specific dashboards for injury risk management.
   (FYP I said "athlete activity tracking, injury logging". Activity tracking was
   removed and screening data took its place; the injury log became the
   clinician-set injury flag.)
3. To evaluate the effectiveness and usability of the system in supporting
   injury risk monitoring and data-driven decision-making at ISN.
   **"Effectiveness" is defined by three measures, not by injury rates**, which
   one semester cannot show:
   - clinicians agreeing with the band the system assigns;
   - task success in the UAT;
   - the information being correct (330/330 values match the printed reports;
     24/24 on the compact layout).

The FYP I wording comes from `docs/fyp/VIVA_SCRIPT.md`. JC should check it
against his FYP I **report** word for word.

**Pending Dr Hoo's approval** at the Week 8 one-to-one. Report drafts up to v3
used a fully reworded set ("To elicit the screening-driven requirements…",
"…cohort-normed risk verdict…", "…usability… processing accuracy…"). That set
is dropped.

### Non-functional requirements (report Table 4.2)

**Three only**, matching Ke Ying's FYP 2 report (Table 4.2,
`Downloads\FYP 2 REPORT (TAN KE YING 22004831).pdf`):

| Category | Requirement |
|---|---|
| Security | Role-Based Access Control (RBAC) |
| Usability | User-Friendly Interface |
| Usability | Ease of Use |

These seven were removed from the table:
- privacy (name redaction)
- audit trail
- scheduled email
- frozen norms
- HTTPS and session lock
- accessibility
- self-hosting

The system still does all of them. Name redaction stays in the report as a use
case ("Redact Athlete Name On-Device"). Do not re-add the others as NFRs.

### Other standing decisions

- **Never quote 23 Nov for the UAT.** Say "ongoing; results expected late Nov to
  early Dec".
- **Six modules, not more.** JC asked about expanding past six, and was advised
  against it, because the 73 use cases already group cleanly into six.
- **Website address:** keep `airms.isn.gov.my` until after the UAT. Then add
  `spirit.isn.gov.my` with a redirect from the old address, and a
  `spirit-web.vercel.app` alias. See memory `pending-jc-actions`.
- **The ISN server stays on `99b48ba` until the UAT ends.** Commit `869001a`
  (chart hover tips, gauge explanations, clickable coach rows, motion) is on
  Vercel only, so the UAT test pack matches the screens.
- **The Vercel demo stays.** It is the only copy examiners can open, because the
  NDA keeps ISN's copy private. The Aiven email about `kafka-3635ea19` is
  irrelevant: SPIRiT does not use Kafka, and its MySQL service is running.

## Deliverables (in `Downloads\FYP II - SPIRiT\`)

| Folder | What |
|---|---|
| `01 Report` | **draft v4** .docx and .pdf (90 pages). Older drafts are in `Older drafts\`. |
| `02 Viva Slides` | FYP II viva deck (.pptx) |
| `03 Week 7 Monitoring` | 10-slide deck for Dr Hoo: `- for Canva.pptx` and `- preview.pdf`. No footer or footnotes. Older versions are in `Older version\`. |
| `04 Usability Test (UAT)` | results workbook (no results yet) |
| `07 Testing Evidence (20 Nov 2026)` | 7 test-run screenshots plus the raw output |
| `08 Dr Hoo 1-to-1 (Week 8)` | 2-page handout: objectives (FYP I vs dropped vs v4), plan to completion, risks, 6 questions |

The Week 7 deck still says "9/9" NFRs and shows the older objective wording.
If it has already been submitted, leave it; the handout explains the change.

### What draft v4 changed from v3

- §1.3: all three objectives, as above. Each explanation paragraph keeps the
  detail of the dropped wording; Objective 3's paragraph defines effectiveness.
- **Abstract**: the objectives sentence was updated to match.
- **§6.1.4**: the opening sentence now ties accuracy to Objective 3's
  effectiveness measure.
- **Conclusion**: the "All three objectives" paragraph says Objective 3 is met
  for accuracy. The placeholder for the usability result is still there:
  `[completed / in progress …]` and `[One sentence on the usability result.]`.
- **Table 4.2**: cut to three rows.
- The contents tables were refreshed in Word.

## Week 8 one-to-one with Dr Hoo

Booked, one hour. From the meeting recording
(`20261116_103213.mp4`; transcript in an old session scratchpad, may be
cleared), Dr Hoo wants:
- a discussion of the submitted slides;
- JC's **plan to completion** and the whole picture, so he can adjust the
  deliverables;
- help with the **objective wording**;
- JC's **questions**.

He did not ask for a demo, but have the system ready. His warning to everyone
was "don't do too much, don't do too less", so JC should state a feature
freeze: UAT fixes only.

Running order: open → status (5 min) → objectives (10–15 min, write down the
exact wording he approves) → plan (10 min, ask for exact submission and viva
dates) → risks (5 min) → remaining questions → close by reading back his
decisions.

The six questions are on the handout:
1. Objectives OK? Tell the panel about the scope change beforehand?
2. Under the NDA, can I show the ISN site live, then demo a local copy?
3. If the UAT is late, can Objective 3 be marked "in progress"?
4. Is it OK that the registered title differs from the system name (SPIRiT)?
5. Is ethics approval or consent needed for the UAT?
6. Is the timeline realistic, and what are the exact dates?

The handout's dates are **estimates**. They assume one week of break after
Week 8, with submission and viva in Weeks 12–13 (28 Dec–8 Jan). The report's own
schedule shows the viva in December. Correct them once Dr Hoo or the
coordinator gives the real dates.

**After the meeting:** apply whatever Dr Hoo decides to the report (objectives,
timeline) the same day.

## Open items for JC

- [ ] Run `sudo airms-update` on the ISN server. ISN repo `main` is at
  `99b48ba` (contrast fixes).
- [ ] Hold the meeting, then send Claude the notes.
- [ ] Delete `C:\wv`. It is the venv used to transcribe the video, and deleting
  it was blocked for Claude.
- [ ] Usability test: ISN has 2 accounts and nobody has signed in since 29 Oct.
  Chase Dr Thung's team for tester accounts and a fixed test window.
- [ ] When the UAT results arrive: §6.1.5, the abstract, the conclusion
  placeholders and the slides. Then sync `869001a` to ISN and add the SPIRiT
  address.

## Health as of 2026-11-21

- CI passed on `2e82c3c` (an empty commit pushed to re-trigger it):
  tests/types/lint, CSP and mutation guards.
- Hosted health has passed since #47.
- The GitHub billing lock is lifted. Every red run before it was "job not
  started".
- Last full local sweep (2026-11-20):
  - jest 1176 backend / 554 frontend
  - mutate 142/142
  - e2e 194/194 locally, 193/193 hosted
  - verify:claims 12/12 hosted
  - verify:reports 25/25
  - csp 20/20
  - contrast, a11y and layout all 0, with their canaries caught
