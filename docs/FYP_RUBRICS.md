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

### Resolved in 2026-05-25 draft

The previous round of rubric-graded gaps has been closed in the latest report + slides drafts (`FYP I REPORT (2).pdf`, `FYP I VIVA SLIDES (Draft).pdf`):

- ✅ **Analysis & Design corrections** — UC-1 now "Login Account"; Medical Staff Dashboard actor labelled "Medical Staff"; Figures 4.10 / 4.11 / 4.12 now correctly titled (Data Import / Admin Injury Analytics / Self-Reported Injury Workflow respectively); Figure 4.16 shows the Athlete Injury Report page; Figure 4.20 (Medical Report Review) no longer duplicated.
- ✅ **Abstract** — 300-word abstract present (report p. 7), covers intro / objective / method / findings / discussion.
- ✅ **Conclusion (Chapter 7)** — full chapter present (report p. 58); aligns with `docs/fyp/CONCLUSION_DRAFT.md` superseded by the in-report version.
- ✅ **Bahr et al. (2020) consistency** — both slides and report now cite *British Journal of Sports Medicine, 54(7), 372–389*.
- ✅ **Figure 5.1 (System Architecture)** — removed from Chapter 5.

### Still outstanding

Lower-stakes residual items found while diffing the new PDFs:

1. **Report front-matter pages still empty** — Table of Contents (p. 8), List of Figures (p. 9), List of Symbols and Abbreviations (p. 11), List of Appendices (p. 12). Generate before final submission.
2. **Acknowledgements (p. 6)** — panel names left as "Dr. and Dr." placeholders; fill in once panel is confirmed.
3. **Original Literary Work Declaration (p. 4)** — "Field of Study" blank; Witness signature / Name / Designation blank.
4. **Project Logbook (slides pp. 52–53)** — Supervisor signature column blank for all 7 entries.
5. **Slides UC-2 vs report UC-2** — slide 20 lists Reset Password user role as "Medical Staff, Administrator"; report p. 32 still lists "Athlete, Medical Staff, Administrator". Pick one (the slides version is more accurate to the seeded-credentials model).
6. **Slides p. 38 subheading** — labels the Data Import activity diagram as "UC-21 to UC-22: Self-Reported Injury Workflow"; the diagram is correct but the heading should read "Data Import Workflow".
7. **Sprint count inconsistency** — slide 18/20 mentions "three broad sprints"; report p. 28 says "two broad sprints". Align.

---

## 6. FYP II — future reference

Different rubrics will apply (heavier weight on system implementation, full deployment, evaluation results). Update this file when FYP II rubrics are released.

---

*Updated 2026-05-25 after diffing the 2026-05-25 report + slides drafts against the previous outstanding-items list.*
