---
title: "Spotiurge"
tagline: "A fast, native Spotify client in Rust, extended with discovery, sync, and album-matched scenery."
year: "2026"
kind: "fork"
role: "Solo developer"
status: "In development"
stack: ["Rust", "egui", "librespot", "Swift"]
scene: "seoul"
featured: true
order: 2
links:
  repo: "https://github.com/SergeSerb2/Spotiurge"
shot: "../../assets/projects/spotiurge.jpg"
shotAlt: "Spotiurge playing an album, its track list floating over a dimmed mountain-lake photo"
---

[Spotifast](https://github.com/crmne/spotifast) by Carmine Paolino is a Spotify client written in Rust. It starts in under a second, uses a fraction of the memory of the official app, and has no browser engine inside. Spotiurge is my fork of it.

## What I added

- **Discovery and ratings.** Rate tracks, keep that feedback across restarts, and get suggestions built from it. Edits stay safe when a request fails or a result arrives late.
- **Sync between desktops.** Your ratings and state follow you from one machine to the next.
- **Scenery.** The window background is an Unsplash photo set chosen to match the album that is playing.
- **Windows installer.** An independent package with its own tests in CI.
- **iPhone.** A native glass client on a separate branch, tested on a real device for background playback.

Playback needs Spotify Premium. Spotiurge is not affiliated with Spotify.
