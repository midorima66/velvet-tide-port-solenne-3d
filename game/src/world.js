// The living state of Port Solenne: Marlo, every car and pedestrian, the wanted
// heat, police pressure, and the busted/wasted verdicts. Rendering lives in the
// meshes each entity carries; the rules live here and in ai.js / combat.js.
import * as THREE from 'three';
import { VX, HZ, ROAD_W, LANE, LAND, PLAYER, CAR, POP, HEAT, CAR_COLORS, PED_COLORS, SKIN_COLORS } from './config.js';
import { mulberry32, rngRange, rngInt, rngPick } from './random.js';
import { collideCircle, onLand } from './city.js';
import { sfx } from './audio.js';

export const EV = { CASH: 1, PICKUP: 2, MISSION_DONE: 4, CRIME: 8 };

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x2c3644 });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xd8dce2 });

function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(boxGeo, paint);
  body.scale.set(CAR.width, 0.62, CAR.length);
  body.position.y = 0.58;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(boxGeo, kind === 'police' ? paint : glassMat);
  cabin.scale.set(CAR.width - 0.24, 0.52, CAR.length * 0.46);
  cabin.position.set(0, 1.12, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  if (kind === 'police') {
    const stripe = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf2f4f6 }));
    stripe.scale.set(CAR.width + 0.04, 0.3, CAR.length * 0.5);
    stripe.position.y = 0.6;
    g.add(stripe);
    const bar = new THREE.Mesh(boxGeo, chromeMat);
    bar.scale.set(1.3, 0.14, 0.5);
    bar.position.set(0, 1.46, -0.25);
    g.add(bar);
    const red = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a20, emissiveIntensity: 0 }));
    red.scale.set(0.55, 0.16, 0.4); red.position.set(-0.34, 1.56, -0.25);
    const blue = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2a5cff, emissiveIntensity: 0 }));
    blue.scale.set(0.55, 0.16, 0.4); blue.position.set(0.34, 1.56, -0.25);
    g.add(red); g.add(blue);
    g.userData.barLights = [red.material, blue.material];
  }
  // Headlight cones (lit at dusk) and lamp dots.
  const coneGeo = new THREE.ConeGeometry(1.3, 7.5, 12, 1, true);
  coneGeo.translate(0, -3.75, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(0, 0.62, CAR.length / 2);
  cone.visible = false;
  g.add(cone);
  g.userData.headlight = cone;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x444433, emissive: 0xffedb5, emissiveIntensity: 0 });
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(boxGeo, lampMat);
    lamp.scale.set(0.34, 0.16, 0.06);
    lamp.position.set(s * 0.62, 0.66, CAR.length / 2 + 0.02);
    g.add(lamp);
    const tail = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xd8241c, emissiveIntensity: 0.4 }));
    tail.scale.set(0.34, 0.14, 0.06);
    tail.position.set(s * 0.62, 0.66, -CAR.length / 2 - 0.02);
    g.add(tail);
  }
  g.userData.lampMat = lampMat;
  for (const [wx, wz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    g.add(wheel);
  }
  return g;
}

