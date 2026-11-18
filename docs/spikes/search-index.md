# P3.1 spike: search index size (D§3.11, D§12; SPEC S1, S5, S7)

Measured 2026-11-18 with `node scripts/search-spike.ts` (MiniSearch 7.2.0, Node 24, `gzip -9`) over the generated
chapter JSON. Verse ids are canonical (`toCanonical`), so WEB's Romans 14:24–26 doxology is not indexed separately.
Exit criterion: ≤ 3 MB gz per translation and < 200 ms query after load.

## Baseline: DESIGN as written (all terms, no stored fields)
| tr | verses | raw | gz | build | loadJSON | avg query | Mt 5:44 in top 3 for "love your enemies" |
|---|---|---|---|---|---|---|---|
| BSB | 31,086 | 6.83 MB | 1.89 MB | 639 ms | 147 ms | 7.6 ms | yes (2) |
| KJV | 31,102 | 7.01 MB | 1.95 MB | 597 ms | 149 ms | 6.4 ms | yes (3) |
| WEB | 31,098 | 6.80 MB | 1.89 MB | 573 ms | 168 ms | 4.8 ms | **no (5)** |

Size passes, but the CI acceptance check (D§3.11) fails for WEB: shorter verses that contain the three words but
not the phrase (Matthew 5:43 "love your neighbor and hate your enemy") outrank Matthew 5:44 under BM25 length
normalization. Changing BM25 `b` (0.75 → 0.5 → 0.3) moved it to 5, 5, 6. Also, BSB James 2 says "faith without
deeds", so the P3.4 query "faith without works" returns nothing under strict AND.

## Chosen configuration (GO: MiniSearch)
- **Stopwords** (`STOPWORDS` in `@tolle/core`, 60 function words incl. KJV "ye/thou/thee/thy/unto/shall") are not
  indexed: index 1.25 MB gz (−35%). Quoted phrases still match them via the exact-phrase filter.
- **Verse text stored in the same file** (`{ index, text: { [verseId]: string } }`): total 2.54–2.58 MB gz. The
  phrase filter and the adjacency re-rank run locally, and results rows need no chapter fetches.
- **Adjacency re-rank**: `score × (1 + 2 × adjacency(queryWords, verseWords))`, where adjacency is the share of the
  query's adjacent word pairs that appear adjacent and in order (`adjacency` in `@tolle/core`). Ties: canonical order.
- **OR fallback** only when AND finds nothing; AND remains the semantics whenever it has results.

| tr | gz total (index) | build | load | avg query | Mt 5:44 rank | "faith without works" top 3 |
|---|---|---|---|---|---|---|
| BSB | 2.57 MB (1.25) | 763 ms | 181 ms | 7.0 ms | 1 | Jas 2:18, 2:26, 2:20 |
| KJV | 2.58 MB (1.26) | 1,021 ms | 139 ms | 1.3 ms | 2 | Jas 2:26, 2:20, 2:18 |
| WEB | 2.54 MB (1.24) | 792 ms | 139 ms | 1.2 ms | 2 | Jas 2:18, Rom 4:6 |

All three meet ≤ 3 MB gz and < 200 ms. The custom delta-varint postings fallback is not needed.
Deviation from D§3.11 ("no stored fields"; verse text from chapter JSON) is recorded in the PLAN Decisions log.
Headroom: ~0.4 MB gz under the S5 assumption; P3.2's size check enforces 3 MB.
