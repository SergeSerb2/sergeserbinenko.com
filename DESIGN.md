# Design: "Journey"

The site is a trip through real places. A full-bleed photo sits behind everything.
Each section of the home page is a stop with its own place. Scrolling moves the camera:
the next place arrives out of a blur while the last one racks out of focus, the caption
spells out the new place letter by letter, and the accent color shifts to match. Content
floats over the photo in frosted glass, in shapes borrowed from travel: a boarding pass,
airplane windows, a folded map, an airmail postcard.

It carries the "World Scenery" language from T3 Pretty and Spotiurge: real photographs,
calm glass, a place caption, and the photographer always credited.

## Rules

- **Photo first.** Every stop leaves the photo room to breathe. Big titles sit straight on
  the scene; anything you read for more than a line sits on glass.
- **One idea per stop.** Hero is a boarding pass, Now is a statement with floating facts,
  Work is a giant title, each project is a view through an airplane window, the résumé
  is a trail on a map, contact is an airmail postcard.
- **Motion is scrubbed, not timed.** Scene changes, captions, parallax, and reveals are
  tied to scroll position (CSS scroll-driven animations), so they follow your hand and
  play backwards when you scroll back. Browsers without scroll timelines get calm
  class-driven fades.
- **Always a little alive.** Photos breathe, light wanders across the scene, glass rims
  catch a travelling highlight, badges turn, the departure board rolls, facts bob.
  All of it stops for reduced motion.
- **Real places, real credit.** Hand-picked Unsplash photos, hotlinked from
  `images.unsplash.com`, photographer and Unsplash linked (with UTM params) wherever a
  photo appears. Never AI-generated scenery.

## Type

One family: **Mona Sans** (variable weight 200–900 and width 75–125).

- Names and titles: heavy and wide (`font-stretch: 125%`, weight 820–900, tight tracking).
- Labels, coordinates, dates, chips: condensed capitals (`font-stretch: 75%`, weight
  650, tracking 0.15em). This replaces a monospace.
- Body: plain (weight 420).
- Secondary names (orgs, roles, the postcard note): light and slightly wide.
- Width is motion: the hero name squeezes from wide to condensed as you leave it.

## Places

All places live in `src/data/scenes.ts`: photo, place name, short `word` (set huge behind
the stop), coordinates, time zone, average color, accent, and focal point. Night
variants live in `nightScenes` and replace the day photo between 19:00 and 06:00 visitor
time.

## Scenery engine

- One `.scene` per stop, in the fixed `.scenery` layer. Each stop has a view timeline
  (`--stop-N`); `<body>` lists them in `timeline-scope` so the backdrop can follow them.
- `scene-in`, `scene-out`, and `scene-drift` (in `scenery.css`) are the whole transition:
  blur + dolly in, blur + pull back, and parallax drift.
- JS only loads photos near the viewport, tracks the active stop (accent, route, caption
  focusability), and resolves day or night.

## Modes

Top-right switch: **Auto**, **Day**, **Night**, **Off** (no photos, the place's color
wash still transitions). Stored in `localStorage.scenery`, applied before first paint.
Glass follows the visitor's color scheme, except night photos always use dark glass.

## Files

- `src/styles/global.css`: font, tokens, base, view transitions.
- `src/styles/scenery.css`: backdrop scenes, light, glass and rim light, top bar, route
  rail, place caption.
- `src/styles/components.css`: stops and giant words, type, buttons, boarding pass,
  ticker, Now facts, voyage (window, card, badge), map card and trail, airmail postcard,
  motion.
- `src/styles/pages.css`: inner pages, project tiles, résumé, notes, print.

Components use these class names and contain no styles of their own.
