# AIRMS — FYP Rubrics & Report Requirements

> What's being assessed and at what weight. Check before drafting report sections, prepping for viva, or deciding what to polish next.
>
> Source PDFs shared by JC on 2026-05-24 (Supervisor Assessment Form, Report Structure guide, Panel Viva Rubric). PDFs not stored in repo — text summarised below is the authoritative working reference.

---

## 1. FYP I weighting (current phase)

Total 100% across four components:

| Component | Weight | Assessor |
|---|---|---|
| Proposal Report | 30% | Supervisor |
| Soft skills | 10% | Supervisor |
| Viva — Technical | 50% | Panel |
| Viva — Soft skills | 10% | Panel |

---

## 2. Proposal Report (30 marks, supervisor)

| # | Criterion | Marks | What it asks for |
|---|---|---|---|
| 1 | Abstract | 2 | ≤300 words. Intro + objective + method + findings + discussion |
| 2 | Introduction | 4 | Problems/gaps, existing works, scope, schedule |
| 3 | Objectives | 3 | Clearly described, relevant, measurable |
| 4 | Literature Review | **6** | Papers + product comparison + theories/methods/algorithms |
| 5 | Problem Statements | 4 | Ideal situation, current problem, proposed solution |
| 6 | Methodology | 4 | Design meets objectives + data gathering technique |
| 7 | System Analysis & Design | 4 | UI mockups + UML diagrams + requirements |
| 8 | Conclusion | 2 | Summary of main points + gaps solved |
| 9 | References | 1 | APA style, 5-year recency expected |

**Required report structure (per separate guide):** Title Page · Abstract · Introduction · Substantive body (objectives, LR, problem statements, methodology, findings & discussion, contributions, acknowledgement) · Conclusion · References.

**Not scored in FYP I:** Chapter 5 (System Development) and Chapter 6 (Stakeholder Collaboration) sit outside the supervisor rubric. They show extra progress and read as initiative — keep them but don't sweat polish for FYP I.

---

## 3. Viva — Technical (50%, panel)

| # | Criterion | Weight | What it asks for |
|---|---|---|---|
| 1 | Objectives | 2% | Clearly described, relevant, measurable |
| 2 | Problem Statement | 2% | Clearly addressed |
| 3 | Literature Review | 2% | Sufficient review on papers / products / theories / algorithms |
| 4 | Methodology | 2% | Design complies expectation and meets all objectives |
| 5 | Requirements | 5% | Adequately collected & analysed |
| 6 | Analysis & Design | 10% | Complete UI mockups + complete UML diagrams |
| 7 | **Technical Implementation** | **25%** | **>2 working core modules + DB CRUD integration + able to explain/modify code live** |
| 8 | Stakeholder Collaboration | 2% | Formal collaboration (NDA/LOI/signed letter) **+ execution with collaborator** = "Exceeds" |

**Implication for AIRMS:**
- Six modules built — comfortably above the "exceed 2" threshold for the 25% item.
- Stakeholder Collaboration sits at "Exceeds" tier (signed letter from Dr Thung + meeting on 2026-04-24).
- Be ready to demo and modify code on the spot during viva — the rubric explicitly rewards live code competence.

---

## 4. Soft skills (10% supervisor + 10% panel)

| Dimension | Where assessed | Top-tier criterion |
|---|---|---|
| Communication / Presentation | Both | Coherent, correct pronunciation, purposeful pauses, confident body language |
| Q&A / Critical thinking | Both | Anticipate questions, integrate knowledge in answers, thorough responses |
| Teamwork & Leadership | Supervisor only | Consistently demonstrates teamwork + assumes supervisory responsibility |
| Ethics & professional moral | Supervisor only | Understands and practises ethics with good example (no plagiarism, no outsourced code) |

---

## 5. Outstanding items before viva

### Current — Chapter 2 rewrite

