# Accessibility checklist (P7.1; SPEC §6.10, D§5.4)

Status: automated checks done; manual checks **not yet done** (need Josh). P7.1 stays unticked until
the manual rows are signed.

## Automated (Playwright + axe, `apps/web/e2e/a11y-pass.spec.ts`, runs in CI)
| Check | Result (2026-11-18, Chromium) |
|---|---|
| axe WCAG 2.0/2.1/2.2 A+AA on /, /about, /privacy, /search, chapter (prose, poetry, single-chapter book), /auth/verify, 404 — light and dark, reduced motion | pass |
| axe on open popovers: reading settings, sign in, highlight toolbar — light and dark | pass |
| 320 px reflow: no horizontal scrolling on key pages and open popovers | pass |
| 200% zoom (640 CSS px at 2×): no horizontal scrolling, bar controls on screen, `/` focuses the reference bar | pass |
| Keyboard flows (picker, refbar, keys, focus, highlight keys, popovers' Esc/focus return) | pass (existing specs) |

Fixes made in this pass: header bar shrinks the reference field instead of overflowing at 320 px;
settings checkboxes meet target-size (24 px spacing); selected verse numbers use `--text-2` on
`--hover` (contrast); long links in prose wrap.

## Manual (not done)
| Check | Who | Result |
|---|---|---|
| VoiceOver (Safari, macOS): read a chapter, navigate by heading/verse, use refbar, picker, search, highlight, sign in | Josh | — |
| Keyboard-only session: all of the above without a pointer | Josh | — |
| Browser zoom 200% and 400% in Safari/Firefox | Josh | — |
| Sign-off | Josh | — |
