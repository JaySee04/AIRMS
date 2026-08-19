# AIRMS FYP II — Viva Dossier

> **What this is.** The defence pack for the system as it stands on
> **2026-08-19**. `VIVA_SCRIPT.md` and `VIVA_ANSWERS.md` are FYP I artefacts,
> deliberately frozen and correctly banner-warned as historical; this file is
> their FYP II successor, and it describes code that exists.
>
> **Every number in §2 was measured against the live database on 2026-08-19**,
> not recalled from a document. Three figures quoted elsewhere in the docs were
> already stale when this was written — which is exactly the failure this file
> exists to prevent, so **re-measure before you walk in** (§2 carries the
> command).
>
> **Every claim carries a file or a `DESIGN_DECISIONS.md` section.** Check any of
> them. Do not deliver a claim from this file that you have not seen for
> yourself in the running system — a confident wrong answer costs more than
> "I'd have to check".

---

## 1. The thesis

**One sentence, if you get one sentence:**

> AIRMS turns the screening reports ISN already produces into one explainable
> risk signal, scored against each athlete's real peer cohort rather than a
> published threshold, and delivers it in four role-shaped views — without
> anyone having to read a PDF.

**The paragraph, if you get a paragraph:**

> ISN runs HoloMotion screenings and receives image-only PDFs. Those PDFs are
> read by one clinician, filed, and effectively never seen again — the coach
> does not get them, the athlete does not get them, and nobody can see the squad
> as a whole. AIRMS ingests that existing artefact, scores each athlete against
> peers matched on sport, programme, gender and discipline, and presents one
> verdict shaped for whoever is looking. The scoring is institution-governed:
> the norms in force are an approved, versioned, **pinned** snapshot, so an
> import cannot silently move the reference everyone is measured against, and a
> clinician can override any verdict with a note recorded against their name.

**The claim it does NOT make** — and volunteering this is stronger than being
caught by it: *AIRMS does not predict injury.* It triages who is worth a
clinician's time. See §3 Q1.

---

## 2. Numbers, measured 2026-08-19

Re-measure before the viva; these drift with every reseed:

```powershell
cd backend
node -e "require('dotenv').config();const{sequelize,Athlete,Screening,CohortThreshold,AuditLog}=require('./src/models');const{latestScreeningsByAthlete}=require('./src/utils/cohorts');const{effectiveBand}=require('./src/utils/bands');(async()=>{const r=await latestScreeningsByAthlete();const b={green:0,amber:0,red:0};for(const x of r)b[effectiveBand(x.screening)]++;console.log('athletes',await Athlete.count(),'| screened',r.length,'| bands',JSON.stringify(b),'| screenings',await Screening.count(),'| cohorts',await CohortThreshold.count(),'| audit',await AuditLog.count());await sequelize.close();})()"
```

| Quantity | Value | Note if asked |
|---|---:|---|
| Athletes on the roster | 62 | all active |
| Athletes with a screening | 56 | **6 have none** — see §5 L3 |
| Screenings held | 74 | 56 latest + 18 prior snapshots |
| Band split (latest per athlete) | **38 green / 9 amber / 9 red** | evidence the pipeline runs, **not** that the model is calibrated (§4 W4) |
| Cohorts computed | 49 | all pinned |
| Cohort an athlete is scored against | min 5, **median 7**, max 10 | **all 56 are below 11 peers** (§4 W2) |
| Repeat pairs available | 18 | below the 20 needed for MDC95 (§5 L2) |
| Audit rows | 22 | 5 action types, 4 roles |
| Users | 8 | across 5 roles |
| Muscle flags | 336 | |
| Commits, FYP I → FYP II | **249** | 231 files, +54,777 / −7,678 lines |
| Tests | 305 backend (19 suites) + 119 frontend (8) | |

**The settings that decide bands** (`backend/src/utils/settings.js`, live values):

| Setting | Value | What it does |
|---|---|---|
| `min_cohort_n` | 5 | floor for a cohort to be usable; below it the ladder falls back |
| `escalation_below_mean_z` | **−0.5** | below-mean rule fires at −0.5 SD, not at any z < 0 |
| `bottom_k` | 3 | capped by `BOTTOM_SHARE = 0.2`, so the applied share is 10–20% at every cohort size |
| `escalation_indicator_high` / `_z` | 25 / 1.5 | per-indicator rule: elevated **and** a peer outlier |
| `norm_min_total` / `_rom` / `_stability` | 0 / 0 / 0 | deliberately **off** (§4 W3) |

The band is the **count** of escalations that fire: 0 → green, 1 → amber,
2 or more → red.

---

## 3. The hard questions

Ranked by likelihood × damage. The short answer is what you say; the expansion
is for if they push.

### Q1 · "Does this actually predict injury?"

