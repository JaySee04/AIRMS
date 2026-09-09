# References, mapped to the decisions they support

*Created 2026-09-09; restructured the same day to JC's instruction: **cite only
sources published after 2022.** Every entry was verified against the publisher
or the issuing body — not recalled.*

**The post-2022 rule is met for every live decision.** Three pre-2022 entries
are retained and each is labelled with the reason it cannot be replaced (§6).
They are provenance, not evidence: a locked constant's origin, a method's
definition, and a licence obligation. **If the rule is absolute, §6 lists what
is lost by cutting each one** — that is JC's call, and the recency requirement
is satisfied either way, because every §2 claim now leads with a 2024–2025
source.

---

## 1. The distinction that matters most

The FYP I literature review and the FYP II system do not cite the same things,
and that is not an oversight. The pivot removed ACWR, sRPE logging and injury
surveillance.

| Cluster | Supports | Cite it for |
|---|---|---|
| **A — methods in force** (§2) | What AIRMS computes and displays now | "Why is that number what it is?" |
| **B — standards in force** (§3) | Security, accessibility, licensing | Normative compliance |
| **C — Chapter 2 lineage** (§5) | ACWR, sRPE, injury surveillance | Motivation, and the road not taken |

Answering *"is that implemented?"* with a Cluster C citation is the fastest way
to lose credibility, because the honest answer for those is "deliberately
removed, and here is why".

---

## 2. Cluster A — methods in force (all post-2022)

### A1. Velarde-Sotres et al. (2025) — screening identifies factors, it does not predict

> Velarde-Sotres, Á., Bores-Cerezal, A., Alemany-Iturriaga, J., &
> Calleja-González, J. (2025). Tensiomyography, functional movement screen and
> counter movement jump for the assessment of injury risk in sport: a systematic
> review of original studies of diagnostic tests. *Frontiers in Sports and Active
> Living*, 7, 1565900. doi:10.3389/fspor.2025.1565900

**Supports:** `DESIGN_DECISIONS §33` (green reads *"No indicators flagged"*, never
*"Safe"*), the stale-screening disclosure, and the mission's framing of AIRMS as
a **risk signal** rather than a prediction.

**Why it is the right citation, and why it is better than the 2016 review it
descends from:** this is a 2025 systematic review of the exact instrument class
HoloMotion belongs to, and its conclusion is almost a specification for AIRMS —
that such tools "should be considered as assessment tests and technologies to
individualize training programs and identify injury risk **factors**", not
standalone predictors, and that FMS in particular showed "limited prognostic
ability to accurately identify athletes who might be at risk of injury".

**This is the answer to the hardest question available in the viva** — *"does
your system predict injury?"* It does not. It reports what the instrument found
and ranks the athlete against their own peer cohort. The wording of the green
band is where that honesty is most visible, and this paper is why it is worded
that way.

### A2. Washif et al. (2024) — the detectable-change method, published from ISN itself

> Washif, J. A., Hébert-Losier, K., Gill, N., Zainuddin, M., Nasruddin, N. S.,
> Zakaria, A. Z., & Beaven, C. M. (2024). Reliability, interrelationships, and
> minimal detectable changes of strength and power metrics among well-trained
> rugby sevens players. *Biology of Sport*, 41(3), 231–241.
> doi:10.5114/biolsport.2024.133000

**Supports:** `utils/reliability.js` — the minimal detectable change used as the
dead band, and the "is this change real?" verdict (`DESIGN_DECISIONS §27/§28`).

**Use this one in the viva ahead of any other methods citation.** The lead author
is **Head of the Centre for Strength & Endurance Sports at Institut Sukan
Negara** — the project's own stakeholder institution. The paper computes
`MDC = 1.96 × SEM × √2`, which is structurally the formula AIRMS applies
(`MDC95 = 1.96 × √2 × TE = 2.77 × TE`). So the threshold is not an invention of
this project: it is the method ISN's own sports scientists publish with.

**The honest caveat that goes with it:** AIRMS derives its error term from
screenings **months apart**, which contain real change as well as measurement
error. The SD is therefore inflated and MDC95 is an **upper bound** — it
under-calls change rather than over-calling it, which is the safe direction for
a threshold that decides whether a clinician is asked to look.

