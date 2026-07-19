# FYP I Viva — Question & Answer Bank

Answers grounded in `docs/MASTER_CLARIFICATIONS.md`, `docs/DESIGN_DECISIONS.md`, `docs/MODULES_STATUS.md`, `docs/FYP_RUBRICS.md`, and the locked viva script (`docs/fyp/VIVA_SCRIPT.md`). Keep answers tight in viva; the rationale column gives you 1–2 sentences to expand if the panel pushes.

---

## 1. Introduction & Stakeholder (Slides 3, 50–51)

| # | Question | Answer |
|---|---|---|
| 1 | Why ISN and not a local sports club / university team? | ISN is the national elite sports institute under the Ministry of Youth & Sports — they run PODIUM and PELAPIS programmes for Malaysia's international-level athletes. Building for elite-tier needs gives the system clinical and operational seriousness that a club setting cannot match, and the data governance is more representative of a real production environment. |
| 2 | Who is Dr Thung and what was his exact role? | Dr Thung Jin Seng is the ISN representative — domain stakeholder and requirement signatory, not co-developer. He gave problem framing, ranked features (admin holistic + medical per-athlete, age-group filters, prevention insight), and signed the collaboration letter. He validates outputs; the engineering decisions are mine. |
| 3 | Why "dual-dashboard" rather than one configurable view? | Admin and medical have fundamentally different jobs: admin makes policy decisions across the cohort (epidemiological framing per Sprouse 2024 and the IOC/STROBE-SIIS lineage), medical makes clinical decisions for one athlete at a time. The information density, filters, and affordances differ — one configurable view would be a worse fit for both. |
| 4 | Inherited HTML prototype — what kept, what discarded, why? | Kept: visual layout, brand colours, page-level component composition (sidebar, topbar, card structures) since Shewin/Keying's UX was already approved by Dr Thung. Discarded: all static HTML, mock data, and standalone pages — replaced with a Next.js App Router app, real REST API, a MySQL relational schema via Sequelize, JWT auth, and the composite risk model. |
| 5 | Without ISN, would the project still be defensible academically? | Yes — the composite risk model is the FYP innovation and stands on Inoue/Yang/Qin/Gabbett evidence regardless of the deployment site. What ISN adds is *real* operational requirements and stakeholder validation, which lifts the work from "plausible prototype" to "stakeholder-grounded artefact." |

## 2. Problem Statement (Slide 4)

### PS1 — Absence of dedicated injury tracking

| # | Question | Answer |
|---|---|---|
| 1 | Concrete example of "fragmented records and manual processes"? | ISN currently uses Excel spreadsheets distributed across medical staff, with no central system tracking longitudinal injury history per athlete. Re-uploads overwrite; there is no audit trail or athlete-facing visibility. |
| 2 | Why a web-based centralised system rather than better spreadsheets? | Spreadsheets cannot enforce RBAC, do not produce role-specific dashboards, cannot drive workload computations in near-real-time, and offer no multi-stakeholder review workflow (Costello 2024 highlights this). A web platform is the minimum architecture that supports the three problems together. |
| 3 | How is the evidence stronger than "ISN says so"? | Costello et al. (2024)'s scoping review surveyed surveillance systems globally and documents the same gap across multiple institutions — so ISN's situation is not idiosyncratic, it is the international baseline that Costello documents. |

### PS2 — Lack of workload monitoring

| # | Question | Answer |
|---|---|---|
| 4 | Why ACWR specifically — not weekly load, monotony, strain? | ACWR (acute:chronic ratio) captures *relative* change against an athlete's own baseline — Qin et al. (2025) finds spikes outside the 0.8–1.3 band carry the highest incidence and are the strongest predictor. Absolute weekly load misses that; monotony/strain are complementary but not as well-evidenced for time-loss injury association. |
| 5 | Was Qin et al. supportive of ACWR as a predictor? | Cautiously supportive — the meta-analysis confirms ACWR is associated with injury risk and quantifies the 0.8–1.3 band as lowest incidence (56%), while flagging heterogeneity in calculation methods. I cite it as evidence ACWR is meaningful, not as a magic predictor — that's why AIRMS *adds* personalisation and escalation. |
| 6 | Isn't "no data-driven basis" overclaiming when a coach can read a spreadsheet? | A coach reading a spreadsheet is exactly the failure mode — it relies on individual recall, has no rolling-window mathematics, and isn't visible to the athlete. The problem isn't impossibility, it's lack of a systematic, role-shared, computed view. |

### PS3 — Lack of centralised admin analytics

| # | Question | Answer |
|---|---|---|
| 7 | Why is structured data the bottleneck — not analyst time or politics? | Without structured data you cannot filter, aggregate, or trend at all — analyst time is moot. Sprouse et al. (2024), extending the IOC/STROBE-SIIS consensus lineage, frames standardisation as the precondition for any epidemiological analysis. Politics is downstream. |
| 8 | How does Sprouse (2024) prove this is a real gap, not just convenience? | Sprouse et al. published a "framework for all" precisely *because* the prior IOC/STROBE-SIIS standard was elite-leaning and under-implemented across the wider participation spectrum. A 2024 follow-up framework exists only when the earlier standard remained a real gap in practice. |
| 9 | What does the dashboard unlock that weekly meetings cannot? | Filtered ad-hoc analysis (e.g. lower-body injuries in PODIUM females under 21, last quarter), reproducible PDF reports for management, and trend identification at quarter/year scale that meeting minutes never aggregate. |

## 3. Objectives (Slide 5)

