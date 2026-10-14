// Season-tab number formats.
export const record = (w: number, l: number, t: number): string => `${w}–${l}${t ? `–${t}` : ''}`;

/** Averages from the simulation: "9.4–4.6". */
export const projRecord = (w: number, l: number): string => `${Math.round(w * 10) / 10}–${Math.round(l * 10) / 10}`;

/** ">99%", "<1%", "37%" */
export function odds(p: number): string {
  if (p >= 0.995) return '>99%';
  if (p > 0 && p < 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}

export const ordinal = (n: number): string => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${tail}`;
};

/** "1.07" */
export const pickLabel = (round: number, pick: number): string => `${round}.${String(pick).padStart(2, '0')}`;
