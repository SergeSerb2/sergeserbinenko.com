---
title: "Draftline"
tagline: "A live pick assistant for one fantasy football draft night, refreshed every 1.5 seconds."
year: "2026"
kind: "experiment"
role: "Solo developer"
status: "Used on draft night"
stack: ["Next.js", "TypeScript", "Drizzle"]
scene: "maligne"
order: 7
---

Four friends, one Fantasy Premier League draft, a 90-second clock per pick. Draftline sat next to the official draft room and kept the best legal picks on screen.

- It reads only the public draft feed, works out the random snake order at kickoff, and drops players as they go.
- Rankings come from a deterministic model: positional replacement levels, projections, injuries, and whether a player will survive until my next turn.
- A language model explains the top choices in two sentences. It cannot change the ranking or make a pick. Picks stay manual.
- Friends' names are replaced before anything reaches the screen or the model.

Tests cover all 60 snake slots, roster limits, stale data, and the rule that it never sends a pick.
