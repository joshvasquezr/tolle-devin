// P7.4 Verify: allow-listed counters only; no identifiers stored; no cookies.
import { describe, expect, it } from "vitest";
import { handleMetrics, type AnalyticsEngine } from "./metrics.ts";

const req = (body: unknown, ct = "application/json") =>
  new Request("https://q.test/api/v1/metrics", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": ct, "CF-Connecting-IP": "203.0.113.5", Cookie: "x=1" } });

describe("metrics", () => {
  it("writes only the name and bucket for allow-listed names; no cookies", async () => {
    const points: unknown[] = [];
    const ae: AnalyticsEngine = { writeDataPoint: (p) => void points.push(p) };
    const r = await handleMetrics(req({ name: "lookup_ms", bucket: "lt100", email: "a@b.co", ip: "1.2.3.4" }), ae);
    expect(r.status).toBe(204);
    expect(r.headers.get("Set-Cookie")).toBeNull();
    expect(points).toEqual([{ blobs: ["lookup_ms", "lt100"], doubles: [1], indexes: ["lookup_ms"] }]);
    expect(JSON.stringify(points)).not.toMatch(/203\.0\.113|a@b\.co|1\.2\.3\.4/);
  });
  it("rejects unknown names, bad buckets and non-JSON", async () => {
    expect((await handleMetrics(req({ name: "page_view" }), undefined)).status).toBe(400);
    expect((await handleMetrics(req({ name: "search_used", bucket: "love your enemies" }), undefined)).status).toBe(400);
    expect((await handleMetrics(req({ name: "search_used" }, "text/plain"), undefined)).status).toBe(415);
    expect((await handleMetrics(req({ name: "search_used" }), undefined)).status).toBe(204);
  });
});
