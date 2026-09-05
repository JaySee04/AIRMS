# AIRMS FYP II — Viva Dossier

> **What this is.** The defence pack for the system as it stands on
> **2026-09-05**. `VIVA_SCRIPT.md` and `VIVA_ANSWERS.md` are FYP I artefacts,
> deliberately frozen and correctly banner-warned as historical; this file is
> their FYP II successor, and it describes code that exists.
>
> **Every number in §2 was measured against the live database on 2026-09-05**,
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

## 2. Numbers, measured 2026-09-05

Re-measure before the viva; these drift with every reseed. Last run **2026-09-05**.

**Run `cd backend; npm run measure:facts`** — it now prints every row of this
table that a database or the repository can answer, which it did not on
2026-08-25. That gap is why four rows below had gone stale while the file said
"re-measure before quoting": the script covered the bands and the cohorts, so
those stayed right, and said nothing about audit rows, commits or tests, so those
drifted (324 audit rows against a stated 1; 386 commits against 291; 572 backend
tests against 382). A re-measurement instruction only protects the quantities the
tool actually re-measures. See `docs/SILENT_FAILURES.md` H7.

The one-liner below is kept because it is short enough to run in front of a panel.

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
| Cohorts computed | 49 | all pinned, as `Pre-viva baseline 2026-08-25` |
| Saved norm versions | 1 | the pinned one — **re-verified 2026-09-05**: recompute while pinned returns `pinnedHeld: true`, 49 of 49 held, all 49 parking `fresh_stats` for `pinDrift()`. CLAUDE.md said "50 of 50" until that day — the 50 belonged to the version a reseed destroyed |
| Cohort an athlete is scored against | min 5, **median 7**, max 10 | **all 56 are below 11 peers** (§4 W2) |
| Repeat pairs available | 18 | below the 20 needed for MDC95 (§5 L2) |
| Audit rows | **324 local** | **a reseed clears the trail**, so this number says how much has been done since the last one, not how much the system has ever recorded. It read "11 hosted / 1 local" until 2026-09-05, measured just after a reseed. All 5 roles ARE represented — the §20 property that a read-only role appears at all was verified by downloading one report as coach and one as executive |
| Users | 10 | across 5 roles — 4 reach a deliverable inbox (§5 L7) |
| Muscle flags | 336 | |
| Commits, FYP I → FYP II | **386** | on `feat/mysql-migration`; re-count with `git rev-list --count HEAD` |
| Tests | **572 backend (36 suites) + 261 frontend (15)** | new since 2026-08-25: `numRound`, `systemMap`, `sharedFacts`, `crossPackage`, `scriptImports`, and the first component suite above `lib/` — `OverallRiskBadge`, the hero |

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

### Q11 · "Could ISN actually run this? What happens when nobody is logged in?"

**The schedule does not depend on the app being open.**

> Two things in AIRMS have to happen without anyone asking: the monthly institute
> digest and the rescreen recall. They were driven by a timer inside the web
> server, which ties a monthly obligation to that server's uptime — on a
> workstation, "monthly" really meant "whenever somebody opened the project". The
> tick is now a standalone command that runs one pass and exits, driven by the
> operating system's scheduler: a per-user Windows task for a demo machine, an
> hourly cron entry for a real deployment. Both call the same code the in-app
> timer calls, so there is one definition of what a tick does.

**If pushed — what if two of them run at once?** They take a compare-and-swap
lock, so six simultaneous ticks produce one email. That property used to be
claimed in a comment and was false: the month marker is written only *after* a
successful send, so two processes both read it unset and both sent. Making an OS
scheduler normal is what forced it to become true.

**If pushed — so is it deployed?** No, and deliberately not: where the app runs,
how MySQL is hosted, TLS and backups are ISN's decisions, and deployment is
gated on Dr Thung's sign-off. What has been removed is the part that was a
*defect* rather than a decision — a scheduled feature that only ran while a
developer had the project open.

*Backing: `docs/DEPLOY.md`; `backend/src/mailTick.js`; `backend/src/utils/lock.js`;
`docs/DESIGN_DECISIONS.md` §36.*

### Q12 · "Is this actually deployed, or only on your laptop?"

**It is live, and the demo runs against it.**

> The web app is at `airms-web.vercel.app`, the API at `airms-api.vercel.app`,
> against a managed MySQL. Both halves deploy from one repository as separate
> Vercel projects. The API was not rewritten for serverless — `api/index.js`
> imports the same Express app `npm start` runs, and `server.js` listens only
> when it is the program, so a route added to the app is live in both and the
> two cannot describe different APIs.

