// Fists and the Harbor Arms pistol. Shots are manual raycasts — ray vs building
// boxes, ray vs body spheres — so a miss costs nothing but noise, and noise has
// a price: everyone nearby runs, and the police remember gunfire.
import * as THREE from 'three';
import { PLAYER, WEAPON, HEAT } from './config.js';
import { addHeat, burst } from './world.js';
import { panic, hurtPed } from './ai.js';
import { sfx } from './audio.js';

const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85 });

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

function rayBox(ox, oy, oz, dx, dy, dz, c) {
  // The city's boxes stand on the ground; give them generous height.
  let tmin = 0, tmax = Infinity;
  const axes = [
    [ox, dx, c.minX, c.maxX],
    [oz, dz, c.minZ, c.maxZ],
    [oy, dy, 0, 60],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) return -1; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

function tracer(world, from, to) {
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  const mesh = new THREE.Mesh(tracerGeo, tracerMat);
  mesh.scale.set(0.035, 0.035, len);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.lookAt(to);
  world.sceneRef.add(mesh);
  world.tracers.push({ mesh, ttl: 0.07 });
  const flash = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  flash.scale.set(0.22, 0.22, 0.22);
  flash.position.copy(from);
  world.sceneRef.add(flash);
  world.tracers.push({ mesh: flash, ttl: 0.045 });
}

/**
 * One attack from Marlo. origin/dir describe the camera ray for the pistol;
 * the punch simply uses his facing. Returns true if the swing/shot happened.
 */
export function tryAttack(world, origin, dir) {
  const p = world.player;
  if (p.attackCd > 0 || p.car || world.verdict) return false;

  if (p.weapon === 'pistol' && p.hasPistol) {
    if (p.ammo <= 0) { sfx.dryFire(); p.attackCd = 0.25; return true; }
    p.ammo--;
    p.attackCd = WEAPON.pistol.cooldown;
    world.stats.shotsFired++;
    sfx.shoot();
    const o = origin || new THREE.Vector3(p.x, 1.5, p.z);
    const d = dir || new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    // Nearest victim along the ray.
    let bestT = WEAPON.pistol.range, hitPed = null, hitCar = null;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, ped.x, 1.0, ped.z, 0.8);
      if (t > 0 && t < bestT) { bestT = t; hitPed = ped; hitCar = null; }
    }
    for (const car of world.cars) {
      for (const off of [-1.2, 0, 1.2]) {
        const cx = car.x + Math.sin(car.heading) * off, cz = car.z + Math.cos(car.heading) * off;
        const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, cx, 0.75, cz, 1.55);
        if (t > 0 && t < bestT) { bestT = t; hitCar = car; hitPed = null; }
      }
    }
    for (const c of world.city.colliders) {
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, c);
      if (t > 0 && t < bestT) { bestT = t; hitPed = null; hitCar = null; }
    }
    const end = new THREE.Vector3(o.x + d.x * bestT, o.y + d.y * bestT, o.z + d.z * bestT);
    const muzzle = new THREE.Vector3(p.x + Math.sin(p.heading) * 0.5, 1.35, p.z + Math.cos(p.heading) * 0.5);
    tracer(world, muzzle, end);
    if (hitPed) {
      hurtPed(world, hitPed, WEAPON.pistol.damage, p.x, p.z);
      burst(world, end.x, end.y, end.z, 0xc9403d, 5);
      sfx.hit();
    } else if (hitCar) {
      burst(world, end.x, end.y, end.z, 0xd8c98a, 6);
      sfx.hit();
      if (hitCar.kind === 'traffic' && hitCar.ai) hitCar.ai.cruise = 15;
    } else {
      burst(world, end.x, end.y, end.z, 0xbbbbbb, 3);
    }
    panic(world, p.x, p.z, 18);
    const policeNear = world.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.z - p.z) < 48);
    addHeat(world, policeNear ? HEAT.shootNearPolice : 35);
    return true;
  }

  // Fists.
  p.attackCd = WEAPON.fist.cooldown;
  sfx.punch();
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  let connected = false;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - p.x, dz = ped.z - p.z;
    const along = dx * fx + dz * fz;
    const lateral = Math.abs(dx * fz - dz * fx);
    if (along > 0.2 && along < PLAYER.punchRange && lateral < 0.9) {
      hurtPed(world, ped, WEAPON.fist.damage, p.x, p.z);
      burst(world, ped.x, 1.2, ped.z, 0xffffff, 3);
      connected = true;
    }
  }
  for (const car of world.cars) {
    if (Math.hypot(car.x - p.x, car.z - p.z) < 3.1) {
      burst(world, p.x + fx, 0.9, p.z + fz, 0xd8c98a, 3);
      connected = true;
    }
  }
  if (connected) sfx.hit();
  return true;
}
