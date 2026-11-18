# Runbook

Operational steps for the Quiet Bible deployment (D§8, P7.3). Nothing here has been run against a
real Cloudflare account yet; commands are the documented Wrangler forms.

## Service-worker kill switch
The SW fetches `/sw-kill.json` (served `Cache-Control: no-store`). To disable it on every client:
1. Set `apps/web/public/sw-kill.json` to `{ "disabled": true }`.
2. Build and deploy. Clients unregister the SW and clear the `quiet-data-*` caches on their next load.
3. Revert to `{ "disabled": false }` once the fix ships.

## Restore D1 (accounts and highlights)
D1 Time Travel is the backup (D§4.3).
1. Find a timestamp before the incident.
2. `wrangler d1 time-travel info tolle --timestamp <unix-or-ISO>` to confirm the bookmark.
3. `wrangler d1 time-travel restore tolle --timestamp <unix-or-ISO>`.
4. Deleted accounts can reappear after a restore: re-run the deletions recorded since that time.

## Roll back a deploy
`wrangler deployments list`, then `wrangler rollback <version-id>`. Static assets roll back with the
Worker version.

## Secrets
- `ESV_API_KEY` (P5, only if ESV ships): rotate by creating a new key at api.esv.org, then
  `wrangler secret put ESV_API_KEY`, deploy, and revoke the old key. Never put it in
  `wrangler.jsonc`, CI logs or client code.
- Email provider key (P6, not chosen yet): same pattern once a provider exists.
- `DEV_MAIL` is a local-only `wrangler dev --var`; the compliance check fails if it appears in
  `wrangler.jsonc`.

## Privacy reminders
Never add logging of IPs, emails, tokens, queries or verse ids. `logging.test.ts` fails on any
`console.*` call in Worker source.