**If pushed — what did the platform force you to change?** Four things, and one
of them is worth volunteering because it tested a design decision. Vercel's
Hobby plan rejects any cron more frequent than daily, so the hourly tick became
daily. That is survivable only because `isDue` asks whether the due moment has
**passed** rather than matching an hour exactly — the marker design from §36
absorbing a constraint it was not written for. A scheduler pinned to an exact
hour would have needed rewriting to deploy at all. The other three: the wrong
branch was deploying (`main` predates the MySQL migration, so the failure was a
*MongoDB* error in code nobody had touched), Root Directory versus the directory
you deploy from, and `mysql2` being traced out of the bundle because Sequelize
resolves its dialect with a dynamic require the bundler cannot see.

**The honest limits of the hosted instance**, all recorded in `DEPLOY.md`:
uploads are capped at 4.5 MB by the platform, so the 7.58 MB expanded HoloMotion
layout is rejected there while the ~1 MB compact one is fine; and "on-device
redaction" becomes "pre-provider redaction", since the browser now uploads the
un-redacted PDF to the API. The name still never reaches the vision provider —
which is the disclosure the design guards against — but it does traverse a
third-party host. The on-device claim remains true of the local deployment ISN
would actually run.

*Backing: `docs/DEPLOY.md`; `backend/api/index.js`; `backend/vercel.json`.*

### Q13 · "How does a real person get an account? I see demo logins."

**An administrator invites them; nobody else ever knows their password.**

> There is no self-registration, deliberately: for an institution holding
> clinical data, "anyone with an email can make an account" is the wrong shape.
> An administrator creates the account with **no password** — one is generated,
> hashed and discarded unread — and the person receives a six-digit code and
> chooses the first password that ever really exists on the account. The
> administrator cannot sign in as them, which matters for an audit trail that
> names people for their actions.

**If pushed — why not a link, and why six digits for seven days?** The mechanism
is the password-reset flow unchanged, sharing one definition of what a one-time
code is (`utils/resetCodes.js`), so an invitation cannot end up weaker than a
reset without anyone deciding it should be. Seven days is the ceiling NIST SP
800-63A sets for an enrollment code; what makes six digits acceptable across
that window is the five-attempt limit rather than the digit count — five guesses
against a million values, and the code burns whether or not the attacker is the
intended recipient.

**Volunteer the weakness:** invitations currently send from a personal Gmail
account. A clinician receiving an unexplained six-digit code from a personal
address is looking at a textbook phishing pattern, and deleting it would be the
correct response. Real institutional use needs ISN's own relay or a controlled
sending domain with SPF and DKIM; the mailer is entirely environment-driven, so
that is configuration rather than code.

*Backing: `backend/src/utils/resetCodes.js`; `backend/src/routes/users.js`;
`frontend/src/app/activate/page.tsx`.*

### Q14 · "The screening tells you what is wrong. Does it tell anyone what to do?"

**Yes, and deliberately not in our own words.**

> The HoloMotion report prints a two-week Training Prescription on its last
> pages — day by day, each exercise with reps, sets and a rest interval, derived
> by the instrument from the same screening AIRMS scores. Nothing read it until
> 2026-08-23. It now appears on the screening panel for the athlete, the
> clinician and the coach, headed as the instrument's own, with its caveat about
> how long the programme stands quoted verbatim rather than paraphrased.

**If pushed — isn't AIRMS giving training advice?** No, and the interface keeps
the two visibly apart. The *Training Focus* card is AIRMS's own: a
region-frequency heuristic that speaks about programme load rather than
treatment, because a read-only coach acting on a screening should be adjusting
volume, not prescribing rehabilitation. The *Training Prescription* card is
HoloMotion's, reproduced. A panellist asking "who is giving this advice" can be
shown both cards and the answer is on them.

**The detail worth volunteering:** I expected this to be expensive — a new
extraction schema and roughly 1,550 tokens per page across 32 extra pages — and
checking the actual PDF disproved it. Pages 1–6 are rendered graphics with no
text layer, which is exactly why they need a vision model; the prescription
pages are ordinary text. So it costs no model call, no tokens, and works even
with no AI provider configured. The parser is strict because the output is a
programme somebody may follow: a row read loosely produces something that looks
complete and is wrong, and nothing downstream could detect it.

*Backing: `backend/src/utils/prescription.js`; `backend/tests/prescription.test.js`.*

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
- **W5 · Route handlers are largely untested.** The 324 backend tests cover pure
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

**L0 — the Activity Log lags the action it records (hosted only).** Audit writes
are deliberately fire-and-forget, so logging can never fail the operation it
describes. On the serverless host that also makes them *late*: a report download
returns its PDF and the row lands seconds afterwards. Measured 2026-08-25 — an
executive download was absent from the trail on an immediate read and present on
the next. **If you demo the trail, refresh it**, and do not click Download and
Activity Log in the same breath. It is not a lost write; it is an unawaited one.

Things that will look like bugs and are not. Know what you will say.

