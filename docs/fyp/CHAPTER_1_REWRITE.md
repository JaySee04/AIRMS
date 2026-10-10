# Chapter 1, rewritten against the system that exists

Drafted 2026-10-09 from `MASTER_CLARIFICATIONS.md` and `REPORT_TABLE_4-1.md`, so
Chapter 1 and Chapter 4 describe the same system. Every capability claimed below
is in the build; nothing removed in the 2026-07/08 cuts is claimed.

**Marked `[CHECK]`** where a number or name is yours to confirm, not mine.

---

## 1.1 Project Background

This project is developed in close collaboration with Institut Sukan Negara (ISN)
to build the Athlete Injury Risk Management System (AIRMS), a platform that turns
the musculoskeletal screening ISN already performs into a risk signal its
clinicians, coaches and athletes can each act on. It continues from the
foundational work of the Student Sports Portal (SSP), developed by Sherwynd Liew
and Tan Ke Ying, which addressed sports event management and student
participation tracking within an educational institution.

The SSP platform handles event registration, certification and announcements. It
has no role in clinical screening, and no mechanism for comparing one athlete's
physical assessment against anyone else's. ISN, which oversees 52 sports across
elite, development and competition programmes, screens its athletes with a
**HoloMotion markerless motion-capture system**, which produces a detailed
per-athlete PDF report after each session. That report is comprehensive — a
total movement score, an exercise-risk score, eight region-specific risk
indicators, a twenty-five-cell physical-fitness subitem table, muscle imbalance
findings, and a two-week training prescription.

**The gap is not that the data does not exist. It is that the data stops at the
PDF.** A report is read once by whoever is in the room, filed, and never compared
to anything. Nothing aggregates across a squad, nothing tracks an athlete across
sessions, and nothing tells a clinician which of sixty athletes to see first.
Each report is also scored against the instrument's own published thresholds,
which are not specific to ISN's athletes, their sport, their sex or their age
group.

AIRMS addresses this directly. The HoloMotion report is treated as the **single
source of truth**: the system ingests the PDF ISN already produces, extracts
every value from it, and scores each athlete **against their own peer cohort**
rather than against a published threshold. The resulting verdict is delivered in
four role-shaped views — athlete, coach, medical staff and administrator — so
that none of them needs to read a PDF to act on it.

The design reflects a requirement stated by Dr Thung of ISN: the institution must
own the standard its athletes are judged by. Cohort norms in AIRMS are therefore
**governed rather than assumed** — they are computed from ISN's own roster,
versioned, approved, and can be pinned so that importing a new report cannot
silently move the reference every athlete is measured against. A clinician may
override any verdict with a note, and that override is recorded. The athlete's
name is removed from the report on the operator's own machine before any page is
transmitted, so the only direct identifier in the document never leaves ISN.

---

## 1.2 Problem Statement

### Screening data that ends at the document

ISN performs structured musculoskeletal screening and receives a detailed report
for each athlete, but that report is a terminal artefact. It is not aggregated,
not compared, and not revisited; identifying a pattern across a squad or across
time means a person opening PDFs side by side. Costello et al. (2024) frames
this fragmentation as a systemic weakness in institutional sports-health
management, finding that effective surveillance depends on structured,
multi-stakeholder capture under a single auditable record — precisely what a
folder of per-athlete documents cannot provide.

### A score with no relevant comparison group

The HoloMotion instrument reports each athlete against its own fixed bands. Those
bands are not derived from ISN's population, and a reading that is unremarkable
for a 30-year-old male weightlifter may be meaningful for a 17-year-old female
badminton player. Without a comparison against a relevant peer group, a screening
score cannot answer the question clinicians actually have — *is this athlete
unusual for someone like them?* — and triage defaults to clinical memory.

### No basis for deciding whether a change is real

Where repeat screenings exist, there is no way to distinguish genuine change from
measurement variation. Washif et al. (2024), published from ISN itself, sets out
the detectable-change method for exactly this purpose. An institution without
such a threshold must treat every fluctuation as signal, or ignore all of them.

### No institutional analytics, and no record of who saw what

ISN administrators have no means of analysing screening outcomes across
programmes, sports or demographics. Sprouse et al. (2024) establishes that
meaningful trend analysis requires consistently structured variables captured
with common conventions across a cohort. Separately, clinical records carry an
accountability requirement that a document store does not meet: there is no
record of who opened whose record, which matters when medical staff are
necessarily unrestricted across sports.

> **A boundary stated at the outset.** AIRMS does not predict injury, and makes
> no claim to. Velarde-Sotres et al. (2025) is explicit that screening identifies
> risk *factors* and does not forecast *events*. AIRMS ranks who warrants
> attention against their own peer group; it does not certify that anyone is
> fit, safe or cleared, and no system surface uses those words.

