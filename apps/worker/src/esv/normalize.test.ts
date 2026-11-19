// P5.2: D§3.12 Normalizer against synthetic ESV-shaped markup
// (placeholder words, no ESV text) and hostile input.
import { describe, expect, it } from "vitest";
import { normalizeEsv } from "./normalize.ts";

describe("normalizeEsv", () => {
  it("prose: heading, paragraphs, chapter and verse numbers", () => {
    const html = `<h3 id="p1">Alpha Beta</h3><p id="p2" class="starts-chapter"><b class="chapter-num" id="v1">3:1&nbsp;</b>Lorem ipsum dolor. <b class="verse-num" id="v2">2&nbsp;</b>Sit amet&#8217;s.</p><p><b class="verse-num">3&nbsp;</b>Consectetur.</p>`;
    expect(normalizeEsv(html)).toEqual([
      { t: "h", text: "Alpha Beta" },
      { t: "p", items: [{ v: 1 }, "Lorem ipsum dolor. ", { v: 2 }, "Sit amet’s."] },
      { t: "p", items: [{ v: 3 }, "Consectetur."] },
    ]);
  });
  it("poetry: psalm title, lines with indents, divine name", () => {
    const html = `<h4 class="psalm-title">Aleph of Bet.</h4><p class="block-indent"><span class="line"><b class="verse-num">1</b>The <span class="divine-name">Lord</span> lorem;</span><br/><span class="indent line">ipsum dolor.</span><br/><span class="indent-2 line">sit amet.</span></p>`;
    expect(normalizeEsv(html)).toEqual([
      { t: "d", items: ["Aleph of Bet."] },
      { t: "q", lines: [
        { i: 0, items: [{ v: 1 }, "The ", { nd: "Lord" }, " lorem;"] },
        { i: 1, items: ["ipsum dolor."] },
        { i: 2, items: ["sit amet."] },
      ] },
    ]);
  });
  it("omitted verse numbers simply produce no marker", () => {
    const blocks = normalizeEsv(`<p><b class="verse-num">3</b>Lorem. <b class="verse-num">5</b>Ipsum.</p>`);
    expect(blocks).toEqual([{ t: "p", items: [{ v: 3 }, "Lorem. ", { v: 5 }, "Ipsum."] }]);
  });
  it("hostile markup: scripts, footnotes, links and unknown tags dropped; text kept; no HTML out", () => {
    const html = `<p><b class="verse-num">1</b>Safe <script>alert(1)</script><img src=x onerror=alert(1)>text<sup class="footnote"><a href="#f1">a</a></sup> <blink>kept</blink> &lt;b&gt;escaped&lt;/b&gt;<!-- c --></p><style>p{}</style><iframe>bad</iframe>`;
    const out = normalizeEsv(html);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/alert|onerror|footnote|<img|<script|p\{\}|bad/);
    expect(out).toEqual([{ t: "p", items: [{ v: 1 }, "Safe text kept <b>escaped</b>"] }]);
  });
});