**Chapter 2 cites only methods the build uses** (JC, 2026-10-10: *"only include the ones we currently implement — remove the ancient stuff like ACWR"*). The live set is Clusters A and B of [`fyp/REFERENCES.md`](fyp/REFERENCES.md) — Velarde-Sotres (2025), Lee et al. (2026), Washif et al. (2024), NIST SP 800-63-4 (2025), WCAG 2.2, PDPA (Amendment) Act 2024. **ACWR and sRPE come out of the review entirely** (Qin, Michailidis, Gabbett, Yang, Inoue), with injury surveillance (Costello, Sprouse, Waldén) and the pre-2022 method entries (Hopkins, Weir, Bahr, Robertson, Impellizzeri). The §2.5 summary table and the §2.6 comparison columns are rebuilt on the live set. This supersedes the 2026-06-04 citation refresh and the 2026-08-21 §2.5 cluster, both of which were ✅ against a system that has since removed what they cite

### Previously resolved (pre-2026-06-11)

- ✅ Front-matter pages — TOC, List of Figures, List of Tables, Symbols all populated
- ✅ Acknowledgements — panel names (Dr. Fairuz Amalina, Dr. Maizatul Akmar Ismail) filled in
- ✅ Chapter 2.6 Existing Systems — Kitman Labs, Teamworks, Catapult Sports, ATS each with table + screenshot
- ✅ Analysis & Design corrections — UC labels, figure titles, actor labels all corrected
- ✅ Abstract — 300 words, covers intro/objective/method/findings/discussion
- ✅ Conclusion Chapter 7 — present and complete
- ✅ Project Logbook signatures — present in `FYP I REPORT (3).pdf` appendix

### Issues found in 2026-06-11 review — SUPERSEDED by the 2026-10-10 chapter rewrite

Eight items were raised against `FYP I REPORT (3).pdf`. **Seven of them no longer
exist as tasks**, because the chapter they sat in has been rewritten rather than
patched (`report/FYP2_CHAPTERS_1-7.md`). Recorded here so nobody re-opens them:

| # | Item | Why it is closed |
|---|---|---|
| 1 | `NoSQL` / `ODM` in the abbreviations list | Removed. JC, 2026-10-11 |
| 2 | §2.4 "a Mongoose pre-save hook" | Chapter 2 is wholly replaced; no such passage survives |
| 3 | §2.1–2.3 / §2.6 "student wellness" framing | Same — the new chapter is ISN/elite framed throughout |
| 4 | Conclusion overclaims | Chapter 7 is rewritten: two objectives achieved, the third **partially**, with the usability track named as outstanding |
| 5 | §5.1.1 normalisation claim vs ERD | `injuries` and `self_reports` no longer exist; §4.4 states the one deliberate denormalisation (the audit trail) and why |
| 6 | §5.1.1 "Module 3 promotion" | The self-report approval workflow is deleted |
| 7 | Conclusion SHA-256 / password specifics | Chapter 7 makes no such claim, and NFR-5 now states credential establishment as a requirement, so the detail has a home |
| 8 | Table 5.1 labelled "MongoDB" | Corrected. JC, 2026-10-11 |

### Still outstanding from earlier reviews

1. **Original Literary Work Declaration (p. 4)** — "Field of Study" still blank; Witness Signature / Name / Designation still blank.
2. **Sprint count inconsistency** — report says "two broad sprints"; slides say three; the rewritten §3.1.3 describes three. Align all three.
3. **UC-2 reset password user role** — slide says "Medical Staff, Administrator"; the report lists more. It is now **five roles**; use that.
4. **Slides p. 38 subheading** — the Data Import activity diagram is labelled "Self-Reported Injury Workflow". That workflow does not exist, so this needs a new label rather than a corrected one.
5. **List of Appendices** — not in the front-matter TOC; confirm whether the template requires it.

> **§2.1's duplicate paragraph is closed** — the old §2.1 was the ACWR cluster and
> came out whole, taking both copies of "In conclusion, while ACWR represents…"
> with it.

### Deliverables-shift items (2026-07-03 review — report + slides vs. shipped system)

The report/slides drafts predate the HoloMotion pivot and its sibling features. Full replacement text in [`docs/fyp/REPORT_EDIT_PACK.md`](fyp/REPORT_EDIT_PACK.md) — **revised 2026-08-06**, and the revision matters: three instructions in the original pack (keep the Excel path, treat the coach as future work, present the ACWR composite as the differentiator) became wrong before it was applied.

