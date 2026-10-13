import { describe, expect, it } from 'vitest';
import { HttpClient, HttpError, TokenBucket, backoffDelayMs } from '../api/http';

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(status === 304 ? null : JSON.stringify(body), { status, headers });

describe('backoffDelayMs', () => {
  it('doubles from 500 ms with up to 250 ms jitter, capped at 8 s', () => {
    expect(backoffDelayMs(0, () => 0)).toBe(500);
    expect(backoffDelayMs(1, () => 0.5)).toBe(1125);
    expect(backoffDelayMs(2, () => 1)).toBe(2250);
    expect(backoffDelayMs(10, () => 1)).toBe(8000);
  });
});

describe('TokenBucket', () => {
  it('allows a burst, then spaces requests at the refill rate', async () => {
    let t = 0;
    const slept: number[] = [];
    const bucket = new TokenBucket({ ratePerSecond: 15, capacity: 15, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
    for (let i = 0; i < 15; i++) await bucket.take();
    expect(slept).toEqual([]);
    await bucket.take();
    expect(slept).toEqual([67]);
  });
});

describe('HttpClient', () => {
  it('retries 429 and 5xx gateway errors, then succeeds', async () => {
    const statuses = [429, 503, 200];
    const sleeps: number[] = [];
    const client = new HttpClient({
      fetchImpl: async () => json(statuses.shift() ?? 200, { ok: true }),
      sleep: async (ms) => { sleeps.push(ms); },
      random: () => 0
    });
    expect(await client.getJson('https://api.sleeper.app/v1/state/nfl')).toEqual({ ok: true });
    expect(sleeps).toEqual([500, 1000]);
  });

  it('gives up after 3 retries with an HttpError', async () => {
    let calls = 0;
    const client = new HttpClient({ fetchImpl: async () => { calls++; return json(502, {}); }, sleep: async () => undefined, random: () => 0 });
    await expect(client.getJson('https://api.sleeper.app/x')).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(4);
  });

  it('does not retry a 404', async () => {
    let calls = 0;
    const client = new HttpClient({ fetchImpl: async () => { calls++; return json(404, null); }, sleep: async () => undefined });
    await expect(client.getJson('https://api.sleeper.app/x')).rejects.toMatchObject({ status: 404 });
    expect(calls).toBe(1);
  });
});
