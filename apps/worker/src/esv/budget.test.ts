// P5.3 Verify: D§3.12 Budget table; SPEC §8.1 rate limits — bursts, soft/hard states, rollover, persistence.
import { describe, expect, it } from "vitest";
import { EsvBudget, WINDOWS, consume, prune, stateOf } from "./budget.ts";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function fakeState() {
  const data = new Map<string, unknown>();
  return {
    data,
    storage: {
      get: async <T>(k: string) => data.get(k) as T | undefined,
      put: async <T>(k: string, v: T) => void data.set(k, structuredClone(v)),
    },
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
  };
}

describe("budget windows", () => {
  it("per-minute burst: open below 48, soft at 48 (80%), hard at 57 (95%)", () => {
    let ts: number[] = [];
    const now = 10 * DAY;
    for (let i = 0; i < 48; i++) {
      const r = consume(ts, now + i, "passage");
      expect(r.ok, `call ${i}`).toBe(true);
      ts = r.ts;
    }
    expect(stateOf(ts, now + 48)).toBe("soft");
    const refused = consume(ts, now + 48, "passage");
    expect(refused).toMatchObject({ ok: false, state: "soft" });
    expect(refused.ts).toHaveLength(48); // refused calls are not counted
    expect(consume(ts, now + 48, "search").ok).toBe(false);
    expect(stateOf([...ts, ...Array.from({ length: 9 }, (_, i) => now + 100 + i)], now + 200)).toBe("hard");
    expect(stateOf(ts, now + MIN + 48)).toBe("open"); // minute window slid past
  });

  it("hourly and daily windows", () => {
    const now = 20 * DAY;
    const spread = (n: number, span: number) => Array.from({ length: n }, (_, i) => now - span + 1 + Math.floor((i * (span - 1)) / n));
    expect(stateOf(spread(799, HOUR), now)).toBe("open");
    expect(stateOf(spread(800, HOUR), now)).toBe("soft");
    expect(stateOf(spread(950, HOUR), now)).toBe("hard");
    expect(stateOf(spread(3_999, DAY), now)).toBe("open");
    expect(stateOf(spread(4_000, DAY), now)).toBe("soft");
    expect(stateOf(spread(4_750, DAY), now)).toBe("hard");
  });

  it("day rollover drops old timestamps and reopens", () => {
    const now = 30 * DAY;
    const ts = Array.from({ length: 4_800 }, (_, i) => now - DAY + 1 + i * 17_000);
    expect(stateOf(ts, now)).toBe("hard");
    const later = now + DAY;
    expect(prune(ts, later)).toHaveLength(0);
    expect(consume(ts, later, "passage")).toMatchObject({ ok: true, state: "open" });
    expect(WINDOWS.map((w) => w.limit)).toEqual([60, 1_000, 5_000]);
  });
});

describe("EsvBudget durable object", () => {
  it("counts consumes, reports state, and persists across restarts", async () => {
    const st = fakeState();
    let t = 5 * DAY;
    const clock = () => t;
    const req = (kind: string) => new Request("https://do/consume", { method: "POST", body: JSON.stringify({ kind }) });
    let d = new EsvBudget(st, {}, clock);
    for (let i = 0; i < 47; i++) {
      t++;
      expect(await (await d.fetch(req("passage"))).json()).toEqual({ ok: true, state: "open" });
    }
    t++;
    expect(await (await d.fetch(req("passage"))).json()).toEqual({ ok: true, state: "soft" });
    // Restart: a new instance reads the persisted timestamps.
    d = new EsvBudget(st, {}, clock);
    await Promise.resolve();
    t++;
    expect(await (await d.fetch(req("search"))).json()).toEqual({ ok: false, state: "soft" });
    expect(await (await d.fetch(new Request("https://do/state"))).json()).toEqual({ state: "soft" });
    expect((st.data.get("ts") as number[]).length).toBe(48);
    t += MIN;
    expect(await (await d.fetch(req("passage"))).json()).toEqual({ ok: true, state: "open" });
    expect((await d.fetch(new Request("https://do/nope"))).status).toBe(404);
  });
});
