# FYP II Progress Pack — June 10 → July 11, 2026

> Paste-ready material derived from [`CHANGES_SINCE_2026-06-10.md`](CHANGES_SINCE_2026-06-10.md):
> **(A)** logbook entries, **(B)** a monitoring-session opener (spoken, ~90s),
> **(C)** a slide-ready progress summary, **(D)** a System Development
> paragraph for the report. Adjust names/dates to match your logbook template.

---

## A · Logbook entries (one per work session, dated by commit history)

**2026-06-11**
Reviewed the submitted FYP I report against the system. Corrected the
literature-review citation set (removed the superseded Foster primary
citation), documented the intentional snapshot denormalisation in the ERD,
and updated the pre-viva punch list from the review findings.

**2026-07-01**
Major development wave completing the HoloMotion pivot: (1) implemented
vision-AI ingestion of HoloMotion screening PDFs — the reports are image-only,
so the backend renders pages and a provider-agnostic vision model (OpenAI-
compatible or Anthropic, env-switched) extracts scores, risk indicators, and
muscle flags with a preview-before-commit workflow; (2) added an admin Excel
backup export of the full dataset; (3) built screening display surfaces and
sport-aware injury alerts (per-sport critical body regions); (4) implemented
admin-controlled per-user feature permissions for medical staff; (5) built an
experimental read-only coach squad-readiness view (kept outside FYP scope).

**2026-07-04**
Hardened the sport-critical alerts (sport-name alias matching, no-data
states, recommended actions) and optimised the vision ingestion cost by
cropping report pages to their data-bearing bands (~58% fewer image tokens,
verified against the real ISN sample). Audited the FYP report and slides
against the shipped system; produced a ten-item edit pack with replacement
prose and redrew four design diagrams (FDD, two use-case diagrams, the data
-import activity diagram); corrected the ERD.

**2026-07-05**
Synchronised the viva Q&A bank and presentation script to the post-pivot
system (Data Management, ERD narration, comparison claims). Added theme-aware
chart palettes so all Chart.js visuals remain legible in dark mode. Resolved
a development-environment fault (OneDrive converting node_modules into cloud
reparse points, breaking Next.js builds) and documented the fix.

**2026-07-07**
Consolidated screening onto the dashboards: replaced the standalone screening
pages with a shared panel rendering the latest HoloMotion report against its
thresholds (tier-ticked gauges + indicator threshold strips). Reworked the
seed data to be HoloMotion-only and added a ground-truth athlete transcribed
1:1 from the stakeholder's sample report for pipeline validation. Added admin
screening-cohort analytics, restructured injury intake around the
IOC/STROBE-SIIS five-step recording workflow with recurrence detection, and
changed permission revocations to hide features (redirect + live session
refresh) rather than show an error panel.

**2026-07-08**
Performance and quality pass: code-split the dashboard chart/body-map
bundles (first-load JS roughly halved), capped injury-list payloads,
removed a duplicated panel, configured ESLint (codebase lints clean) and
removed unused dependencies. Completed a full documentation-consistency
audit across the project docs and viva materials.

**2026-07-11**
Implemented per-sport screening thresholds — the same eight tests are judged
against sport-specific bands (critical regions tightened ~20%; others keep
the instrument's own scale) — and a Training Focus block mirroring the
report's closing Training Prescription, using its exercise vocabulary.
Validated against the ground-truth report: the system independently selects
the same three problem regions the report's own summary flags. Compiled the
consolidated change record for the period.

---

## B · Monitoring-session opener (spoken, ~90 seconds)

"Since the last session, the system completed what I call the HoloMotion
pivot. ISN's real screening workflow produces a HoloMotion report PDF — an
image-only document with no text layer — so AIRMS now ingests that directly:
the backend renders the report's data sections and a vision model extracts
the scores, the eight risk indicators, and the muscle lists, with the
operator confirming a preview before anything is committed. It's provider-
agnostic — any OpenAI-compatible endpoint or Anthropic, and for data-privacy
reasons it can run a fully local model so athlete reports never leave the
premises.

On the analysis side, the screening data now lives directly on the
dashboards, read against thresholds rather than restated as numbers — and
those thresholds are personalised per sport: every athlete takes the same
eight tests, but the regions their sport loads heavily are held to a
tightened standard. The panel closes with a training-focus block mirroring
the report's own prescription section.

The strongest validation point: I seeded Dr Thung's actual report into the
system as a ground-truth athlete, and AIRMS independently flags the same
three problem regions — neck, ankle, and knee — that the report's own summary
identifies. Beyond that, the period also delivered fine-grained staff
permissions, a professional-standard injury intake workflow, admin screening
analytics, and a full alignment pass across the report, slides, and viva
materials."

---

## C · Slide-ready progress summary (one slide, six bullets)

**AIRMS — Progress since 10 June**
- **HoloMotion PDF ingestion** — vision-AI reads ISN's image-only screening
  reports (provider-agnostic, preview-before-commit, local-model capable)
- **Screening on the dashboards** — tier-ticked gauges + threshold strips;
  standalone screening pages retired
- **Per-sport thresholds** — same eight tests, sport-tightened bands (12/20
  vs the instrument's 15/25); Training Focus mirrors the report's prescription
- **Ground-truth validation** — Dr Thung's report seeded 1:1; AIRMS
  reproduces its summary findings (neck / ankle / knee)
- **Clinical workflow** — five-step IOC/STROBE-SIIS injury intake with
  recurrence detection; per-user staff permissions
- **Quality** — screening-cohort analytics, dark-mode charts, first-load JS
  halved, lint-clean codebase, docs/viva materials fully synced

---

## D · Report — System Development addition (one paragraph, adapt tense to chapter)

> Following the FYP I submission, the data-management module was extended to
> ingest ISN's native screening artefact directly. The HoloMotion report is
> generated as an image-only PDF with no extractable text layer, so the
> system renders the report's data-bearing sections to images and submits
> them to a vision-capable AI model, which returns the athlete's scores,
> eight per-region exercise-risk indicators, and flagged muscles as
> structured data; the operator reviews a full preview before any record is
> committed. The extracted screening then drives the dashboards: each
> indicator is evaluated against sport-specific thresholds — regions heavily
> loaded by the athlete's sport are held to a tightened standard, while all
> others retain the instrument's own risk bands — and the dashboard concludes
> with a corrective training-focus section that mirrors the report's own
> training prescription. The pipeline was validated against a ground-truth
> case: the stakeholder's own screening report, transcribed verbatim into the
> seeded dataset, for which the system independently identifies the same
> three problem regions highlighted by the report's summary.

---

*Compiled 2026-07-11. Sources: `CHANGES_SINCE_2026-06-10.md` (commit index),
`DESIGN_DECISIONS.md §13–15`, `VIVA_ANSWERS.md`.*
