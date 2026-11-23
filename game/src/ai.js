// Traffic that keeps its lane and turns at junctions, police that hunt the
// player across the grid, and pedestrians who stroll the pavements and flee
// from danger. Everyone shares the arcade physics in world.js.
import { VX, HZ, ROAD_W, LANE, LAND, HEAT } from './config.js';
import { integrateCar, addHeat, burst } from './world.js';
import { rngRange, rngPick } from './random.js';

const HALF_ROAD = ROAD_W / 2 + 4;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function steerToward(car, tx, tz) {
  const desired = Math.atan2(tx - car.x, tz - car.z);
  const diff = wrapAngle(desired - car.heading);
  return { steer: Math.max(-1, Math.min(1, diff * 2.4)), diff };
}

/** Is something solid in the lane just ahead of this car? Returns 0..1 urgency. */
function obstacleAhead(world, car, look = 9) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let urgency = 0;
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    const lateral = Math.abs(dx * fz - dz * fx);
    if (along > 0.5 && along < look && lateral < 2.3) {
      urgency = Math.max(urgency, 1 - along / look);
    }
  }
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x, dz = ped.z - car.z;
    const along = dx * fx + dz * fz;
    const lateral = Math.abs(dx * fz - dz * fx);
    if (along > 0.5 && along < look * 0.7 && lateral < 1.8) urgency = Math.max(urgency, 0.9);
  }
  return urgency;
}

function driveTo(world, car, tx, tz, cruise, dt, aggressive = false) {
  const { steer, diff } = steerToward(car, tx, tz);
  let target = cruise;
  if (Math.abs(diff) > 1.1) target = Math.min(target, 3.5);
  const urgency = obstacleAhead(world, car, aggressive ? 7 : 10);
  if (urgency > 0.55) target = 0;
  else if (urgency > 0.2) target = Math.min(target, 3);
  const throttle = Math.max(-1, Math.min(1, (target - car.speed) / 3.5));
  integrateCar(world, car, dt, throttle, steer, false);
}

// ---- Traffic ----

function pickNextLeg(world, car) {
  const ai = car.ai;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  if (Math.abs(fz) > Math.abs(fx)) {
    ai.axis = 'z';
    ai.line = VX.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
    ai.dir = fz > 0 ? 1 : -1;
  } else {
    ai.axis = 'x';
    ai.line = HZ.reduce((a, b) => (Math.abs(b - car.z) < Math.abs(a - car.z) ? b : a));
    ai.dir = fx > 0 ? 1 : -1;
  }
  ai.decidedAt = null;
  ai.turn = null;
}

function stepTraffic(world, car, dt) {
  const ai = car.ai;
  if (!ai.axis) pickNextLeg(world, car);
  if (ai.wait > 0) {
    ai.wait -= dt;
    integrateCar(world, car, dt, car.speed > 0.3 ? -1 : 0, 0, false);
    return;
  }
  // Where is the next junction ahead?
  const cross = ai.axis === 'z' ? HZ : VX;
  const pos = ai.axis === 'z' ? car.z : car.x;
  let junction = null;
  for (const c of cross) {
    const ahead = (c - pos) * ai.dir;
    if (ahead > 2 && (junction === null || ahead < (junction - pos) * ai.dir)) junction = c;
  }
  const laneOff = ai.axis === 'z' ? (ai.dir > 0 ? LANE : -LANE) : (ai.dir > 0 ? -LANE : LANE);

  if (ai.turn) {
    driveTo(world, car, ai.turn.x, ai.turn.z, ai.cruise, dt);
    const done = Math.hypot(ai.turn.x - car.x, ai.turn.z - car.z) < 5;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const aligned = ai.turn.axis === 'x' ? Math.abs(fx) > 0.85 : Math.abs(fz) > 0.85;
    if (done || aligned) { ai.axis = ai.turn.axis; ai.line = ai.turn.line; ai.dir = ai.turn.dir; ai.turn = null; ai.decidedAt = null; }
    return;
  }

  if (junction !== null && ai.decidedAt !== junction) {
    const distJ = Math.abs(junction - pos);
    if (distJ < 10) {
      ai.decidedAt = junction;
      if (world.rng() < 0.38) {
        const newDir = world.rng() > 0.5 ? 1 : -1;
        if (ai.axis === 'z') {
          const newLaneZ = junction + (newDir > 0 ? -LANE : LANE);
          ai.turn = { x: car.x + newDir * 16, z: newLaneZ, axis: 'x', line: junction, dir: newDir };
        } else {
          const newLaneX = junction + (newDir > 0 ? LANE : -LANE);
          ai.turn = { x: newLaneX, z: car.z + newDir * 16, axis: 'z', line: junction, dir: newDir };
        }
      }
    }
  }
  // Street ran out: turn around.
  const aheadPos = pos + ai.dir * 12;
  if (aheadPos < 6 || aheadPos > (ai.axis === 'z' ? LAND.z : LAND.x) - 6) ai.dir *= -1;

  const tx = ai.axis === 'z' ? ai.line + laneOff : car.x + ai.dir * 30;
  const tz = ai.axis === 'z' ? car.z + ai.dir * 30 : ai.line + laneOff;
  driveTo(world, car, tx, tz, ai.cruise, dt);
}