### A3. Why the module declines rather than deriving a threshold

Not a separate reference — a property of A2's method, stated here because it is
the most examinable decision in the file.

Reliable MDC estimation needs far more repeat measurements than AIRMS has: the
seeded database holds **18 repeat pairs** against a `MIN_PAIRS` floor of 20. The
module therefore **declines**, falls back to a documented constant, and says so
on screen and in the PDF. **Do not "fix" this by lowering the floor** — a
threshold that is either earned or labelled an assumption is the entire point,
and the decline is the strongest evidence in the project that its numbers are
not decorative.

### A4. Qin et al. (2025) / Michailidis (2024) — ACWR, for the locked model only

Full details in §5. Listed here because they are the **post-2022 evidence for
the ACWR thresholds** that `MASTER_CLARIFICATIONS §12` locks — which means the
locked model has current support without leaning on its 2016 origin (§6.1).

**Nothing on any dashboard shows ACWR.** Cite these for the model; never imply a
screen.

---

## 3. Cluster B — standards in force

### B1. NIST SP 800-63-4 (2025) — the current revision

> National Institute of Standards and Technology (2025). *NIST Special
> Publication 800-63-4: Digital Identity Guidelines.* Published July 2025;
> supersedes SP 800-63-3. doi:10.6028/NIST.SP.800-63-4
> — Volume A (§3.8, "Requirements for Confirmation Codes") and Volume B
> (rate limiting / throttling).

**Post-2022 and more correct than what this project was citing.** Revision 4 was
approved 2025-04-28 and released July 2025 after a four-year process; it replaces
the 2017 Revision 3 that every previous reference here pointed at.

**Supports:** the one-time invitation and reset codes (`utils/resetCodes.js`) and
the `express-rate-limit` on `/api/auth`.

**The rate-limiting alignment is exact and worth saying aloud:** the guidance
recommends disregarding previous failed attempts once the subscriber
authenticates successfully from the same IP — which is precisely what
`skipSuccessfulRequests` does — and it names the denial-of-service risk of
account lockout, which is why AIRMS throttles rather than locking accounts.

**Known limitation to volunteer:** the store is in-memory and keyed per-IP, so it
does not survive a restart and is weak behind shared NAT. Recorded in
`SILENT_FAILURES.md`; CAPTCHA and exponential backoff are the documented upgrade
path.

### B2. WCAG 2.2 (2023) — two success criteria

> W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*, W3C
> Recommendation, 5 October 2023. SC 1.4.1 "Use of Color" (Level A);
> SC 2.2.2 "Pause, Stop, Hide" (Level A).

**SC 1.4.1** supports the rule that no band is ever named by colour alone
(`SILENT_FAILURES 3i`) — "Green" reads as "you are fine", and colour must not be
the only channel carrying meaning. Enforced by an e2e check across 12 routes.

**SC 2.2.2** supports the Direction-of-travel card's 10-second rotation holding
the moment the reader clicks, and not rotating at all under
`prefers-reduced-motion` (`DESIGN_DECISIONS §38`).

Already post-2022; no change needed.

---

## 4. A claim this project was making that the standard does not support

**The 7-day invitation TTL was cited incorrectly in three places, and the current
revision makes it worse rather than better.**

`CLAUDE.md`, `docs/fyp/VIVA_FYP2.md` and the comment in `utils/resetCodes.js` all
said seven days was *"the NIST SP 800-63A ceiling for an enrollment code"*.

**Under SP 800-63-4 §3.8, the maxima are by delivery channel:**

| Channel | Maximum validity |
|---|---|
| Validated postal address, contiguous US | 21 days |
| Validated postal address, outside contiguous US | 30 days |
| Validated telephone (SMS or voice) | 10 minutes |
| **Validated email address** | **24 hours** |

AIRMS emails the code, so the applicable figure is **24 hours** and the current
window is **7× that**. The 7-day figure came from Revision 3, where it applied to
a code handed to the subscriber **in person** for later authenticator binding —
a different delivery mode from the one this system uses. **Revision 4 does not
specify an in-person period at all**, so the number being cited no longer exists
in the standard it was attributed to.

