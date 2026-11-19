# Spike P5.1 · ESV response fidelity (2026-11-19)

Live ESV API v3 (`GET /v3/passage/html/`, `Authorization: Token <key>`), key verified 2026-11-19.

## Final query options (all accepted by the live API)
`include-passage-references=false`, `include-verse-numbers=true`, `include-first-verse-numbers=true`, `include-footnotes=false`, `include-footnote-body=false`, `include-headings=true`, `include-subheadings=true`, `include-chapter-numbers=false`, `include-book-titles=false`, `include-crossrefs=false`, `include-surrounding-chapters=false`, `include-surrounding-chapters-below=false`, `include-audio-link=false`, `include-short-copyright=false`, `include-copyright=false` (we render Crossway's citation ourselves, `docs/esv-compliance.md`), `include-css-link=false`, `inline-styles=false`, `wrapping-div=false`.

Response keys: `query`, `canonical`, `parsed` (`[[startVerseId, endVerseId]]`, ESV uses `BBCCCVVV`), `passage_meta`, `passages` (HTML strings).

## Observed markup (tags/classes across the five fixtures)
- Tags: `h3` (section heading), `h4` (psalm title, class `psalm-title`), `p` (prose paragraph; first has `starts-chapter`), `b` (verse number wrapper), `span`, `br`.
- Classes: `verse-num` (on `b`), `woc` (words of Christ), `divine-name` (only inside headings, e.g. Psalm 23's "The Lord Is My Shepherd"; verse text spells it "LORD" in plain capitals), `block-indent` (poetry container `p`), `line` (poetry line span), `indent` (indented line), `inline`, `begin-line-group` / `end-line-group` (stanza breaks).
- Query gotcha: `q=Jude 1` returns only verse 1 (book/verse, not chapter); query single-chapter books by book name (`q=Jude`).
- Omitted verses: Matthew 17 returns 26 verse numbers (17:21 absent), matching `packages/core/data/versemap`.

## Fixtures (`apps/worker/test/fixtures/esv/`)
John 3 (36 verses), Psalm 23 (6), Proverbs 3 (35), Jude (25, whole single-chapter book), Matthew 17 (26, omitted verse). Total 128 verses stored, under Crossway's 500-verse total and each under its per-page cap. Each fixture carries the Crossway citation in the folder README.
