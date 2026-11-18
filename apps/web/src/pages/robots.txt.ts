// D§6.3: crawl PD pages; keep ESV shells and the API out.
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nDisallow: /esv/\nDisallow: /api/\n\nSitemap: ${new URL("/sitemap.xml", site).href}\n`, {
    headers: { "Content-Type": "text/plain" },
  });
