# sergeserbinenko.com

Serge Serbinenko's personal site. It is a static Astro site with a "Journey"
concept: a full-bleed photo backdrop sits behind every page, and each section
of the home page is a stop bound to a place. When a stop reaches the middle
of the viewport, the backdrop crossfades to that stop's photo, the place
caption changes, and the accent color follows. Visitors can switch scenery
between Auto (night photos from 19:00 to 06:00 local time), Day, Night,
and Off.

All visual styling lives in `src/styles/global.css` and is owned by design.
This repo holds structure, data, client logic, and deploy config.

## Run it

You need Node 22 and pnpm 11.

```sh
pnpm install
pnpm dev        # local dev server
pnpm typecheck  # astro sync, then tsc-rs (Rust port of TypeScript 7) on the .ts files
pnpm check      # typecheck, then astro check for the .astro files
pnpm test       # node --test src/scripts/
pnpm build      # static build to dist/
pnpm preview    # serve dist/ locally
```

## Add a project

Create a Markdown file in `src/content/projects/`, for example
`src/content/projects/my-thing.md`:

```md
---
title: "My Thing"
tagline: "One sentence about it."
year: "2026"
kind: "product"          # product | open-source | fork | work | experiment
stack: ["TypeScript"]
scene: "tofino"          # must be a key in src/data/scenes.ts
featured: true           # true puts it on the home page journey
order: 3
links:
  repo: "https://github.com/SergeSerb2/my-thing"
shot: "../../assets/projects/my-thing.jpg"   # optional
shotAlt: "Describe the screenshot"           # required with shot
draft: false
---

Write the story here in Markdown.
```

Put screenshots in `src/assets/projects/`. Set `draft: true` to hide a
project everywhere. Featured projects appear on the home page in `order`
order, each with its own scenery stop.

## Add a note

Create a Markdown file in `src/content/notes/`:

```md
---
title: "A short note"
description: "One-line summary."
date: 2026-10-12
scene: "kyoto"
draft: false
---

Note body here.
```

The `/notes` pages, the home Notes stop, and the Notes nav links only
appear when at least one non-draft note exists. With no published notes,
the build generates no `/notes` pages at all.

## Key files

- `src/data/scenes.ts` — every place, photo, credit, and night variant.
- `src/data/site.ts` — name, role, location, email, links.
- `src/data/resume.ts` — experience, education, skills. A summary that
  starts with `TODO(serge)` never renders in public.
- `src/scripts/daylight.ts` — pure mode/daylight/tone rules (tested).
  The boot script in `src/layouts/Base.astro` repeats these rules inline.
  Keep the two in sync.
- `src/scripts/scenery.ts` — the client engine: scroll stops, crossfades,
  place captions, accent color, and the mode switch.

## Deploy

The site deploys to Cloudflare Workers static assets. `wrangler.jsonc`
serves `./dist` on `sergeserbinenko.com` and `www.sergeserbinenko.com`
with a 404 page fallback. `public/_headers` sets security headers and
long-lived caching for `/_astro/*`.

CI (`.github/workflows/ci.yml`) runs check, test, and build on every pull
request and push to `main`. A push to `main` also deploys with
`wrangler deploy`, using the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

To deploy by hand:

```sh
pnpm deploy   # astro build && wrangler deploy
```

Designer-owned assets still to add: `/public/favicon.svg`,
`/public/apple-touch-icon.png`, and `/public/og.jpg` (1200×630).
The pages already reference all three.

## Site agent

A small Claude-powered agent answers questions about Serge and his work.
The Worker in `worker/` serves the static site and three API routes
(`POST /api/agent/session`, `POST /api/agent/chat`, `GET /api/agent/status`).
Its knowledge is `/agent-context.txt`, built at build time from the content
collections (`src/pages/agent-context.txt.ts`). The browser-side module is
`src/scripts/agent-client.ts`; the chat UI is separate.

The agent is locked down on purpose. Messages are at most 280 characters.
A Turnstile widget (already created; site key in `wrangler.jsonc` `vars`)
gates every session. Sessions last 30 minutes with at most 10 messages.
Each IP gets at most 6 sessions and 30 messages per UTC day. Global caps
live in `wrangler.jsonc` `vars` (`DAILY_MESSAGE_CAP`, `DAILY_SPEND_CAP_USD`),
and Workers Rate Limiting bindings cap chat at 4/minute and sessions at
3/minute per IP. A `Gate` Durable Object enforces the caps and tracks real
spend from token usage, with a worst-case reservation per turn so a burst
cannot overshoot the spend cap by much. The system prompt (`worker/prompt.ts`)
only allows questions about Serge, his work, and this site.

Operator settings (all in `wrangler.jsonc` `vars`, then redeploy):

- `MODEL` — `claude-haiku-5-5` (default) or `claude-sonnet-5-5`. Any other
  value falls back to Haiku.
- `AGENT_ENABLED` — kill switch. Set to anything but `"true"` to stop the
  agent. `GET /api/agent/status` then reports `enabled: false`.
- `DAILY_MESSAGE_CAP` and `DAILY_SPEND_CAP_USD` — global daily caps.

Before the first deploy, set the two Worker secrets (never put them in the
repo or in `vars`):

```sh
pnpm exec wrangler secret put ANTHROPIC_API_KEY
pnpm exec wrangler secret put TURNSTILE_SECRET
```

For local development, put `ANTHROPIC_API_KEY`, `DEV=true`, and Cloudflare's
**test** Turnstile secret `TURNSTILE_SECRET=1x0000000000000000000000000000000AA` into
`.dev.vars` (gitignored). On localhost the browser uses the matching test site key,
and a production secret would reject those tokens. Then run `pnpm build`, then
`pnpm exec wrangler dev --local-upstream localhost:8787` and open
`http://localhost:8787/`. Without `--local-upstream`, wrangler rewrites a
same-host `Origin` to the configured route host, and the Origin guard rejects it.

Recommended zone settings, to enable by hand in the Cloudflare dashboard
(not in this repo): Bot Fight Mode, and a WAF rate-limiting rule on
`/api/agent/*` as a second layer in front of the Worker limits.