| # | Question | Answer |
|---|---|---|
| 1 | Mapping each objective to which problem(s)? | Obj 1 (requirements via ISN) underpins all three. Obj 2 (centralised platform with role dashboards) directly addresses PS1+PS2+PS3. Obj 3 (evaluate effectiveness/usability) closes the loop for all three by validating the build was useful. |
| 2 | Evidence artefact for Objective 1? | Signed collaboration letter (Prof. Nor Liyana, Dr Hoo, Dr Thung), the 2026-04-24 stakeholder meeting transcript, the requirements traceability matrix (`MODULES_STATUS.md` final table mapping Dr Thung's asks to system locations). |
| 3 | Which integration target in Objective 2 is hardest? | The Athlete Dashboard / Workload module — it integrates activity load (Module 1), screening data (Module 4), injury history (Module 3), via the composite risk model. Difficulty is visible in `frontend/src/lib/risk.ts` — the only file with non-trivial decision logic. |
| 4 | Evaluation is FYP II — why claim it as an FYP objective now? | FYP I and II are graded as one project; objectives must span both. The evaluation instrument (TAM/SUS + ISN UAT) is already planned, and partial heuristic evaluation already informed Module 6's prevention insight card. |
| 5 | Are the objectives SMART? | Specific (each names the artefact); measurable (Obj 1 = signed letter + interview minutes, Obj 2 = number of modules + use-case coverage, Obj 3 = UAT score + usability score); achievable (six modules functional); relevant (each ties to a PS); time-bound (FYP I/II semesters). |

## 4. Literature Review (Slides 6–11)

### Qin et al. (2025)

| # | Question | Answer |
|---|---|---|
| 1 | What evidence level does a systematic review and meta-analysis carry vs. RCT, and why is it right here? | Level I — a meta-analysis of 22 cohort studies sits at the top of the evidence hierarchy alongside RCTs. It is *more* appropriate than a single RCT here because injury prediction is multi-factorial; a pooled synthesis across team sports is more generalisable to ISN's multi-sport cohort than any one trial. |
| 2 | ACWR critics (Impellizzeri 2020) — how do you defend continued use? | I don't claim ACWR is causal — I use it as a *flag* for disproportionate workload, which the critics still acknowledge. Qin's 2025 meta-analysis re-confirms the 0.8–1.3 sweet spot empirically. The composite model layered on top is *exactly* the response to ACWR's known limitations: personalised thresholds + escalation by injury/biomechanical context. |
| 3 | What's the meaningful unit window — 7-day acute / 28-day chronic — why? | This is the Gabbett-standard pairing: 7 days captures fatigue accumulation, 28 days approximates current fitness. Shorter chronic windows over-react to noise; longer ones lag real fitness changes. |
| 4 | Coupled vs uncoupled ACWR — which do you use, defensible? | AIRMS uses *coupled* ACWR (acute included in chronic). Uncoupled is statistically cleaner but introduces a delay; coupled matches Gabbett's original published method and what most applied practitioners use. Qin (2025) reports coupled is the dominant method (95% of pooled studies). |

### Costello et al. (2024)

| # | Question | Answer |
|---|---|---|
| 5 | Why a 2024 scoping review — gap in earlier reviews? | Costello synthesises post-COVID surveillance practice when many institutions moved to digital tools, so it captures the multi-stakeholder digital workflow patterns that earlier reviews predate. |
| 6 | Which module translates Costello to code, and where? | Module 3 — the self-report → review → approve/reject → promote-to-Injury flow lives in `backend/src/routes/selfReports.js` (review endpoint promotes a SelfReport into an Injury document). |
| 7 | Why three review states (Pending/Approved/Rejected), not two or four? | Three is the minimum that preserves clinical accountability: Pending = athlete submitted, Approved = clinician validated and promoted, Rejected = clinician declined with note. Two collapses accountability; four (e.g. "Under Review") adds workflow friction without changing outcomes. |

### Sprouse et al. (2024)

| # | Question | Answer |
|---|---|---|
| 8 | STROBE-SIIS in plain language — which fields come from it? | STROBE-SIIS is the standard reporting framework for sports injury studies — what data variables every report should capture. Sprouse (2024) inherits and operationalises these for non-elite settings. From it I take: body part, side, injury type, mechanism, severity, date, and recovery status — all of which are columns in the `injuries` table (`backend/src/models/Injury.js`). |
| 9 | Does the Injury schema fully meet STROBE-SIIS? Defend omissions. | Core variables yes. Omitted for FYP scope: exact session in which it occurred (we have date), exposure hours denominator (would require attendance tracking — out of scope), and clinician identifier (we have logging user but not credentialing). All are FYP II extensions. |
| 10 | Sprouse is a framework paper, not primary research — why is it good evidence? | Sprouse explicitly extends the IOC/STROBE-SIIS consensus lineage and aggregates implementation experience across participation levels. For a *standardisation-plus-operationalisation* problem (PS3), a 2024 framework built atop the field's authoritative consensus is the strongest possible evidence. |

### Inoue et al. (2022) + Yang et al. (2024) — sRPE cluster

| # | Question | Answer |
|---|---|---|
| 11 | Why two papers instead of one for session load — does the sRPE method really need that much support? | sRPE is decades-old; one recent citation could look thin. Two papers cover the two axes that matter for institutional use: Inoue (2022) validates *scale reliability* (athletes interpret CR-10 consistently with coaches), and Yang (2024) validates *physiological correspondence* (sRPE tracks HR-TRIMP). Together they justify continued use without leaning on the original 2001 paper. |
| 12 | Has sRPE been validated for *your* athletes? | Not within FYP I (no labelled outcome data). I rely on construct validity: Inoue (2022) and Yang (2024) both confirm the method generalises across sports and competitive levels, and applying it the same way (Duration × RPE) inherits that validity. Local re-validation is an FYP II evaluation activity. |
| 13 | RPE 1–10 — why not Borg 6–20 or CR-10? | The published session-RPE method uses a 0–10 modified Borg CR-10 — I use 1–10 to avoid zero-load entries that would produce zero AU. This is consistent with how most ACWR studies (including those pooled in Qin 2025) operationalise it. |

### Across all four

| # | Question | Answer |
|---|---|---|
| 14 | Why four review clusters — not five or three? | Each maps cleanly to one piece of the system: sRPE cluster (Inoue + Yang)→load metric, Qin→ACWR justification, Costello→surveillance architecture, Sprouse→data standardisation. Gabbett (2016) is referenced in `DESIGN_DECISIONS.md` but not in the slide review because Qin's 2025 meta-analysis already synthesises that lineage. |
| 15 | No CS / SE / HCI papers in the review — defend. | The FYP innovation is sport-science clinical logic, not a software-engineering novelty. The CS contribution is integration (combining workload + screening + injury into one explainable classification). The four review clusters ground the *what*; the engineering is the *how*, evidenced by the working system. |
| 16 | Four-way map: cluster → problem → module → defence in one breath. | sRPE cluster (Inoue + Yang) → PS2 → Module 1 (Activity load). Qin → PS2 → Module 2 (ACWR bands). Costello → PS1 → Module 3 (multi-stakeholder review). Sprouse → PS3 → Module 5 (standardised analytics variables). |

## 5. Existing Systems Comparison (Slides 12–16)

| # | Question | Answer |
|---|---|---|
| 1 | Why Kitman/Teamworks/Catapult/ATS specifically? | They are the four most-cited commercial platforms in elite-sport injury management — covering the four orthogonal positions: workload-only (Kitman), config-heavy (Teamworks), hardware-led (Catapult), injury-only (ATS). They span the feature space we compete in. |
| 2 | Is comparing across six features fair when competitors don't target all six? | Yes — the six features are the *functional requirements ISN expressed*, not features AIRMS chose to win on. The comparison shows that no single commercial system meets all of ISN's needs, justifying a bespoke build. |
| 3 | What if ISN later wants Catapult device integration? | The architecture absorbs it cleanly: `Activity` schema already separates `duration` and `intensity`, so an HR/TRIMP-derived intensity would slot in as an alternative computation; the load formula stays in `backend/src/models/Activity.js` pre-save hook. |
| 4 | Have you used the competitor systems hands-on? | Comparison is based on vendor documentation and published reviews — I have not signed up for any. Stated transparently in the report; the comparison is on documented feature presence, not UX subjective rating. |
| 5 | Is "Excel upload with validation" a research-worthy axis? | Not research-worthy in itself — but ISN explicitly listed Excel as their preferred data inflow (their current workflow). It is a competitive axis because most enterprise platforms force proprietary import formats, which is a real institutional barrier. |
| 5a | Has the bulk-import axis changed since the comparison was drawn? | Strengthened — AIRMS now ingests ISN's actual screening artefact, the image-only HoloMotion report PDF, via AI-assisted extraction with confirm-before-commit, batch-capable with athlete name-matching. None of the four compared systems can ingest an image-only clinical PDF; they all require structured exports, proprietary formats, or wearable telemetry. The interim Excel import was retired once the PDF path superseded it (code archived; Excel backup export retained). |

## 6. Methodology (Slides 17–18)

| # | Question | Answer |
|---|---|---|
| 1 | Why Agile, not Waterfall for an FYP? | ISN's data was still being cleaned when development began, so requirements were known to evolve (e.g. Dr Thung's "by age group" + "prevention insight" asks emerged in the 2026-04-24 meeting after Sprint 1). Agile iteration absorbed this; Waterfall would have frozen the wrong baseline. |
| 2 | What shipped in each sprint? | Sprint 1 (Sem 1): Modules 1+2 + auth + core schema. Sprint 2 (Break): Module 3 self-report flow + Module 5 analytics + PDF generation. Sprint 3 (Sem 2 — in progress): Module 6 prevention insight + Module 4 ISN format lock + audit fixes. |
| 3 | Evidence of iteration — a user story that changed shape? | Module 5 filter strip — initial design had sport+gender+date only. After Dr Thung's 2026-04-24 ask for "age group" and "body region (upper/lower)", filters expanded to 8. An upper/trunk/lower chip row was prototyped on top of that, but a later UX review removed it: the 10-option body-part dropdown already covered every region query and the chips were visual clutter that paid no analytical dividend. That iteration loop — add, evaluate, remove — is the story. |
| 4 | Has ISN signed off via UAT? | No — UAT and effectiveness evaluation are Objective 3, FYP II deliverables. ISN have validated requirements; usability/effectiveness sign-off is the next phase. |
| 5 | Agile vs fixed FDD — contradiction? | The FDD names the *modules*; the use cases within them are what iterated. Module count is the scope ceiling (a stakeholder contract); module *content* is Agile. This is roughly how Scrum scope-locks epics while iterating stories. |