function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rngPick(rng, PED_COLORS) });
  const skin = new THREE.MeshLambertMaterial({ color: rngPick(rng, SKIN_COLORS) });
  const legs = new THREE.MeshLambertMaterial({ color: rngPick(rng, [0x2e3440, 0x4a3b2c, 0x5a6270, 0x704214]) });
  const torso = new THREE.Mesh(boxGeo, shirt);
  torso.scale.set(0.52, 0.72, 0.3); torso.position.y = 1.06; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.66; head.castShadow = true;
  const legL = new THREE.Mesh(boxGeo, legs);
  legL.scale.set(0.2, 0.72, 0.24); legL.position.set(-0.14, 0.36, 0);
  const legR = legL.clone(); legR.position.x = 0.14;
  const armL = new THREE.Mesh(boxGeo, shirt);
  armL.scale.set(0.15, 0.62, 0.2); armL.position.set(-0.35, 1.05, 0);
  const armR = armL.clone(); armR.position.x = 0.35;
  g.add(torso, head, legL, legR, armL, armR);
  g.userData.parts = { legL, legR, armL, armR, torso };
  return g;
}

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x274156 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
  const torso = new THREE.Mesh(boxGeo, jacket);
  torso.scale.set(0.56, 0.76, 0.32); torso.position.y = 1.08; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.7; head.castShadow = true;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const legL = new THREE.Mesh(boxGeo, legMat);
  legL.scale.set(0.21, 0.74, 0.25); legL.position.set(-0.15, 0.37, 0);
  const legR = legL.clone(); legR.position.x = 0.15;
  const armL = new THREE.Mesh(boxGeo, jacket);
  armL.scale.set(0.16, 0.64, 0.21); armL.position.set(-0.37, 1.06, 0);
  const armR = armL.clone(); armR.position.x = 0.37;
  // The pistol appears in the right hand once bought.
  const pistol = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x17181c }));
  pistol.scale.set(0.09, 0.14, 0.34);
  pistol.position.set(0.37, 0.72, 0.14);
  pistol.visible = false;
  g.add(torso, head, legL, legR, armL, armR, pistol);
  g.userData.parts = { legL, legR, armL, armR, pistol };
  return g;
}

