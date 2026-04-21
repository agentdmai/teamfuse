# teamfuse website

Landing page and documentation site for teamfuse. Hosted at
[teamfuse.dev](https://teamfuse.dev).

Next.js 16, React 19, Tailwind 3. Server-rendered at build time with
`force-static`, so every route is a plain HTML file when deployed.

## What it does

* Reads the project's `README.md` and every `docs/*.md` at build time
  via `scripts/sync-docs.mjs`.
* Renders the landing page with the teamfuse logo, feature grid,
  architecture summary, command surface, and CTA.
* Renders each doc at `/docs/<slug>` with a table of contents, prev
  and next links, and an "Edit on GitHub" link.
* Emits a sitemap, robots.txt, per-page Open Graph and JSON-LD
  structured data, and an `/opengraph-image.png` generated from code.
* Emits `/llms.txt` and `/llms-full.txt` for generative engine
  optimisation (Perplexity, ChatGPT browse, Google AI Overviews,
  Claude browse, etc).

## Development

```bash
cd website
npm install
npm run dev
# open http://127.0.0.1:3006
```

The `predev` and `prebuild` hooks run `scripts/sync-docs.mjs`, which:

1. Copies `../README.md` to `src/content/readme.md`.
2. Copies every `../docs/*.md` to `src/content/docs/`.
3. Copies `../docs/logo.svg` to `public/logo.svg`.
4. Copies `../docs/screenshots/*.svg` to `public/screenshots/`.
5. Generates `public/llms.txt` and `public/llms-full.txt`.

`src/content/` is gitignored. The site's source of truth is always the
root repo.

## Deploying

Vercel:

1. Create a new project, set the Root Directory to `website`.
2. Build command: `npm run build` (sync-docs runs as `prebuild`).
3. Install command: `npm install`.
4. Add the custom domain `teamfuse.dev`.

The build will produce a static bundle. No server runtime needed.

## SEO checklist

* Per-page `<title>` and `description` via `generateMetadata`.
* Canonical URL per page.
* Open Graph image generated in-repo at
  `src/app/opengraph-image.tsx` (`next/og`).
* JSON-LD `SoftwareApplication` on the landing page.
* JSON-LD `TechArticle` on each docs page.
* Sitemap at `/sitemap.xml` (auto-generated from the docs list).
* Robots at `/robots.txt` (auto-generated, allows all, points at the
  sitemap).

## GEO checklist

* `/llms.txt` at the root, matching the
  [llmstxt.org](https://llmstxt.org) convention. Short summary plus
  a curated list of the most important URLs on the site.
* `/llms-full.txt` with the entire README + every doc inline, so
  crawlers can ingest the whole site in a single fetch.
* Semantic HTML (no `<div>`-only pages, real headings, landmark
  elements).
* Every doc page opens with a description paragraph (answer first),
  then the body.
* Fast static pages, no client-side data fetching.
