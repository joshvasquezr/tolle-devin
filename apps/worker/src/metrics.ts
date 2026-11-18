// D§3.12 Metrics (SPEC §11, §7): allow-listed anonymous counters only — no user, IP, cookie or
// query fields. Written to Workers Analytics Engine when bound; otherwise accepted and dropped.
export const METRIC_NAMES = ["lookup_ms", "parse_fail", "search_used", "highlight_used"] as const;
const BUCKET = /^[a-z0-9_.-]{1,16}$/;

export interface AnalyticsEngine {
  writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export async function handleMetrics(req: Request, ae: AnalyticsEngine | undefined): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (req.method !== "POST" || !(req.headers.get("Content-Type") ?? "").startsWith("application/json")) return new Response(null, { status: 415, headers });
  const body = (await req.json().catch(() => null)) as { name?: unknown; bucket?: unknown } | null;
  const name = body?.name;
  const bucket = body?.bucket ?? "";
  if (typeof name !== "string" || !(METRIC_NAMES as readonly string[]).includes(name) || typeof bucket !== "string" || (bucket && !BUCKET.test(bucket))) {
    return new Response(null, { status: 400, headers });
  }
  ae?.writeDataPoint({ blobs: [name, bucket], doubles: [1], indexes: [name] });
  return new Response(null, { status: 204, headers });
}
