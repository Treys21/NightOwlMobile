import { describe, expect, it } from 'vitest';
import { ago, gameClock, percent, shortName, signedPts } from '../utils/format';

describe('format', () => {
  it('signs points with a real minus', () => {
    expect(signedPts(7.44)).toBe('+7.4');
    expect(signedPts(-6.9)).toBe('−6.9');
    expect(signedPts(0)).toBe('±0.0');
  });

  it('formats clocks, shares, names and ages', () => {
    expect(gameClock(3, '4:12')).toBe('Q3 · 4:12');
    expect(gameClock(5, '9:00')).toBe('OT · 9:00');
    expect(gameClock(0, '')).toBe('');
    expect(percent(0.625)).toBe('63%');
    expect(shortName('Josh', 'Allen')).toBe('Allen, J.');
    expect(ago(1000, 1000 + 10000)).toBe('just now');
    expect(ago(0, 5 * 60000)).toBe('5m ago');
    expect(ago(0, 3 * 3600000)).toBe('3h ago');
  });
});
