# Design: "Scenery OS"

The whole site is one native-feeling Mac app window, styled after Serge's T3 Pretty app,
floating over a full-screen landscape photo. Every thread (About, Résumé, Contact, each
project) has its own place. Moving around the site feels like switching threads in an app,
and the world behind the glass changes with it.

## Rules

- **The window is the hero; the scenery is the frame.** Content never sits straight on the
  photo.
- **It should feel like a real app.** 13–14px sidebar rows,
  a titlebar with traffic lights and a breadcrumb, a composer like T3 Code's. No marketing
  hero, no scroll-jacking.
- **The window never moves between threads.** Only the main pane changes, the backdrop
  reveals the new scenery, and the credit, breadcrumb, and accent follow.
- **Scenery, not places.** Hand-picked Unsplash photos, hotlinked. No place names: the
  only text on the photo is a small credit chip (photographer and Unsplash) under the
  window's right corner. Never AI-generated scenery.
- **Always a little alive.** The photo drifts toward its subject and leans against the
  pointer; light and cloud shadow pass over it; motes of light float in front. New
  scenery spreads out in a soft circle from where you clicked.
- **Every interaction answers.** Sliding sidebar plates, a sheen and rim light on the
  glass that follow the pointer, pages that arrive in pieces (headline words pop),
  cards that lift with glare, springy buttons, a ring of light on the focused composer.
  Reduced motion turns all of it off.

## Threads and scenery

| Thread | Scenery |
| --- | --- |
| About | Tofino, Canada |
| Résumé | Moraine Lake, Canada |
| Contact | Lofoten, Norway |
| Each project | The `scene` in its frontmatter |
| All projects | Isle of Skye |
| Not found | Faroe Islands |

Scenes live in `src/data/scenes.ts` (photo, photographer, average color, accent,
focal point). The accent follows the active scene. On darker scenery the glass gets
more opaque so text keeps its contrast.

## Type and color

- Font: **Sora** (variable, self-hosted from `public/fonts/`, SIL OFL), system UI fallback.
- Greeting 48/600, project title 40/600, lead 18/400, sidebar rows 13.5, labels 12.
- Ink `#1d1f24`, secondary `#484d56`, gray `#6b7079`.
- Window glass `rgba(255,255,255,.55)` with `blur(30px) saturate(1.8)`; sidebar adds a
  lighter layer; active row `rgba(255,255,255,.7)`; composer `rgba(255,255,255,.8)`.
- Traffic lights `#ff5f57`, `#febc2e`, `#28c840`.

## Size

The window is drawn at 1320x860 and centered above the credit chip. On big screens it
scales with `zoom` (1.1 at 1680w, 1.2 at 1900w, 1.4 at 2300w, 1.65 at 2800w), so it
never looks small. On phones it becomes a full-height sheet.

## Site agent

The About composer is a small Claude agent (Claude Haiku 5.5) that answers questions
about Serge only. A conversation opens inside the About pane like a thread: the
composer glides down, replies stream in word by word, and the agent can open a page,
show the scenery, or draft an email the visitor sends themselves. Limits and bot
protection are in the README.

## Little things

- ⌘K searches threads by title, stack, and tagline.
- ↑/↓ moves between threads; the green light goes to the next one.
- Peek: the photo icon, the red or yellow light, or P hides the window to show the scenery.
- The About composer talks to the site agent; the Contact composer turns a note into an email.
- The sidebar footer shows Vancouver time.

## Files

- `src/layouts/App.astro`: the shell (backdrop, caption, window, sidebar, titlebar).
- `src/styles/app.css`: all styles, including phone layout and résumé printing.
- `src/scripts/app.ts`: navigation hooks, backdrop crossfade, search, keys, peek.
