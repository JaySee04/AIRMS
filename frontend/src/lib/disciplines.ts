// Per-sport competition events ("disciplines"). Only sports that actually have
// events appear here; every other sport has none, and its athletes carry an
// empty discipline list. Badminton is the first curated sport (ISN's showcase).
// The backend stores disciplines as free strings (athlete_disciplines table) and
// does not validate against this list, so adding a sport's events is a
// frontend-only change here.
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
