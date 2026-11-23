// The HUD: health, cash, wanted stars, clock, weapon, speed, the mission banner,
// the dialogue box, the BUSTED meter and the live circular minimap.
// It writes only to the DOM and reads only the world, once per frame — the
// minimap is plotted from the same VX/HZ grid the city itself is built on,
// so the map in the corner can never quietly disagree with the streets.
import { VX, HZ, LAND, HEAT } from './config.js';
import { missionBanner } from './missions.js';

const $ = (id) => document.getElementById(id);
const els = {};
let minimapCtx = null;

export function initHud() {
  for (const id of ['hud', 'health-fill', 'cash', 'stars', 'clock', 'weapon', 'speed',
    'banner-title', 'banner-line', 'dialogue', 'dlg-name', 'dlg-text', 'prompt',
    'busted-wrap', 'busted-fill', 'obj-arrow', 'obj-dist', 'minimap']) {
    els[id] = $(id);
  }
  minimapCtx = els.minimap.getContext('2d');
}

export function showHud(on) { els.hud.classList.toggle('hidden', !on); }

function fmtClock(minutes) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function updateHud(world, dt) {
  const p = world.player;
  els['health-fill'].style.width = `${Math.max(0, p.health)}%`;
  els['health-fill'].style.background = p.health < 30 ? '#e5534b' : '#7dd069';
  els.cash.textContent = `$${p.cash}`;
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < world.stars ? '★' : '<span class="off">★</span>';
  els.stars.innerHTML = stars;
  els.clock.textContent = fmtClock(world.clockMinutes);
  els.weapon.textContent = p.weapon === 'pistol' && p.hasPistol
    ? `Pistol — ${p.ammo} rounds` : 'Fists';
  if (p.car) {
    els.speed.classList.remove('hidden');
    els.speed.innerHTML = `${Math.round(Math.abs(p.car.speed) * 3.6)} <small>km/h</small>`;
  } else els.speed.classList.add('hidden');

  const banner = missionBanner(world);
  if (banner) {
    els['banner-title'].textContent = banner.title;
    els['banner-line'].textContent = banner.line;
  }
  const bustPct = Math.min(100, (world.bustedMeter / HEAT.bustedSeconds) * 100);
  els['busted-wrap'].classList.toggle('hidden', bustPct <= 1 || !!world.verdict);
  els['busted-fill'].style.width = `${bustPct}%`;

  // Dialogue: lines advance on a timer (E or a click skips ahead, handled in main).
  const dlg = world.dialogue;
  if (dlg && dlg.at < dlg.lines.length) {
    els.dialogue.classList.remove('hidden');
    els['dlg-name'].textContent = dlg.lines[dlg.at][0];
    els['dlg-text'].textContent = dlg.lines[dlg.at][1];
    dlg.timer += dt;
    if (dlg.timer > 4.2) { dlg.timer = 0; dlg.at++; }
    if (dlg.at >= dlg.lines.length) world.dialogue = null;
  } else {
    els.dialogue.classList.add('hidden');
    if (dlg && dlg.at >= dlg.lines.length) world.dialogue = null;
  }
  drawMinimap(world);
}

export function setPrompt(text) {
  if (text) {
    els.prompt.textContent = text;
    els.prompt.classList.remove('hidden');
  } else els.prompt.classList.add('hidden');
}

/** The objective arrow/dist are positioned by main (it owns the camera). */
export function objectiveEls() { return { arrow: els['obj-arrow'], dist: els['obj-dist'] }; }

function drawMinimap(world) {
  const g = minimapCtx;
  if (!g) return;
  const S = 190, C = S / 2, SCALE = 0.52; // px per metre; ~180 m view radius
  const p = world.player;
  let cx = Math.max(C / SCALE, Math.min(LAND.x - C / SCALE, p.x));
  let cz = Math.max(C / SCALE, Math.min(LAND.z - C / SCALE, p.z));
  if (LAND.x * SCALE < S) cx = LAND.x / 2;
  if (LAND.z * SCALE < S) cz = LAND.z / 2;
  const px = (x) => C + (x - cx) * SCALE;
  const pz = (z) => C + (z - cz) * SCALE;

  g.clearRect(0, 0, S, S);
  g.fillStyle = '#274b5c';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#5d8a4e';
  g.fillRect(px(0), pz(0), LAND.x * SCALE, LAND.z * SCALE);
  g.fillStyle = '#8d8578'; // docks
  g.fillRect(px(300), pz(500), 460 * SCALE, 60 * SCALE);
  g.fillStyle = '#e3c188'; // beach
  g.fillRect(px(688), pz(0), (LAND.x - 688) * SCALE, LAND.z * SCALE);
  g.strokeStyle = '#3c3f4a';
  g.lineWidth = Math.max(2, 9 * SCALE);
  g.beginPath();
  for (const x of VX) { g.moveTo(px(x), pz(0)); g.lineTo(px(x), pz(LAND.z)); }
  for (const z of HZ) { g.moveTo(px(0), pz(z)); g.lineTo(px(LAND.x), pz(z)); }
  g.stroke();

  // Cars: white dots; police flash blue/red; pedestrians are specks.
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    g.fillStyle = 'rgba(230,225,210,.55)';
    g.fillRect(px(ped.x) - 1, pz(ped.z) - 1, 2, 2);
  }
  for (const car of world.cars) {
    if (car === p.car) continue;
    if (car.kind === 'police') {
      g.fillStyle = Math.floor(world.time * 4) % 2 ? '#3a6fd8' : '#e5534b';
      g.beginPath(); g.arc(px(car.x), pz(car.z), 3.4, 0, 7); g.fill();
    } else {
      g.fillStyle = '#e8e8e8';
      g.beginPath(); g.arc(px(car.x), pz(car.z), 2.4, 0, 7); g.fill();
    }
  }
  // Objective: gold, clamped to the rim when off-view.
  const obj = world.objective;
  if (obj) {
    let ox = px(obj.x), oz = pz(obj.z);
    const dx = ox - C, dz = oz - C, d = Math.hypot(dx, dz);
    if (d > C - 12) { ox = C + (dx / d) * (C - 12); oz = C + (dz / d) * (C - 12); }
    g.fillStyle = '#f2c94c';
    g.beginPath(); g.arc(ox, oz, 4 + Math.sin(world.time * 5) * 1.1, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.4; g.stroke();
  }
  // Marlo: a gold arrow at the centre of his world.
  const heading = p.car ? p.car.heading : p.heading;
  g.save();
  g.translate(px(p.x), pz(p.z));
  g.rotate(Math.PI - heading);
  g.fillStyle = '#f2c94c';
  g.beginPath();
  g.moveTo(0, -7); g.lineTo(4.6, 5.5); g.lineTo(0, 2.6); g.lineTo(-4.6, 5.5);
  g.closePath(); g.fill();
  g.restore();
}
