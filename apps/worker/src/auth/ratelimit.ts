// Fixed-window counters per isolate (D§3.12: 5/h per email, 20/h per IP key). The IP is only a map
// key, hashed, never stored or logged. Production can swap in the Workers rate-limiting binding.
export class Limiter {
  private readonly hits = new Map<string, { start: number; n: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  allow(key: string, now: number): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      this.hits.set(key, { start: now, n: 1 });
      return true;
    }
    h.n++;
    return h.n <= this.limit;
  }
}
