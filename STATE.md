# STATE
Updated: 2026-11-18 07:12 · Lead: Devin (Cognition), handed over by Josh 2026-11-17 from Claude Code
Approved phase: P0–P7 under standing autonomy (AGENTS.md "Standing autonomy"; Josh 2026-11-17)

## Current task
P1.7 · Static support pages and SEO files · in progress

## Progress
- Baseline verified: `main` = `045d980` (docs refinement pushed). Branch `devin/autonomous-p0-p7` from it; one draft PR to `main`.
- P0.4 decisions approved by Josh: invalid ids throw `RangeError` + `isVerseId()`; branded numeric `VerseId`; `Translation = 'bsb' | 'kjv' | 'web' | 'esv'`; content types in `packages/core/src/types.ts`; 10–20 shared vectors in `test-vectors/verse-ids.json`.
- Toolchain on this VM: Node 24.22.2 (nvm), pnpm 12.16.1 global. Baseline `install --frozen-lockfile`, `-r typecheck`, `-r test` green (72 tests).
- P0.4–P0.11, P0.13 done. P0.12 local `wrangler dev` result in `docs/spikes/assets-routing.md`; box unticked until a real deploy.

## Needs decision
- (none; external blockers are listed below)

## Blockers
- No Cloudflare account/token: P0.12, P1.8 deploy verification and any preview deploy cannot run.
- No ESV API key: P5.1 live fixtures cannot be captured. P5.0 is human-only (Crossway email).
- Open doc issue: SPEC §11 "field data" Core Web Vitals has no defined source after the Cloudflare analytics removal.

## Next
- P1 in PLAN order. Tasks needing P0.12/P1.8 are built and tested locally (wrangler dev / workerd); deploy verification stays listed under Blockers.

## Notes for next session
- Toolchain: pnpm 12.16.1, TypeScript 6.0.3, Vitest 5.0.5, @types/node 24.19.2, Node ≥ 24.
- CI pins: actions/checkout v7.0.1, actions/setup-node v7.1.0 (SHAs), gitleaks 8.30.1 (SHA-256).
- `BookId` is branded: use `toBookId()`/`isBookId()` or a `Book`; never cast a raw string.
- Scripts run on Node 24 type stripping (`node build-data.ts`); core uses `.ts` relative imports.
- pnpm 12 enforces a minimum release age: pick dependency versions ≥ ~2 weeks old; `allowBuilds` lists esbuild and workerd.
- Old branches `p0.3-books-metadata`, `p0.4-verse-ids-types` (local, empty) may be deleted when Josh says.
