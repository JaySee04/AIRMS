# Who can do what in AIRMS

*Measured, not described. Every line below comes from calling all 52 endpoints as
each non-administrator role against the running system (`cd backend; npm run
audit:access`), re-run 2026-09-04. Where this disagrees with any other document,
this one is right, because the other one was written and this one was executed.*

Written to open a discussion, not to close one. It changes nothing.

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
| Athlete roster (all) | ✓ | ✓ | — | ✓ | — |
| One athlete's full record | ✓ | ✓ | *sport* | ✓ | *self* |
| Screening history | ✓ | ✓ | *sport* | ✓ | *self* |
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

## 3. Four things worth a decision

These are the places where the current answer is defensible but not obvious.
None is a bug.

### 3.1 Medical staff reach every athlete in the institute

A clinician can open any athlete in any sport. A coach cannot. The argument for
it is that clinical cover is not organised by sport — whoever is on duty may be
asked about anybody — and scoping them would mean an athlete could arrive at a
clinician who cannot see their history.

The argument against is simply least privilege: a physiotherapist who only ever
works with swimmers can currently read every badminton athlete's clinical record.

**Open question:** should medical be scopeable by sport or programme, the way a
coach is — as an *option* an administrator can set per account, defaulting to
unscoped so nothing changes for existing staff?

### 3.2 Executive reads named athletes, not just aggregates

`executive` was created for institutional oversight. It reaches the analytics and
the three institutional PDFs, and it also reaches **every athlete's full record
and every individual screening report** — a named person's clinical scores.

It has no write access anywhere, which is the property that matters most, and it
was granted the individual report deliberately so an executive can follow a
number down to the case behind it.

**Open question:** is following a number down to a named athlete part of
oversight, or should executive stop at the aggregate? Narrowing it is a two-line
change; the cost is that an executive asking "who are these nine red athletes?"
would have to ask a clinician.

### 3.3 Only medical staff have per-account capabilities

The per-user permission model — `viewRecords`, `uploadData`, `editCohortNorms`,
opt-out, revocable per account — applies to **medical only**. Coach and executive
are all-or-nothing: an administrator can create or deactivate them but cannot
tune what they reach.

In practice each of those roles is narrow enough that there is little to tune,
which is why it was built this way.

**Open question:** is there a real case for revoking, say, report downloads from
one particular executive? If not, this stays as it is and the answer in the viva
is "the capability model exists where capabilities vary".

### 3.4 The medical capabilities are coarse

`viewRecords` is one switch over the entire clinical surface — revoke it and the
account can see no athlete at all. There is no "read but not export", no "own
sport only", no "no PDF downloads".

**Open question:** does ISN need finer capabilities, or is the current
three-switch model the right size for a department of a handful of clinicians?

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
