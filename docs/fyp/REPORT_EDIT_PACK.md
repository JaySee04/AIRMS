# Report/Slides Edit Pack — deliverables-shift alignment

> Companion to `FYP_RUBRICS.md` §5 "Deliverables-shift items". Each entry gives
> **where**, **what to remove**, and **ready-to-paste replacement text** written in
> the report's voice. Section/figure numbers follow the report structure — page
> numbers shift between drafts, so locate by heading. Written on the assumption
> that the **coach role is out of the FYP I artefact** (FYP I shipped 3 roles); in FYP II the coach is a first-class 4th role.
>
> Apply in the Word document, re-export the PDF, then replace
> `reports/FYP-I-Report.pdf`.

---

## R1 · §1.4 Project Scope — Module 4 sentence

**Remove:** "A dedicated data management module supports the upload and validation of Excel-based screening data from ISN, ensuring the database can be updated efficiently as new assessments are conducted."

**Replace with:**

> A dedicated data management module brings athlete screening data into the system by importing the HoloMotion screening report — the per-athlete biomechanical assessment PDF produced by ISN's actual screening workflow. Because these reports contain no machine-readable text layer, the system renders their pages to images and extracts the structured values using a vision-capable AI model, presenting a full preview for operator confirmation before any data is committed. Reports can be imported singly or as a batch, and athletes already on record are matched automatically by the name printed on each report. Administrators can additionally export the complete dataset as an Excel backup at any time, ensuring the database can be updated efficiently and safely as new assessments are conducted.

## R2 · §3.1.3 Development — Sprint 2 deliverables

Where Sprint 2's deliverables are listed, extend the Data Management wording:

> …Data Management Module (batch AI-assisted HoloMotion PDF ingestion with athlete name-matching, plus dataset backup export)…

Also resolve the sprint-count inconsistency here (report "two broad sprints" vs slides "three") — pick one and align both artifacts.

## R3 · §3.2.1 Stakeholder Interview — key feature 4

**Remove:** "A simple Excel upload mechanism that allows screening data to be added to the system and reflected in the dashboards without complex steps."

**Replace with:**

> **Data Management Module** — A simple upload mechanism that allows new screening data to be added to the system and reflected in the dashboards without complex steps. Because ISN's screening workflow produces per-athlete HoloMotion report PDFs rather than spreadsheets, the module ingests these reports directly using AI-assisted extraction — singly or in batches, with athletes matched automatically by the name on each report — alongside a dataset backup export.

(This *strengthens* stakeholder traceability — Dr Thung's clinic produces HoloMotion PDFs, so the pivot moves the system closer to his stated "easy upload" requirement.)

## R4 · Table 4.1 Functional Requirements

Renumber to fit the current draft's UC sequence; titles below are descriptive.

**General Module — fix stale rows (if still present in current draft):**

| Change | Detail |
|---|---|
| Remove *Register Account* | AIRMS has no self-registration; accounts are provisioned by the administrator |
| *Login* description | "…with session management via cookies" → "…issuing a signed JWT attached as a bearer token on every subsequent request" |
| *Reset Password* description | "via email token link" → "via a single-use six-digit email OTP verified before the new password is accepted" |
| Add *Change Password* | "Change the account password from within the profile page while logged in, subject to the password complexity policy" — Athlete, Medical Staff, Administrator |
| Add *Manage Staff Permissions* | "Administrator grants or revokes individual medical-staff capabilities (view records, upload data, review reports, log injuries) and can deactivate an account; enforced server-side on every affected route" — Administrator |

**Data Management Module — replace the block:**

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-a | Import HoloMotion Screening Report(s) | Upload one or many per-athlete HoloMotion PDFs; for each, the system renders the report pages and extracts scores, injury-risk indicators, and muscle flags using a vision AI model, returning a preview for confirmation before commit | Medical Staff, Administrator |
| UC-b | Match Athlete by Name | The extracted athlete name is matched against the existing roster; a match auto-fills Athlete ID, sport, and programme, while a new athlete's details are supplied by the operator (sport selected from ISN's 52-sport list) | System |
| UC-c | Validate Import Data | System checks extracted data for missing fields and existing-athlete conflicts before committing; nothing is written during preview | System |
| UC-d | Export Data Backup | Download the complete athlete, injury, and screening dataset as a multi-sheet Excel workbook for backup and offline analysis | Administrator |

**Remove:** *View Import History* and *Delete Import Record* — not built. If the marker will compare against an earlier submitted table, keep them but mark "(future work)".

**Athlete Dashboard / Workload Module — add:**

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-e | View Screening Report | View the athlete's latest ingested screening assessment: overall scores, the eight injury-risk indicators, and flagged muscles on a body map | Athlete |
| UC-f | Display Sport-Critical Screening Alert | Show a dashboard alert when a screening indicator is out of healthy range in a body region critical to the athlete's sport (each sport maps to its highest-stress regions), with a severity-matched recommended action | System |

**Medical Staff Dashboard Module — add:**

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-g | View Athlete Screening Report | Look up any athlete and view the same screening report view the athlete sees, supporting clinical interpretation of the ingested assessment | Medical Staff |

Update the total use-case count **everywhere it is quoted** (report prose + slides "33 use cases").

## R5 · §2.5/2.6 Existing Systems Comparison

**"Bulk Data Import" cell for AIRMS/SSP 3.0 — replace with:**