> **Bigger than this list, as of 2026-08-02:** the HoloMotion-only cut deleted the `Injury` and `SelfReport` models, their routes and all three of their pages. **Module 2 (Injury & Recovery Logging) no longer exists**, and the injury half of Module 5 went with it. The report, Table 4.1, the FDD and the slides all still describe them. The rewritten table (UC-1–47) and regenerated FDD are in [`fyp/REPORT_TABLE_4-1.md`](fyp/REPORT_TABLE_4-1.md) and [`fyp/fdd-updated.html`](fyp/fdd-updated.html); **one decision there is JC's** — recast Module 2 as Athlete Roster & Identity Management (recommended) or drop to five modules.
>
> **Two things worth writing that the report never mentions:** the on-device name redaction (the strongest defensible contribution in the system — pack item R7a) and the identity-card-as-key trade-off (R7b). Expect a panel question on the second.

Summary of the original deliverables-shift items:

1. **Module 4 described as Excel-only** in §1.4 scope, §3.2.1 key feature 4, Table 4.1 UCs, FDD (Fig 4.1), Data Management UC diagram (Fig 4.6), data-import activity diagram, and the §2.5/2.6 comparison "Bulk Data Import" column. Must describe: HoloMotion PDF vision-AI ingestion as the **sole** import path (batch + athlete name-matching; the Excel import was retired 2026-07-12 and archived) plus the admin backup export. The comparison cell is also an unclaimed differentiator — no compared system does AI-assisted ingestion of image-only clinical PDFs.
2. **Overclaimed Module 4 UCs** — "import history log" (comparison table + UC-25) and "delete imported dataset" (UC-26) are not built. Drop or mark future work.
3. **Stale General-module UCs** — self-registration doesn't exist; login is JWT/localStorage not "cookies"; reset is email OTP not "token link". Missing: in-place change-password, admin per-user feature permissions for medical staff (`/admin/staff`).
4. **Missing screening surfaces** — the HoloMotion screening panel embedded on the athlete/medical dashboards (gauges + threshold strips + muscle flags) and the sport-critical screening alerts have no requirement/mention (Modules 2 and 6). *(2026-07-06: the former standalone screening pages were folded into the dashboards — describe the embedded panel, not separate pages.)*
5. **Ch 5 lacks the vision-AI pipeline** (pdfjs render → provider-agnostic vision model → preview/commit) and must present the composite risk model, not plain Gabbett.
6. **Slides predate the MySQL migration** (2026-05-25 draft) — check every tech-stack slide for MongoDB; "33 use cases" count changes with the UC edits; consider mockup slides for the PDF uploader / screening report / alert banner.
7. **Coach role** — FYP I shipped 3 roles, so the FYP I *artifacts* describe those three; **FYP II promotes the coach to a first-class 4th role** (2026-07-19), so FYP II write-ups own it fully (squad readiness + filters + read-only athlete detail + team report + `/admin/coaches`). It is no longer "experimental / future work".
8. **The body-map attribution belongs in the references.** The figure's path data is `react-muscle-highlighter` (MIT, Sorooj Shehryar), re-sliced into HoloMotion's 22 muscles — so the entry in `docs/fyp/REFERENCES.md` must appear in the submitted report. What is AIRMS's own, and what Chapter 3 should claim, is the **re-slicing and the clinical mapping**: a workout atlas's training regions turned into an instrument's individual muscles, including the six deep stabilisers it has no shapes for (DD §4a / §138 / §152). Claim the mapping, cite the paths.
9. **Repo hygiene** — `reports/FYP-I-Report.pdf` is a stale pre-refresh draft (51 pp); replace with the current draft and add the slides PDF to `docs/fyp/` per its README.

---

## 6. FYP II — future reference

Different rubrics will apply (heavier weight on system implementation, full deployment, evaluation results). Update this file when FYP II rubrics are released.

---

*Updated 2026-06-11 after reviewing `FYP I REPORT (3).pdf`.*
