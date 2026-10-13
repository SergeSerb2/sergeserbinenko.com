# Design: "Journey"

The site is a trip through real places. A full-bleed photo sits behind everything.
Each section of the home page is a stop with its own place. When a stop reaches the
middle of the screen, the photo crossfades to that place, the caption in the bottom
right names it (with its coordinates and the local time there), and the accent color
shifts to match. Content floats over the photo in frosted glass.

It carries the "World Scenery" language from T3 Pretty and Spotiurge: real
photographs, calm glass, a place caption, and the photographer always credited.

## Rules

- **Photo first.** Content never covers the whole photo on wide screens. Cards sit on
  the left (projects alternate sides), the photo breathes on the right.
- **Everything readable lives in glass.** Never put body text straight on a photo.
  The only text on the photo is the place caption, over a bottom scrim.
- **One idea per stop.** A stop is one card: hero, now, one project, résumé, contact.
- **Real places, real credit.** Photos are hand-picked Unsplash photos, hotlinked from
  `images.unsplash.com` with the photographer and Unsplash linked (with UTM params).
  Never AI-generated scenery.
- **Calm motion.** Crossfades are slow (1.3 s), the photo settles and then drifts very
  slowly. Glass cards rise in once as they enter. Reduced motion keeps the fades and
  drops all movement.

## Places

All places live in `src/data/scenes.ts`. Each has a photo, coordinates, time zone,
average color (the wash while loading and the whole backdrop when scenery is off), an
accent color picked by eye from the photo, and a focal point.

| Stop | Day | Night (19:00–06:00 visitor time) |
| --- | --- | --- |
| Home | Tofino kayak | Jasper Milky Way |
| Now | Moraine Lake | Jasper night sky |
| Work intro | Lofoten | Hong Kong at night |
| Projects | Each project picks its own place in its frontmatter (`scene`) | — |
| Résumé | Isle of Skye (a trail) | — |
| Notes | Kyoto | — |
| Contact | Tofino at dusk (end of the day, send a postcard) | Jasper night sky |
| 404 | Faroe Islands ("off the map") | — |

To add a place, pick a photo from Unsplash, add it to `scenes`, choose an `accent`
that is a real color in the photo, and set `focal` so the subject is not hidden behind
the cards. Night variants go in `nightScenes`.

## Scenery modes

Top-right switch: **Auto** (visitor's local time decides day or night), **Day**,
**Night**, **Off** (no photos, just a soft wash of the place's color). Stored in
`localStorage.scenery`. An inline script in `<head>` applies it before first paint.

Tone (light or dark glass) follows the visitor's color scheme, except night photos
always use dark glass.

## Type

- **Newsreader** (display): names, titles, place names, the "handwritten" postcard.
  Optical size 72 at display sizes. Italic for places and organisations.
- **Geist** (UI and body).
- **Geist Mono** (eyebrows, coordinates, dates, chips). Uppercase with wide tracking.

## Tokens

Defined at the top of `src/styles/global.css`: `--ink`, `--ink-2`, `--ink-3`,
`--line`, `--glass`, `--glass-hi`, `--solid`, `--accent` (registered, animates
between places), `--wash` (registered), radii `--r-xl/l/m`, `--ease`, `--ease-io`.
Dark tone overrides live under `html[data-tone="dark"]`.

## Files

- `src/styles/global.css`: fonts, tokens, base, view transitions.
- `src/styles/scenery.css`: backdrop, glass, top bar, route rail, place caption.
- `src/styles/components.css`: stops, type, buttons, chips, hero, project postcard,
  résumé trail, contact postcard (stamp and postmark), motion.
- `src/styles/pages.css`: inner pages, project tiles, résumé page, notes, print.

Components use these class names and contain no styles of their own.

## Details worth keeping

- The route rail on the home page fills with the accent color as you scroll
  (scroll-driven animation; static where unsupported).
- The résumé trail is a dashed path between waypoints, like a hiking map.
- The contact card is a postcard: message on the left, address lines on the right, a
  perforated stamp of the current place, and a postmark with today's date.
- `/resume` prints as a clean document ("Save as PDF").
- Cross-document view transitions keep the backdrop in place between pages, and a
  project card morphs into its page header.
