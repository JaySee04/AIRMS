// Finding one athlete on a 62-name roster, from a name a clinician half
// remembers or an IC they are reading off a form.
//
// ONE matcher for every athlete search in the app — the medical rail and the
// upload page's AthleteSearchSelect both call it. They had a copy each, both
// `name.toLowerCase().includes(q) || athleteId.includes(q)`, which fails three
// ways that matter here:
//
//   1. WORD ORDER. "faris ahmad" does not appear as a substring of "Ahmad
//      Faris", so the athlete the clinician is looking at returns nothing. On
//      this roster names average two words and the given name comes first, so
//      recalling them the other way round is an ordinary thing to do.
//   2. IC PUNCTUATION. ICs are printed on forms as 070202-02-1001 and stored as
//      070202021001. Typing what is on the paper matched nothing at all.
//   3. NO RANKING. Results came back in roster order, so typing an exact IC put
//      that athlete wherever the alphabet left them.
//
// AND SEMANTICS, DELIBERATELY: every token in the query must match something.
// Each extra word the clinician types narrows the list. An OR would widen it,
// which is the opposite of what typing more is for.
//
// WHY RANKING IS A SAFETY FEATURE HERE, NOT A NICETY. Five names on this roster
// belong to two different athletes each (Adam Kumar, Aiman Bakar, Faris Ahmad,
// Zikri Chong, Zikri Ahmad — 10 of 62 people). Their clinical records are not
// interchangeable, and the only things that separate them are the IC and the
// sport. So an exact IC outranks everything, and `ambiguous` is set on any hit
// whose name is shared, for the UI to mark.

export interface SearchableAthlete {
  athleteId: string;
  name: string;
  sport?: string | null;
}

/** A run of text, flagged when it is part of what the query matched. */
export interface Segment {
  text: string;
  hit: boolean;
}

export interface SearchHit<T extends SearchableAthlete> {
  athlete: T;
  score: number;
  /** The athlete's name split for highlighting. */
  nameSegments: Segment[];
  /** The IC split for highlighting. */
  idSegments: Segment[];
  /** Another athlete in the SAME result set carries this exact name. */
  ambiguous: boolean;
}

