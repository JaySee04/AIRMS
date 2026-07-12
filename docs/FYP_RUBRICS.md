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

### Previously resolved (pre-2026-06-11)

- ✅ Literature review citation refresh — Qin (2025) + Michailidis (2024) + Sprouse (2024) + Inoue (2022) + Yang (2024) carry the sRPE/ACWR/surveillance clusters
- ✅ Section 2.5 Summary Table — 7 papers across 4 clusters
- ✅ Front-matter pages — TOC, List of Figures, List of Tables, Symbols all populated
- ✅ Acknowledgements — panel names (Dr. Fairuz Amalina, Dr. Maizatul Akmar Ismail) filled in
- ✅ Chapter 2.6 Existing Systems — Kitman Labs, Teamworks, Catapult Sports, ATS each with table + screenshot
- ✅ Analysis & Design corrections — UC labels, figure titles, actor labels all corrected
- ✅ Abstract — 300 words, covers intro/objective/method/findings/discussion
- ✅ Conclusion Chapter 7 — present and complete
- ✅ Project Logbook signatures — present in `FYP I REPORT (3).pdf` appendix

### Issues found in 2026-06-11 review (`FYP I REPORT (3).pdf`) — fix in Word document

1. **§ Abbreviations (pp. 12–13)** — `NoSQL` and `ODM` listed but neither term has any referent in the MySQL/Sequelize stack. Remove both rows.
2. **§2.4 (p. 23)** — "a Mongoose pre-save hook automatically computes the AU load" — system uses Sequelize, not Mongoose. Change to "a Sequelize model hook automatically computes the AU load at write time, persisting the derived value."
3. **§2.1–2.3 and §2.6 framing** — repeated "student wellness," "student sports portal," "university sports environments," "university student athletes," "open-access platform." AIRMS serves ISN national elite athletes, not university students. Replace with institutional/ISN/elite framing throughout; remove "open-access" (contradicts the NDA).
4. **Conclusion (p. 59–61) — overclaims for FYP I** — "all three project objectives were successfully achieved," "end-to-end testing confirm," "usability assessment with medical practitioners confirming." No evaluation chapter, no participants, no results exist in this report. Objective 3 is planned, not complete. Soften to expected/planned outcomes.
5. **§5.1.1 (p. 47) — normalisation claim vs ERD** — "Its normalised relational model" but `injuries` and `self_reports` snapshot `athlete_name`, `sport`, `gender`, `athlete_age` (visible in ERD Fig 4.9). Qualify: intentional snapshot denormalisation in event-log tables; `athletes`, `muscle_flags`, `recovery_baselines` are normalised.
6. **§5.1.1 (p. 48) — "Module 3 promotion"** — modules are not numbered anywhere else in Ch. 5. Change to "the self-report approval workflow's promotion."
7. **Conclusion (p. 61) — SHA-256 and password policy specifics** — "SHA-256-hashed single-use tokens … complexity policy of at least ten characters with mixed case, digit, and symbol" never appear as requirements in Chapter 4. Trim to "an email-driven password reset flow, and an in-place change-password capability with complexity enforcement."
8. **Table 5.1 (p. 47) — Database label** — table shows MySQL logo but the label underneath reads "MongoDB." Change label to "MySQL."

### Still outstanding from earlier reviews

1. **Original Literary Work Declaration (p. 4)** — "Field of Study" still blank; Witness Signature / Name / Designation still blank.
2. **§2.1 duplicate paragraph** — "In conclusion, while ACWR represents..." appears twice (p. 19). Delete the second occurrence.
3. **Sprint count inconsistency** — report (p. 29) says "two broad sprints"; slides mention "three." Align across both artefacts.
4. **UC-2 reset password user role** — slide says "Medical Staff, Administrator"; report (p. 33) lists all three roles. Pick one.
5. **Slides p. 38 subheading** — Data Import activity diagram mislabelled as "Self-Reported Injury Workflow."
6. **List of Appendices** — not in report front-matter TOC; confirm whether template requires it.

### Deliverables-shift items (2026-07-03 review — report + slides vs. shipped system)

The report/slides drafts predate the HoloMotion pivot and its sibling features. Full replacement text in [`docs/fyp/REPORT_EDIT_PACK.md`](fyp/REPORT_EDIT_PACK.md); summary:

1. **Module 4 described as Excel-only** in §1.4 scope, §3.2.1 key feature 4, Table 4.1 UCs, FDD (Fig 4.1), Data Management UC diagram (Fig 4.6), data-import activity diagram, and the §2.5/2.6 comparison "Bulk Data Import" column. Must describe: HoloMotion PDF vision-AI ingestion as the **sole** import path (batch + athlete name-matching; the Excel import was retired 2026-07-12 and archived) plus the admin backup export. The comparison cell is also an unclaimed differentiator — no compared system does AI-assisted ingestion of image-only clinical PDFs.
2. **Overclaimed Module 4 UCs** — "import history log" (comparison table + UC-25) and "delete imported dataset" (UC-26) are not built. Drop or mark future work.
3. **Stale General-module UCs** — self-registration doesn't exist; login is JWT/localStorage not "cookies"; reset is email OTP not "token link". Missing: in-place change-password, admin per-user feature permissions for medical staff (`/admin/staff`).
4. **Missing screening surfaces** — the HoloMotion screening panel embedded on the athlete/medical dashboards (gauges + threshold strips + muscle flags) and the sport-critical screening alerts have no requirement/mention (Modules 2 and 6). *(2026-07-06: the former standalone screening pages were folded into the dashboards — describe the embedded panel, not separate pages.)*
5. **Ch 5 lacks the vision-AI pipeline** (pdfjs render → provider-agnostic vision model → preview/commit) and must present the composite risk model, not plain Gabbett.
6. **Slides predate the MySQL migration** (2026-05-25 draft) — check every tech-stack slide for MongoDB; "33 use cases" count changes with the UC edits; consider mockup slides for the PDF uploader / screening report / alert banner.
7. **Coach role stays OUT of FYP I artifacts** (locked 3-role model; experimental). One future-work sentence in Ch 7 at most.
8. **react-muscle-highlighter MIT attribution** must appear in the references (locked decision) — absent from the old draft; verify in current.
9. **Repo hygiene** — `reports/FYP-I-Report.pdf` is a stale pre-refresh draft (51 pp); replace with the current draft and add the slides PDF to `docs/fyp/` per its README.

---

## 6. FYP II — future reference

Different rubrics will apply (heavier weight on system implementation, full deployment, evaluation results). Update this file when FYP II rubrics are released.

---

*Updated 2026-06-11 after reviewing `FYP I REPORT (3).pdf`.*
