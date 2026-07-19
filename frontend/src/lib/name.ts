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
