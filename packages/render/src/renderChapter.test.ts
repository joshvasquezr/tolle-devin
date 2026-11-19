// D§3.3; SPEC R1–R3 (text, poetry, headings), R4 (footnotes); XSS: all text escaped.
import { describe, expect, it } from "vitest";
import type { Chapter } from "@tolle/core";
import { toBookId } from "@tolle/core";
import { renderChapter } from "./renderChapter.ts";
import bsbJohn3 from "./fixtures/bsb-john-3.json" with { type: "json" };
import bsbPs23 from "./fixtures/bsb-psalms-23.json" with { type: "json" };
import kjvPs23 from "./fixtures/kjv-psalms-23.json" with { type: "json" };

const fixture = (j: unknown) => j as Chapter;
const ruth = toBookId("ruth");

describe("renderChapter snapshots", () => {
  it.each([
    ["BSB John 3 (prose, headings, notes)", bsbJohn3],
    ["BSB Psalm 23 (title, poetry indents, stanzas)", bsbPs23],
    ["KJV Psalm 23 (nd small caps)", kjvPs23],
  ])("%s", (_name, j) => {
    expect(renderChapter(fixture(j))).toMatchSnapshot();
  });
});

describe("structure", () => {
  it("prose verses are spans with data-v and a non-selectable number", () => {
    const html = renderChapter(fixture(bsbJohn3));
    expect(html).toContain('<span class="v" data-v="16"><sup class="vn">16</sup>For God so loved the world');
    expect(html.match(/<sup class="vn">/g)).toHaveLength(36);
    expect(html).not.toMatch(/<span class="v" data-v="\d+"><\/span>/);
    expect(html).toMatch(/^<article class="chapter" lang="en" data-tr="bsb" data-book="john" data-ch="3">/);
  });

  it("poetry lines carry indent classes; a verse crossing lines repeats data-v without a number", () => {
    const html = renderChapter(fixture(bsbPs23));
    expect(html).toContain('<p class="d"><span class="v" data-v="1"><sup class="vn">1</sup>A Psalm of David.</span></p>');
    expect(html).toContain('<p class="l"><span class="v" data-v="1">The LORD is my shepherd;');
    expect(html).toContain('<p class="l i1"><span class="v" data-v="1">I shall not want.</span></p>');
    expect(html.match(/<div class="poetry">/g)).toHaveLength(2);
  });

  it("nd renders as small-caps span; title before verse 1 is outside any verse span", () => {
    const html = renderChapter(fixture(kjvPs23));
    expect(html).toContain('<p class="d">A Psalm of David.</p>');
    expect(html).toContain('The <span class="nd">LORD</span> is my shepherd');
  });

  it("footnotes link both ways and can be turned off", () => {
    const html = renderChapter(fixture(bsbPs23));
    expect(html).toContain('<sup class="fn"><a href="#fn1" id="fnr1" aria-label="Footnote 1">1</a></sup>');
    expect(html).toContain('<li id="fn1">See Revelation 7:17. <a href="#fnr1" aria-label="Back to text">↩</a></li>');
    const off = renderChapter(fixture(bsbPs23), { notes: false });
    expect(off).not.toContain("fn1");
    expect(off).not.toContain("notes");
  });
});

describe("escaping (XSS)", () => {
  const evil = `<img src=x onerror="alert(1)">'&`;
  const ch: Chapter = {
    tr: "bsb",
    book: ruth,
    chapter: 1,
    blocks: [
      { t: "h", text: evil },
      { t: "p", items: [{ v: 1 }, evil, { nd: evil }, { fn: 0 }] },
      { t: "q", lines: [{ i: 2, items: [evil] }] },
    ],
    notes: [evil],
  };
  const html = renderChapter(ch);

  it("no raw tag, quote or ampersand from text reaches the output", () => {
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html.match(/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&#39;&amp;/g)).toHaveLength(5);
  });

  it("attribute values are escaped too", () => {
    const html2 = renderChapter({ ...ch, book: `x" onload="y` as never });
    expect(html2).toContain('data-book="x&quot; onload=&quot;y"');
  });
});
