// Velvet Tide: Port Solenne 3D — every tuning number, street and colour in one place.
// The world is measured in metres. Streets run on a grid: VX west→east, HZ north→south.
// Nothing here imports anything or holds state: if a value feels wrong in play, the
// fix is a number in this file, not a hunt through the simulation.

export const STEP = 1 / 60;

/** Vertical street centre-lines (x) and horizontal street centre-lines (z). */
export const VX = [40, 130, 220, 310, 400, 490, 580, 670];
export const HZ = [40, 130, 220, 310, 400, 490];
export const ROAD_W = 18;          // road width
export const SIDEWALK = 4;         // sidewalk width each side of a road
export const LANE = 4.5;           // lane offset from street centre, right-hand traffic
export const LAND = { x: 760, z: 560 };   // the island's landmass; water beyond
export const BLOCK = 90;           // street pitch

export const PLAYER = {
  radius: 0.55,
  walkSpeed: 5.2,
  runSpeed: 9.0,
  health: 100,
  punchRange: 2.2,
  punchDamage: 34,
  punchCooldown: 0.34,
};

export const CAR = {
  length: 4.6,
  width: 2.0,
  radius: 1.7,
  accel: 14,
  brake: 26,
  reverseMax: 8,
  topSpeed: 34,        // m/s ≈ 122 km/h
  drag: 0.6,
  grip: 3.2,
};

export const POP = {
  trafficCars: 22,
  parkedCars: 26,
  pedestrians: 34,
  policePerStar: 2,
  policeMax: 8,
};

/** Wanted heat: crimes add points, stars are points // 100, calm time drains them. */
export const HEAT = {
  stealCar: 110,
  hitPedestrian: 210,
  shootNearPolice: 120,
  ramPolice: 90,
  hitAndRun: 60,
  decayPerSecond: 3.2,
  decayWhenHidden: 11,
  bustedSeconds: 2.6,
};

export const WEAPON = {
  fist: { name: 'Fists', damage: 34, range: 2.2, cooldown: 0.34 },
  pistol: { name: 'Pistol', damage: 55, range: 90, cooldown: 0.24, price: 350, ammoPrice: 2 },
};

/** One game minute passes per real second; the city opens at golden hour, 17:40. */
export const CLOCK = { start: 17 * 60 + 40, minutesPerSecond: 1 };

export const SAVE_KEY = 'velvet-tide.port-solenne-3d.save.v1';

export const CITY_NAME = 'Port Solenne';
export const GAME_TITLE = 'VELVET TIDE';
export const SUBTITLE = 'Port Solenne 3D';
export const HERO_NAME = 'Marlo Reyes';

export const CAR_COLORS = [
  0xc94f4f, 0x4f7dc9, 0xe0a83c, 0x5da85f, 0xd8d8d8, 0x7a4fc9,
  0x3fbfae, 0xe2703a, 0x8a93a5, 0xd45f9e, 0x4361ee, 0xbc6c25,
];

export const PED_COLORS = [
  0xe8e3d5, 0x30475e, 0xa63d40, 0x3d6ea5, 0x588157, 0xe9c46a,
  0x6d597a, 0xf4a261, 0x2a9d8f, 0xbc4749, 0x495057, 0xffb4a2,
];

export const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
