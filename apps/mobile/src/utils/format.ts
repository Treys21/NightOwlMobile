// Display formatting shared by every screen.

/** 12.4 → "12.4", 12 → "12.0" */
export const pts = (n: number, digits = 1): string => n.toFixed(digits);

/** +7.4 / −6.9 with a real minus sign. */
export const signedPts = (n: number, digits = 1): string => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(digits);

export const percent = (share: number): string => `${Math.round(share * 100)}%`;

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Sun 1:00 PM" */
export const kickoffLabel = (ms: number): string => `${DAY.format(ms)} ${TIME.format(ms)}`;

/** "3m ago", "just now" */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 30) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** "Q3 · 4:12", "Half", "Final" */
export function gameClock(quarter: number, clock: string): string {
  if (!quarter) return '';
  return `${quarter > 4 ? 'OT' : `Q${quarter}`}${clock ? ` · ${clock}` : ''}`;
}

/** "Allen, J." for tight grid cells. */
export function shortName(first: string, last: string): string {
  return first ? `${last}, ${first.charAt(0)}.` : last;
}