**No, and it does not claim to.**

> Validating a screening test for prediction takes three things (Bahr, *BJSM*
> 2016): a prospective association with injury, adequate test properties in the
> target population, and evidence that intervening on screen-identified athletes
> beats intervening on everyone. No published screening test has cleared all
> three — the best-known threshold in the field, an FMS composite of 14 or below,
> is not significantly associated with injury risk once studies are pooled.
> AIRMS therefore reports indicators and triages who is worth assessing; the
> verdict stays with a clinician, who can override it.

**If pushed — why is this better than an FMS-style cut-off?** A published
threshold imports whatever population it was derived on. AIRMS scores against
the athlete's own peer cohort, so it never inherits that mismatch. And red
requires **two independent rules to agree**, which is the standard defence
against the false-positive rate that makes flagging systems get ignored.

*Backing: `docs/DESIGN_DECISIONS.md` §33 opening, §33g.*

### Q2 · "Why is the identity-card number your primary key?"

**Own the tension — do not defend it as costless.**

> It is the identifier ISN already uses, so records reconcile against the
> institute's own directory with no mapping table. That is a real benefit with a
> real cost: an IC number is sensitive personal data, and as a cross-table key it
> appears in request paths, exported filenames and logs, where a synthetic key
> would not. The mitigations sit at the boundaries — reports are anonymised
> before leaving the machine, all athlete routes are authenticated and
> role-restricted — and the residual exposure inside ISN's own deployment is
> accepted rather than eliminated, because it is an identifier their staff
> already handle.

**If pushed — what would you do differently?** A surrogate key with the IC as a
unique attribute is the textbook answer and I would take it in a rebuild. The
column is already named `athleteId` and serialised as `_id`, so the change is
contained. What it would not fix is the reconciliation the IC was chosen for.

*Backing: `docs/fyp/REPORT_EDIT_PACK.md` R7b; `CLAUDE.md` (A2, 2026-08-04).*

### Q3 · "You have no injury history. Isn't prior injury the strongest predictor?"

**Yes it is, and no we do not hold it. That is a scope decision.**

> Prior injury is the single strongest known predictor and AIRMS does not have
> it. That follows from the HoloMotion-only decision: the HoloMotion PDF is the
> sole source of truth and it does not carry injury history. Adding load and
> history would not have cleared Bahr's three steps either — it would be a larger
> untested claim on a wider dataset. What the system does instead is report what
> it can see, name what it cannot, and leave the verdict with the clinician.

**If pushed:** one clinician-set flag survives (`isInjured`) and it does exactly
one job — excluding an athlete from norm **computation**, because a screening
taken while injured does not represent that athlete. They are still *scored*
against the resulting norm. That is the only place injury enters the system.

*Backing: `docs/DESIGN_DECISIONS.md` §33g; `backend/src/utils/cohorts.js`
(`isEligibleForNorms`).*

### Q4 · "Your cohorts are tiny. Is a z-score from five people meaningful?"

**Not very — and the interface says so.**

> Every one of the 56 scored athletes is compared against fewer than 11 peers,
> median 7. An SD from that many observations is unstable, and the below-mean
> rule fires at −0.5 SD, which sits inside the sampling error of such an
> estimate. So below ten peers the comparison caveats itself on screen: the group
> mean and spread are themselves uncertain.

**If pushed — then why not raise `min_cohort_n`?** Because of where the fallback
ladder sends them. Athletes currently resolve at sport·gender or
sport·programme·gender. Raising the floor pushes those cohorts up to **sport
alone** — comparing a female athlete's ROM and stability against a squad of men.
So the alternative to a small specific cohort is not the same comparison with
more people, it is a different and less valid one: it trades sampling variance
for **systematic bias**, and bias does not shrink with n.

**The honest future-work answer:** scale the escalation cutoff with cohort size —
the standard error of a z widens as n falls. That addresses the variance
directly without touching the tier, and it was not worth introducing days before
assessment.

*Backing: `docs/DESIGN_DECISIONS.md` §33c, §34a.*

### Q5 · "How do you know a change between two screenings is real?"

**We compute the threshold — and when the data cannot support one, we say so.**

> Every direction-of-travel verdict used to use one hardcoded value: a change of
> 2 points was real. Nothing derived it. It now computes the typical error (SD of
> within-athlete differences ÷ √2) and MDC95 (2.77 × TE) from repeat screenings.
> Two deliberate honesty properties: the repeats are months apart, so they
> contain real change as well as measurement error, which makes this an **upper
> bound** that under-calls change rather than over-calling it; and below 20 pairs
> it **declines**, falls back to the documented 2, and says so on screen and in
> the PDF.

**On the seeded data it declines — 18 pairs, 20 needed.** Say that before they
find it. Refusing is the feature: a confidently wrong threshold here silently
changes who gets assessed.

