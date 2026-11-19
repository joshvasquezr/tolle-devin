// P5.6 e2e stand-in for api.esv.org: placeholder words only (never ESV text), same response shape as the
// live API (docs/spikes/esv.md). Obadiah answers 503 to exercise the outage note.
import { createServer } from "node:http";
import { BOOKS } from "@tolle/core";

export const MARKER = "Zqesvmark";
const PORT = 4323;

createServer((req, res) => {
  const u = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (u.pathname === "/health") return void res.end("ok");
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== "Token e2e-fake-key") return void ((res.statusCode = 403), res.end("{}"));
  if (u.pathname !== "/passage/html/") return void ((res.statusCode = 404), res.end("{}"));
  const m = /^(.+) (\d+):(\d+)-(\d+)$/.exec(u.searchParams.get("q") ?? "");
  const b = m && BOOKS.find((x) => x.name === m[1]);
  if (!m || !b) return void ((res.statusCode = 400), res.end("{}"));
  if (b.slug === "obadiah") return void ((res.statusCode = 503), res.end("{}"));
  const [c, a, z] = [Number(m[2]), Number(m[3]), Number(m[4])];
  const base = b.order * 1_000_000 + c * 1_000;
  let html = `<h3>Placeholder heading</h3><p class="starts-chapter">`;
  for (let v = a; v <= z; v++) html += `<b class="verse-num">${v}&nbsp;</b>${MARKER} placeholder words for verse ${v}. `;
  res.end(JSON.stringify({ query: m[0], canonical: m[0], parsed: [[base + a, base + z]], passage_meta: [], passages: [`${html}</p>`] }));
}).listen(PORT);