// Fold case and accents, and treat apostrophes and hyphens inside names
// (Nur'ain, Abd-Rahman) as word breaks rather than letters.
function normalise(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const WORD_SPLIT = /[\s'’\-/,.]+/;

function words(s: string): string[] {
  return normalise(s).split(WORD_SPLIT).filter(Boolean);
}

/** Digits only — so a typed 070202-02-1001 matches a stored 070202021001. */
function digits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

/** Query tokens, each tagged as numeric (an IC fragment) or textual (a name). */
export function tokenise(query: string): Array<{ raw: string; numeric: boolean }> {
  const q = normalise(query).trim();

  // A query that is ONLY digits and separators is one IC, not several numbers.
  // Splitting 070202-02-1001 on its hyphens produced three fragments matched
  // independently, which found the athlete but as three weak "contains" hits —
  // so the same IC ranked top when typed bare and mid-list when typed the way
  // it is printed on the form. Rejoining the digits makes the two identical.
  if (q && /^[\d\s'’\-/,.]+$/.test(q)) {
    const joined = digits(q);
    if (joined) return [{ raw: joined, numeric: true }];
  }

  return q
    .split(WORD_SPLIT)
    .filter(Boolean)
    .map((raw) => ({ raw, numeric: /^\d+$/.test(raw) }));
}

// Scores are ordinal, not measurements: the gaps only have to keep the tiers
// apart. An exact IC has to beat any quantity of name evidence, because it is
// the only identifier on this roster that is guaranteed unique.
const S = {
  IC_EXACT: 10000,
  IC_PREFIX: 400,
  IC_CONTAINS: 150,
  WORD_START: 100,
  WORD_INSIDE: 40,
  /** Whole query matches the start of the full name — the common "type the first name" case. */
  FULL_PREFIX_BONUS: 250,
};

/**
 * Score one athlete against one query.
 * Returns null when any token fails to match, which is what makes typing more
 * words narrow the list.
 */
function scoreOne(a: SearchableAthlete, tokens: ReturnType<typeof tokenise>): number | null {
  if (!tokens.length) return 0;

  const nameWords = words(a.name);
  const icDigits = digits(a.athleteId);
  // Normalised once per athlete, not once per token — this runs for every
  // athlete on every keystroke.
  const icNorm = normalise(a.athleteId);
  let total = 0;

  for (const { raw, numeric } of tokens) {
    let best = 0;

    if (numeric) {
      const d = digits(raw);
      if (d && icDigits === d) best = S.IC_EXACT;
      else if (d && icDigits.startsWith(d)) best = S.IC_PREFIX;
      else if (d && icDigits.includes(d)) best = S.IC_CONTAINS;
    }

    // A textual token can still hit the ID (rare, but the ID is a string), and
    // a numeric token can appear in a name, so both paths are always tried.
    for (const w of nameWords) {
      if (w.startsWith(raw)) best = Math.max(best, S.WORD_START);
      else if (w.includes(raw)) best = Math.max(best, S.WORD_INSIDE);
    }
    if (!numeric && icNorm.includes(raw)) {
      best = Math.max(best, S.IC_CONTAINS);
    }

    // AND semantics: one unmatched token drops the athlete entirely.
    if (best === 0) return null;
    total += best;
  }

  // "ada" should put Adam Ismail above an athlete merely containing "ada".
  const flatQuery = tokens.map((t) => t.raw).join(' ');
  if (normalise(a.name).startsWith(flatQuery)) total += S.FULL_PREFIX_BONUS;

  return total;
}

/** Split `text` for highlighting, marking every span any token matched. */
function segment(text: string, tokens: ReturnType<typeof tokenise>, numericOnly = false): Segment[] {
  if (!text) return [];
  if (!tokens.length) return [{ text, hit: false }];

  const norm = normalise(text);
  // A boolean per character is the simplest thing that survives overlapping
  // matches ("ada" and "dam" both hitting "Adam") without merging logic.
  const marked = new Array(norm.length).fill(false);

  // Built once, outside the token loop — it depends only on `text`, and every
  // numeric token was rebuilding the same map.
  const map: number[] = [];
  let bare = '';
  if (numericOnly) {
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] >= '0' && text[i] <= '9') { bare += text[i]; map.push(i); }
    }
  }

  for (const { raw, numeric } of tokens) {
    if (numericOnly && !numeric) continue;
    // For an IC the user may type separators the stored value does not have, so
    // matching happens on digits and the marks are mapped back to real indices.
    const needle = numericOnly ? digits(raw) : raw;
    if (!needle) continue;

    if (numericOnly) {
      let at = bare.indexOf(needle);
      while (at !== -1) {
        for (let k = at; k < at + needle.length; k += 1) marked[map[k]] = true;
        at = bare.indexOf(needle, at + 1);
      }
    } else {
      let at = norm.indexOf(needle);
      while (at !== -1) {
        for (let k = at; k < at + needle.length; k += 1) marked[k] = true;
        at = norm.indexOf(needle, at + 1);
      }
    }
  }

  const out: Segment[] = [];
  let run = '';
  let runHit = marked[0];
  for (let i = 0; i < text.length; i += 1) {
    const hit = Boolean(marked[i]);
    if (hit === runHit) { run += text[i]; } else {
      if (run) out.push({ text: run, hit: runHit });
      run = text[i]; runHit = hit;
    }
  }
  if (run) out.push({ text: run, hit: runHit });
  return out;
}

/**
 * Rank a roster against a query. An empty query returns everyone, in the order
 * given, so the caller's own sort (alphabetical) still governs the idle list.
 */
export function searchAthletes<T extends SearchableAthlete>(
  athletes: T[],
  query: string,
): Array<SearchHit<T>> {
  const tokens = tokenise(query);

  const scored: Array<{ athlete: T; score: number }> = [];
  for (const a of athletes) {
    const score = scoreOne(a, tokens);
    if (score !== null) scored.push({ athlete: a, score });
  }

  if (tokens.length) {
    // Alphabetical within a score, so equal-relevance results do not reshuffle
    // between keystrokes.
    scored.sort((x, y) => y.score - x.score || x.athlete.name.localeCompare(y.athlete.name));
  }

  // Ambiguity is judged against the RESULTS, not the whole roster: two people
  // called Adam Kumar are only a hazard when both are on screen to be picked.
  const nameCounts = new Map<string, number>();
  for (const { athlete } of scored) {
    const k = normalise(athlete.name);
    nameCounts.set(k, (nameCounts.get(k) || 0) + 1);
  }

  return scored.map(({ athlete, score }) => ({
    athlete,
    score,
    nameSegments: segment(athlete.name, tokens),
    idSegments: segment(athlete.athleteId, tokens, true),
    ambiguous: (nameCounts.get(normalise(athlete.name)) || 0) > 1,
  }));
}
