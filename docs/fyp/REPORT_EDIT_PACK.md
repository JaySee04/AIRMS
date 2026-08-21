# Report/Slides Edit Pack — deliverables-shift alignment

> Companion to `FYP_RUBRICS.md` §5. Each entry gives **where**, **what to
> remove**, and **ready-to-paste replacement text** written in the report's
> voice. Locate by heading — page numbers shift between drafts.
>
> Apply in the Word document, re-export the PDF, then replace
> `reports/FYP-I-Report.pdf`.
>
> **Revised 2026-08-06.** The 2026-07-03 version of this pack was written
> before three changes that invalidated parts of it, and following it now would
> introduce *new* errors:
> - it told you to write **"the validated Excel path remains fully functional"** — the Excel import was retired 2026-07-12
> - it told you **"do not present coach as a shipped role"** — the coach became a first-class fourth role 2026-07-19
> - it treated the **composite ACWR model** as the graded differentiator — that is now dormant with no live caller; the cohort-normed indicator is the differentiator
>
> It also predated the HoloMotion-only cut (2026-08-02), which removed an
> entire module the report still describes. Items below are renumbered and
> rewritten accordingly; **R4 is now delegated** to
> [`REPORT_TABLE_4-1.md`](REPORT_TABLE_4-1.md).

---

> **APPLIED 2026-08-21** to `FYP II REPORT (AIRMS) - revised.docx` (from JC's
> `Downloads/FYP I REPORT.docx`). R1–R9 are in the document, plus edits this pack
> did not cover: a new §2.5 literature cluster (Bahr 2016, Robertson et al. 2017),
> Chapters 1 and 7 rewritten, §4.6 UX de-overclaimed, four non-functional
> requirements added, and Table 4.1 extended to **53** use cases — 47 from
> `REPORT_TABLE_4-1.md` plus six built after this pack was written (norm pinning,
> notification preferences, scheduled mail, forced send, activity log, programme
> activity report). `executive` was added to the roles on the ten read-only use
> cases; **this pack's "use all four" instruction for UC-2 is stale — it is five.**
> Not done, because they need a person: R6 (re-screenshot the diagrams), R10 (the
> slides), §4.6's mockups of deleted pages, and Table 1.1's FYP I schedule.

---

## R1 · §1.4 Project Scope — the data module sentence

**Remove:** "A dedicated data management module supports the upload and validation of Excel-based screening data from ISN, ensuring the database can be updated efficiently as new assessments are conducted."

**Replace with:**

> A dedicated screening-ingestion module brings athlete assessment data into the system by importing the HoloMotion screening report — the per-athlete biomechanical assessment PDF produced by ISN's actual screening workflow, and the system's sole source of screening data. Because these reports contain no machine-readable text layer, the system renders their pages to images and extracts the structured values using a vision-capable AI model, presenting a full preview for operator confirmation before any data is committed. The athlete's name is located and obscured on the operator's own machine before any image is transmitted, so the report's only direct identifier never leaves the institute. Reports can be imported singly or as a batch, and are attached to an athlete already on record either automatically or by the operator. Administrators can additionally export the dataset as an Excel backup at any time.

## R2 · §3.1.3 Development — Sprint deliverables

Extend the ingestion wording:

> …Screening Data Ingestion Module (batch AI-assisted HoloMotion PDF ingestion with on-device name redaction and roster attachment, plus dataset backup export)…

Also resolve the sprint-count inconsistency (report "two broad sprints" vs slides "three") — pick one, align both.

## R3 · §3.2.1 Stakeholder Interview — key feature 4

**Remove:** "A simple Excel upload mechanism that allows screening data to be added to the system and reflected in the dashboards without complex steps."

**Replace with:**

> **Screening Data Ingestion Module** — A simple upload mechanism that allows new screening data to be added to the system and reflected in the dashboards without complex steps. Because ISN's screening workflow produces per-athlete HoloMotion report PDFs rather than spreadsheets, the module ingests these reports directly using AI-assisted extraction — singly or in batches, with each report attached to the athlete it belongs to — alongside a dataset backup export.

