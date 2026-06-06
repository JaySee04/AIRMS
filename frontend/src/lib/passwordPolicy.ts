// Mirrors backend/src/utils/passwordPolicy.js. Keep both in sync if you edit.
// Exposes per-rule predicates so the UI can render an inline checklist; the
// aggregate `validatePassword()` is used to block form submission.

export const PASSWORD_MIN_LENGTH = 10;

export const passwordRules = [
  { id: 'length',  label: `At least ${PASSWORD_MIN_LENGTH} characters`,     test: (p: string) => p.length >= PASSWORD_MIN_LENGTH },
  { id: 'upper',   label: 'Includes an uppercase letter (A–Z)',             test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'Includes a lowercase letter (a–z)',              test: (p: string) => /[a-z]/.test(p) },
  { id: 'digit',   label: 'Includes a number (0–9)',                        test: (p: string) => /[0-9]/.test(p) },
  { id: 'symbol',  label: 'Includes a symbol (! @ # $ etc.)',               test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function validatePassword(password: string): string | null {
  for (const rule of passwordRules) {
    if (!rule.test(password)) return rule.label;
  }
  return null;
}
