// D§2 / D§6.3 (D2): verse URLs reuse the chapter HTML with verse-specific metadata.
// The input is our own build output (Base.astro), so the edits target its exact markup.

export interface VerseMeta {
  title: string;
  description: string;
  canonical: string;
  focus: string; // "16-16"
  crumbName: string;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

function setAttr(html: string, tagPattern: RegExp, attr: string, value: string): string {
  return html.replace(tagPattern, (tag) => tag.replace(new RegExp(`${attr}="[^"]*"`), `${attr}="${esc(value)}"`));
}

export function rewriteVerseHtml(html: string, m: VerseMeta): string {
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`);
  out = setAttr(out, /<meta name="description"[^>]*>/, "content", m.description);
  out = setAttr(out, /<meta property="og:description"[^>]*>/, "content", m.description);
  out = setAttr(out, /<meta property="og:title"[^>]*>/, "content", m.title);
  out = setAttr(out, /<meta property="og:url"[^>]*>/, "content", m.canonical);
  out = setAttr(out, /<link rel="canonical"[^>]*>/, "href", m.canonical);
  out = out.replace(/<main id="main"/, `<main id="main" data-focus="${esc(m.focus)}"`);
  // Breadcrumb gains the verse as a fourth item.
  out = out.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (all, open: string, json: string, close: string) => {
    try {
      const ld = JSON.parse(json) as { itemListElement?: unknown[] };
      if (!Array.isArray(ld.itemListElement)) return all;
      ld.itemListElement.push({ "@type": "ListItem", position: ld.itemListElement.length + 1, name: m.crumbName, item: m.canonical });
      return open + JSON.stringify(ld).replace(/</g, "\\u003c") + close;
    } catch {
      return all;
    }
  });
  return out;
}

/** D§6.3: verse text trimmed to 155 characters on a word boundary. */
export function trimDescription(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 80 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, "")}…`;
}