## 7. Functional Requirements (Slides 20–26)

### General Module (UC-1 to UC-3)

| # | Question | Answer |
|---|---|---|
| 1 | UC-2 Reset Password — works today? | Yes, fully. The flow uses a 6-digit OTP delivered by email and is presented as a three-page sequence in one browser tab: `/forgot-password` (email entry) → `/verify-otp` (code entry) → `/reset-password` (new password). `POST /api/auth/forgot-password` generates the code with `crypto.randomInt`, stores its SHA-256 hash with a 10-min TTL, resets the attempt counter, and sends the code via env-driven SMTP. `POST /api/auth/verify-otp` verifies the code (5-attempt cap, invalidates on lock-out) and on success swaps in a 32-byte verification token (SHA-256 hashed, 5-min TTL) returned to the client. `POST /api/auth/reset-password` consumes that verification token + new password — the OTP itself never travels in the reset payload. Open to all three roles. |
| 1a | Why OTP rather than a link in the email? | Single-tab UX. A link-based flow opens a second tab when the user clicks it, leaving the original forgot-password tab orphaned and creating a cross-tab synchronisation problem. An OTP brings the entire flow into one tab — the user reads the code from their email, returns to the original page, and enters it. Same security guarantees (hashed at rest, single-use, time-limited), simpler mental model, no cross-tab signalling required. |
| 1b | Why three pages? Why not just one wizard? | Separation of concerns. Each page has exactly one responsibility — collect an email, verify a code, set a password. That makes the URL state meaningful (you can tell from the address where the user is in the flow), the route guards stricter (each page can refuse direct navigation if its prerequisites aren't met), and the failure modes localised (an expired verification token bounces from step 3 back to step 1 without affecting the other pages). It also matches how users mentally model the flow — get code, verify code, change password — three discrete decisions. |
| 1c | Where does the verification token live between step 2 and step 3? | In `sessionStorage`, scoped to the same browser tab. Deliberately not in the URL, so it doesn't leak into the browser history or any logs that capture `Referer` headers. `sessionStorage` clears automatically when the tab closes, and the server-side TTL of 5 minutes means a stolen `sessionStorage` snapshot has at most that long to be useful. The same XSS exposure as the JWT we already store in `localStorage`, so no new threat surface. |
| 1d | Why does the login error say "doesn't match an active AIRMS account" instead of "wrong password"? | The wording is deliberately generic and identical across "no such email" and "wrong password" cases. If we said "wrong password" we'd implicitly confirm that the email exists, letting an attacker probe `/auth/login` with arbitrary emails to enumerate valid AIRMS accounts. The friendlier wording preserves the no-enumeration property while reading less hostile than a stock "Invalid credentials". Same defensive posture as the forgot-password endpoint. |
| 2 | Did you also add an in-place change password? | Yes — `POST /api/auth/change-password` lets a logged-in user rotate without leaving the app. Surfaced inline on `/athlete/profile` and as a modal on the medical/admin profile pages. Requires the current password (so an unattended session can't be hijacked into rotation) and clears any outstanding email-reset token on success. |
| 3 | Password policy — what enforces it? | 10 characters minimum, must contain uppercase, lowercase, digit, and symbol. Defined in `backend/src/utils/passwordPolicy.js` and mirrored at `frontend/src/lib/passwordPolicy.ts` so the form renders an inline checklist as the user types. Validated again server-side as defense in depth. |
| 4 | Why SHA-256 hash on the code, not bcrypt like the password? | Reset codes are short-lived (10 min) and the brute-force surface is locked down by a 5-attempt cap on the user row — bcrypt's per-check work-factor would only slow down the legitimate user without adding meaningful security. SHA-256 of the code is enough at rest because a DB compromise leaks no code that can be tried more than 5 times. Passwords get bcrypt because they're persistent and users pick low-entropy values, so the work-factor matters against offline brute force. |
| 5 | What stops user enumeration via the forgot-password endpoint? | Same response in every case: `"If an account exists for that email, a password reset link has been sent."` The endpoint never reveals whether the email matched. Mail send is fire-and-forget so timing analysis can't differentiate either. |
| 6 | Why RBAC as a use case rather than NFR? | RBAC is functional because it determines *which features each actor can invoke* — it is enforced at every protected route and shapes the UI. NFRs (in our taxonomy) are quality attributes. We list NFR-Security as the *property* RBAC delivers. |
| 7 | Why these roles — where does the coach fit? | FYP I shipped **three** roles — the operational core of ISN's workflow: athletes self-log, medical staff clinically review, admin runs cohort analytics. **FYP II promotes a fourth, read-only `coach` role**, scoped to one sport: a squad-readiness board (Full-Go / Observation / Restricted derived from the *same* cohort-normed band the medical team sees), team-report download, and read-only athlete screening detail. It deliberately adds **no clinical authority** — a coach can't override bands, log injuries, or upload — so the medical team stays the gatekeeper and the graded risk models are untouched. It's a real ISN need (Dr Thung's own vision deck has a "Squad Readiness: Coaching Overview" slide). Adding roles *beyond* these four would be a further scope decision. |
| 8 | What SMTP provider does the demo run against? | Gmail with a 2FA app password. The mailer is env-driven, so dropping in Mailtrap or SendGrid credentials switches providers without code changes. When `SMTP_HOST` is unset the mailer falls back to a console transport that prints the email body to the backend terminal — so the system runs end-to-end without any credentials, which is useful for development. |
| 9 | Beyond role-level RBAC, any finer-grained access control? | Yes — admin-controlled per-user feature permissions for medical staff: `viewRecords`, `uploadData`, `reviewReports`, `injuryReports` can each be revoked per staffer, and accounts can be deactivated entirely. Opt-out model (everything granted unless revoked), enforced server-side by `requirePermission()` on every affected route and mirrored in the UI so a revoked feature disappears from the sidebar. Athlete and admin roles are never constrained by this layer. |
| 10 | Why opt-out permissions rather than opt-in? | Default-permissive matches ISN's trust model — medical staff are credentialed employees, so the control exists for exceptions (probation, offboarding, scoped contractors), not default restriction. Opt-in would have broken every existing account the day it shipped. |

### Activity Tracking (UC-4 to UC-8)

| # | Question | Answer |
|---|---|---|
| 4 | Why persist `load = duration × intensity` instead of computing on read? | Two reasons: (1) ACWR aggregations are query-heavy and computing-per-read would scan every activity; (2) persisted load lets us snapshot historical load even if the formula evolves. Computed in a Sequelize `beforeValidate` hook in `backend/src/models/Activity.js`. |
| 5 | What stops gaming via back-dated entries? | Front-end form blocks future dates; backend validates date is not in the future. Historical back-dating within reason is allowed (athletes do catch up after a missed day), which matches sport-science practice. |
| 6 | External load logged anywhere? | No — sRPE is internal load by design (DESIGN_DECISIONS §1). External load requires hardware ISN doesn't universally have. Explicit scope decision. |

### Athlete Dashboard / Workload (UC-9 to UC-12)

| # | Question | Answer |
|---|---|---|
| 7 | Is the composite-risk personalisation a use case or hidden inside UC-11? | It is *the system extension* of UC-11. Splitting it into its own UC was considered; we kept it inside UC-11 because it is the rule-set's mechanism, not a separate user-invoked action — the user invokes "show risk", the system internally applies personalisation. |
| 8 | Why tuck the differentiator inside UC-11 then? | Because UC-11 is *risk classification* — that's the natural home. Pulling it into a separate UC would make it look like a parallel feature rather than the implementation strategy for UC-11. The slide deck and report both call this out explicitly to ensure the panel sees it. |

### Injury & Recovery Logging (UC-13 to UC-19)

| # | Question | Answer |
|---|---|---|
| 10 | When self-report → Injury, what happens to the SelfReport? | It is preserved with `status: 'Approved'` and a new row is inserted into the `injuries` table. Both writes happen inside a single `sequelize.transaction()` so the SelfReport status update and the Injury insert either both commit or both roll back. The promotion is additive — we never delete the source — which preserves the audit trail (important for clinical accountability per Costello 2024). |
| 11 | Is UC-16 deletion hard delete? GDPR/PDPA concerns? | Currently a hard `DELETE` from the MySQL `injuries` table. For FYP I this is acceptable as a research prototype; a production deployment at ISN would use soft delete + retention policy to comply with Malaysia's PDPA. Acknowledged limitation. |
| 12 | UC-14 says "update recovery status" but recovery milestones are deferred — reconcile? | The boolean-ish `recoveryStatus` (Recovering / Recovered / Chronic) is editable today — that *is* UC-14. What's deferred is the richer milestone schema (acute → sub-acute → return-to-play), which awaits Dr Thung's standardised phase definition. |

### Data Management — Excel + HoloMotion PDF ingestion + backup

| # | Question | Answer |
|---|---|---|
| 13 | Why two-step preview → commit? | Validating without committing protects the database from partial bad uploads and lets the user see the result before deciding. Same pattern on both ingestion paths; on the PDF path the commit endpoint accepts the previewed JSON, so the vision model is called exactly once per upload — no double spend. |
| 14 | Why replace the Excel path with PDF ingestion? | Because Excel was never ISN's real artefact — Dr Thung's screening workflow produces a per-athlete HoloMotion report PDF. The Excel path forced someone to transcribe that report by hand. The PDF path was introduced alongside Excel, then Excel was retired once the PDF path became strictly superior: it batch-imports a whole squad's reports, auto-matches athletes by the printed name, and covers Excel's only remaining advantage (bulk entry). The removed code is archived, and the Excel backup *export* remains. |
| 14a | Batch import on a free-tier vision model — how do you avoid rate limits? | Extraction runs sequentially with 3-second spacing between files — one vision call per report, comfortably inside free-tier requests-per-minute limits — and committing costs no calls at all (the previewed JSON is replayed). A 20-report squad batch is ~20 calls over ~1 minute. |
| 15 | The HoloMotion PDF has no text layer — how do you read it? | Verified: the report is jsPDF-generated pure graphics — pdf-parse and pdfjs both extract zero characters, and free OCR misses the numbers inside the circular gauges, which are the most important values. So the backend renders the report pages to images (pdfjs + a prebuilt canvas binding) and sends the data-bearing sections to a vision-capable AI model with a strict JSON extraction prompt. |
| 16 | An AI model in a clinical data pipeline — how do you control hallucination? | Human-in-the-loop by construction: extraction always lands in a preview the operator verifies before anything is written; temperature 0; the prompt instructs "use null for anything unreadable, never guess"; and the commit writes the previewed JSON, not a second model call. A bad extraction costs one retry — it can never silently write a wrong row. The operator also supplies the identity fields (Athlete ID, sport, programme) so the model never guesses who the data belongs to. |
| 17 | What does an extraction cost — is this affordable for ISN? | The pipeline crops each page to its data-bearing bands (measured against a real ISN sample) instead of sending whole pages — roughly 58% fewer image tokens, on top of never rendering pages 4–12 (angle-trajectory charts we don't persist). On a small vision model an extraction costs fractions of a cent. `VISION_FULL_PAGES=1` falls back to whole pages if HoloMotion ever shifts its template. |
| 18 | Vendor lock-in / NDA data privacy — athlete PDFs to a US cloud? | Provider-agnostic by design: one OpenAI-compatible wire format covers OpenAI, Gemini (free-tier keys work), Qwen, OpenRouter, and a fully local Ollama; Anthropic's native format is also supported — switched purely by env vars, zero code change. For NDA-sensitive production ISN can run a local vision model so athlete reports never leave the premises. With no provider configured the PDF path self-disables cleanly and Excel continues to work. |
| 19 | Earlier drafts mentioned an import history log and batch delete — where are they? | Descoped deliberately, and the artefacts were corrected to match: re-upload upserts by `athleteId` (latest wins), which is the versioning behaviour ISN actually needs, and the admin instead gained a full **Excel backup export** (multi-sheet workbook: athletes + injuries + muscle flags) — a better answer to "can we get our data back out". Claims and build now match one-to-one. |
| 20 | Muscle-flag columns were "awaiting ISN exports" — what happened? | Superseded by the pivot: the HoloMotion report itself is the canonical source. The vision path reads the Myodynamia Deficiency and Muscle Tension lists straight into `muscle_flags` rows (replaced wholesale per import), so the Excel column-lock dependency disappeared. |

### Admin Analytics (UC-24 to UC-27)

| # | Question | Answer |
|---|---|---|
| 16 | Why pdfkit streamed, no temp files — what if it fails mid-stream? | Streaming keeps memory bounded and avoids disk cleanup. If generation fails mid-stream, the HTTP response simply ends; the client gets a truncated download and an error toast. No partial server state to clean up — that is the upside of statelessness. |
| 17 | UC-26 monthly/quarterly/yearly — count or incidence rate? | Currently count. Incidence rate per 1000 athlete-hours requires exposure denominators (attendance) which we don't yet store. Count is the rubric-meeting minimum; rate is an FYP II extension Dr Thung has flagged interest in. |

### Medical Dashboard (UC-28 to UC-33)

| # | Question | Answer |
|---|---|---|
| 18 | UC-33 mirrors athlete dashboard — clinical justification? | Dr Thung explicitly asked for "trace through" — the clinician should see exactly what the athlete sees so consultations align on the same picture. Adding clinical affordances (Log Injury deep-link, prevention insight) without removing athlete-facing detail is the design principle. |
| 19 | UC-32 — what's the cohort baseline? | Aggregated injury distribution within the selected athlete's sport, computed live from the Injury collection at view time. It's a comparison context, not a statistical model — explainability over sophistication. |
| 20 | Where do users actually *see* the ingested HoloMotion data? | Directly on the dashboards — the athlete and medical dashboards embed a shared screening panel: five tier-ticked score gauges, the eight indicators as threshold strips (OK / Watch / High zones with the athlete's value marked and sport-critical regions starred), the muscle-flag chips, plus the body map. There is deliberately no separate screening page — the dashboard is the working surface, so the report lives where decisions are made. |

## 8. Non-Functional Requirements (Slide 27)

| # | Question | Answer |
|---|---|---|
| 1 | Only Security + Usability — what about Performance, Reliability, Maintainability, Portability? | Performance is met implicitly (indexed MySQL queries on `athlete_id` + `date`, sub-second dashboard loads on seed data) but not a graded objective. Reliability/Maintainability/Portability fall under standard software engineering practice — addressed in code organisation (modular components, TypeScript, env-driven config) but not enumerated because the rubric weights them under Technical Implementation, not NFR. |
| 2 | RBAC client + server — why duplicate? | Backend is the *security* boundary (cannot be bypassed). Client gating is *UX* — preventing a user from clicking through to a page that would 403 anyway. Both are needed; only the backend is the trust boundary. |
| 3 | "No steep learning curve" — how do you measure? | Not measured in FYP I — it is a design intent. FYP II evaluation will use SUS (System Usability Scale) with ISN users, which yields a defensible numeric score. |

## 9. Analysis & Design (Slides 29–40)

| # | Question | Answer |
|---|---|---|
| 1 | Why exactly six modules — not five or seven? | Five would force merging Medical Dashboard with Admin Analytics, which have different actors and different data scopes (per-athlete vs cohort) — collapsing them blurs RBAC. Seven would split something cohesive (e.g. injury logging vs self-report review), but they share the same data model and review workflow, so they belong together. |
| 2 | Most coupled module — could it ship independently? | Module 2 (Athlete Dashboard) — depends on Module 1 (load), Module 3 (injuries), Module 4 (screening). It is intentionally coupled because it is the integration showcase. It cannot ship independently, which is the *point*. |
| 3 | Why one UC diagram per module, not one system-level? | Module-level diagrams are readable at slide size and aligned with FDD decomposition. A single system-level UC diagram with 33 use cases across 3 actors is unreadable in slides and dilutes the actor-feature mapping. |
| 4 | Athletes + medical in Module 3 — extends / includes? | Approving a Self-Report **«include»**s the Log Injury use case (UC-18 includes UC-13's outcome). No extends — both review-approve and review-reject share the same review action with branched outcomes. |
| 5 | User → role tables — table-per-type or single-table? | Single `users` table with a `role` column, plus a separate `athletes` table with `athleteId` as the canonical cross-table FK. It's a hybrid: shared identity in `users`, role-specific data in `athletes`. The User → Athlete link is kept as a soft column reference rather than a strict FK so the seeder can populate either table first without ordering pain. |
| 6 | SelfReport → Injury promotion — 1:1 or 0..1? Double-approval handling? | 0..1 (a SelfReport may never be approved). Once a SelfReport has status Approved with a linked Injury, the review endpoint refuses re-review — enforced server-side in `selfReports.js`. |
| 7 | Why `athleteId` (VARCHAR) as PK / FK instead of an integer surrogate? | ISN already issues athlete IDs ("ATH0001") — using their canonical identifier as the primary key means CSV uploads, PDF reports, and external references all use the same key the institution uses. The MySQL schema sets `athletes.athlete_id` as PRIMARY KEY and uses it as the FK on `activities`, `injuries`, `self_reports`, and `muscle_flags`. |
| 8 | Data-import validation — client, server, or both? | Both, with server as the source of truth. Client provides immediate feedback (drag-drop validation, file-type check). Server (Multer + parser) re-validates everything because client validation is never trustable. |
| 9 | Self-report approved when athlete account deleted? | UI prevents this (medical sees the athlete name when reviewing). At schema level, athlete deletion would orphan the SelfReport — handled by an FYP II cascade-delete policy. Acknowledged limitation. |
| 10 | Why is PDF an extension flow in the activity diagram? | The main flow is "view analytics" — PDF is an *optional* action a subset of users take. UML extension semantics fit: a triggering condition (user clicks Generate PDF) branches into an alternate path. |

## 10. UI Design (Slides 41–47)

| # | Question | Answer |
|---|---|---|
| 1 | Why split branded card on login — beyond "Figma"? | Establishes institutional brand identity before authentication (left panel = AIRMS+ISN), separates branding from interaction (right panel) — a documented UX pattern for institutional/clinical apps. |
| 2 | Single `[data-theme="dark"]` attribute — accessibility? | Toggles a single CSS variable set so colour contrasts swap atomically with no FOUC. Accessibility comes from the underlying choice of contrast-compliant colour pairs in both modes — not from the toggle mechanism itself. |
| 3 | Composite risk first, body map second — cognitive load justification? | Risk is the *answer* the athlete came for ("am I in danger?"). Body map is the *explanation* ("which muscles to watch"). Fitts' law and primacy effect: put the answer first, supporting detail below. |
| 4 | Medical view = athlete view + affordances — won't clinicians find it noisy? | Dr Thung explicitly preferred this — clinicians need to see what the athlete sees during consultations. Affordances (deep-link Log Injury, prevention insight) are additive, not replacement. Validated in the 2026-04-24 stakeholder meeting. |
| 5 | Risk band colours — colour-blindness considerations? | Risk bands also carry textual labels (Low / Optimal / Elevated / High Risk), the chart bars have distinct heights, and the radar surfaces both colour and numeric value. Colour is supportive, not sole carrier — meets WCAG 1.4.1. |

## 11. Technical Implementation (Slide 48)

| # | Question | Answer |
|---|---|---|
| 1 | Next.js over React+Vite SPA — no SSR used? | Filesystem routing maps onto the role-based URL hierarchy with zero config; layout sharing via App Router; TypeScript-first defaults; future-proof if SSR/Vercel deploy is added. Vite SPA would have required hand-rolling routing and layout. |
| 2 | Node/Express over Fastify/Nest/FastAPI? | Express is the most familiar Node framework for academic audiences and has the densest middleware ecosystem (Multer, Sequelize, jwt). Fastify is faster but adds learning curve cost without functional gain at FYP scale. Nest/FastAPI add framework opinionation that's overkill for ~30 endpoints. |
| 3 | MySQL vs PostgreSQL for clinical data? | Both are reasonable. MySQL was chosen because it matches ISN's production environment — Dr Thung confirmed the institute standardises on MySQL — so the deployed artefact matches the target stack without translation. Postgres would have offered richer JSON column support but at the cost of a future translation step. Both engines provide the FK constraints and ACID transactions a clinical-record system needs. |
| 4 | JWT in localStorage — XSS risk? Mitigation? | Honest acknowledgement: localStorage is XSS-readable. Mitigation is that the app is an internal clinical tool with controlled user pool, React naturally escapes user content, and we don't render `dangerouslySetInnerHTML` anywhere. Production deployment would migrate to httpOnly cookies + CSRF. |
| 5 | No automated test suite — defend. | Confidence comes from TypeScript schema alignment, Sequelize model validation, engine-level FK constraints, manual verification through three role flows with seeded deterministic data (seed=42), and audit-driven fixes on Modules 1+2. Adding Jest for FYP I would yield brittle UI tests of limited grading value. FYP II evaluation phase will add integration tests where they protect deployment. |
| 6 | Chart.js over D3/Recharts/ECharts? | Chart.js: low ceremony, built-in responsive canvas rendering, React wrapper (react-chartjs-2), no need for D3's data-binding paradigm. We render bars + lines + radar — all stock Chart.js patterns. D3 would be over-engineering. |

## 12. Composite Risk Model — The FYP Differentiator

| # | Question | Answer |
|---|---|---|
| 1 | Walk through classifyCompositeRisk() for a sport scientist. | Step 1: compute vulnerability from screening (injury risk index, overall activity score, mobility, stability, symmetry — each normalised, summed with explicit weights). Step 2: modify Gabbett's thresholds ±~15% inversely proportional to vulnerability (vulnerable athletes get tighter bands, robust athletes get wider bands). Step 3: classify ACWR against personalised thresholds. Step 4: escalate band one step if active injuries or muscle flags align with current load. Output: band + explanation chips. |
| 2 | Why ±15% — not 10 or 20? Sensitivity analysis? | 15% is intentionally small — it personalises without contradicting Gabbett's well-established baseline (an athlete at median vulnerability sees almost exactly the textbook numbers). Larger would imply we know better than the literature; smaller would be cosmetic. Sensitivity analysis is FYP II calibration work. |
| 3 | Are the five screening factors equally weighted? | No — they're weighted by source-credibility. `injuryRiskIndex` carries the largest weight (0.30) because it's ISN's own direct injury-risk composite. `overallActivityScore` and `mobility` deficits each carry 0.20 (conditioning composite and the most clinically-correlated movement axis). `stability` and `symmetry` deficits each carry 0.15. The two composite inputs together carry 0.50 and the three movement-quality inputs the other 0.50 — preserving the structural shape that composite indicators carry half the vulnerability signal. Empirical reweighting via logistic regression on labelled ISN injury outcomes is FYP II calibration work. |
| 4 | What does "escalate" do — promote one band, two, capped? | Promote by exactly one band, capped at High. So Optimal → Elevated, Elevated → High, High stays High. Multiple triggering conditions still escalate by one band — they reinforce the case rather than compound. Defensible: it is a conservative rule that flags, doesn't catastrophise. |
| 5 | Have you validated against injury outcomes — if not, what does "differentiator" mean? | Not yet — no labelled outcome data in FYP I. "Differentiator" in FYP I means **methodological novelty**: integrating workload + biomechanical + injury history into one explainable classification is not done by any commercial system reviewed. Clinical-utility validation is FYP II. |
| 6 | "This is just heuristics dressed as a model" — defend. | Heuristics with explicit literature anchors, deterministic outputs, and clinical explainability are *exactly* what a clinical-decision-support tool should be — black-box ML is harder to defend in clinical settings. Explainability is a feature, not a limitation. |
| 7 | How does it degrade with missing screening data? | Vulnerability score gracefully falls back to median (0.5) when fields are missing — yielding bands almost identical to textbook Gabbett. The system never breaks; it returns to literature-baseline behaviour. |
| 8 | Where in UI does user see *why* band was escalated? | The risk hero card surfaces modifier chips: "+0.15 personalised", "escalated from Optimal", "2 active injuries", "3 muscle flags". Each is hover-explainable. Explainability is built into the UI, not buried in logs. |

## 13. Body Map

| # | Question | Answer |
|---|---|---|
| 1 | Why aggregate 26 muscles to ~10 library regions? | Showing 26 anatomically accurate muscles on a thumbnail-scale silhouette is visually unreadable and not how clinicians communicate. Aggregation matches clinical norms (region on figure, specifics in panel). The side cards below the figure preserve full granularity, so nothing is lost. |
| 2 | MIT attribution — where does it live? | At the top of every imported file in `frontend/src/components/dashboard/bodymap-data/` and called out in `docs/DESIGN_DECISIONS.md §4`. Must remain in the FYP references section — explicitly locked in MASTER_CLARIFICATIONS §12. |
| 3 | If react-muscle-highlighter were ever de-licensed, fallback? | The path data is already copied into the repo (not installed as a dependency), so a licence change upstream does not affect us. The MIT licence at the time of copy persists with the copied code. |
| 4 | Why render head/hands/feet inert rather than omit? | Anatomical context — the silhouette must read as a human body. Removing limbs would look broken. Rendering them inert (no hover, no tooltip, no cursor change) communicates "not tracked here" without breaking the figure. |
| 5 | Flag cards redundant with hover tooltips? | They are complementary: tooltips are exploratory (hover to discover), cards are persistent (visible at a glance with no interaction). Clinicians scan the cards; athletes hover. Different modalities, same data — defensible duplication. |

## 14. Sport-Critical Screening Alerts

| # | Question | Answer |
|---|---|---|
| 1 | What is the alert layer and how does it relate to the composite risk model? | A separate, additive layer — it reads only the 8 HoloMotion exercise-risk indicators and never touches `classifyCompositeRisk()`, so the graded model is untouched. Each sport maps to its biomechanically critical regions (e.g. Athletics → Knee/Ankle/Lumbar-Pelvis; Swimming → Shoulder/Neck/Lumbar-Pelvis). An indicator alerts when its region is sport-critical and above the Watch threshold, or when *any* region exceeds the High threshold (safety net). Surfaced as a banner on the athlete and medical dashboards and as a squad-level flag on the coach view. |
| 2 | Where do the thresholds come from? | From the instrument itself: the HoloMotion report's own legend bands 0–15 as Low Risk, so Watch = the report's Low/Medium boundary and 25 splits Watch from High inside the report's Medium band. On top of that, each sport's critical regions are held to **tightened bands (12/20, ~20% stricter — the same personalisation scale as the composite model's ±15%)**. Tightening only: AIRMS never waits longer than the instrument's own bands, so no sport/region pair is less protected than the report. |
| 3 | Isn't this "personalised thresholds" duplicating the composite model? | Different axis of personalisation: the composite model personalises *ACWR workload thresholds* by vulnerability; this layer personalises *the screening thresholds per body region* by sport — every athlete takes the same eight tests, but a runner's knee is judged against 12/20 while their neck keeps the instrument's 15/25. Region-level, workload-independent, and each is explainable on its own terms. |
| 3a | The report ends with a Training Prescription — does AIRMS reflect it? | Yes — the screening panel closes with a **Training Focus** block mirroring that structure: for up to the three most pressing out-of-range regions (sport-critical first), corrective exercises with the report's own reps × sets · rest dosing, drawn from the HoloMotion prescription vocabulary. Rule-based and deterministic — no model call, medical staff stay the authority. Ground-truth check: for the sample report it selects Ankle, Knee, and Neck — the same three problems the report's own summary flags. |
| 4 | Sport is a free-text column — what about typos and variants? | The lookup is case- and whitespace-insensitive with an alias table (Running / Track & Field → Athletics, Soccer → Football, Lawn Bowls → Bowls…). Unmapped sports keep the High-threshold safety net, so a misspelt sport degrades to generic alerting, never to silence. |
| 5 | Athlete with no screening data — what happens? | The layer distinguishes "no screening ingested" (all indicators zero) from "screened and healthy" — the coach table shows *no data* rather than implying a clean bill of health, and the banner simply doesn't render. Malformed values from ingestion are guarded to zero. |

## 15. Stakeholder Collaboration (Slides 50–51)

| # | Question | Answer |
|---|---|---|
| 1 | How many meetings with Dr Thung — what changed? | One formal stakeholder meeting (2026-04-24) — transcript on file. Directly produced: age-group filter on Module 5, expanded body-part dropdown coverage (Dr Thung's "upper/lower" ask), prevention insight card on Module 6, PDF report builder requirement. Pre-meeting Module 5 had 3 filters; post-meeting it has 8. |
| 2 | Is the signed collaboration letter just a formality? | No — it formalises Dr Thung's commitment to provide data (within ISN's data-governance constraints), validates the requirements as authentic stakeholder asks, and earns the "Exceeds" tier on the Stakeholder Collaboration rubric (2% of viva). |
| 3 | Did Dr Hoo and Dr Thung ever disagree on direction? | Not on substance — Dr Hoo guides academic framing (rubrics, defensibility), Dr Thung guides operational fit. Where their guidance intersected (e.g. scope of evaluation), Dr Hoo's academic framing prevailed because the artefact is graded, not deployed. |

---

# Interconnecting Questions — The Seam Tests

These are the panel's highest-leverage questions. They test whether the story holds across PS ↔ Obj ↔ Lit ↔ Module ↔ Implementation.

## PS ↔ Literature Review

| # | Question | Answer |
|---|---|---|
| 1 | PS1 cites Costello — why not also Sprouse (both speak to surveillance)? | Sprouse (extending the IOC/STROBE-SIIS consensus lineage) addresses *what variables to record and how to operationalise them at all participation levels* (standardisation) — that is PS3's gap. Costello addresses *which architecture captures injury data well* (multi-stakeholder workflows) — that is PS1's gap. They are different layers of the surveillance problem; we cite each where it is most evidentially direct. |
| 2 | Could PS2 stand on Qin alone, or does it lean on the sRPE cluster? | It leans on the sRPE cluster implicitly — ACWR cannot exist without a load metric, and the sRPE method (revalidated by Inoue 2022 and Yang 2024) is the load metric. The slide cites Qin because the *gap* PS2 names is workload monitoring (ACWR), but the full justification chain is sRPE → ACWR → Qin. |
| 3 | PS3 cites Sprouse for standardisation — but the underlying IOC consensus is about variables, not dashboards. Defend the leap. | Standardised variables are the precondition for any dashboard — you cannot filter by injury type if injury type isn't a controlled vocabulary. Sprouse (2024) and the IOC/STROBE-SIIS lineage establish that the field's variables can and should be standardised; the dashboard is the *applied surface* on that standardised data. |
| 4 | None of the four papers directly justifies a web platform. Where does that decision get evidence? | The platform itself isn't an academic claim — it is the *delivery vehicle* for the claims. The evidence is operational (ISN's current spreadsheet limitations) and competitive (existing-systems comparison). The four papers justify *what* the platform must compute and capture, not that it should be a web app. |

## PS ↔ Objective

| # | Question | Answer |
|---|---|---|
| 5 | Objective 1 is means, not end — defend. | It is both. As a means: it enables Obj 2. As an end: stakeholder requirement-gathering is itself a graded outcome in supervised FYP work, demonstrating real-world engagement vs. self-generated requirements. |
| 6 | Obj 2 promises to address all three PS — which feature maps where? | Module 1+2 (activity tracking + workload dashboard) addresses PS2. Module 3 (injury + recovery + self-report) addresses PS1. Module 5 (admin analytics + PDF) addresses PS3. Module 4 (data upload) and Module 6 (medical dashboard) cross-cut PS1+PS3. |
| 7 | Obj 3 is evaluation — isn't that QA? | QA verifies *correctness*; evaluation verifies *utility*. Obj 3 is the latter — does the system actually help ISN's medical/admin staff make decisions they couldn't before. That's a research question, not a QA question. |

## Literature ↔ Module

| # | Question | Answer |
|---|---|---|
| 8 | sRPE cluster (Inoue 2022 + Yang 2024) → Module 1. Walk from paper to code. | The sRPE method — revalidated by both papers — defines `Session Load (AU) = duration (min) × RPE (1–10)`. In `backend/src/models/Activity.js`, a Sequelize `beforeValidate` hook computes `activity.load = activity.duration * activity.intensity` before every write. The frontend live-preview in `app/athlete/activity/page.tsx` mirrors this in TS for instant feedback. |
| 9 | Qin did not prescribe visual banding — that's interpretation. Defend. | Qin (2025) quantifies the 0.8–1.3 band as lowest injury incidence (56%), giving empirical backing for threshold-based visual presentation. We operationalise it as Low/Optimal/Elevated/High with Gabbett's numeric anchors. Interpretation in the engineering, not in the underlying claim. |
| 10 | Costello → Module 3. Which surveyed system resembles AIRMS most? | Costello documents that the most effective surveillance systems implement athlete-submission + clinician-review + state machine (Pending/Approved/Rejected). AIRMS's self-report flow is a direct implementation of that architectural pattern. We don't replicate a specific system from the review — we replicate the *pattern*. |
| 11 | Sprouse → Module 5. Map every Sprouse/IOC-inherited variable to your Injury schema. | Variables in our schema: bodyPart ✓, side ✓, injuryType ✓, mechanism ✓, severity ✓, date (onset) ✓, recoveryStatus ✓. Absent: exposure hours denominator (no attendance), specific session linkage (only date), clinician credentials (logging user only). Each absence is FYP II extension. |

## Literature ↔ Design Decision

| # | Question | Answer |
|---|---|---|
| 12 | Composite model goes beyond Qin/Gabbett. Which citations support personalisation? | Michailidis (2024), reviewing ACWR in professional soccer, concludes precise universal thresholds remain difficult to establish — motivating personalised rather than one-size-fits-all bands. Beyond that, personalisation is my design call, anchored on the principle that vulnerability differs between athletes. I cite Gabbett's baseline thresholds as the anchor; the ±15% modifier and escalation logic are own contribution. This is disclosed clearly so I am not over-claiming literature support. |
| 13 | RPE 1–10 vs Borg 6–20 vs CR-10 — defend without "industry standard". | The published sRPE method uses modified Borg CR-10 (0–10). I shift to 1–10 to avoid zero-load edge cases that would zero out ACWR. Functionally equivalent to CR-10; slide intentionally simplifies for athlete cognitive load. |
| 14 | Costello says multi-stakeholder — how does your role model reflect that? | Four stakeholders: athletes (self-log), medical staff (clinical gatekeeper), admin (cohort governance), and — promoted in FYP II — a read-only **coach** with a sport-scoped squad-readiness view. The coach is deliberately read-only: medical staff remain the clinical gatekeeper, so the coach *informs* the workflow without changing who makes clinical decisions. That mirrors ISN — coaches need visibility of who to send to the medical team, not authority over the assessment. |

## Module ↔ Module

| # | Question | Answer |
|---|---|---|
| 15 | If Module 1 (load) is broken, what breaks downstream? | Module 2's ACWR computation breaks → composite risk band is invalid → escalation chips become unreliable. Module 6's medical view of the same athlete shows the same broken risk picture. Module 5's analytics (which is injury-driven, not load-driven) is unaffected. |
| 16 | Walk the chain: Self-report → Injury → composite risk escalation. | Athlete submits SelfReport. Medical reviews and approves at `selfReports.js:50`, which constructs a new `Injury` document with the submission's fields and saves with `status: 'Approved'` linked to the new Injury `_id`. On the athlete's next dashboard load, the Injury becomes an "active injury" — `classifyCompositeRisk()` sees ≥1 active injury and escalates the risk band. |
| 17 | Module 2 defensible if Module 4 hasn't fully shipped? | Module 4 has shipped — both ingestion paths work end-to-end, and the HoloMotion path reads the muscle lists directly off the report (the old Excel column-lock dependency is gone). Module 2 reads screening data via the Athlete model, populated by Module 4 ingestion or the seeder, and the composite risk model degrades gracefully if screening fields are missing (vulnerability defaults to median; the dashboard shows an explicit "no screening ingested" state). |

## Methodology ↔ Status

| # | Question | Answer |
|---|---|---|
| 18 | Modules 1–2 audit-fixed and locked while 3–6 still iterate — genuinely Agile or de-facto Waterfall? | Genuinely Agile — Modules 1–2 went through Sprint 1 + audit fix iteration, then declared "stable" (DoD met). Modules 3–6 are in Sprint 3. Stabilising a delivered increment while iterating on later increments is exactly the Scrum cadence; it is not Waterfall because nothing was big-bang released. |
| 19 | Show one user story that changed shape after a sprint review. | Module 5 filter strip: original Sprint 2 design had sport + gender + date range. After Dr Thung's 2026-04-24 review, expanded to age group + programme + body part + injury type — eight filters total. The story didn't move; the acceptance criteria expanded. A subsequent iteration also added then removed an upper/trunk/lower chip row after concluding the body-part dropdown already covered the same query without the visual clutter. |

## Composite Risk ↔ Everything

| # | Question | Answer |
|---|---|---|
| 20 | Composite risk depends on load, thresholds, screening, injuries — failure modes if any is wrong/missing? | Load broken → ACWR invalid → all bands suspect. Thresholds wrong → mispersonalised but explainable. Screening missing → falls back to median vulnerability ≈ Gabbett baseline. Injuries missing → no escalation, model reverts to personalised-Gabbett only. Each layer degrades gracefully. |
| 21 | Worked example: ACWR 1.1 (textbook Optimal) but AIRMS flags High. How? | Athlete has high vulnerability (low mobility + low symmetry → personalised upper threshold tightens from 1.3 to 1.10, so 1.1 is right at Elevated). Plus 2 active injuries align with current workload → escalation bumps Elevated → High. UI shows: "0.68–1.10 personalised" + "escalated: 2 active injuries". Every step explainable. |

## Scope vs. Limitations

| # | Question | Answer |
|---|---|---|
| 22 | Demo uses seeded synthetic data — doesn't that invalidate ISN-design claims? | Synthetic data validates the *system mechanics*; real ISN data validates *clinical utility* (FYP II). The data schema, field names, and structure come from ISN's actual screening template (`docs/data-samples/`). Stakeholder validation has been done on requirements; outcome validation will be done on real data in evaluation phase. |
| 23 | "This is essentially Gabbett 2016 with a UI" — two-sentence rebuttal. | Gabbett 2016 prescribes one population-level threshold; AIRMS personalises thresholds per athlete using screening data and escalates when injuries/flags align with workload. That integration is not in Gabbett — it is the FYP contribution, and every layer is explainable to the clinician. |
| 24 | No ML, no inference, only rules — is this CS-degree-worthy? | The CS contribution is system integration across heterogeneous data sources (relational schema design via Sequelize, transactional cross-table writes, RBAC, role-aware routing, validation pipelines, PDF generation, deterministic seeding), plus explainable rule composition. ML for clinical decision support requires labelled outcome data we do not have — claiming ML without it would be the indefensible choice. |

## FYP I vs FYP II

| # | Question | Answer |
|---|---|---|
| 25 | Objective 3 evaluation instrument — TAM, SUS, semi-structured? | A mix: SUS for usability (numeric, validated), TAM for perceived usefulness/ease-of-use (theoretical grounding), plus semi-structured interviews with Dr Thung and ISN medical staff to capture qualitative clinical-utility feedback that questionnaires miss. |
| 26 | What would Dr Thung need to say for you to abandon the composite risk model? | If real ISN outcome data showed the personalised + escalated bands consistently misclassified vs. plain Gabbett, *and* the misclassification harmed clinical decisions rather than improving them. That would justify pulling back to textbook ACWR. Anything short of that — abandoning is overreaction. |

---

## Rehearsal strategy

1. **Drill the four-cluster map** — sRPE cluster (Inoue + Yang) → Module 1 → activity load; Qin → Module 2 → ACWR bands; Costello → Module 3 → review states; Sprouse → Module 5 → STROBE-SIIS variables. Say it in one breath.
2. **Memorise the defensibility one-liners** in `docs/DESIGN_DECISIONS.md`. They are already in viva-voice form.
3. **Rehearse the worked example** (Interconnecting Q21) — the ACWR-1.1-yet-High walk-through is the single highest-leverage answer for showing the composite model in motion.
4. **Know the deferred items honestly** — Module 3 recovery milestones (external), Module 5 severity×time heatmap (polish), Module 6 watchlist (polish). The old "Module 4 muscle-flag lock" item is resolved — the HoloMotion vision path now populates muscle flags directly. Owning deferred items earns more marks than hiding them.
5. **Drill the HoloMotion pipeline one-liner** — "the report is image-only, so we render its data sections and read them with a vision model — provider-agnostic, even fully local for the NDA — into a preview the operator confirms before anything is committed." Cost answer if pushed: cropped bands, ~58% fewer image tokens, fractions of a cent per report.
