// Velvet Tide: Port Solenne 3D — boot, the fixed-step loop, the third-person
// camera, the day-night cycle, screens, saving. The simulation lives in
// world.js / ai.js / combat.js / missions.js; this file conducts it.
import * as THREE from 'three';
import { STEP, CLOCK, SAVE_KEY, WEAPON } from './config.js';
import { buildCity } from './city.js';
import {
  createWorld, stepPlayerOnFoot, toggleCar, integrateCar,
  stepPolicePressure, applyVerdict, stepParticles, EV,
} from './world.js';
import { stepAI } from './ai.js';
import { tryAttack } from './combat.js';
import { startStory, resumeStory, stepMissions } from './missions.js';
import { initHud, showHud, updateHud, setPrompt, objectiveEls } from './hud.js';
import { setupShot } from './shots.js';
import * as input from './input.js';
import { initAudio, resumeAudio, startMusic, setEngine, setSiren, toggleMute, sfx } from './audio.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const shotName = params.get('shot');

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2a56b);
scene.fog = new THREE.Fog(0xf2a56b, 130, 460);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const city = buildCity(scene, seed);
const world = createWorld(scene, city, seed);
world.sceneRef = scene;
startStory(world);

// The gold objective marker: a ring on the ground and a pillar of light.
const marker = new THREE.Group();
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(3.2, 0.28, 8, 28),
  new THREE.MeshBasicMaterial({ color: 0xf2c94c }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.35;
const pillar = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 0.7, 26, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
);
pillar.position.y = 13;
marker.add(ring, pillar);
marker.visible = false;
scene.add(marker);

