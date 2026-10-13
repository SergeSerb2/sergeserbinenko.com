---
title: "Broadcast monitoring"
tagline: "Round-the-clock radio and TV monitoring: live transcripts, AI-detected segments, and one dashboard to search them."
year: "2025–2026"
kind: "work"
role: "Lead engineer (contract)"
status: "In production"
stack: ["Python", "TypeScript", "Speech-to-text", "LLMs", "Google Cloud Run"]
scene: "hong-kong"
featured: true
order: 5
---

This is client work, so there is no code and there are no screenshots here. I can describe the shape of it.

The platform follows what is said on radio and TV, around the clock, and turns it into something people can search.

## What I built

- **Ingest.** Live radio and TV streams are recorded 24/7, with health checks on every stream.
- **Transcription.** Speech-to-text runs locally first, with a cloud fallback, so a bad hour on one side does not leave a gap.
- **Understanding.** Language models split transcripts into segments and write short summaries.
- **One dashboard.** Everything lands in a single place to search and review.

I wrote most of the system and run its delivery: staging deploys on every merge to main, production on Google Cloud Run.