**If pushed — why not lower the floor to 18 so it computes?** Then the threshold
exists because it was made to, not because it was earned. Same objection to
seeding more repeats.

*Backing: `backend/src/utils/reliability.js` — the header comment states the
method and the caveat; Robertson, Bartlett & Gastin, IJSPP 2017.*

### Q6 · "What stops an import from changing everyone's score?"

**The norms in force are pinned.**

> Saving a norm version was only an archive. A **pin** makes one saved set the
> norms actually in force: while pinned, recompute holds `stats`/`n` instead of
> overwriting them, so importing a new report cannot move the reference every
> athlete is measured against. It still records what the data *would* say, in
> `fresh_stats`, and `pinDrift()` surfaces the gap — a frozen norm with no
> staleness signal would be worse than none. `Pre-viva baseline 2026-08-19` is
> pinned now, holding 49 cohorts.

**If pushed:** deleting the pinned version, or restoring another over it, both
409. A cohort first seen *after* the pin is still created live
(`added_since_pin`), because the pin must never leave an athlete unscoreable.

*Backing: `docs/DESIGN_DECISIONS.md` §22, §32.*

### Q7 · "You send athlete data to an AI provider. What about privacy?"

**The athlete's name never leaves the machine.**

> Page-1 OCR locates the name field on-device and blacks out the value before any
> image reaches the vision model, so the sole direct identifier is never
> transmitted. It fails **closed**: if redaction cannot confirm it worked, the
> page is not sent. This is the strongest defensible contribution in the system
> and the report should carry it.

**If pushed — what still leaves?** Not the IC number: the operator attaches the
extracted report to a roster athlete *after* extraction, by name search, and the
commit backfills the name server-side. The model sees an anonymous set of
numbers.

*Backing: `backend/src/utils/redactName.js`; `docs/DESIGN_DECISIONS.md` §18;
`docs/fyp/REPORT_EDIT_PACK.md` R7a.*

### Q8 · "Why is one of the eight measured risks never shown?"

**Clinical instruction — and it is asserted rather than assumed.**

> Lumbar disc herniation is extracted and stored but never scored, charted,
> printed or named, on Dr Thung's instruction. Rather than leave that as an
> absence — something you can only verify by checking it is missing everywhere —
> it is named as a value, `EXCLUDED_RISK_KEYS`, so a test can assert it. Two
> suites pin the backend and frontend indicator lists to each other and check the
> exclusion across every derived view.

**If pushed — why does that need a test?** Because a leaked indicator would
render as an ordinary row. Nothing would look wrong.

*Backing: `backend/src/utils/riskIndicators.js`;
`backend/tests/riskIndicators.test.js`; `docs/DESIGN_DECISIONS.md` §31.*

### Q9 · "What did you actually add in FYP II?"

> 249 commits, 231 files, +54,777 / −7,678 lines. `main` is frozen at the FYP I
> submission state (2026-06-05) — that boundary is deliberate, so the comparison
> is checkable rather than asserted.

The substantive additions: HoloMotion PDF ingestion with on-device redaction
(replacing the Excel import), cohort-normed scoring with governed and pinned
norms, two new roles (`coach`, `executive`), an append-only audit trail that
records **reads** as well as writes, five PDF reports, a scheduled monthly digest
and rescreen reminders, screening analytics (squad body map, risk-vs-movement
scatter, indicator histogram, subitem heatmap, left–right asymmetry), and a
derived detectable-change threshold.

The honest framing: **FYP I built the dashboard; FYP II built the thing that
fills it, and the governance around it.**

### Q10 · "Why did you remove the ACWR model that was your FYP I differentiator?"

> It was not removed — it is dormant. `lib/risk.ts` still implements the composite
> model and it remains a locked decision. What was removed was Activity Tracking,
> its only input: the athlete was reading three competing verdicts at once, and
> the training-load card visually dominated the cohort indicator that is the
> actual finding. With no session logging there is no ACWR to compute, so showing
> it would have been theatre.

**If pushed:** the rebuild path is specified in `docs/fyp/ACWR_REBUILD.md`, and
re-establishing a training-load input is a stated future-work item.

---

## 4. Where the design argues against itself

Volunteer these. Each is a place a sharp examiner can land a hit, and each lands
softer if you get there first.

- **W1 · The system cannot answer Dr Thung's most specific request.** In the
  2026-04-24 meeting he asked for an administrator view of injury *cases* — how
  many, which body part, which side, what type, trending over time. The
  HoloMotion-only cut removed it. AIRMS answers the anatomical half from
  screening data but cannot answer "how many knee injuries last year". **Put this
  to him before the viva** (§6) so it is a decision he made, not a gap you missed.