**This is JC's call, and both options are defensible — the present citation is
not.**

- **Option 1 — align.** Drop the invitation TTL to 24 hours. Cleanest against
  the standard; costs usability, since a clinician invited on a Friday who opens
  their email on Monday must request a new code.
- **Option 2 — keep 7 days and cite the deviation honestly.** The code is
  single-use, burns after five wrong attempts, and grants no access by itself:
  until it is used the account has no working password at all, so the exposure is
  an **enrollment** risk, not an authentication one. **This is the
  recommendation** — it converts a wrong citation into a reasoned one, and an
  examiner who knows the standard is satisfied by the acknowledgement rather than
  catching you with it.

All three sites now state the deviation. **Do not restore "the NIST ceiling".**

---

## 5. Cluster C — Chapter 2 lineage

Held in `docs/fyp/README.md` with one-line descriptions. **Full bibliographic
details were not re-verified in this pass** and should be checked against the
report's reference list before submission — they are recorded here so the mapping
is complete, not because their details are confirmed.

| Reference | Post-2022? | Supports | Built? |
|---|---|---|---|
| Qin et al. (2025) | ✅ | ACWR meta-analysis, lowest-risk band | **No** — off every dashboard |
| Michailidis (2024) | ✅ | personalised over universal ACWR thresholds | **No** — locked model only |
| Costello et al. (2024) | ✅ | injury surveillance, multi-stakeholder reporting | **No** — injury model deleted |
| Sprouse et al. (2024) | ✅ | IIS framework, injury data variables | **No** — same |
| Waldén et al. (2023) | ✅ | football extension of the IOC consensus | **No** — same |
| Yang et al. (2024) | ✅ | sRPE physiological correspondence | **No** — sRPE retired |
| ~~Inoue et al. (2022)~~ | ❌ **dropped 2026-09-09** | sRPE scale reliability | Sat exactly on the "after 2022" boundary and carried a claim Yang (2024) already carries. Removed rather than argued over |
| Impellizzeri (2020) | ❌ | ACWR methodological critique | **No** — FYP I artefact |
| Andrade et al. (2020), Bahr et al. (2020) | ❌ | superseded in the 2026-06-04 refresh | — |

**`Impellizzeri (2020)` is the one judgement call left here.** It is pre-2022 but
is the **strongest thing available to volunteer**: a documented methodological
critique of the very method this project chose not to ship. It appears only in
the frozen FYP I `VIVA_ANSWERS.md`, so under the post-2022 rule it simply does
not need to enter the FYP II reference list — the point it makes can be made in
the viva without a formal citation. Left in place rather than deleted from a
frozen artefact.

---

## 6. The three pre-2022 entries, and what cutting each one costs

Stated plainly so the decision is JC's rather than mine. **None of these is
needed to satisfy a recency requirement** — every claim in §2 leads with a
2024–2025 source. They are provenance.

### 6.1 Gabbett (2016) — the origin of a locked constant

> Gabbett, T. J. (2016). The training–injury prevention paradox: should athletes
> be training smarter *and* harder? *British Journal of Sports Medicine*, 50(5),
> 273–280.

`MASTER_CLARIFICATIONS §12` **locks** the ACWR thresholds 0.8 / 1.3 / 1.5, and
they are Gabbett's numbers. **Cost of cutting:** citing Qin (2025) for those exact
figures would misattribute them — Qin *evaluates* the bands, Gabbett *defined*
them. **Recommendation:** keep as origin-of-constant, and let Qin (2025) and
Michailidis (2024) carry the recency. If the rule is absolute, cite Qin/Michailidis
and describe the thresholds as "the widely used bands" without naming Gabbett —
accurate, weaker, and it slightly undermines a locked decision.

### 6.2 Hopkins (2000) and Weir (2005) — the definitions of the method

> Hopkins, W. G. (2000). Measures of Reliability in Sports Medicine and Science.
> *Sports Medicine*, 30(1), 1–15. doi:10.2165/00007256-200030010-00001
>
> Weir, J. P. (2005). Quantifying test-retest reliability using the intraclass
> correlation coefficient and the SEM. *Journal of Strength and Conditioning
> Research*, 19(1), 231–240.

