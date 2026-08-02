// Two-letter initials from a name: the first letters of the first two word-like
// (alphabetic-initial) tokens, uppercased. Returns '' when the name has no
// alphabetic tokens — callers that need a placeholder can `|| '??'`.
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// Resolve a typed value to an athlete ID against a roster: an explicit ATHxxxx
// wins, else an exact (case-insensitive) name match, else a unique name-prefix
// match. Returns '' when there's no unique match. Shared by the admin + coach
// report pages so "search by name → ATH id" behaves identically.
export function resolveAthleteId(query: string, roster: Array<{ athleteId: string; name: string }>): string {
  const raw = query.trim();
  const m = raw.match(/ATH\d+/i);
  if (m) return m[0].toUpperCase();
  const lower = raw.toLowerCase();
  const exact = roster.find((a) => a.name.toLowerCase() === lower);
  if (exact) return exact.athleteId;
  const hits = roster.filter((a) => a.name.toLowerCase().startsWith(lower));
  return hits.length === 1 ? hits[0].athleteId : '';
}