- **W2 · Every scored athlete sits in a cohort of fewer than 11.** Median 7. The
  answer in Q4 is good, but the number is worse than the docs said — quote
  56-of-56, not the older 49-of-58.
- **W3 · The three norm-eligibility floors are off, on purpose.** Excluding low
  scores from a norm computed on those very scores is selection on the dependent
  variable: it censors the left tail, biases the mean up, shrinks the SD and
  over-flags whoever is left. Excluding the *injured* is different and stays,
  because injury is an external fact about whether a screening represents the
  athlete at all. *(§32)*
- **W4 · The seeded band split is not calibration evidence.** 38/9/9 shows the
  pipeline runs end to end. It does not show the model is calibrated, because the
  data is synthetic. Do not offer it as validation. *(§33f, §34b)*
- **W5 · Route handlers are largely untested.** The 305 backend tests cover pure
  logic — scoring, permissions, PDF drawing, bands, reliability. Anything inside a
  route body, a page, or the import flow is verified by hand, and there are no
  end-to-end tests. Say "the logic is tested, the wiring is verified manually"
  rather than implying coverage you do not have.
- **W6 · The audit trail is fire-and-forget.** Logging must never fail the
  operation it describes, so a lost row is silent. That is the right trade for
  transparency logging and the **wrong** one for anything the institution must
  *prove*. Name it as a trade, not an oversight.

---

## 5. Demo landmines

Things that will look like bugs and are not. Know what you will say.

- **L1 · The monthly digest will not send during your demo.**
  `digest_last_sent` and `rescreen_reminder_last_sent` are both `2026-08` — this
  month is already marked delivered, and that marker is what makes the scheduler
  idempotent. To send live, clear the marker first (§6). To *show* the email
  without sending, run with `MAILER_DRY_RUN=true` and it prints to the terminal,
  attachment included.
- **L2 · "Is this change real?" will say it cannot tell.** 18 repeat pairs, 20
  needed. This is designed behaviour and the best answer in the dossier — lead
  with it rather than being caught by it (Q5).
- **L3 · Six athletes have no screening at all.** Deliberate: coverage and the
  *never screened* recall state need something to report, and "never screened" is
  counted apart from "overdue" because it needs a first assessment, not a
  call-back.
- **L4 · Green does not say "Safe".** It reads **"No indicators flagged"**. If
  asked why so hedged: a screen that cannot predict injury cannot certify its
  absence, and since most athletes are low-risk, green is exactly where a false
  reassurance would land. *(§33a)*
- **L5 · `exerciseRisks` never moves between a seeded athlete's two screenings.**
  The prior snapshot copies injury-risk values unchanged. If a trend panel shows
  movement in five scores and flatness in the sixth, that is the seeder, not the
  code.
- **L6 · The branch is called `feat/mysql-migration`.** It was about MySQL for
  three commits and has been all of FYP II for 246. Renaming was considered and
  rejected: it has a public upstream, and five docs name it in prose — including
  the logbook source material. `main` is FYP I; this branch is FYP II.
- **L7 · Two demo accounts reach real inboxes; five bounce.** See §6.

---

## 6. Before you walk in

- [ ] **Re-measure §2** (command at the top of that section).
- [ ] **Put W1 to Dr Thung** — the injury-summary substitution. It should not
      surface first in the viva.
- [ ] **Re-print the five PDFs and look at them.** They have changed since you
      last did — dead-band shading, the squad body map, the band relabel.
- [ ] **Decide whether you want a live email demo.** If yes, clear the marker in
      MySQL — set `digest_last_sent` to an empty string in the `settings` table —
      and restart the backend; the scheduler's boot pass fires 30 seconds later.
      The send lands at `poseidonapollo11@gmail.com` (admin); the `@isn.gov.my`
      addresses bounce.
- [ ] **Rehearse Q1, Q2 and Q4 aloud.** Those are the three where a hesitant
      answer reads as a gap rather than a decision.

---

## 7. What this file does not vouch for

- **The Word report.** Nothing here has been checked against the document you
  will submit. `REPORT_EDIT_PACK.md` R1–R10 is the list of edits it still needs.
- **The slides.** Same — R10 is that checklist.
- **How the panel will behave.** The ranking in §3 is my judgement about
  likelihood and damage, not information.
- **Claims inherited rather than measured.** Everything in §2 was measured on
  2026-08-19. Everything in §3–§5 traces to a cited file, but the *citations* were
  checked — not every downstream consequence of them.

---

*Compiled 2026-08-19. Measured, not recalled: three figures in the surrounding
docs were already stale when this was written (`DESIGN_DECISIONS.md` §32 and
§33c, and `JC_CHECKLIST.md`), which is the argument for re-measuring rather than
trusting any of it — this file included.*
