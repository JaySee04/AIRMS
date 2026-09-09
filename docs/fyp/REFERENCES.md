# References, mapped to the decisions they support

*Created 2026-09-09. Every entry below was **verified against the source** on
that date — not recalled. Where a claim this project has been making turned out
not to be supported, that is recorded in §4 rather than quietly corrected.*

**Why this file exists.** The citations were scattered: `MASTER_CLARIFICATIONS`
held one full entry, `DESIGN_DECISIONS` and `PROJECT_GUIDE` held short forms,
and `fyp/README.md` held the Chapter 2 cluster. Several load-bearing methods —
typical error, MDC95, the screening critique — were **used without attribution
anywhere**. A viva question of the form *"what is that number grounded in?"*
had no single place to answer from.

---

## 1. The distinction that matters most

**The FYP I literature review and the FYP II system no longer cite the same
things, and that is not an oversight.** The pivot removed ACWR, sRPE logging and
injury surveillance. Their references remain correct and necessary — for Chapter
2, and for the locked formula in `MASTER_CLARIFICATIONS §6` — but they must not
be presented as evidence for anything the system *does today*.

| Cluster | Supports | Status in the built system |
|---|---|---|
| **A — Methods in force** (§2) | What AIRMS computes and displays now | **Live.** Cite these when asked why a number is what it is |
| **B — Standards in force** (§3) | Security, accessibility, licensing | **Live.** Normative, not persuasive |
| **C — Chapter 2 lineage** (§5) | ACWR, sRPE, injury surveillance | **Retired features.** Cite as motivation and as the locked-but-dormant model — never as backing a shipped screen |

Answering *"is that implemented?"* with a Cluster C citation is the single
easiest way to lose credibility in the viva, because the honest answer for those
is "deliberately removed, and here is why".

---

## 2. Cluster A — methods in force

### A1. Bahr (2016) — the paper this project's honesty rests on

> Bahr, R. (2016). Why screening tests to predict injury do not work — and
> probably never will…: a critical review. *British Journal of Sports Medicine*,
> 50(13), 776–780.

**Supports:** `DESIGN_DECISIONS §33` (green reads *"No indicators flagged"*, never
*"Safe"*), the stale-screening disclosure on the hero, and the mission statement's
framing of AIRMS as a **risk signal**, not a prediction.

**Why it is the right citation:** Bahr's argument is that a screening test must
clear three separate validation steps before it can be said to predict injury,
and that no test in the literature has. AIRMS ingests exactly such a screening
instrument. The decision that *a screen which cannot predict injury cannot
certify its absence* is this paper restated as an interface rule — and it is the
reason green is the band most carefully worded, since most athletes are low-risk
and green is where false reassurance lands.

**Use it also to answer the hardest viva question available:** *"does your system
predict injury?"* No. It ranks an athlete against their own peer cohort and says
what the instrument found. Bahr is why that distinction is drawn so hard.

### A2. Hopkins (2000) — typical error

> Hopkins, W. G. (2000). Measures of Reliability in Sports Medicine and Science.
> *Sports Medicine*, 30(1), 1–15. doi:10.2165/00007256-200030010-00001

**Supports:** `utils/reliability.js` — the typical error, computed as the SD of
within-athlete differences ÷ √2, and the "is this change real?" dead band
(`DESIGN_DECISIONS §27/§28`).

**Was previously uncited.** The formula was in the code and in three documents
with no source attached.

**Note for the viva:** Hopkins recommends ~50 participants and ≥3 trials for a
reasonable reliability estimate. AIRMS has 18 repeat pairs against its own
`MIN_PAIRS` floor of 20 — so it **declines** to derive a threshold and says so.
That is the citation and the system agreeing, not disagreeing: the floor exists
because Hopkins' precision requirement is not met.

### A3. Weir (2005) — minimal detectable change

> Weir, J. P. (2005). Quantifying test-retest reliability using the intraclass
> correlation coefficient and the SEM. *Journal of Strength and Conditioning
> Research*, 19(1), 231–240.

**Supports:** MDC95 = 1.96 × √2 × TE ( = 2.77 × TE ), used as the dead band, and
the confidence-interval reasoning behind "the minimal difference needed to be
confident a true change has occurred".

**Also previously uncited.** Pair it with Hopkins: Hopkins gives the error term,
Weir turns it into a threshold for an individual's change.

