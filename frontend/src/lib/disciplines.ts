// Per-sport competition-event SEED SUGGESTIONS ("disciplines"). Events are NOT a
// fixed catalogue — the import combobox lets an operator type any new event or
// pick one already on record (GET /api/athletes/meta/disciplines), and the DB
// stores free strings (athlete_disciplines table). This map only pre-populates
// the autocomplete for sports we ship suggestions for (badminton, ISN's
// showcase) so the first import doesn't start from an empty list. Adding more
// suggestions here is optional polish, never required to record an event.
export const SPORT_DISCIPLINES: Record<string, string[]> = {
  Badminton: [
    "Men's Singles",
    "Women's Singles",
    "Men's Doubles",
    "Women's Doubles",
    'Mixed Doubles',
  ],
};

// Events for a sport, or an empty list if the sport has none.
export function disciplinesForSport(sport: string | null | undefined): string[] {
  if (!sport) return [];
  return SPORT_DISCIPLINES[sport] ?? [];
}

export function sportHasDisciplines(sport: string | null | undefined): boolean {
  return disciplinesForSport(sport).length > 0;
}
