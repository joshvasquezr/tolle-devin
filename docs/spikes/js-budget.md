# P0.13 spike: font and JS budget baseline (D§12 last row, SPEC §7)

Measured 2026-11-18 on commit after P0.11. Budget: first-load JS ≤ 60 KB gz (SPEC §7).

## JS (esbuild 0.27, `--bundle --minify --format=esm --platform=browser`, `gzip -9`)
| Bundle | Raw | gz |
|---|---|---|
| `books` (BOOKS + books.json, with aliases) | 14,292 B | 4,362 B |
| `parseInput` + `formatRef` (pulls in books) | 17,560 B | 5,749 B |
| `resolveRoute` + `formatPath` + parser + books (router core) | 19,946 B | 6,749 B |

`books.json` alone, minified: 14,931 B raw / 4,080 B gz; without `aliases` 3,390 B gz; names only (no aliases, no verse counts) 1,715 B gz.

**Decision: no lazy-loading of aliases or picker data.** Aliases cost ≈ 0.7 KB gz and the whole router core ≈ 6.7 KB gz, about 11% of the 60 KB budget. The refbar, picker and router islands have ~50 KB gz of headroom. Revisit if the measured first-load total (P7.2) passes 45 KB gz.

## Fonts (OFL, Latin subset WOFF2 from Fontsource 5.3.x)
| Face | File | Size |
|---|---|---|
| Source Serif 4 variable, `wght` axis | `source-serif-4-latin-wght-normal.woff2` | 50,936 B |
| Source Serif 4 variable, `opsz`+`wght` | `source-serif-4-latin-opsz-normal.woff2` | 122,360 B |
| Inter variable, `wght` | `inter-latin-wght-normal.woff2` | 48,256 B |
| Newsreader variable, `wght` (alternative, SPEC [A]) | `newsreader-latin-wght-normal.woff2` | 58,084 B |

Fonts are not part of the JS budget but compete for LCP (≤ 1.0 s). The `opsz` axis (D§5 asks for optical sizing) costs +71 KB for the reading face. P1.1 decides between the `opsz` file and the `wght` file plus `font-optical-sizing: auto` fallback, after a further `pyftsubset` pass (Latin + punctuation only). Only the reading face is preloaded (D§5).