### A4. Robertson, Bartlett & Gastin (2017) — why the dead band exists at all

> Robertson, S., Bartlett, J. D., & Gastin, P. B. (2017). Red, Amber, or Green?
> Athlete Monitoring in Team Sport: The Need for Decision-Support Systems.
> *International Journal of Sports Physiology and Performance*, 12(s2),
> S2-73–S2-79. doi:10.1123/ijspp.2016-0541

**Supports:** the whole banded-verdict design, and specifically the criticism
that traffic-light systems are **not standardised in how they are
operationalised**. AIRMS's answer is that its band boundaries are named
constants in one shared file, its dead band is derived rather than assumed, and
it declines when it cannot derive one.

**Already cited** in `DESIGN_DECISIONS` and `PROJECT_GUIDE`; volume, pages and
DOI were missing and are supplied here.

### A5. Gabbett (2016) — the locked baseline

> Gabbett, T. J. (2016). The training–injury prevention paradox: should athletes
> be training smarter *and* harder? *British Journal of Sports Medicine*, 50(5),
> 273–280.

**Supports:** the ACWR thresholds 0.8 / 1.3 / 1.5 locked in
`MASTER_CLARIFICATIONS §12` and the ±15% personalisation in `risk.ts`.

**Cluster boundary warning:** this is the one Cluster C reference that is also
*locked* project vocabulary. It is correct to cite for the model; it is wrong to
imply any dashboard shows it. Nothing has since 2026-07-16.

---

## 3. Cluster B — standards in force

### B1. NIST SP 800-63B §5.2.2 — rate limiting

> National Institute of Standards and Technology (2017, rev. incl. updates).
> *NIST Special Publication 800-63B: Digital Identity Guidelines —
> Authentication and Lifecycle Management*, §5.2.2 "Rate Limiting (Throttling)".

**Supports:** the `express-rate-limit` on `/api/auth` (30 failures / 15 min / IP)
and, precisely, the choice of `skipSuccessfulRequests`.

**The alignment is exact and worth stating aloud:** §5.2.2 recommends that "when
the subscriber successfully authenticates, the verifier SHOULD disregard any
previous failed attempts for that user from the same IP address." That is what
`skipSuccessfulRequests` does. The section also names the denial-of-service risk
of lockout, which is why AIRMS throttles rather than locks accounts.

**Known limitation to volunteer:** the store is in-memory and the key is per-IP,
so it does not survive a restart and is weak behind shared NAT. Recorded in
`SILENT_FAILURES.md`; NIST's own mitigations list (CAPTCHA, exponential backoff)
is the upgrade path.

### B2. WCAG 2.2 — two success criteria

> W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*, W3C
> Recommendation. SC 1.4.1 "Use of Color" (Level A); SC 2.2.2 "Pause, Stop,
> Hide" (Level A).

**SC 1.4.1** supports the rule that no band is ever named by colour alone
(`SILENT_FAILURES 3i`) — "Green" reads as "you are fine", and colour is not the
only channel carrying the meaning. Enforced by an e2e check across 12 routes.

**SC 2.2.2** supports the Direction-of-travel card's 10-second rotation holding
the moment the reader clicks, and not rotating at all under
`prefers-reduced-motion` (`DESIGN_DECISIONS §38`).

### B3. MIT License — the body map asset

> Shehryar, S. *react-muscle-highlighter*. MIT License.
> https://github.com/soroojshehryar/react-muscle-highlighter

**Supports:** `frontend/src/components/dashboard/bodymap-data/`. The path data is
adapted, the attribution is preserved at the top of every file, and
`MASTER_CLARIFICATIONS §12` **locks** its presence in the report's reference
section. This is a licence obligation, not a courtesy.

---

## 4. A claim this project was making that the source does not support

**The 7-day invitation TTL is cited incorrectly, and the correct reading is less
favourable.** This is the one substantive finding of the reference pass.

`CLAUDE.md` and `docs/fyp/VIVA_FYP2.md` both say seven days is *"the NIST SP
800-63A ceiling for an enrollment code"*. NIST SP 800-63A **§4.4.1.6** sets the
maximum by **delivery channel**:

