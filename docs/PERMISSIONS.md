# Who can do what in AIRMS

*Measured, not described. Every line below comes from calling all 52 endpoints as
each non-administrator role against the running system (`cd backend; npm run
audit:access`), re-run 2026-09-04. Where this disagrees with any other document,
this one is right, because the other one was written and this one was executed.*

Written to open a discussion; §3 records how it was settled. Two of the four
questions produced changes and the table below already reflects them.

---

## 1. The five roles in one sentence each

| Role | What it is for | Writes anything? |
|---|---|---|
| **admin** | Running the institute — people, norms, settings, the trail. Dr Thung's role. | Yes, everything |
| **medical** | The clinician's working surface: every athlete, import, overrides, norms. | Yes |
| **coach** | One sport's squad, read-only. | **No** |
| **executive** | Institutional oversight — analytics and reports, read-only. | **No** |
| **athlete** | Their own record, and their squad without the identifiers. | **No** |

Three of the five cannot change anything. That is the shape of the system and it
held under test: **every one of 21 write endpoints refused coach, executive and
athlete.**

---

## 2. What each role can reach

`✓` reachable · `—` refused (403) · *self* = only their own record ·
*sport* = only their assigned sport

| | admin | medical | coach | executive | athlete |
|---|---|---|---|---|---|
| **Reading athletes** | | | | | |
| *(opening a record writes an `athlete.view` audit row)* | | | | | |
| Athlete roster (all) | ✓ | ✓ | — | ✓ | — |
| One athlete's full record | ✓ | ✓ | *sport* | — | *self* |
| Screening history | ✓ | ✓ | *sport* | — | *self* |
| Squad list without IC numbers | — | — | — | — | ✓ |
| Sport context for an athlete | ✓ | ✓ | — | — | — |
| **Reports** | | | | | |
| Individual screening PDF | ✓ | ✓ | *sport* | ✓ | *self* |
| Team PDF | ✓ | ✓ | *sport* | ✓ | — |
| Holistic / programme-activity / activity-log PDF | ✓ | — | — | ✓ | — |
| Excel backup export | ✓ | — | — | — | — |
| **Analytics** | | | | | |
| Screening analytics, programme periods | ✓ | — | — | ✓ | — |
| Squad readiness board | — | — | ✓ | — | — |
| Activity log + staff activity | ✓ | — | — | ✓ | — |
| **Governance** | | | | | |
| View cohort norms / versions / settings | ✓ | ✓ | — | — | — |
| Recompute norms, save a version, edit a threshold | ✓ | ✓ | — | — | — |
| Pin / unpin / restore / delete a norm version | ✓ | — | — | — | — |
| Change institution settings | ✓ | — | — | — | — |
| Force a scheduled mail run | ✓ | — | — | — | — |
| **Data** | | | | | |
| Import a HoloMotion PDF | ✓ | ✓ | — | — | — |
| Override a risk band | ✓ | ✓ | — | — | — |
| Set an athlete's injury flag | ✓ | ✓ | — | — | — |
| Create / edit / delete an athlete | ✓ | edit only | — | — | — |
| **People** | | | | | |
| Create, invite, deactivate an account | ✓ | — | — | — | — |

---

## 3. Four things that were open, and how they were settled

*Argued both ways on 2026-09-04 and decided. Two produced changes, two did not.
The reasoning is kept because the answers are only as good as it.*

None was a bug. Each was a place where the existing answer was defensible but
not obvious, which is precisely where a system quietly drifts.

### 3.1 Medical staff reach every athlete in the institute

A clinician can open any athlete in any sport. A coach cannot. The argument for
it is that clinical cover is not organised by sport — whoever is on duty may be
asked about anybody — and scoping them would mean an athlete could arrive at a
clinician who cannot see their history.

The argument against is simply least privilege: a physiotherapist who only ever
works with swimmers can currently read every badminton athlete's clinical record.

**Settled: leave it unscoped, and make the reading visible instead.**

Clinical cover is not organised by sport. Whoever is on duty may be asked about
anybody, and an athlete arriving at a clinician who cannot see their history is a
worse failure than a colleague reading a record they did not need. Scoping would
buy a little confidentiality and cost the thing the system is for.

But that argument only holds if the reading is *accountable*, and it was not.
The trail logged report **downloads** — for the stated reason that "for a
read-only role reading is the only auditable act" — while opening the same
athlete's full record on screen left no trace at all. A clinician could read
every record in the institute invisibly, and downloading one PDF was permanent.