/** A random point on a random street, biased near (x, z) when given. */
export function streetPoint(rng, nearX = null, nearZ = null, dist = 0) {
  if (nearX !== null && rng() > 0.3) {
    const vertical = rng() > 0.5;
    if (vertical) {
      const x = VX.reduce((a, b) => (Math.abs(b - nearX) < Math.abs(a - nearX) ? b : a));
      return { x: x + rngRange(rng, -3, 3), z: nearZ + rngRange(rng, -dist, dist), heading: rng() > 0.5 ? 0 : Math.PI };
    }
    const z = HZ.reduce((a, b) => (Math.abs(b - nearZ) < Math.abs(a - nearZ) ? b : a));
    return { x: nearX + rngRange(rng, -dist, dist), z: z + rngRange(rng, -3, 3), heading: rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }
  if (rng() > 0.5) {
    return { x: rngPick(rng, VX) + rngRange(rng, -3, 3), z: rngRange(rng, 20, LAND.z - 20), heading: rng() > 0.5 ? 0 : Math.PI };
  }
  return { x: rngRange(rng, 20, LAND.x - 20), z: rngPick(rng, HZ) + rngRange(rng, -3, 3), heading: rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

export function createWorld(scene, city, seed = 7) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const world = {
    city, rng,
    time: 0,
    clockMinutes: 17 * 60 + 40,
    heat: 0, stars: 0, bustedMeter: 0,
    verdict: null, verdictTimer: 0,
    objective: null, dialogue: null,
    mission: null, missions: null, completed: false,
    stats: { earned: 0, carsStolen: 0, shotsFired: 0 },
    flags: { crate: false },
    cars: [], peds: [], particles: [], tracers: [],
    scripted: null, // {throttle, steer} for screenshot scenes
    muted: false,
  };

  const player = {
    x: city.places.diner.x - 6, z: city.places.diner.z + 10,
    heading: 2.6, health: PLAYER.health, cash: 120,
    car: null, weapon: 'fist', hasPistol: false, ammo: 0,
    attackCd: 0, walkPhase: 0, dead: false,
    mesh: makePlayerMesh(),
  };
  world.player = player;
  scene.add(player.mesh);

  function addCar(x, z, heading, kind, color) {
    const mesh = makeCarMesh(color, kind);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh, x, z, heading, speed: 0, kind,
      color, steerVis: 0, ai: null, playerUsed: false,
      flashPhase: rngRange(rng, 0, 6),
    };
    world.cars.push(car);
    return car;
  }
  world.addCar = addCar;

  // Parked cars along the kerbs, traffic already rolling.
  for (let i = 0; i < POP.parkedCars; i++) {
    const p = streetPoint(rng);
    const side = rng() > 0.5 ? 1 : -1;
    const vertical = Math.abs(Math.sin(p.heading)) < 0.5;
    const x = vertical ? p.x + side * (ROAD_W / 2 - 1.6) : p.x;
    const z = vertical ? p.z : p.z + side * (ROAD_W / 2 - 1.6);
    if (!onLand(city, x, z)) continue;
    addCar(x, z, p.heading, 'parked', rngPick(rng, CAR_COLORS));
  }
  for (let i = 0; i < POP.trafficCars; i++) {
    const p = streetPoint(rng);
    const car = addCar(p.x, p.z, p.heading, 'traffic', rngPick(rng, CAR_COLORS));
    car.ai = { tx: p.x, tz: p.z, cruise: rngRange(rng, 7, 11), wait: 0 };
    snapToLane(car);
  }
  // The cream coupe waiting at the Old Bus Depot for chapter 3.
  const coupe = addCar(city.places.depot.x + 4, city.places.depot.z + 6, Math.PI / 2, 'parked', 0xf0e3c0);
  coupe.isCoupe = true;

  for (let i = 0; i < POP.pedestrians; i++) {
    const p = streetPoint(rng);
    const mesh = makePedMesh(rng);
    scene.add(mesh);
    const ped = {
      mesh, x: p.x + rngRange(rng, -2, 2), z: p.z + rngRange(rng, -2, 2),
      heading: rngRange(rng, 0, Math.PI * 2), speed: 0,
      state: 'stroll', tx: p.x, tz: p.z, timer: rngRange(rng, 1, 5),
      health: 100, walkPhase: rngRange(rng, 0, 6), panicFrom: null,
    };
    world.peds.push(ped);
  }
  return world;
}

export function snapToLane(car) {
  // Nudge a car into the correct right-hand lane for its heading.
  const fwdX = Math.sin(car.heading), fwdZ = Math.cos(car.heading);
  if (Math.abs(fwdZ) > Math.abs(fwdX)) {
    const streetX = VX.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
    car.x = streetX + (fwdZ > 0 ? LANE : -LANE);
  } else {
    const streetZ = HZ.reduce((a, b) => (Math.abs(b - car.z) < Math.abs(a - car.z) ? b : a));
    car.z = streetZ + (fwdX > 0 ? -LANE : LANE);
  }
}

export function addHeat(world, points) {
  const before = world.stars;
  world.heat = Math.min(560, world.heat + points);
  world.stars = Math.max(0, Math.min(5, Math.floor(world.heat / 100)));
  if (world.stars > before) sfx.star();
}

export function starsOf(world) { return world.stars; }

/** Shared arcade car physics: throttle/steer in, collisions resolved. */
export function integrateCar(world, car, dt, throttle, steer, isPlayer) {
  const top = car.kind === 'police' ? CAR.topSpeed + 3 : CAR.topSpeed;
  if (throttle > 0) car.speed += CAR.accel * throttle * dt * (car.speed < 0 ? 2.2 : 1);
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed + CAR.accel * 0.55 * throttle * dt);
  }
  car.speed -= car.speed * CAR.drag * dt * 0.35;
  if (Math.abs(car.speed) > top) car.speed = Math.sign(car.speed) * top;
  if (Math.abs(car.speed) < 0.04 && throttle === 0) car.speed = 0;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 6) * (car.speed < 0 ? -1 : 1);
  car.heading += steer * 1.9 * steerAuthority * dt * (1 - Math.min(0.55, Math.abs(car.speed) / 90));
  car.steerVis = steer;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  if (!onLand(world.city, nx, nz)) {
    car.speed *= 0.4;
    if (isPlayer && Math.abs(car.speed) > 3) sfx.crash(0.5);
    return;
  }
  const before = Math.abs(car.speed);
  const res = collideCircle(world.city.colliders, nx, nz, CAR.radius);
  car.x = res.x; car.z = res.z;
  if (res.hit) {
    if (before > 9) { sfx.crash(Math.min(1, before / 26)); burst(world, car.x, 0.8, car.z, 0xd8c98a, 6); }
    car.speed *= before > 12 ? 0.25 : 0.6;
    if (isPlayer) world.player.health = Math.max(1, world.player.health - (before > 16 ? 4 : 0));
  }
  // Car-to-car: soft circles, speed traded, paint traded too.
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = car.x - other.x, dz = car.z - other.z;
    const d2 = dx * dx + dz * dz, min = 3.1;
    if (d2 < min * min && d2 > 0.001) {
      const d = Math.sqrt(d2), push = (min - d) / 2;
      const ux = dx / d, uz = dz / d;
      car.x += ux * push; car.z += uz * push;
      if (other.kind !== 'parked' || other === world.player.car) { other.x -= ux * push; other.z -= uz * push; }
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 5) {
        sfx.crash(Math.min(1, impact / 22));
        burst(world, car.x, 0.7, car.z, 0xcccccc, 5);
        if (isPlayer && other.kind === 'police') addHeat(world, HEAT.ramPolice * 0.2);
        car.speed *= 0.55; other.speed *= 0.55;
      }
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

