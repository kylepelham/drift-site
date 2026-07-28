# drift-site

Marketing site for [Drift](https://github.com/kylepelham/Drift), a focused Windows
desktop for coding with AI agents.

Astro static site with a procedural three.js jellyfish hero, a showcase video recorded
from the real app, live GitHub stats, and a beach footer.

## Commands

- `bun install` install dependencies
- `bun run dev` local dev server
- `bun run build` static build into `dist/`
- `bun run preview` preview the build
- `bun run typecheck` strict TS across scripts, jelly, and remotion code
- `bun run video:capture` record the real app into `public/showcase.mp4` and `public/poster.jpg`
- `bun run og` regenerate `public/og.jpg`

`bun run video:capture` expects Drift's dev server at `http://localhost:5180`; it drives
a real agent session in a scratch workspace through Edge DevTools and assembles a 30fps
H.264 video. Never point it at a real workspace.

Set `SITE_URL` when building for a real domain; it feeds the canonical URL, OG URLs,
robots.txt, and sitemap.xml.