// ---- Police ----

function stepPolice(world, car, dt) {
  const p = world.player;
  const ai = car.ai;
  if (!ai.offset) ai.offset = { x: rngRange(world.rng, -4, 4), z: rngRange(world.rng, -4, 4) };
  // Flash the light bar.
  const mats = car.mesh.userData.barLights;
  if (mats) {
    const phase = Math.floor(world.time * 5 + car.flashPhase) % 2;
    mats[0].emissiveIntensity = phase === 0 ? 2.6 : 0.1;
    mats[1].emissiveIntensity = phase === 1 ? 2.6 : 0.1;
  }
  if (world.stars === 0) {
    // Heat is gone: peel off and cruise away.
    driveTo(world, car, car.x + Math.sin(car.heading) * 40, car.z + Math.cos(car.heading) * 40, 9, dt);
    return;
  }
  const tx = p.x + ai.offset.x, tz = p.z + ai.offset.z;
  const dist = Math.hypot(p.x - car.x, p.z - car.z);
  // If a building block stands between us and the player, aim for the nearest
  // junction on our street first — cruisers think in grids.
  let wx = tx, wz = tz;
  const sameV = VX.some((x) => Math.abs(x - car.x) < HALF_ROAD && Math.abs(x - p.x) < HALF_ROAD + 6);
  const sameH = HZ.some((z) => Math.abs(z - car.z) < HALF_ROAD && Math.abs(z - p.z) < HALF_ROAD + 6);
  if (!sameV && !sameH && dist > 26) {
    let bestJ = null, bestScore = Infinity;
    for (const jx of VX) for (const jz of HZ) {
      const dMe = Math.hypot(jx - car.x, jz - car.z);
      const dP = Math.hypot(jx - p.x, jz - p.z);
      const score = dMe + dP * 0.7;
      if (score < bestScore) { bestScore = score; bestJ = { x: jx, z: jz }; }
    }
    if (bestJ) { wx = bestJ.x; wz = bestJ.z; }
  }
  // Pursuit speed: flat out while the gap is real, measured when close enough
  // to ram — a cruiser that cruises at traffic speed never catches anyone.
  const cruise = dist > 28 ? 33.5 : dist > 10 ? 24 : 13;
  driveTo(world, car, wx, wz, cruise, dt, true);
  // Rubber-band rescue: a cruiser wedged on a wall teleports back to the hunt.
  if (Math.abs(car.speed) < 0.4 && dist > 18) {
    ai.stuck = (ai.stuck || 0) + dt;
    if (ai.stuck > 3) {
      ai.stuck = 0;
      const spot = { x: p.x + rngRange(world.rng, -55, 55), z: p.z + rngRange(world.rng, -55, 55) };
      const sx = VX.reduce((a, b) => (Math.abs(b - spot.x) < Math.abs(a - spot.x) ? b : a));
      car.x = sx; car.z = Math.max(14, Math.min(LAND.z - 14, spot.z));
      car.heading = Math.atan2(p.x - car.x, p.z - car.z);
      car.speed = 4;
    }
  } else ai.stuck = 0;
}

// ---- Pedestrians ----

