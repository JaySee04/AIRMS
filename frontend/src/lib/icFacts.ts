// CORROBORATE A MATCH, SO NOBODY HAS TO TAKE IT ON TRUST.
//
// THE PROBLEM THIS REPLACES. Variant B collapses a report whose athlete
// resolved by itself, which buys the operator their afternoon back and asks
// them to accept a match they did not look at. That was posed as a trade —
// speed against clinical caution — and it is not one, because "look at the
// card" was never much of a check either: a person scanning fifty-four cards
// will not notice that the thirty-seventh report says Male where the athlete is
// Female.
//
// A MALAYSIAN IC ENCODES TWO OF THE FACTS THE REPORT PRINTS. The format is
// YYMMDD-PB-###G: the first six digits are the date of birth and the final
// digit's parity is the sex (odd male, even female). It is why `/teammates`
// withholds the IC at all (§43).
//
// The HoloMotion cover prints the athlete's AGE and GENDER. So a match can be
// checked against two independent facts that came from the report itself,
// derived from an identifier the roster already returns. No new endpoint, no
// new column, and nothing the operator has to read.
//
// THE RULE: a row may only collapse if it was corroborated. Where the IC cannot
// be parsed, or the report did not print an age or a gender, this returns
// `unknown` — and an unknown is NOT a pass. It is shown as unchecked and kept
// open, because a collapse that quietly meant "we could not tell" would be the
// silent-failure shape this project exists to avoid (docs/SILENT_FAILURES.md).

export interface IcFacts {
  /** Date of birth encoded in the first six digits. */
  dateOfBirth: Date;
  /** 'Male' | 'Female', from the parity of the final digit. */
  sex: 'Male' | 'Female';
}

/**
 * Pull the date of birth and sex out of a 12-digit Malaysian IC.
 *
 * Returns null rather than guessing on anything that is not one — legacy
 * `ATH0001` keys, a typo, a foreign athlete's passport number.
 *
 * THE CENTURY IS RESOLVED BY PLAUSIBILITY, NOT BY A CUTOFF YEAR. `070322` is
 * 2007 or 1907, and a hardcoded pivot ("under 30 means 2000s") silently
 * mis-dates somebody the day it stops being true. Instead both are tried
 * against the date the screening was taken and the one giving a sane age wins;
 * if neither or both do, this declines.
 */
export function icFacts(ic: string, on: Date): IcFacts | null {
  const digits = String(ic || '').replace(/\D/g, '');
  if (digits.length !== 12) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const candidates: Date[] = [];
  for (const century of [1900, 2000]) {
    const d = new Date(Date.UTC(century + yy, mm - 1, dd));
    // Reject a date the calendar rolled over — 31 February becomes 3 March.
    if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) continue;
    const age = ageOn(d, on);
    if (age >= 5 && age <= 100) candidates.push(d);
  }
  if (candidates.length !== 1) return null;

  const last = Number(digits.slice(11, 12));
  return { dateOfBirth: candidates[0], sex: last % 2 === 1 ? 'Male' : 'Female' };
}

/** Whole years between a date of birth and a given day. */
export function ageOn(dateOfBirth: Date, on: Date): number {
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday = on.getUTCMonth() < dateOfBirth.getUTCMonth()
    || (on.getUTCMonth() === dateOfBirth.getUTCMonth() && on.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export type CheckVerdict = 'agrees' | 'disagrees' | 'unknown';

export interface MatchCheck {
  verdict: CheckVerdict;
  /** What was compared, for the operator to read at a glance. */
  sex: { report: string | null; ic: string | null; ok: boolean | null };
  age: { report: number | null; ic: number | null; ok: boolean | null };
  /** One line naming what disagreed, when something did. */
  reason: string | null;
}

/**
 * Check a proposed athlete against what the report itself printed.
 *
 * `assessedAt` matters: age is compared AT THE SCREENING DATE, not today. A
 * report from last season is a year stale by now, and comparing against today's
 * age would report a disagreement on every correctly matched old report — the
 * false alarm that gets a check switched off.
 *
 * Age is allowed to be out by one year. The cover prints whole years and the
 * instrument's own rounding around a birthday is not something to accuse an
 * operator over; a real mismatch is years out, not one.
 */
export function checkMatch(args: {
  athleteId: string;
  reportAge: number | null;
  reportGender: string | null;
  assessedAt: string | null;
}): MatchCheck {
  const { athleteId, reportAge, reportGender, assessedAt } = args;
  const on = assessedAt ? new Date(assessedAt.replace(' ', 'T')) : null;
  const facts = on && !Number.isNaN(on.getTime()) ? icFacts(athleteId, on) : null;

  const icSex = facts ? facts.sex : null;
  const icAge = facts && on ? ageOn(facts.dateOfBirth, on) : null;

  const sexOk = icSex && reportGender ? icSex === reportGender : null;
  const ageOk = icAge !== null && reportAge !== null ? Math.abs(icAge - reportAge) <= 1 : null;

  const out: MatchCheck = {
    verdict: 'unknown',
    sex: { report: reportGender ?? null, ic: icSex, ok: sexOk },
    age: { report: reportAge ?? null, ic: icAge, ok: ageOk },
    reason: null,
  };

  if (sexOk === false || ageOk === false) {
    out.verdict = 'disagrees';
    const bits: string[] = [];
    if (sexOk === false) bits.push(`the report says ${reportGender} and this IC is ${icSex}`);
    if (ageOk === false) bits.push(`the report says age ${reportAge} and this IC gives ${icAge}`);
    out.reason = bits.join('; ');
    return out;
  }
  // BOTH must be checkable. One agreeing fact is a coincidence away from being
  // wrong — half the roster is Female — so a single check is not corroboration.
  if (sexOk === true && ageOk === true) out.verdict = 'agrees';
  return out;
}
