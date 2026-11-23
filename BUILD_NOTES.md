# Velvet Tide: Port Solenne 3D — build notes

An original 3D open-world crime game for the make.fun bounty gta6-01 ("Make
GTA 6"), rendered with Three.js (vendored, MIT) and hand-built everything else.
City, people, vehicles, story, sound — all invented for this entry; nothing
comes from any commercial game.

## The game

Marlo Reyes, a wheelman who swore he was done, returns to the coastal city of
Port Solenne and takes five errands ("chapters") from his Auntie Vi of the
Tidewater Diner: a crate from the South Docks, three taxi fares, a hot coupe
to the chop shop, three debt collections, and a final drive to Gull Rock
Lighthouse. Between chapters the city is free to roam: steal cars, outrun the
Solenne PD, brawl and shoot, heal at Solenne General, buy a pistol at Harbor
Arms, and save the run to the browser.

## Architecture (game/src/, one job per file)

- `config.js` — every tuning number, the street grid, places data shared with
  the city, the save key.
- `random.js` — mulberry32 seeded RNG; a seed rebuilds the same city and shots.
- `city.js` — builds Port Solenne in Three.js: canvas-textured ground and
  asphalt, towers with emissive lit windows, instanced houses / containers /
  trees / street lamps, docks with cranes, the beach and palms, the park pond,
  and the lighthouse with its rotating beam. Also exports the collision boxes
  and circle-vs-AABB resolution the simulation uses.
- `world.js` — the living state: Marlo, every car and pedestrian (built from
  shared box/sphere geometries), arcade car physics, car theft, wanted heat,
  police spawning, the BUSTED meter and the busted/wasted verdicts, particles.
- `ai.js` — traffic that keeps its lane, decides at junctions and brakes for
  obstacles; police that think in grids, aim for junctions when a block stands
  in the way, and recover when wedged; pedestrians who stroll the pavements,
  flee gunfire and traffic, and go down when hit.
- `combat.js` — the punch, and the pistol as manual raycasts (ray vs building
  boxes, ray vs body spheres) with tracers, muzzle flash and crowd panic.
- `missions.js` — the five-chapter story: dialogue, objectives, markers,
  fares, collections, the hot-car and finale heat, rewards, save/resume.
- `audio.js` — WebAudio-synthesized engine, sirens, a bass/pad music loop and
  all one-shot effects. No audio files exist.
- `input.js` — keyboard/mouse as a sampled state; pointer-lock mouse look.
- `hud.js` — the DOM HUD (health, cash, stars, weapon, clock, speed, mission
  banner, dialogue box, BUSTED meter) and the live circular minimap.
- `shots.js` — the four staged screenshot scenes (`?shot=start|foot|chase|
  mission`), each a real seeded moment played forward with scripted hands.
- `main.js` — boot, the fixed-step loop, the third-person camera, the
  day-night cycle (sun, sky, lit windows, lamps, headlights, the beam),
  screens, busted/wasted respawns, the shop and hospital interactions, saving.

Root files: `main.ts` hands the game in (copies `game/` + `screenshots/` to
the output and writes `dossier.json` via the kit's `vendor/makefun-game.ts`,
copied unchanged); `serve.ts` is a local static server for playing and
screenshotting; `shots.json` lists the four screenshot scenes. Three.js r160
sits at `game/vendor/three.module.min.js`, imported through the import map in
`game/index.html`.

## Controls

WASD/arrows walk and drive · mouse look & aim · click or J punch/shoot ·
Shift run · E enter/exit car, talk, buy · 1/2 fists/pistol · P pause ·
K save · C continue (title screen) · M mute.

## Performance notes

Shared geometries and materials everywhere; houses, containers, trees and
lamp posts are InstancedMeshes; one 1024px shadow map follows the player;
draw calls stay in the low hundreds. The dossier's source-text cap (160 KiB)
shaped the module sizes.

## Testing

- Parse check of every module (all pass as ES modules).
- Headless Chrome 157 (SwiftShader WebGL) over CDP: the game loads and plays
  with zero console errors in normal play and in every `?shot=` scene.
- A scripted interactive session in the same harness: start the game, walk,
  steal a car, drive, raise the wanted level to four stars, buy the pistol
  and fire it — state asserted after each step.
- `MAKEFUN_OUTPUT_DIR=… node main.ts` builds the dossier inside every cap.
- The same run writes `entry-manifest.json` into the output (after the
  dossier, so it can never feed back into it): title, timestamp, and every
  assembled file with its byte size — the hand-in can be diffed against the
  repository without trusting the assembler.

## Screenshots (screenshots/, real renders via headless Chrome)

1. `1-chase.jpg` — cover: a four-star chase on the downtown avenue, cruisers
   with flashing light bars behind the cream coupe, HUD, minimap and the
   chapter-3 objective all live.
2. `2-downtown.jpg` — on foot outside the Tidewater Diner as chapter one
   begins: Vi's dialogue, traffic, pedestrians, the gold marker.
3. `3-docks.jpg` — dusk at Berth 9: the car at the crate, containers, cranes
   and warehouses, headlights on.
4. `4-title.jpg` — the title screen over a slow orbit of the golden-hour city.

Method: `node serve.ts --port 8902`, then headless Chrome at 1280x720 opens
`?shot=<scene>&seed=7`; the page stages the scene, plays it forward, sets
`window.__shotReady`; the frame is captured as a quality-88 JPEG under
256 KiB.