function sidewalkTarget(world, ped) {
  const rng = world.rng;
  if (rng() > 0.5) {
    const line = VX.reduce((a, b) => (Math.abs(b - ped.x) < Math.abs(a - ped.x) ? b : a));
    const side = rng() > 0.5 ? 1 : -1;
    ped.tx = line + side * (HALF_ROAD + 1.6);
    ped.tz = Math.max(8, Math.min(LAND.z - 8, ped.z + rngRange(rng, -70, 70)));
  } else {
    const line = HZ.reduce((a, b) => (Math.abs(b - ped.z) < Math.abs(a - ped.z) ? b : a));
    const side = rng() > 0.5 ? 1 : -1;
    ped.tz = line + side * (HALF_ROAD + 1.6);
    ped.tx = Math.max(8, Math.min(LAND.x - 8, ped.x + rngRange(rng, -70, 70)));
  }
}

export function panic(world, x, z, radius = 16) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.z - z) < radius) {
      ped.state = 'flee';
      ped.timer = rngRange(world.rng, 2.4, 4);
      ped.panicFrom = { x, z };
    }
  }
}

export function hurtPed(world, ped, damage, fromX, fromZ) {
  ped.health -= damage;
  if (ped.health <= 0) {
    ped.state = 'down';
    ped.timer = 25;
  } else {
    ped.state = 'flee';
    ped.timer = 3.4;
    ped.panicFrom = { x: fromX, z: fromZ };
  }
  panic(world, ped.x, ped.z, 10);
}

function stepPed(world, ped, dt) {
  const p = world.player;
  if (ped.state === 'down') {
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.set(ped.x, 0.25, ped.z);
    ped.timer -= dt;
    if (ped.timer <= 0 && ped.health <= 0) {
      // Quietly re-shuffle the crowd: a fresh face across town.
      ped.x = rngRange(world.rng, 30, LAND.x - 30);
      ped.z = rngRange(world.rng, 30, LAND.z - 30);
      ped.health = 100; ped.state = 'stroll';
      ped.mesh.rotation.x = 0;
      sidewalkTarget(world, ped);
    } else if (ped.timer <= 0) {
      ped.state = 'stroll'; ped.mesh.rotation.x = 0;
    }
    return;
  }
  let speed = 1.5;
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const from = ped.panicFrom || { x: p.x, z: p.z };
    ped.tx = ped.x + (ped.x - from.x) * 2;
    ped.tz = ped.z + (ped.z - from.z) * 2;
    speed = 4.6;
    if (ped.timer <= 0) { ped.state = 'stroll'; sidewalkTarget(world, ped); }
  } else if (Math.hypot(ped.tx - ped.x, ped.tz - ped.z) < 1.6) {
    sidewalkTarget(world, ped);
  }
  const dx = ped.tx - ped.x, dz = ped.tz - ped.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.1) {
    ped.heading = Math.atan2(dx, dz);
    ped.x += (dx / d) * speed * dt;
    ped.z += (dz / d) * speed * dt;
    ped.walkPhase += dt * (speed > 3 ? 11 : 7);
  }
  // Cars are hard: any car rolling through a pedestrian puts them down.
  for (const car of world.cars) {
    if (Math.abs(car.speed) < 2.5) continue;
    if (Math.hypot(car.x - ped.x, car.z - ped.z) < 1.9) {
      hurtPed(world, ped, 70, car.x, car.z);
      burst(world, ped.x, 0.8, ped.z, 0xc9403d, 5);
      if (car === p.car) {
        addHeat(world, HEAT.hitPedestrian);
        p.health = Math.max(1, p.health - 3);
      }
      break;
    }
  }
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.heading;
  const parts = ped.mesh.userData.parts;
  const swing = Math.sin(ped.walkPhase) * 0.5;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = ped.state === 'flee' ? 2.6 : -swing * 0.7;
  parts.armR.rotation.x = ped.state === 'flee' ? 2.6 : swing * 0.7;
}

export function stepAI(world, dt) {
  for (const car of world.cars) {
    if (car.kind === 'traffic') stepTraffic(world, car, dt);
    else if (car.kind === 'police') stepPolice(world, car, dt);
  }
  for (const ped of world.peds) stepPed(world, ped, dt);
}
