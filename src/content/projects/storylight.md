---
title: "Storylight"
tagline: "Spoiler-safe scene art for audiobooks, revealed only when you reach the scene."
year: "2026"
kind: "product"
role: "Solo developer"
status: "Private beta"
stack: ["Node.js", "Chrome extension", "EPUB", "Image models"]
scene: "faroe"
featured: true
order: 4
---

Storylight reads the structure of a book from its EPUB, follows where you are in the audiobook, and shows concept art for the scene you are hearing. A picture never appears before its scene does.

## How it works

- **The book stays with you.** The EPUB is opened in the browser. The file is never uploaded.
- **A small Chrome extension** follows the web player's chapter and position, and adds play, pause, seek, and speed controls. It never captures audio.
- **Scenes are planned per chapter** from the text, then timed by word count inside the chapter's real start and length.
- **Art is ready before you get there.** Up to 16 images generate in parallel for the current chapter, and the next chapter starts five minutes before it begins.
- **Calm by default.** Cinematic, gentle, and still motion modes, and full support for reduced motion.
