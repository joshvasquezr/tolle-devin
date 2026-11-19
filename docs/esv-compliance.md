# ESV compliance record (P5.0)

Questions sent by Josh to Crossway (ESV API team) on 2026-11-18. Reply received 2026-11-18 and pasted below verbatim. This file is the source for AGENTS.md "Crossway's reply"; never paraphrase the citation from memory.

## Questions sent
1. Caching: may our server cache API responses for up to 24 hours (max 500 verses per entry, no pre-fetching)? Is a shorter limit required?
2. Half-book rule: is "half a book" calculated as floor(1/2 x the book's total verses)? For example, can 3 John (14 verses) show at most 7 verses per page?
3. Search indexing: may ESV pages be indexed by search engines, or should they be marked noindex? We don't put ESV text in sitemaps or link previews.
4. Attribution: what exact copyright notice wording should appear on pages showing ESV text?

## Crossway's reply (verbatim)
> Thank you for reaching out with these questions.
> Caching: The 500-verse limit applies to everything stored at once, not to each cache entry, so many 500-verse entries would go over it. There's no required expiration within that limit, but clearing the cache periodically keeps the text current.
> In the cases of single chapter books, you are welcome to display them all at once.
> Search indexing: We don't have any specific policy for indexing, so you are free to do so.
> Please use the following citation:
> Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.

## What it means for the project
| Topic | Crossway's answer | Effect |
|---|---|---|
| Caching | 500 verses is a cap on the **whole cache at once**, not per entry. No required TTL. | **Stricter** than SPEC §8.1 / D§3.12 (one window per entry, many entries). Adopted now: the server-side ESV cache must hold ≤ 500 verses in total across all entries (P5.4). The 24 h TTL stays as project policy. |
| Half a book | Single-chapter books may be shown whole. Multi-chapter books: not addressed. | Loosens the external rule for Obadiah, Philemon, 2 John, 3 John, Jude only. Josh approved 2026-11-18: `esvCap` shows single-chapter books whole. Multi-chapter books keep min(500, floor(half book)). |
| Indexing | No policy; indexing allowed. | External rule allows indexing. Josh decided 2026-11-18 to keep ESV pages as `noindex` shells (project policy, D5–D6): crawlers would spend the 5,000/day API budget, and ESV text loads client-side. |
| Citation | Exact wording above (adds the Creative Commons and translation sentences). | P5.6 attribution uses this exact text. The site must not be published under a Creative Commons licence while it quotes ESV. |