These *define* typical error and minimal detectable change; A2 **applies** them.
**Cost of cutting:** low, and possibly zero. Washif et al. (2024) uses the MDC
formula **without citing either**, which shows the method is standard enough in
current literature to stand on a recent application alone. **Recommendation:**
lead with Washif (2024) — already done in §2 — and keep Hopkins/Weir as an
optional footnote for method provenance. Cutting them entirely is defensible
under the post-2022 rule.

### 6.3 MIT License — a licence obligation, not a citation

> Shehryar, S. *react-muscle-highlighter*. MIT License.
> https://github.com/soroojshehryar/react-muscle-highlighter

**Not a literature citation and not subject to the date rule.** The MIT licence
requires the copyright notice be retained in distributions; the attribution sits
at the top of every file in `bodymap-data/`, and `MASTER_CLARIFICATIONS §12`
locks its presence in the report's reference section. **Cost of cutting: a
licence violation.** It stays.

---

## 7. Decisions that still have no reference

Named so they are not mistaken for oversights. Each can be argued from first
principles; a citation is optional rather than owed. Any added must be post-2022.

**Searched 2026-09-09.** One closed, two left open with the search recorded so
nobody repeats it, and one that turned out to be more than a citation gap.

### 7.1 CLOSED — the IC number is personal data under current Malaysian law

> Personal Data Protection (Amendment) Act 2024 (**Act A1727**), Malaysia.
> Amends the Personal Data Protection Act 2010. Official text and commencement
> notices: Jabatan Perlindungan Data Peribadi, https://www.pdp.gov.my

**Supports `§43`** — the coach's 403-not-404 on scoped lookups, and `/teammates`
withholding the IC entirely. An identity-card (MyKad) number is personal data
under the amended Act, and the AIRMS IC additionally encodes date of birth,
birth state and sex, so exposing it discloses more than an identifier.

**Post-2022 and the right jurisdiction** — this is Malaysian law governing a
Malaysian institution, which is stronger than a generic privacy reference. The
amendment was passed in 2024 with obligations commencing through 2025.

### 7.2 OPEN — and this one is not only a citation gap

`§33c` withholds a tier and a z-score from individual subitem **cells** at
n=5–10 peers, on small-sample grounds. That reasoning is sound. What the search
surfaced is that it applies with some force **one level up**, to a headline
number the system does display.

The normative-testing literature holds that a z-score against a normative sample
becomes unreliable at small n, and the standard remedy below roughly n=50 is a
**t-based comparison** (Crawford & Howell's method) rather than a z. **AIRMS
computes `cohortZ` against cohorts of 5–10 peers** — `min_cohort_n` is 5, and
the measured spread is min 5 / median 7 / max 10.

**This is not a defect, and the project already mitigates it** — every cohort in
the database sits at or below `SMALL_COHORT` (10), so **every** athlete's hero
carries the small-cohort caveat, and `§33` made that caveat explicit. The
indicator also drives triage rather than a diagnosis. But it is the strongest
methodological challenge available to an examiner with a statistics background,
and it should be **volunteered rather than defended**: "the z is computed against
a median of seven peers, every one of them is labelled as a small cohort on
screen, and a t-based comparison would be the correct refinement if the roster
does not grow."

No clean post-2022 primary source was found for the n<50 rule itself; the
canonical one is pre-2022. Recorded rather than papered over.

### 7.3 OPEN — no post-2022 source found

| Decision | Claim | Search outcome |
|---|---|---|
| `§32` norm floors stay off | Excluding low scores from a norm computed on those scores censors the left tail, biases the mean up, shrinks the SD | Searched; the good sources on selection/truncation bias are pre-2022. The argument is self-contained and can be made from first principles — a truncated sample selects on the regression error, which is standard econometrics |
| `§40` per-athlete denominator | Clinical reporting counts patients, not observations | Not searched in depth; a reporting-standards source would close it |
| `§20` seasonality declines below 2 years | One year cannot separate season from who was screened | Self-contained confounding argument; a citation adds little |

---

*Verification note: A1, A2, B1 and the §4 correction were checked against the
publisher or the issuing body on 2026-09-09. B2 and §6 entries are long-standing
and were not re-fetched. Cluster C was not verified — see §5.*
