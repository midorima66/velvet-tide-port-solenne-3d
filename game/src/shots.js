// Staged screenshot scenes (?shot=start|foot|chase|mission&seed=7). Each one is a
// real moment of the game, arranged: the same world, the same rules, scripted
// hands. main.js runs the normal loop; shots only set the stage.
import { startStory } from './missions.js';
import { addHeat } from './world.js';

export function setupShot(world, name) {
  const p = world.player;
  const places = world.city.places;
  if (name === 'start') {
    world.clockMinutes = 17 * 60 + 40;
    return 'title';
  }
  if (name === 'foot') {
    startStory(world);
    p.x = places.diner.x; p.z = places.diner.z + 3;
    p.heading = 2.8;
    world.clockMinutes = 17 * 60 + 40;
    return 'play';
  }
  if (name === 'chase') {
    startStory(world);
    const m = world.mission;
    m.index = 2; m.started = true; m.stage = 1;
    world.objective = {
      x: places.chopShop.x, z: places.chopShop.z,
      text: "Deliver the coupe to Rook's Chop Shop — lose the police first if you can",
    };
    const car = world.addCar(400, 305.5, Math.PI / 2, 'parked', 0xf0e3c0);
    car.playerUsed = true;
    car.wasKind = 'parked';
    car.kind = 'player';
    car.speed = 17;
    p.car = car;
    p.mesh.visible = false;
    p.x = car.x; p.z = car.z;
    addHeat(world, 420); // four stars
    for (const [ox, oz, spd] of [[30, 1, 15], [-11, -6, 19], [-19, 4, 19], [-27, -3, 19]]) {
      const cop = world.addCar(car.x + ox, car.z + oz, Math.PI / 2, 'police', 0x2c3e50);
      cop.ai = { tx: p.x, tz: p.z, cruise: 14, wait: 0 };
      cop.speed = spd;
    }
    world.scripted = { throttle: 0.6, steer: 0 };
    world.clockMinutes = 18 * 60 + 55;
    return 'play';
  }
  if (name === 'mission') {
    startStory(world);
    const m = world.mission;
    m.index = 0; m.started = true; m.stage = 0;
    world.objective = {
      x: places.docks.x, z: places.docks.z,
      text: 'Pick up the crate at Berth 9, South Docks',
    };
    const car = world.addCar(472, 505, 0.6, 'parked', 0x4f7dc9);
    car.playerUsed = true;
    car.wasKind = 'parked';
    car.kind = 'player';
    p.car = car;
    p.mesh.visible = false;
    p.x = car.x; p.z = car.z;
    world.clockMinutes = 19 * 60 + 5;
    return 'play';
  }
  return null;
}