// ---- Save / load ----
function saveGame() {
  const m = world.mission;
  const data = {
    cash: world.player.cash,
    health: world.player.health,
    hasPistol: world.player.hasPistol,
    ammo: world.player.ammo,
    nextMission: world.completed ? world.missions.length : (m && m.started ? m.index : (m ? m.index + 1 : 0)),
    completed: world.completed,
    earned: world.stats.earned,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  return data;
}
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function loadGame(data) {
  const p = world.player;
  p.cash = data.cash; p.health = data.health;
  p.hasPistol = data.hasPistol; p.ammo = data.ammo;
  if (p.hasPistol) p.weapon = 'pistol';
  world.stats.earned = data.earned || 0;
  resumeStory(world, data.nextMission, data.completed);
}

// ---- Screens and state ----
let state = 'title'; // title | play | pause
const $ = (id) => document.getElementById(id);
const screens = { title: $('screen-title'), pause: $('screen-pause'), verdict: $('screen-verdict'), complete: $('screen-complete') };
let shotReadyFrames = 0;

function startPlaying(withSave) {
  initAudio(); resumeAudio(); startMusic();
  if (withSave) loadGame(withSave);
  screens.title.classList.add('hidden');
  state = 'play';
  showHud(true);
  input.lockPointer(renderer.domElement);
}
$('btn-start').addEventListener('click', () => startPlaying(null));
$('btn-resume').addEventListener('click', () => {
  screens.pause.classList.add('hidden');
  state = 'play';
  input.lockPointer(renderer.domElement);
});
$('btn-roam').addEventListener('click', () => {
  screens.complete.classList.add('hidden');
  input.lockPointer(renderer.domElement);
});
const existing = readSave();
if (existing && !shotName) {
  $('btn-continue').classList.remove('hidden');
  $('continue-label').textContent = existing.completed ? 'Port Solenne, finished' : `Chapter ${Math.min(5, existing.nextMission + 1)}`;
  $('btn-continue').addEventListener('click', () => startPlaying(existing));
}
renderer.domElement.addEventListener('click', () => {
  if (state === 'play' && !input.isPointerLocked()) input.lockPointer(renderer.domElement);
});

// ---- Day and night ----
// Keyframes: [hour, sky, sunIntensity, sunColour, hemi, darkness]
const SKY_KEYS = [
  [0.0, 0x11182b, 0.14, 0x8fa8d8, 0.22, 1.0],
  [5.0, 0x11182b, 0.14, 0x8fa8d8, 0.22, 1.0],
  [6.5, 0xd98a6a, 0.7, 0xffb37a, 0.4, 0.45],
  [8.0, 0x9fc8e8, 1.6, 0xfff0d0, 0.75, 0.0],
  [16.5, 0x9fc8e8, 1.6, 0xfff0d0, 0.75, 0.0],
  [17.7, 0xf2a56b, 1.45, 0xffc98a, 0.62, 0.18],
  [18.8, 0xe2703a, 0.9, 0xff9a5e, 0.45, 0.5],
  [19.6, 0x4a4460, 0.3, 0xd88a6a, 0.3, 0.85],
  [20.5, 0x11182b, 0.14, 0x8fa8d8, 0.22, 1.0],
  [24.0, 0x11182b, 0.14, 0x8fa8d8, 0.22, 1.0],
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function updateSky(dt) {
  const hour = (world.clockMinutes / 60) % 24;
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (hour >= SKY_KEYS[i][0] && hour <= SKY_KEYS[i + 1][0]) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const t = b[0] === a[0] ? 0 : (hour - a[0]) / (b[0] - a[0]);
  _c1.setHex(a[1]); _c2.setHex(b[1]);
  scene.background.copy(_c1).lerp(_c2, t);
  scene.fog.color.copy(scene.background);
  const sunI = a[2] + (b[2] - a[2]) * t;
  const hemiI = a[4] + (b[4] - a[4]) * t;
  const dark = a[5] + (b[5] - a[5]) * t;
  _c1.setHex(a[3]); _c2.setHex(b[3]);
  city.sun.color.copy(_c1).lerp(_c2, t);
  city.sun.intensity = sunI;
  city.hemi.intensity = hemiI;
  // The sun rides an arc; at night this becomes the moon's cold light.
  const ang = ((hour - 6.5) / 13) * Math.PI;
  const p = world.player;
  city.sun.position.set(p.x + Math.cos(ang) * 190, 40 + Math.sin(ang) * 170, p.z - 90);
  city.sun.target.position.set(p.x, 0, p.z);
  for (const m of city.windowMats) m.emissiveIntensity = dark * 0.95;
  city.lampHeadMat.emissiveIntensity = dark * 2.2;
  city.beamMat.opacity = 0.04 + dark * 0.14;
  city.beamPivot.rotation.y += dt * 0.45;
  city.waterMat.color.setHex(0x2e6f8e).lerp(_c1.setHex(0x0d2233), dark * 0.8);
  const headlights = dark > 0.32;
  for (const car of world.cars) {
    car.mesh.userData.headlight.visible = headlights;
    car.mesh.userData.lampMat.emissiveIntensity = headlights ? 1.8 : 0;
  }
}

// ---- Camera ----
let camYaw = world.player.heading, camPitch = 0.32;
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = world.player;
  if (state === 'title') {
    const t = world.time * 0.05;
    camera.position.set(400 + Math.cos(t) * 150, 58, 300 + Math.sin(t) * 150);
    camera.lookAt(390, 8, 280);
    return;
  }
  const md = input.mouseDelta();
  if (input.isPointerLocked() || shotName) {
    camYaw -= md.x * 0.0026;
    camPitch = Math.max(-0.08, Math.min(1.0, camPitch + md.y * 0.0022));
  }
  const driving = !!p.car;
  if (driving) {
    // The camera settles behind the car; the mouse may still swing it.
    let diff = ((p.car.heading - camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    camYaw += diff * Math.min(1, dt * (Math.abs(p.car.speed) > 3 ? 2.6 : 0.8));
  }
  const dist = driving ? 10.5 + Math.abs(p.car.speed) * 0.16 : 7.6;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  camTarget.set(p.x, 1.6, p.z);
  camera.position.set(
    p.x - fx * dist * Math.cos(camPitch),
    1.6 + dist * Math.sin(camPitch) + (driving ? 1.2 : 0.6),
    p.z - fz * dist * Math.cos(camPitch),
  );
  camera.lookAt(p.x + fx * 6, 1.7, p.z + fz * 6);
}

// ---- Objective arrow on the HUD ----
const _v = new THREE.Vector3();
function updateObjectiveUi() {
  const { arrow, dist } = objectiveEls();
  const obj = world.objective;
  if (!obj || state !== 'play') { arrow.classList.add('hidden'); dist.classList.add('hidden'); marker.visible = false; return; }
  const p = world.player;
  const d = Math.hypot(obj.x - p.x, obj.z - p.z);
  marker.visible = true;
  marker.position.set(obj.x, 0, obj.z);
  const s = 1 + Math.sin(world.time * 4) * 0.08;
  marker.scale.set(s, 1, s);
  _v.set(obj.x, 1.5, obj.z).project(camera);
  const behind = _v.z > 1;
  let x = _v.x, y = _v.y;
  if (behind) { x = -x * 2; y = -1.4; }
  const off = Math.abs(x) > 0.92 || Math.abs(y) > 0.88 || behind;
  if (!off) { arrow.classList.add('hidden'); dist.classList.add('hidden'); return; }
  const cx = Math.max(-0.92, Math.min(0.92, x));
  const cy = Math.max(-0.88, Math.min(0.88, y));
  const sx = (cx * 0.5 + 0.5) * innerWidth;
  const sy = (-cy * 0.5 + 0.5) * innerHeight;
  arrow.classList.remove('hidden');
  dist.classList.remove('hidden');
  arrow.style.left = `${sx - 11}px`;
  arrow.style.top = `${sy - 10}px`;
  const ang = Math.atan2(sy - innerHeight / 2, sx - innerWidth / 2) + Math.PI / 2;
  arrow.style.transform = `rotate(${ang}rad)`;
  dist.style.left = `${sx}px`;
  dist.style.top = `${sy + 14}px`;
  dist.textContent = `${Math.round(d)} m`;
}

// ---- One fixed simulation step ----
function step(dt) {
  world.time += dt;
  world.clockMinutes += CLOCK.minutesPerSecond * dt;
  const p = world.player;
  p.attackCd = Math.max(0, p.attackCd - dt);

  if (state === 'play' && !world.verdict) {
    // Dialogue takes the interact key and the click while it is on screen.
    const dlgActive = !!world.dialogue;
    if (input.consume('interact')) {
      if (dlgActive) { world.dialogue.at++; world.dialogue.timer = 0; }
      else if (!tryShop(world)) toggleCar(world);
    }
    if (input.consume('fists')) p.weapon = 'fist';
    if (input.consume('pistol') && p.hasPistol) p.weapon = 'pistol';
    if (input.consume('mute')) world.muted = toggleMute();
    if (input.consume('save')) { saveGame(); setPrompt('Saved — the tide remembers.'); setTimeout(() => setPrompt(''), 1400); }
    if (input.consume('pause')) {
      state = 'pause';
      screens.pause.classList.remove('hidden');
      document.exitPointerLock?.();
    }

    if (p.car) {
      let throttle = 0, steer = 0;
      if (world.scripted) { throttle = world.scripted.throttle; steer = world.scripted.steer; }
      else {
        const ax = input.axis();
        throttle = -ax.y;
        steer = -ax.x;
      }
      integrateCar(world, p.car, dt, throttle, steer, true);
      p.x = p.car.x; p.z = p.car.z;
    } else {
      const ax = input.axis();
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const rx = fz, rz = -fx; // camera-right in world space
      let mx = fx * -ax.y + rx * ax.x;
      let mz = fz * -ax.y + rz * ax.x;
      if (world.scripted && world.scripted.walk) { mx = world.scripted.walk.x; mz = world.scripted.walk.z; }
      stepPlayerOnFoot(world, dt, mx, mz, input.down('ShiftLeft') || input.down('ShiftRight'));
      if (Math.hypot(mx, mz) < 0.05 && !dlgActive) {
        // Standing still, Marlo faces where the camera looks (aiming).
        p.heading = camYaw;
        p.mesh.rotation.y = camYaw;
      }
      const heal = city.places.hospital;
      if (Math.hypot(heal.x - p.x, heal.z - p.z) < 9 && p.health < 100) {
        p.health = Math.min(100, p.health + 22 * dt);
      }
    }

    if ((input.consume('attack') || (input.attackHeld() && p.weapon === 'pistol')) && !dlgActive) {
      camera.getWorldDirection(_v);
      tryAttack(world, camera.position.clone(), _v.clone());
    }

    const events = stepMissions(world, dt);
    if (events & EV.CASH) sfx.cash();
    if (events & EV.MISSION_DONE) {
      sfx.mission();
      saveGame();
      if (world.completed) {
        $('complete-stats').textContent =
          `Five chapters, $${world.stats.earned} earned, ${world.stats.carsStolen} cars borrowed and ${world.stats.shotsFired} shots fired. Port Solenne is yours now — the diner, the docks, all of it.`;
        screens.complete.classList.remove('hidden');
        document.exitPointerLock?.();
      }
    }
    stepAI(world, dt);
    const nearestCop = stepPolicePressure(world, dt);
    setEngine(p.car ? Math.abs(p.car.speed) / 34 : null);
    setSiren(nearestCop < 60 && world.stars > 0 ? 1 - nearestCop / 70 : 0);
    if (p.health <= 0 && !world.verdict) {
      world.verdict = 'wasted';
      world.verdictTimer = 2.6;
      sfx.wasted();
    }
  } else if (state === 'title') {
    stepAI(world, dt);
    setEngine(null); setSiren(0);
  }

  if (world.verdict) {
    $('verdict-word').textContent = world.verdict === 'busted' ? 'BUSTED' : 'WASTED';
    $('verdict-word').className = world.verdict === 'busted' ? '' : 'wasted';
    $('verdict-sub').textContent = world.verdict === 'busted'
      ? 'Solenne PD walks you out $100 poorer — and they keep the change from your pockets.'
      : 'Solenne General patches you up. The bill comes out of your cash.';
    screens.verdict.classList.remove('hidden');
    world.verdictTimer -= dt;
    setEngine(null);
    if (world.verdictTimer <= 0) {
      applyVerdict(world);
      screens.verdict.classList.add('hidden');
    }
  }
  stepParticles(world, dt);
  updatePrompt();
}

function tryShop(world) {
  const p = world.player;
  if (p.car) return false;
  const shop = world.city.places.gunStore;
  if (Math.hypot(shop.x - p.x, shop.z - p.z) > 8) return false;
  if (!p.hasPistol) {
    if (p.cash >= WEAPON.pistol.price) {
      p.cash -= WEAPON.pistol.price;
      p.hasPistol = true;
      p.ammo = 24;
      p.weapon = 'pistol';
      sfx.cash();
    } else setPrompt(`Harbor Arms: a pistol is $${WEAPON.pistol.price}. You are short.`);
  } else if (p.cash >= 60 && p.ammo < 120) {
    p.cash -= 60;
    p.ammo = Math.min(120, p.ammo + 24);
    sfx.cash();
  }
  return true;
}

function updatePrompt() {
  if (state !== 'play' || world.verdict) { setPrompt(''); return; }
  const p = world.player;
  if (world.dialogue) { setPrompt('E — continue'); return; }
  if (p.car) { setPrompt('E — step out'); return; }
  const shop = city.places.gunStore;
  if (Math.hypot(shop.x - p.x, shop.z - p.z) < 8) {
    setPrompt(!p.hasPistol ? `E — buy a pistol ($${WEAPON.pistol.price})` : 'E — buy 24 rounds ($60)');
    return;
  }
  const heal = city.places.hospital;
  if (Math.hypot(heal.x - p.x, heal.z - p.z) < 9 && p.health < 100) {
    setPrompt('Solenne General — patching you up…');
    return;
  }
  let nearCar = false;
  for (const car of world.cars) {
    if (car.kind !== 'police' && Math.hypot(car.x - p.x, car.z - p.z) < 3.4) { nearCar = true; break; }
  }
  setPrompt(nearCar ? 'E — take the car' : '');
}

// ---- Boot and the loop ----
input.initInput(renderer.domElement);
initHud();
if (shotName) {
  const mode = setupShot(world, shotName);
  if (mode === 'play') {
    screens.title.classList.add('hidden');
    state = 'play';
    showHud(true);
    camYaw = world.player.car ? world.player.car.heading : world.player.heading;
    camPitch = 0.3;
  }
}
window.__game = { world, scene, camera };

let last = performance.now(), accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state !== 'pause') {
    accumulator += dt;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
  } else {
    input.mouseDelta();
  }
  updateSky(Math.min(dt, 0.05));
  updateCamera(dt);
  if (state === 'play') updateHud(world, dt);
  updateObjectiveUi();
  renderer.render(scene, camera);
  if (shotName && ++shotReadyFrames === 45) window.__shotReady = true;
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
