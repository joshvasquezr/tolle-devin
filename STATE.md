# STATE
Updated: 2026-11-18 08:26 · Lead: Devin (Cognition), handed over by Josh 2026-11-17 from Claude Code
Approved phase: P0–P7 under standing autonomy (AGENTS.md "Standing autonomy"; Josh 2026-11-17)

## Current task
P7.1 · Accessibility pass · in progress (automated parts)

## Progress
- Branch `devin/autonomous-p0-p7` (from `main` = `045d980`); one draft PR to `main` (#1).
- Done: P0.4–P0.11, P0.13, P1.1–P1.7, P2.1–P2.7, P3.1–P3.5, P4.1–P4.7, P5.3, P6.1–P6.4, P6.6–P6.8 (see PLAN boxes).
- Partial, unticked: P5.2 normalizer (synthetic markup; needs P5.1); P6.5 OpenAPI waits on P5.4.
- Built and tested locally but unticked (need a real deploy): P0.12, P1.8.
- P4 checkpoint (2026-11-18): frozen install ok; `-r typecheck` 0 errors; `-r test` core 885, render 9, worker 15, web 82, scripts 44; build 3,572 pages; Playwright + axe 61 passed (selection.spec also in Firefox + WebKit); first-load JS 20.2 KB gz.
- P6 checkpoint (2026-11-18): frozen install ok; `-r typecheck` 0; `-r test` core 885, render 9, worker 40, web 86, scripts 44; build 3,573 pages; Playwright + axe 66 passed; first-load JS 22.3 KB gz.
- MVP gate unticked: needs a preview deploy and Josh's manual session (three chapters, five references, three searches, ten highlights).

## Needs decision
- (none; external blockers are listed below)

## Blockers
- No Cloudflare account/token: P0.12, P1.8 deploy verification, MVP-gate preview.
- No ESV API key: P5.1 live fixtures; P5.2/P5.4–P5.7 cannot be verified against real responses. P5.0 is human-only (Crossway email).
- No email provider configured: magic-link mail is a no-op outside local dev (Playwright uses a `DEV_MAIL` sink).
- Open doc issue: SPEC §11 "field data" Core Web Vitals has no defined source after the Cloudflare analytics removal.

## Next
- P7.3 (compliance script, headers/CSP + log-redaction tests, runbook), then P7.1/P7.2 automated parts and P7.4; P7.5–P7.6 are human/deploy-gated.

## Notes for next session
- Toolchain: Node 24.22.2 (nvm), pnpm 12.16.1, TypeScript 6.0.3, Vitest 5.0.5, Playwright 1.64.1 (chromium, firefox, webkit installed).
- pnpm 12 enforces a minimum release age: pick dependency versions ≥ ~2 weeks old; `allowBuilds` lists esbuild and workerd.
- `BookId` is branded: use `toBookId()`/`isBookId()` or a `Book`; never cast a raw string.
- Web unit tests needing generated data skip without `pnpm build:data`; CI runs them in the build job.
- Playwright screenshot baselines live in `apps/web/e2e/*-snapshots` (Chromium, Linux).
