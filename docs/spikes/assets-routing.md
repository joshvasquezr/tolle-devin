# P0.12 spike: Workers Static Assets routing (D§1 D1, D§12)

**Status: local result only. The toy deploy is blocked (no Cloudflare account or API token in this environment).** P0.12 stays unticked until the same requests are run against a deployed `*.workers.dev` preview.

## Setup
`docs/spikes/assets/` holds the toy Worker and `wrangler.jsonc` (assets from `./public`, `html_handling: "drop-trailing-slash"`, `not_found_handling: "none"`, `run_worker_first: ["/api/*"]`). Public files: `index.html`, `bsb/john/3/index.html`, `data/bsb/john/3.json`, and `api/ping.json` (a static file under a Worker-first path).
Every Worker response carries `x-worker: 1` and the Worker logs `WORKER <method> <path>`.
Run with wrangler 4.156.2 (`wrangler dev --local`, workerd 1.20261102.1) on 2026-11-18.

## Request log
| Path | Status | Worker invoked | Notes |
|---|---|---|---|
| `/` | 200 | no | asset |
| `/bsb/john/3` | 200 | no | `bsb/john/3/index.html`, no trailing slash |
| `/bsb/john/3/` | 307 → `/bsb/john/3` | no | asset layer canonicalizes |
| `/data/bsb/john/3.json` | 200 | no | `application/json` |
| `/bsb/john/3/16` | 200 | **yes** | Worker fetches `/bsb/john/3` via `env.ASSETS`, sets `x-rewritten` |
| `/api/ping.json` | 200 | **yes** | `run_worker_first` wins over a matching static file |
| `/api/x` | 200 | **yes** | |
| `/nope` | 404 | **yes** | unmatched path falls through |

Wrangler output: asset requests log only `[wrangler:info] GET …`; Worker requests are preceded by `WORKER GET …` (`/bsb/john/3/16`, `/api/ping.json`, `/api/x`, `/nope`).

## Findings
- Asset hits do not invoke the Worker; unmatched paths and `run_worker_first` patterns do. This is the D1 behavior locally.
- Use `html_handling: "drop-trailing-slash"` so chapter URLs stay slash-free (SPEC URL rules); the default `auto-trailing-slash` answers `/bsb/john/3` with a 307 to `/bsb/john/3/`.
- The asset layer's redirect is a **307**, not 301. Canonical 301s (aliases, default translation) are the Worker's job (P2.1).
- `not_found_handling: "none"` is needed so unknown paths reach the Worker (404 page, verse rewrites).

## Left to verify on a real deploy (blocked)
- Same table against `*.workers.dev`, with Worker invocation counts from the dashboard or `wrangler tail`.
- That asset requests are not billed as Worker requests.