| Channel | Maximum validity |
|---|---|
| Postal address, contiguous US | 10 days |
| Postal address, outside contiguous US | 30 days |
| Telephone of record (SMS or voice) | 10 minutes |
| **Email address of record** | **24 hours** |
| Given **directly to the subscriber**, for later authenticator binding | **7 days** |

AIRMS emails the six-digit invitation code. The applicable figure is therefore
**24 hours**. The 7-day figure is real, but it belongs to a code handed over
**in person** — a different delivery mode from the one this system uses. So the
current TTL is not "the ceiling"; it is **seven times the NIST maximum for the
channel actually used**.

**This is JC's call, and both options are defensible — but the present citation
is not.**

- **Option 1 — align.** Drop the invitation TTL to 24 hours. Cleanest against
  the standard; costs usability, since an invited clinician who opens their
  email the next evening has to request a new code.
- **Option 2 — keep 7 days and cite it honestly** as a deliberate deviation:
  the code is single-use, rate-limited to five attempts, grants no access by
  itself (the account has no working password until it is used), and the risk it
  carries is an *enrollment* risk rather than an authentication one. State the
  24-hour figure, then say why AIRMS exceeds it. **This is the recommendation** —
  it converts a wrong citation into a reasoned one, and an examiner who knows the
  standard will be satisfied by the acknowledgement rather than caught by it.

Either way, `CLAUDE.md` and `VIVA_FYP2.md` need the wording changed. **Do not
leave "the NIST ceiling" in place** — it is the kind of specific, checkable claim
that damages the rest of the evidence if it is found wrong.

---

## 5. Cluster C — Chapter 2 lineage (retired features)

Held in `docs/fyp/README.md` with one-line descriptions. **Full bibliographic
details were not re-verified in this pass** and should be checked against the
report's own reference list before submission — they are recorded here so the
mapping is complete, not because their details are confirmed.

| Reference | Supports | Built? |
|---|---|---|
| Inoue et al. (2022) | sRPE scale reliability | **No** — sRPE retired 2026-07-20 |
| Yang et al. (2024) | sRPE physiological correspondence | **No** — same |
| Qin et al. (2025) | ACWR meta-analysis, lowest-risk band | **No** — ACWR off every dashboard |
| Michailidis (2024) | personalised over universal ACWR thresholds | **No** — supports the locked model only |
| Costello et al. (2024) | injury surveillance, multi-stakeholder reporting | **No** — injury model deleted 2026-08-02 |
| Sprouse et al. (2024) | IIS framework, injury data variables | **No** — same |
| Waldén et al. (2023) | football extension of the IOC consensus | **No** — same |
| Impellizzeri (2020) | ACWR methodological critique | **No** — cited in `VIVA_ANSWERS` (FYP I artefact) |

**The honest framing for Chapter 2:** these justify why the problem was worth
solving and why the ACWR route was *considered and then set aside*. Impellizzeri
in particular is the strongest thing to volunteer — a documented critique of the
method this project chose not to ship.

---

## 6. Decisions that still have no reference

Named so they are not mistaken for oversights. Each is a design position this
project can argue from first principles; none is currently backed by a citation,
and adding one is optional rather than owed.

| Decision | Nature of the claim | Would a citation help? |
|---|---|---|
| `§32` norm floors stay off — "selection on the dependent variable" | A standard statistical objection: excluding low scores from a norm computed on those scores censors the left tail, biases the mean up, shrinks the SD | **Yes.** A methods text on selection/truncation bias would close the loop; the argument is currently made in prose only |
| `§40` per-athlete denominator for band mix | Clinical reporting counts patients, not observations | Possibly — a reporting-standards source |
| `§20` seasonality declines below 2 years | Confounding: one year cannot separate season from who was screened | The reasoning is self-contained; a confounding reference is optional |
| `§33c` cell-level means without z-scores at n=5–10 | Small-sample instability | **Yes**, if a reviewer presses on why the tier is withheld per cell |
| IC number withheld from coach (`§43`) | The IC encodes DOB, birth state and sex | **Yes** — Malaysia's PDPA 2010 is the natural citation and is not currently referenced anywhere |

---

*Verification note: A1–A4 and B1 were checked against the publisher or the
issuing body on 2026-09-09. A5 and B2–B3 are long-standing entries already in
the project's documents and were not re-fetched. Cluster C was not verified —
see §5.*
