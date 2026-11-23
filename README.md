# Velvet Tide: Port Solenne 3D

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/midorima66/velvet-tide-port-solenne-3d/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/midorima66/velvet-tide-port-solenne-3d/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original **3D open-world crime game** that plays offline in a desktop browser from its own static files — Three.js vendored in, no build step, no network. Explore the coastal city of Port Solenne in third person, on foot and by car: steal cars, dodge or fight the law, and work through a five-chapter story for the Tidewater Diner family.

**Play it:** open `game/index.html` in a desktop browser — no server, no network, no installs.

## The game

- A real 3D coastal city built with Three.js: downtown towers with lit windows, suburban houses, working docks with cranes and container stacks, a beach with palms, a park with a pond, and Gull Rock Lighthouse sweeping its beam over the water
- Third-person on foot and driving, with car theft, arcade vehicle physics, lane-keeping traffic AI, and pedestrians who stroll the pavements and flee from danger
- A 1–5 star wanted system: police cruisers navigate the street grid, cut you off at junctions and ram; BUSTED and WASTED respawns cost cash
- Punch and pistol combat with mouse aim and raycast shooting; buy the pistol and ammo at Harbor Arms, heal at Solenne General
- Five story chapters: a dock pickup, taxi fares, a hot-coupe delivery under a three-star ambush, debt collections, and a finale run to the lighthouse under four stars
- HUD with health, cash, wanted stars, weapon and ammo, clock and speed — plus a live circular minimap and a gold objective marker with an edge arrow
- Title, pause, busted/wasted and completion screens; save/continue in localStorage, autosaved after every chapter
- Fully synthesized WebAudio: engine, sirens, effects, and a generated music loop (M to mute)
- A full day-night cycle: golden-hour start, lit windows and street lamps at dusk, headlight cones at night, the lighthouse beam

**Controls:** WASD / arrows — walk & drive · Mouse — look & aim · Click / J — punch & shoot · Shift — run · E — enter / exit car, talk, buy · 1 / 2 — fists / pistol · P — pause · K — save · M — sound

## Entry

Built for the make.fun bounty [Make GTA 6](https://make.fun/bounty/gta6-01). `main.ts` (Node 22) assembles the entry: it copies `game/` and `screenshots/` to the output directory and writes `dossier.json` via the vendored `vendor/makefun-game.ts`. Three.js (MIT) is vendored under `game/vendor/`; everything else — city, characters, vehicles, names, story, art, sound and music — is an original creation.

## Run locally

Just open `game/index.html` in a desktop browser — everything runs from the files themselves, with no build step. If you prefer a local server, `node serve.ts` serves `game/` at http://localhost:8080 (pass `--port N` for another port). To assemble the competition entry, `node main.ts` writes `game/`, `screenshots/` and `dossier.json` to `$MAKEFUN_OUTPUT_DIR` (or `/output`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=niccolo&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
