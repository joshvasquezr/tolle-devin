// D§6.3: the 3,567 public-domain chapter URLs. No ESV, no verse URLs (MVP [A]).
import type { APIRoute } from "astro";
import { formatPath } from "@tolle/core";
import { chapterPaths } from "../lib/chapters.ts";

export const GET: APIRoute = ({ site }) => {
  const urls = chapterPaths().map(({ props }) => new URL(formatPath(props.tr, { book: props.book.id, chapter: props.n }), site).href);
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
};