> Batch AI-assisted ingestion of image-only HoloMotion screening PDFs with athlete name-matching and confirm-before-commit; full dataset backup export (Excel)

**Add to the closing narrative paragraph:**

> Notably, none of the reviewed systems can ingest image-only clinical screening reports; each depends on structured exports, proprietary formats, or wearable telemetry. AIRMS's AI-assisted PDF ingestion addresses the format that ISN's screening workflow actually produces.

Remove "import history log" from this table (see R4).

## R6 · Diagrams — done, screenshot-ready

Redrawn HTML diagrams (open in a browser at 100% zoom, screenshot, paste into the doc). All match the `erd-corrected.html` visual style:

- **Fig 4.1 FDD** → [`fdd-updated.html`](fdd-updated.html) — Data Management gains *Import HoloMotion PDF (AI Vision)* + *Export Data Backup*; General gains *Change Password* + *Manage Staff Permissions* (no *Register*); dashboards gain *View Screening Report* + *Sport-Critical Screening Alert*
- **Fig 4.2 General UC diagram** → [`uc-general-updated.html`](uc-general-updated.html) — Login (JWT), Reset Password (email OTP), Change Password, Manage User Profile, Manage Staff Permissions (admin), RBAC (system)
- **Fig 4.6 Data Management UC diagram** → [`uc-datamgmt-updated.html`](uc-datamgmt-updated.html) — both import paths with «include» → Validate & Preview, Export Data Backup, and the Vision AI Provider as an «external system» actor
- **Data-import activity diagram** → [`activity-dataimport-updated.html`](activity-dataimport-updated.html) — single PDF path with a batch loop: render → vision extraction → name-match decision (auto-fill vs manual entry) → preview → confirm → commit → next report. (Slides: this diagram is also mislabelled "Self-Reported Injury Workflow" on p. 38 — existing punch item)
- **Fig 4.9 ERD** → [`erd-corrected.html`](erd-corrected.html) **updated 2026-07-03**: removed the `import_records` table (no such model exists — it was an overclaim), and corrected `users` columns (`permissions`, `reset_code_attempts`, `last_login_at`; audit timestamps trimmed). the coach column is now **`coach_sport`** (scalar, renamed from the JSON `coach_sports` array on 2026-07-18); it was omitted from the FYP I ERD (3-role scope) but belongs in FYP II figures now that the coach is a first-class role. No new tables for HoloMotion — it maps onto `athletes` + `muscle_flags`. **Re-screenshot Fig 4.9.**

## R7 · Chapter 5 — new subsection: AI-assisted screening ingestion

Paste-ready draft (adjust numbering):

> **5.1.x AI-Assisted HoloMotion Report Ingestion**
>
> ISN's biomechanical screening workflow produces a per-athlete HoloMotion report as a PDF. These reports are generated as pure graphics with no embedded text layer, so conventional text extraction returns nothing, and off-the-shelf OCR proved unreliable on the report's circular gauge figures — the very values the system needs. AIRMS therefore treats ingestion as a vision problem: the backend renders the report's pages to images and submits them to a vision-capable AI model with a structured extraction prompt, receiving the athlete's scores, the eight per-region injury-risk indicators, and the flagged muscles as validated JSON mapped onto the existing athlete schema.
>
> The integration is deliberately provider-agnostic — the same code path supports any OpenAI-compatible endpoint (OpenAI, Qwen, OpenRouter, or a fully local Ollama deployment) as well as Anthropic's native API, selected purely by environment configuration, so the institution is not coupled to a single AI vendor and can keep athlete data on-premises if required. Ingestion follows a two-step confirm-before-commit flow: the extraction result is first presented to the operator as a preview, and only on explicit confirmation is the database updated. When no AI provider is configured, the PDF path disables itself and the validated Excel path remains fully functional.

Also confirm §5.1 presents the **personalised composite risk model** (vulnerability-adjusted ACWR thresholds + escalation), not plain Gabbett banding — this is the graded differentiator.

## R8 · Chapter 7 Conclusion

- Mention AI-assisted ingestion among delivered capabilities (one clause is enough).
- Optional single future-work sentence for the coach experiment: *"Future iterations may explore a read-only coaching view that surfaces squad-level readiness derived from the same risk model, subject to stakeholder validation of the additional role."* Do **not** present coach as a shipped role.

## R9 · References

Add (locked decision — the body-map asset attribution must appear):

> Shehryar, S. (2023). *react-muscle-highlighter* [Computer software]. MIT License. https://github.com/soroojshehryar/react-muscle-highlighter — anatomical path data adapted for the AIRMS body-map component.

## R10 · Slides checklist (54-page deck)

1. Tech-stack slide(s): **MongoDB → MySQL** (deck predates the migration; the FYP II panel deck already claims the migration is resolved — the main deck must not contradict it)
2. Module 4 / requirements slides: dual-path ingestion + backup (mirror R1/R4); update the "33 use cases" count
3. Comparison slide: updated Bulk Data Import cell (R5)
4. Diagram slides: mirror R6, including the p. 38 mislabel
5. UC-2 reset-password roles: align with report (all three roles) — existing punch item
6. Sprint count: align with report (R2)
7. Consider 1–3 new screenshots: PDF uploader, the dashboard's HoloMotion screening panel (tier-ticked gauges + threshold strips), sport-critical alert banner

---

*Created 2026-07-03 from the deliverables-shift review. Verify each item against the current Word draft — the repo PDF this was diffed against is the pre-refresh 51-page draft.*