/** Enter the nearest car, or leave the current one. Returns an EV flag or 0. */
export function toggleCar(world) {
  const p = world.player;
  if (p.car) {
    const car = p.car;
    p.car = null;
    car.kind = car.wasKind || 'parked';
    const side = car.heading + Math.PI / 2;
    p.x = car.x + Math.sin(side) * 2.4;
    p.z = car.z + Math.cos(side) * 2.4;
    const res = collideCircle(world.city.colliders, p.x, p.z, PLAYER.radius);
    p.x = res.x; p.z = res.z;
    p.mesh.visible = true;
    sfx.door();
    return EV.PICKUP;
  }
  let best = null, bestD = 3.4;
  for (const car of world.cars) {
    if (car.kind === 'police') continue;
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return 0;
  best.wasKind = best.kind;
  best.kind = 'player';
  p.car = best;
  p.mesh.visible = false;
  sfx.door();
  if (!best.playerUsed) {
    best.playerUsed = true;
    world.stats.carsStolen++;
    addHeat(world, HEAT.stealCar);
    return EV.PICKUP | EV.CRIME;
  }
  return EV.PICKUP;
}

/** Move Marlo on foot. moveX/moveZ are world-space wishes, already camera-relative. */
export function stepPlayerOnFoot(world, dt, moveX, moveZ, running) {
  const p = world.player;
  const mag = Math.hypot(moveX, moveZ);
  if (mag > 0.05) {
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const vx = (moveX / mag) * speed, vz = (moveZ / mag) * speed;
    let nx = p.x + vx * dt, nz = p.z + vz * dt;
    if (onLand(world.city, nx, nz)) {
      const res = collideCircle(world.city.colliders, nx, nz, PLAYER.radius);
      p.x = res.x; p.z = res.z;
    }
    p.heading = Math.atan2(vx, vz);
    p.walkPhase += dt * (running ? 11 : 8);
  } else {
    p.walkPhase = 0;
  }
  // A pedestrian Marlo walks into steps aside; a car door is not a wall.
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  const parts = p.mesh.userData.parts;
  const swing = Math.sin(p.walkPhase) * (mag > 0.05 ? 0.55 : 0);
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8;
  parts.armR.rotation.x = p.weapon === 'pistol' && p.hasPistol ? -1.25 : swing * 0.8;
  parts.pistol.visible = p.hasPistol && p.weapon === 'pistol';
}

/** Spawn/despawn cruisers to match the wanted level; returns nearest police distance. */
export function stepPolicePressure(world, dt) {
  const p = world.player;
  const want = Math.min(world.stars * POP.policePerStar, POP.policeMax);
  const police = world.cars.filter((c) => c.kind === 'police');
  if (police.length < want) {
    const spot = streetPoint(world.rng, p.x, p.z, 95);
    if (Math.hypot(spot.x - p.x, spot.z - p.z) > 45) {
      const car = world.addCar(spot.x, spot.z, spot.heading, 'police', 0x2c3e50);
      car.ai = { tx: p.x, tz: p.z, cruise: 13, wait: 0 };
      snapToLane(car);
    }
  }
  let nearest = Infinity;
  for (const car of police) {
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    nearest = Math.min(nearest, d);
    if (d > 240 && world.stars === 0) {
      world.cars.splice(world.cars.indexOf(car), 1);
      car.mesh.removeFromParent();
    }
  }
  // Heat cools when nobody is watching; it barely cools mid-chase.
  const seen = nearest < 65;
  world.heat = Math.max(0, world.heat - (seen ? HEAT.decayPerSecond * 0.25 : HEAT.decayWhenHidden) * dt);
  world.stars = Math.max(0, Math.min(5, Math.floor(world.heat / 100)));

  // BUSTED: pinned by a cruiser, or cornered on foot.
  const pinRange = p.car ? 7.5 : 4.2;
  const pinned = nearest < pinRange && (!p.car || Math.abs(p.car.speed) < 1.2);
  if (pinned && world.stars > 0) world.bustedMeter += dt;
  else world.bustedMeter = Math.max(0, world.bustedMeter - dt * 1.6);
  if (world.bustedMeter >= HEAT.bustedSeconds && !world.verdict) {
    world.verdict = 'busted';
    world.verdictTimer = 2.6;
    sfx.busted();
  }
  return nearest;
}

export function applyVerdict(world) {
  const p = world.player;
  const fine = Math.min(p.cash, 100 + Math.floor(p.cash * 0.15));
  p.cash -= fine;
  world.stats.earned -= 0; // fines are not earnings; the ledger stays honest
  if (p.car) { p.car.kind = p.car.wasKind || 'parked'; p.car.speed = 0; p.car = null; }
  p.mesh.visible = true;
  world.heat = 0; world.stars = 0; world.bustedMeter = 0;
  p.health = PLAYER.health;
  const dest = world.verdict === 'busted' ? world.city.places.policeStation : world.city.places.hospital;
  p.x = dest.x; p.z = dest.z;
  p.mesh.position.set(p.x, 0, p.z);
  world.verdict = null;
}

/** Small particle burst (sparks, dust, glass). Pooled, capped, cheap. */
export function burst(world, x, y, z, color, n = 6) {
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n; i++) {
    if (world.particles.length > 130) break;
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(0.12, 0.12, 0.12);
    mesh.position.set(x, y, z);
    world.sceneRef.add(mesh);
    world.particles.push({
      mesh,
      vx: rngRange(world.rng, -2.4, 2.4), vy: rngRange(world.rng, 1.5, 4.5), vz: rngRange(world.rng, -2.4, 2.4),
      ttl: rngRange(world.rng, 0.35, 0.7),
    });
  }
}

export function stepParticles(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.ttl -= dt;
    if (pt.ttl <= 0) {
      pt.mesh.removeFromParent();
      world.particles.splice(i, 1);
      continue;
    }
    pt.vy -= 9.8 * dt;
    pt.mesh.position.x += pt.vx * dt;
    pt.mesh.position.y = Math.max(0.06, pt.mesh.position.y + pt.vy * dt);
    pt.mesh.position.z += pt.vz * dt;
  }
  for (let i = world.tracers.length - 1; i >= 0; i--) {
    const tr = world.tracers[i];
    tr.ttl -= dt;
    if (tr.ttl <= 0) {
      tr.mesh.removeFromParent();
      world.tracers.splice(i, 1);
    }
  }
}