- **L1 · The monthly digest sends on demand now.** Admin → Settings → Email
  Notifications has a **Send now** button on both the monthly summary and the
  rescreen reminder, and each tile shows the outcome of the last attempt — in
  red if it failed. That is the control to demo. (`digest_last_sent` is still
  `2026-08`, so the *scheduled* path will not fire again this month; "Send at the
  next hourly check" clears that marker, and Send now bypasses it outright.) To
  show the email without sending anything, run the backend with
  `MAILER_DRY_RUN=true` and it prints the body and the attachment to the
  terminal.

  **If asked why a button exists at all:** `force` skips the *due* check only. It
  deliberately does not override the institution's on/off switch — that would be
  a second gate contradicting the first. It is audited as `mail.send`, separately
  from settings changes, because it is the one control on that page that puts
  athlete-derived content into somebody's inbox.
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
  three commits and has been all of FYP II for 288. Renaming was considered and
  rejected: it has a public upstream, and five docs name it in prose — including
  the logbook source material. `main` is FYP I; this branch is FYP II.
- **L7 · Four demo accounts reach a real inbox; five bounce.** `@isn.gov.my`
  addresses are fictional and bounce to the SMTP account — expected, not a
  fault. The deliverable ones are `poseidonapollo11@gmail.com` (admin),
  `23005005@siswa.um.edu.my` (medical), and — added 2026-08-19 —
  `poseidonapollo11+coach@gmail.com` and `poseidonapollo11+exec@gmail.com`, which
  plus-address into the same mailbox. Without those last two, the digest's
  **executive** copy and the coach's **sport-scoped** recall slice could never be
  shown arriving. Coach Demo 02 shares Badminton with Coach Demo 01 on purpose:
  the reminder sends one email per *sport*, not per coach, so the pair
  demonstrates that rule.

---

## 6. Before you walk in

- [ ] **Re-measure §2** (command at the top of that section).
- [ ] **Put W1 to Dr Thung** — the injury-summary substitution. It should not
      surface first in the viva.
- [ ] **Re-print the five PDFs and look at them.** They have changed since you
      last did — dead-band shading, the squad body map, the band relabel.
- [ ] **Try the live email demo once before the day.** Admin → Settings →
      **Send now**, on either mail tile. It sends immediately and writes the
      outcome back onto the tile. Delivery lands in one Gmail mailbox across four
      plus-addressed accounts; `@isn.gov.my` recipients bounce, which is expected.
      Nothing needs a database edit or a restart.
- [ ] **Open the deployed site a few minutes early** (§7). The first request
      after an idle spell can take a minute while Vercel and Aiven wake; that is
      not something to discover in front of a panel.
- [ ] **Decide which instance you demo from.** The laptop is faster and can
      import the 7.58 MB report; the deployment proves it is real. Doing the
      import locally and everything else live is a defensible split — say so
      rather than switching silently.
- [ ] **Rehearse Q1, Q2 and Q4 aloud.** Those are the three where a hesitant
      answer reads as a gap rather than a decision.

---

## 7. The deployed instance

| | |
|---|---|
| Web | `https://airms-web.vercel.app` |
| API | `https://airms-api.vercel.app` |
| Database | Aiven managed MySQL 8.4.8, TLS verified with the provider CA |

Seeded identically to the laptop and **verified against the deployment**, not
inferred from it: 62 athletes, 74 screenings, 49 cohorts, bands 38/9/9, the
three engine-level foreign keys intact and the five-value role enum preserved —
which is why the choice was real MySQL rather than a MySQL-*compatible* engine,
where a schema leaning on foreign keys quietly loses them.

All five roles authenticate against it; an executive reads analytics and is
refused settings (403); an athlete is refused the roster and a teammate's report
(403) and gets their own (200); a PDF streams out of a serverless function.

**Two things to say before the panel finds them.** Deploys currently run from
the CLI because the Git webhook does not fire for this branch — a platform
annoyance, not a system property. And the demo accounts with their documented
passwords are reachable on that public URL; that is a deliberate choice for a
stakeholder sandbox seeded with synthetic data, and it is not what an ISN
deployment would look like.

**Cold starts.** The first request after an idle period can take up to a minute
— Vercel waking a function plus Aiven waking a free-tier database. Open the site
a few minutes before the demo so the panel does not watch a spinner.

---

## 8. What this file does not vouch for

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

*Revised the same day — and the revision proves the point. The first version of
§6 told you to clear the digest marker with raw SQL. A button for that already
existed on the admin Settings page, and I had written the instruction without
opening the page: the same "assert from the value, not the consumer" error this
dossier warns about in §3 Q4's retraction. §6 and L1 now describe the **Send
now** control added afterwards (`DESIGN_DECISIONS.md` §35), and L7 the two
deliverable inboxes that let the executive digest and the coach's recall slice be
seen arriving at all.*