---

## 1.3 Project Objectives

### Objective 1 — Analyse ISN's screening workflow and define a cohort-normed risk model

Requirements are elicited along two parallel strands. Stakeholder engagement with
Dr Thung and ISN's medical and administrative staff captures the operational
needs the system must serve and the governance ISN requires over its own
standards. In parallel, a structured review of the screening literature defines
what the system may legitimately claim — Velarde-Sotres et al. (2025) on the
limits of screening, Washif et al. (2024) on detectable change, and Sprouse et
al. (2024) on surveillance variables. The output is a requirements set and a
cohort-normed risk model that are clinically grounded in ISN practice and
academically anchored in the literature.

### Objective 2 — Design and develop AIRMS, a role-based platform built on HoloMotion report ingestion

AIRMS is developed as a dedicated platform, separate from the existing SSP
deployment, across **six functional modules**: the athlete dashboard and overall
risk indicator; athlete roster and identity management; screening data ingestion;
cohort norms and governance; analytics and reporting; and clinical and squad
monitoring.

Its technical core is an ingestion pipeline that reads the HoloMotion PDF
directly, extracting every reported value without manual transcription, and a
scoring engine that composes those values into one explainable indicator by
comparing each athlete against a cohort of their peers — matched by sport,
programme, sex and age group, with a defined fallback when a cohort is too small
to be meaningful. Norms are versioned and can be pinned by an administrator. The
system serves **five roles**: athlete, coach, medical staff, administrator and
executive, each receiving the same verdict shaped for what they can act on.

### Objective 3 — Evaluate clinical usability and validate extraction and scoring accuracy

Evaluation proceeds along two tracks. The first assesses usability with medical
practitioners — whether a clinician can trace an athlete's history, interpret the
risk presentation, and reach an informed decision using the platform. The second
validates accuracy at both ends of the pipeline: that extracted values match the
printed report field for field, and that cohort statistics, the composite
indicator and the resulting risk band compute correctly against the requirements
agreed with Dr Thung. Together these confirm that the system is fit for clinical
use and that its classifications can be trusted. `[CHECK]` *state your sample
size and method for the usability track.*

---

## 1.4 Project Scope

Despite growing institutional emphasis on athlete welfare, professional sports
organisations such as ISN continue to depend on documents and manual compilation
for screening outcomes. Reports are stored as individual files, administrative
reporting is assembled by hand, and medical staff have no systematic means of
tracing an athlete across sessions. These shortcomings align with gaps identified
in the literature, where fragmented reporting is characterised as prone to
inconsistency and underreporting (Costello et al., 2024).

AIRMS addresses these gaps through six modules.

**Ingestion.** The system accepts the HoloMotion PDF ISN already produces and
extracts every reported value — headline scores, the eight exercise-risk
indicators, the twenty-five-cell subitem table, muscle imbalance findings with
side, and the training prescription. The athlete's name is removed on the
operator's own machine before any page is transmitted for processing.

**Scoring and governance.** Each athlete is scored against a cohort of peers
matched on sport, programme, sex and age group, with a documented fallback when
too few peers exist. Cohort norms are computed from ISN's roster, versioned,
approved and pinnable, so the standard is institutionally owned rather than
implicit. Where repeat screenings allow, the system derives a detectable-change
threshold and **declines to assert one when the available data cannot support
it**, reporting instead that the figure is assumed.

**Role-based delivery.** Athletes see their own result in plain language; coaches
see squad readiness scoped to their sport; medical staff see a ranked worklist,
full per-athlete detail, and the ability to override a verdict with a recorded
note; administrators manage norms, personnel, settings and institutional
analytics; executives receive read-only oversight. Reading a clinical record is
itself recorded, which is the accountability trade for leaving medical staff
unrestricted across sports.

**Reporting.** Holistic, individual and team reports are generated as PDFs for
management and policy use, together with an activity log and a programme-activity
report.

The system is deployed as a standalone platform separate from the SSP, reflecting
the distinct user base and confidentiality requirements of ISN's athlete records.
All athlete data is handled under the Non-Disclosure Agreement signed with ISN.

### Out of scope

Stated explicitly, because each was considered and deliberately excluded:

- **Training-load monitoring and ACWR.** The composite ACWR model is retained as
  a designed and documented artefact (Chapter `[CHECK]`), but no load-logging
  surface exists and no ACWR is computed. AIRMS draws solely on screening data.
- **Injury logging and athlete self-reporting.** AIRMS holds no injury history.
  A clinician may flag an athlete as injured, which affects their eligibility to
  contribute to a cohort norm; this is a screening-governance control, not a
  medical record.
- **Injury prediction.** See the boundary in §1.2.
