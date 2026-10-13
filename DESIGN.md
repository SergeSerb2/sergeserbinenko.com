# Design: "Scenery OS"

The whole site is one native-feeling Mac app window, styled after Serge's T3 Pretty app,
floating over a full-screen landscape photo. Every thread (About, Résumé, Contact, each
project) has its own place. Moving around the site feels like switching threads in an app,
and the world behind the glass changes with it.

## Rules

- **The window is the hero; the place is the frame.** Content never sits straight on the
  photo. The only text on the photo is the centered place caption at the bottom.
- **It should feel like a real app.** System font (SF Pro on a Mac), 13–14px sidebar rows,
  a titlebar with traffic lights and a breadcrumb, a composer like T3 Code's. No marketing
  hero, no scroll-jacking.
- **The window never moves between threads.** Only the main pane changes, the backdrop
  crossfades to the new place, and the caption, breadcrumb, and accent follow.
- **Real places, real credit.** Hand-picked Unsplash photos, hotlinked, with the
  photographer and Unsplash linked in the caption. Never AI-generated scenery.
- **Calm motion.** Backdrop crossfade 600 ms with a slight settle, pane 160 ms out and
  220 ms in with a 6 px rise. Reduced motion turns movement off.

## Threads and places

| Thread | Place |
| --- | --- |
| About | Tofino, Canada |
| Résumé | Moraine Lake, Canada |
| Contact | Lofoten, Norway |
| Each project | The `scene` in its frontmatter |
| Not found | Faroe Islands |

Places live in `src/data/scenes.ts` (photo, photographer, coordinates, average color,
accent, focal point). The accent follows the active place. On dark places the glass gets
more opaque so text keeps its contrast.

## Type and color

- Font: `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`.
- Greeting 48/600, project title 40/600, lead 19/400, sidebar rows 13.5, labels 12.
- Ink `#1d1f24`, secondary `#484d56`, gray `#6b7079`.
- Window glass `rgba(255,255,255,.55)` with `blur(30px) saturate(1.8)`; sidebar adds a
  lighter layer; active row `rgba(255,255,255,.7)`; composer `rgba(255,255,255,.8)`.
- Traffic lights `#ff5f57`, `#febc2e`, `#28c840`.

## Little things

- ⌘K searches threads by title, stack, tagline, and place.
- ↑/↓ moves between threads; the green light goes to the next one.
- Peek: the photo icon, the red or yellow light, or P hides the window to show the place.
- The composer turns a question into an email.
- The sidebar footer shows Vancouver time.

## Files

- `src/layouts/App.astro`: the shell (backdrop, caption, window, sidebar, titlebar).
- `src/styles/app.css`: all styles, including phone layout and résumé printing.
- `src/scripts/app.ts`: navigation hooks, backdrop crossfade, search, keys, peek.