(This *strengthens* stakeholder traceability — Dr Thung's clinic produces HoloMotion PDFs, so the pivot moves the system closer to his stated "easy upload" requirement.)

## R4 · Table 4.1 Functional Requirements → **see [`REPORT_TABLE_4-1.md`](REPORT_TABLE_4-1.md)**

That file now holds the complete paste-ready table (UC-1–47, six modules plus
General), the notes for the surrounding §4.1.1 prose, and Appendix C mapping
every previous use case to its disposition. **Module 2 is now Athlete Roster &
Identity Management** (ratified 2026-08-06); Chapter 4 prose that names it
"Injury & Recovery Logging" must change throughout, and any figure caption
citing 44 use cases becomes 47.

Stale General-module rows to fix if the current draft still has them:

| Change | Detail |
|---|---|
| Remove *Register Account* | AIRMS has no self-registration; accounts are provisioned by the administrator |
| *Login* description | "…with session management via cookies" → "…issuing a signed JWT attached as a bearer token on every subsequent request" |
| *Reset Password* description | "via email token link" → "via a single-use six-digit email OTP verified before the new password is accepted" |
| *Reset Password* roles | Slides say "Medical Staff, Administrator"; report lists all roles. Use **all four** |

## R5 · §2.5/2.6 Existing Systems Comparison

**"Bulk Data Import" cell for AIRMS — replace with:**

> Batch AI-assisted ingestion of image-only HoloMotion screening PDFs, with the athlete's name redacted on-device before transmission and confirm-before-commit review; full dataset backup export (Excel)

**Add to the closing narrative paragraph:**

> Notably, none of the reviewed systems can ingest image-only clinical screening reports; each depends on structured exports, proprietary formats, or wearable telemetry. AIRMS's AI-assisted PDF ingestion addresses the format that ISN's screening workflow actually produces, and does so without transmitting the athlete's identity to the extraction service.

Remove "import history log" from this table — no such feature exists (overclaim).

## R6 · Diagrams — regenerate and re-screenshot

Open each HTML at 100% zoom, screenshot, paste into the doc.

**All five were regenerated on 2026-08-06 and are screenshot-ready.**

- **Fig 4.1 FDD** → [`fdd-updated.html`](fdd-updated.html) — six modules plus General, 46 leaves. Module 2 is Athlete Roster & Identity Management; Module 5 is screening-derived only; Module 3 gains the redaction leaf
- **Fig 4.2 General UC diagram** → [`uc-general-updated.html`](uc-general-updated.html) — "Manage Personnel & Permissions" (the merged page creates coach *and* medical accounts and assigns a coach's sport); the coach is no longer marked experimental and now associates with Change Password and View Profile, since `/coach/profile` ships
- **Fig 4.6 Data Management UC diagram** → [`uc-datamgmt-updated.html`](uc-datamgmt-updated.html) — **fully redrawn.** The old one showed a single pre-split module and *both* import paths. Now two system boundaries (Module 3 Ingestion, Module 4 Cohort Norms) on one canvas — screenshot whole for one figure, or crop at the dashed divider for two. The PDF path only; the «include» chain Import → Redact → Extract makes the point that no image reaches the provider before the name is obscured
- **Data-import activity diagram** → [`activity-dataimport-updated.html`](activity-dataimport-updated.html) — **redaction step added, and a real error fixed**: the old diagram branched on *"Extracted name on roster?"*, but the name is redacted **before** extraction, so no extracted name exists. The branch is now the local filename, which is what the system actually matches on. Also adds the post-queue recompute. (Slides: still mislabelled "Self-Reported Injury Workflow" on p. 38 — and that workflow no longer exists at all)
- **Fig 4.9 ERD** → [`erd-corrected.html`](erd-corrected.html) — **first ERD showing the complete live schema, all eight tables.** `injuries` and `self_reports` removed; `screenings`, `athlete_disciplines`, `cohort_thresholds`, `cohort_norm_versions` and `settings` added (the previous pass deferred them as out of scope); `athletes` gains the five injury/exclusion columns and its key values are now IC numbers. The two dashed links are labelled as derivations rather than foreign keys — a cohort is identified by values, not by reference, which is worth a sentence if asked

## R7 · Chapter 5 — AI-assisted screening ingestion

Paste-ready draft (adjust numbering):

> **5.1.x AI-Assisted HoloMotion Report Ingestion**
>
> ISN's biomechanical screening workflow produces a per-athlete HoloMotion report as a PDF. These reports are generated as pure graphics with no embedded text layer, so conventional text extraction returns nothing, and off-the-shelf OCR proved unreliable on the report's circular gauge figures — the very values the system needs. AIRMS therefore treats ingestion as a vision problem: the backend renders the report's data pages to images and submits them to a vision-capable AI model with a structured extraction prompt, receiving the athlete's headline scores, the eight per-region injury-risk indicators, the twenty-five physical-fitness subitem scores, the report summary and the flagged muscles as validated JSON mapped onto the existing athlete schema.
>
> The integration is deliberately provider-agnostic — the same code path supports any OpenAI-compatible endpoint (OpenAI, Gemini, Qwen, OpenRouter, or a fully local Ollama deployment) as well as Anthropic's native API, selected purely by environment configuration, so the institution is not coupled to a single AI vendor and can keep athlete data on-premises if required. Ingestion follows a two-step confirm-before-commit flow: the extraction result is first presented to the operator as a preview rendered in the same form the dashboards use, and only on explicit confirmation is the database updated. Where no AI provider is configured, the import path disables itself cleanly and the rest of the system is unaffected.

## R7a · Chapter 5 — privacy-preserving extraction *(NEW — write this one)*

**This is the strongest defensible contribution in the system and the report does not mention it.** Paste-ready:

> **5.1.y Privacy-Preserving Extraction**
>
> Submitting a clinical report to a third-party AI service raises an obvious objection: the report carries the athlete's name, and transmitting it discloses to an external processor both who the athlete is and what their assessment found. AIRMS answers this at the point of capture rather than by policy. Before any page image is transmitted, a local optical-character-recognition pass — running entirely in the application process, with no network access — locates the name field on the report's first page and obscures its value, leaving every clinical value intact. The extraction model therefore receives a complete but anonymous report.
>
> The mechanism fails closed: where the name cannot be located with confidence, the entire identifying region of the page is obscured rather than risking disclosure, accepting the loss of the age and gender fields, which the operator can supply from the roster. Re-attaching the anonymous report to the correct athlete happens locally, against the institute's own roster, so the linkage between identity and assessment is never transmitted either.
>
> The result is that the sole direct identifier in the screening pipeline never leaves the institute's machine, while the system retains the accuracy benefit of a capable vision model.

Also confirm §5.1 presents the **cohort-normed overall risk indicator** — standardisation against the athlete's own peer group with explicit escalation rules — as the graded differentiator. The earlier personalised-ACWR composite model is retained in the codebase as a locked decision but has **no live caller**; if the report presents it as running, correct that (see `ACWR_REBUILD.md` for the honest framing).

## R7b · Chapter 5 or 7 — the identity-key trade-off *(NEW — expect a question)*

The athlete key became the identity-card number on 2026-08-04. State it and own the tension:

> The athlete record is keyed by identity-card number, the identifier ISN itself uses, which allows records to be reconciled directly against the institute's own athlete directory without maintaining a separate mapping. This is a deliberate trade-off rather than a costless one: an identity-card number is sensitive personal data, and using it as the cross-table key means it appears in request paths, exported filenames and application logs, where a synthetic key would not. The system's mitigations therefore operate at the boundaries — screening reports are anonymised before transmission to any external service (§5.1.y), and all athlete data is served only over authenticated, role-restricted routes — but the residual exposure within the institution's own deployment is accepted rather than eliminated, on the basis that the identifier is one ISN staff already handle in the course of their work.

## R8 · Chapter 7 Conclusion

- Mention AI-assisted ingestion **and on-device redaction** among delivered capabilities.
- The coach is a **shipped, first-class fourth role** — present it as delivered, not future work. (This reverses the 2026-07-03 instruction in the old pack.)
- Future-work candidates that are honest: a responsive/mobile athlete view (explicitly out of scope, `JC_CHECKLIST.md`); replacing the stand-in institute directory with the live ISN source; re-establishing a training-load input for the dormant composite model.
- Trim the overclaimed specifics flagged in `FYP_RUBRICS.md` §7 (SHA-256 tokens, the ten-character complexity policy) unless Chapter 4 states them as requirements.

## R9 · References

Add (locked decision — the body-map asset attribution must appear):

> Shehryar, S. (2023). *react-muscle-highlighter* [Computer software]. MIT License. https://github.com/soroojshehryar/react-muscle-highlighter — anatomical path data adapted for the AIRMS body-map component.

Still correct after the 2026-08-04 change: the geometry was re-partitioned into the screening instrument's muscle vocabulary, but no path data was redrawn and the licence terms are unchanged.

Keep the sRPE citations (Inoue 2022, Yang 2024) **only** where the report discusses the composite model as a designed artefact. If any passage implies session load is being collected, remove it — nothing computes it.

## R10 · Slides checklist

1. Tech-stack slide(s): **MongoDB → MySQL**
2. Requirements slides: the use-case count is now **47**, not 33 (and not 44)
3. Module slides: Module 2 is no longer Injury & Recovery Logging; remove self-report and injury-log screenshots
4. Comparison slide: updated Bulk Data Import cell (R5)
5. Diagram slides: mirror R6, including the p. 38 mislabel — and note that "Self-Reported Injury Workflow" is not merely mislabelled, the workflow is gone
6. UC-2 reset-password roles: all four
7. Sprint count: align with report (R2)
8. Screenshots worth adding: the PDF uploader mid-batch, the redaction step, the dashboard's HoloMotion screening panel, the 22-muscle body map, the coach squad board

---

## Still outstanding from earlier reviews (unchanged, verify against current draft)

1. **Original Literary Work Declaration** — "Field of Study" blank; Witness Signature / Name / Designation blank
2. **§2.1 duplicate paragraph** — "In conclusion, while ACWR represents…" appears twice; delete the second
3. **Table 5.1 Database label** — shows the MySQL logo, labelled "MongoDB". Change the label
4. **List of Appendices** — absent from front-matter TOC; confirm whether the template requires it

---

*Revised 2026-08-06 for the HoloMotion-only cut and the 2026-08 roadmap batch. Three instructions in the 2026-07-03 version were actively wrong by this date (dual-path import, coach-as-future-work, ACWR-as-differentiator) and are corrected above. R7a, R7b and the R6 regeneration flags are new. Verify each item against the current Word draft — `reports/FYP-I-Report.pdf` in the repo is still the pre-refresh draft.*
