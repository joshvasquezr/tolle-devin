// D§6.3: crawl PD pages; keep ESV shells and the API out. NOINDEX=1 (preview deploys) blocks all crawling.
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) =>
  new Response(
    process.env.NOINDEX === "1"
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nDisallow: /esv/\nDisallow: /api/\n\nSitemap: ${new URL("/sitemap.xml", site).href}\n`,
    { headers: { "Content-Type": "text/plain" } },
  );
