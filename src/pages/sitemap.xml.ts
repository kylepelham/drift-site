import type { APIRoute } from "astro"

export const GET: APIRoute = ({ site }) => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${new URL("/", site).href}</loc></url>
</urlset>
`
  return new Response(body, { headers: { "Content-Type": "application/xml" } })
}
