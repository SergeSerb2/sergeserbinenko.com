---
title: "Papers"
tagline: "Listen to research papers, read aloud with the citations handled and the math in words."
year: "2026"
kind: "product"
role: "Solo developer"
status: "In development"
stack: ["Next.js", "TypeScript", "SQLite", "LLMs", "Text-to-speech"]
scene: "seceda"
order: 6
---

Add an arXiv id, a PDF, or a link. Papers turns it into a read-aloud script, reads it with a natural voice, and shows a clean reader that highlights the sentence you are hearing.

## The pipeline

1. **Ingest.** arXiv HTML, web articles, or PDF pages read by a vision model become one structured document.
2. **Script.** A language model rewrites it for the ear: citations and references handled, equations spoken in words.
3. **Voice.** One audio clip per sentence, generated in order, so playback starts before the whole paper is done.
4. **Read along.** A shared library with progress and highlights for each listener.
