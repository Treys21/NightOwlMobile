// Shared HTTP layer: a token bucket per host (Sleeper asks for well under
// 1,000 requests a minute; 15 a second with bursts of 15 stays polite) and
// exponential backoff with jitter on 429 and 5xx gateway errors.

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export interface TokenBucketOptions {
  /** Tokens added per second. */
  ratePerSecond: number;
  /** Bucket size: the largest burst allowed. */
  capacity: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly rate: number;
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<void> = Promise.resolve();

  constructor({ ratePerSecond, capacity, now = Date.now, sleep = realSleep }: TokenBucketOptions) {
    this.rate = ratePerSecond;
    this.capacity = capacity;
    this.tokens = capacity;
    this.now = now;
    this.sleep = sleep;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
  }

  /** Resolves when a request may go out. Callers are served in order. */
  take(): Promise<void> {
    const turn = this.queue.then(async () => {
      this.refill();
      while (this.tokens < 1) {
        await this.sleep(Math.ceil(((1 - this.tokens) / this.rate) * 1000));
        this.refill();
      }
      this.tokens -= 1;
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }
}

export const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
export const MAX_RETRIES = 3;

/** min(8 s, 500 ms × 2^attempt + up to 250 ms of jitter). */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  return Math.min(8000, 500 * Math.pow(2, attempt) + random() * 250);
}

export interface HttpClientOptions {
  fetchImpl?: typeof fetch;
  ratePerSecond?: number;
  burst?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ConditionalResult<T> {
  status: 200 | 304;
  data: T | null;
  etag: string | null;
}

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly rate: number;
  private readonly burst: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.rate = options.ratePerSecond ?? 15;
    this.burst = options.burst ?? 15;
    this.sleep = options.sleep ?? realSleep;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  private bucketFor(url: string): TokenBucket {
    const host = new URL(url).host;
    let bucket = this.buckets.get(host);
    if (!bucket) {
      bucket = new TokenBucket({ ratePerSecond: this.rate, capacity: this.burst, now: this.now, sleep: this.sleep });
      this.buckets.set(host, bucket);
    }
    return bucket;
  }

  /** Fetch with rate limiting and retries; returns the final Response (ok, 304, or a non-retryable error status). */
  async raw(url: string, options: RequestOptions = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      await this.bucketFor(url).take();
      let res: Response;
      try {
        const init: RequestInit = { headers: options.headers ?? {} };
        if (options.signal) init.signal = options.signal;
        res = await this.fetchImpl(url, init);
      } catch (err) {
        if (options.signal?.aborted || attempt >= MAX_RETRIES) throw err;
        await this.sleep(backoffDelayMs(attempt, this.random));
        continue;
      }
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        await this.sleep(backoffDelayMs(attempt, this.random));
        continue;
      }
      return res;
    }
  }

  async getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const res = await this.raw(url, options);
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as T;
  }

  /** GET with If-None-Match; a 304 comes back as { status: 304, data: null }. */
  async getConditional<T>(url: string, etag: string | null, options: RequestOptions = {}): Promise<ConditionalResult<T>> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (etag) headers['If-None-Match'] = etag;
    const res = await this.raw(url, { ...options, headers });
    if (res.status === 304) return { status: 304, data: null, etag };
    if (!res.ok) throw new HttpError(res.status, url);
    return { status: 200, data: (await res.json()) as T, etag: res.headers.get('ETag') };
  }
}

/** One shared client for the app. */
export const defaultHttp = new HttpClient();