`GET /athletes/:id` now writes an **`athlete.view`** row: who opened whose record,
and when. It is written after every permission check, so a refused request logs
nothing; an athlete opening their *own* record is skipped, because that is not an
access anybody needs to review and logging it would bury the ones that are; and
it is counted as a READ in the staff rollup, since summing views with changes
would let an account that only ever looked outrank the clinicians doing the work.

The answer to "should medical be scoped?" is therefore **no — because the
alternative is accountability, and now that alternative actually exists.**

### 3.2 Executive reads named athletes, not just aggregates

`executive` was created for institutional oversight. It reaches the analytics and
the three institutional PDFs, and it also reaches **every athlete's full record
and every individual screening report** — a named person's clinical scores.

It has no write access anywhere, which is the property that matters most, and it
was granted the individual report deliberately so an executive can follow a
number down to the case behind it.

**Settled: narrowed — the raw record is gone, the report stays.**

Following a figure down to the case *is* oversight, so the individual screening
report remains open to executive. What went is the raw record endpoint
(`/athletes/:id`) and the screening-history endpoints, which no executive screen
ever called — reach nobody used.

The capability is therefore **funnelled, not removed**, and that is the whole
point. The individual PDF is audited as `report.download`; the JSON endpoint was
not. An executive following a number to a named athlete now leaves a row in the
trail either way. Oversight of the institution should itself be visible.

Measured after the change: executive is refused `/athletes/:id`,
`/screenings/athlete/:id` and `/screenings/:id/full`, and still reaches the
analytics, the activity log and all three reports.

### 3.3 Only medical staff have per-account capabilities

The per-user permission model — `viewRecords`, `uploadData`, `editCohortNorms`,
opt-out, revocable per account — applies to **medical only**. Coach and executive
are all-or-nothing: an administrator can create or deactivate them but cannot
tune what they reach.

In practice each of those roles is narrow enough that there is little to tune,
which is why it was built this way.

**Settled: leave it.** Coach and executive are each narrow enough that there is
nothing meaningful to tune — a coach sees one squad read-only, an executive sees
aggregates and reports read-only. Adding a permission surface nobody has asked
for is complexity that must then be tested, explained and kept correct.

The honest formulation is: **the capability model exists where capabilities
vary.** Medical staff have a wide surface with genuinely separable parts (view,
import, edit norms); the other roles do not.

### 3.4 The medical capabilities are coarse

`viewRecords` is one switch over the entire clinical surface — revoke it and the
account can see no athlete at all. There is no "read but not export", no "own
sport only", no "no PDF downloads".

**Settled: leave it, now that the gap it hid is closed.**

The tempting extra switch was "read but not export" — export being the point at
which data leaves the building. But every export was already audited, and as of
today every *view* is too, so the distinction the switch would have drawn is now
drawn in the trail instead: both are recorded, and both are visible to an
administrator reviewing who looked at what.

Three switches for a department of a handful of clinicians is the right size. A
fourth would add a state to reason about without adding a decision anybody at ISN
is waiting to make.

---

## 4. What is already settled and should stay

- **Three roles cannot write.** Verified by calling every write endpoint as each
  of them. This is the backbone and nothing here proposes changing it.
- **Deactivation is immediate** — the user row is re-read on every request, so
  switching an account off ends its session on the next click.
- **An administrator cannot deactivate themselves**, and the institution cannot
  be left with no active administrator.
- **Accounts are created without a usable password** — one is generated, hashed
  and discarded unread, and the invitee sets the first real one.
- **A scoped role's refusal reveals nothing.** A coach gets the same answer for
  an athlete who does not exist as for one in another sport, so the roster cannot
  be probed for IC numbers.
- **Opening a clinical record is recorded** (`athlete.view`), counted as a read
  rather than a change, skipped for an athlete's own record, and never written
  for a request that was refused.
- **Clinician notes stay clinical.** `injuryNote`, `injuryBy` and `injuryAt` are
  withheld from coach, executive and athlete; `isInjured` is shared, because it is
  a roster fact a coach needs.

---

## 5. How to re-check this

```powershell
cd backend; npm run audit:access     # every endpoint, every non-admin role
cd frontend; npm run e2e             # the browser-side gate, 59 checks
```

Both need `npm run dev` running. `audit:access` fails if any read-only role
completes a write, so it is a regression test, not just a report.
