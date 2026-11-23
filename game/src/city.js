// Port Solenne in 3D: builds the whole city into a THREE scene — ground, roads,
// towers with lit windows, houses, the docks, the beach, the park and Gull Rock
// Lighthouse — and reports the collision boxes, named places and lane data the
// simulation needs. Geometries and materials are shared; houses, containers,
// trees and lamps are instanced, so the whole city costs a few hundred draws.
// buildCity runs once at boot; after that the city is read-only — the places,
// lanes and colliders it returns are the one description every other module
// navigates by, so the map, the AI and the physics can never disagree.
import * as THREE from 'three';
import { VX, HZ, ROAD_W, SIDEWALK, LAND, CAR_COLORS } from './config.js';
import { mulberry32, rngRange, rngInt, rngPick } from './random.js';

const HALF_ROAD = ROAD_W / 2 + SIDEWALK; // street centre to block edge

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Building side texture: plain walls with a grid of windows; a matching emissive
 *  canvas lights a seeded subset of those windows for dusk. */
function windowTextures(rng) {
  const lit = [];
  for (let i = 0; i < 48; i++) lit.push(rng() > 0.55);
  const diffuse = canvasTexture(128, 256, (g) => {
    g.fillStyle = '#b8bcc4'; g.fillRect(0, 0, 128, 256);
    let k = 0;
    for (let y = 10; y < 240; y += 22) for (let x = 10; x < 118; x += 22) {
      g.fillStyle = lit[k++] ? '#5a5142' : '#39404e';
      g.fillRect(x, y, 13, 14);
    }
  });
  const emissive = canvasTexture(128, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    let k = 0;
    for (let y = 10; y < 240; y += 22) for (let x = 10; x < 118; x += 22) {
      if (lit[k++]) { g.fillStyle = '#ffb45e'; g.fillRect(x, y, 13, 14); }
    }
  });
  return { diffuse, emissive };
}

function asphaltTexture() {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#3a3d47'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#4a4e5a';
    for (let i = 0; i < 260; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    g.fillStyle = '#cfd3da'; g.fillRect(2, 0, 3, 128); g.fillRect(123, 0, 3, 128);
    g.fillStyle = '#d8c98a'; g.fillRect(62, 8, 4, 46); g.fillRect(62, 74, 4, 46);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function asphaltTextureH() {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#3a3d47'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#4a4e5a';
    for (let i = 0; i < 260; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    g.fillStyle = '#cfd3da'; g.fillRect(0, 2, 128, 3); g.fillRect(0, 123, 128, 3);
    g.fillStyle = '#d8c98a'; g.fillRect(8, 62, 46, 4); g.fillRect(74, 62, 46, 4);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function groundTexture() {
  const W = 2048, H = 1508, sx = W / LAND.x, sz = H / LAND.z;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#5d8a4e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#557f47';
    for (let i = 0; i < 900; i++) g.fillRect(Math.random() * W, Math.random() * H, 7, 7);
    // Downtown pavement.
    g.fillStyle = '#8f949c';
    g.fillRect(233 * sx, 53 * sz, (657 - 233) * sx, (487 - 53) * sz);
    g.fillStyle = '#878d95';
    g.fillRect(240 * sx, 60 * sz, (650 - 240) * sx, (480 - 60) * sz);
    // The park: deeper green.
    g.fillStyle = '#4c7a3e';
    g.fillRect(0, 0, 207 * sx, 207 * sz);
    // Docks concrete.
    g.fillStyle = '#8d8578';
    g.fillRect(300 * sx, 500 * sz, 460 * sx, 60 * sz);
    // Beach sand: east shore and the southern fringe west of the docks.
    g.fillStyle = '#e3c188';
    g.fillRect(688 * sx, 0, (LAND.x - 688) * sx, H);
    g.fillRect(0, 512 * sz, 300 * sx, (LAND.z - 512) * sz);
    g.fillStyle = '#d4af74';
    g.fillRect(688 * sx, 0, 12 * sx, H);
  });
}

function signSprite(text, bg = '#20242e', fg = '#f5efe2') {
  const tex = canvasTexture(512, 96, (g) => {
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(4, 4, 504, 88, 14); g.fill();
    g.strokeStyle = fg; g.lineWidth = 3; g.stroke();
    g.fillStyle = fg;
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text.toUpperCase(), 256, 52);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(13, 2.44, 1);
  return sprite;
}

/** Hand-placed venues: rect is [centreX, centreZ, width, depth]. */
const VENUES = [
  { key: 'diner', name: 'Tidewater Diner', rect: [262, 262, 34, 20], h: 6, color: 0xf2e3c9, awning: 0xff5d8f, place: [300, 250] },
  { key: 'hotel', name: 'The Velvetine Hotel', rect: [352, 262, 40, 30], h: 34, color: 0xd9c8a9, awning: 0x7a4fc9, place: [384, 294] },
  { key: 'hospital', name: 'Solenne General', rect: [160, 78, 44, 26], h: 16, color: 0xe8ecef, awning: 0xe5534b, place: [204, 56] },
  { key: 'policeStation', name: 'Solenne PD', rect: [540, 262, 38, 24], h: 14, color: 0x9fb4d8, awning: 0x3a6fd8, place: [506, 236] },
  { key: 'gunStore', name: 'Harbor Arms', rect: [352, 78, 26, 18], h: 7, color: 0xc9b18a, awning: 0xbc6c25, place: [384, 114] },
  { key: 'chopShop', name: "Rook's Chop Shop", rect: [160, 352, 36, 24], h: 8, color: 0x8a8f99, awning: 0x33363f, place: [146, 384] },
  { key: 'depot', name: 'Old Bus Depot', rect: [78, 352, 40, 26], h: 9, color: 0xa89a80, awning: 0x588157, place: [56, 326] },
  { key: 'marina', name: 'Velvet Marina', rect: [610, 352, 34, 20], h: 7, color: 0xd8e4ea, awning: 0x53e0d4, place: [596, 384] },
];

export function buildCity(scene, seed = 7) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];   // {minX, maxX, minZ, maxZ}
  const occupied = [];    // rects generic lots must avoid
  const collide = (cx, cz, w, d) => {
    const r = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
    colliders.push(r); occupied.push(r);
    return r;
  };

  // ---- Lights the day-night cycle drives (intensities set in main.js) ----
  const hemi = new THREE.HemisphereLight(0xbfd6e4, 0x54503c, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfb0, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  // ---- Ground, water, beach slab ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(LAND.x, LAND.z),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(LAND.x / 2, 0, LAND.z / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const waterMat = new THREE.MeshPhongMaterial({ color: 0x2e6f8e, shininess: 90, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(LAND.x / 2, -0.55, LAND.z / 2);
  group.add(water);

  // ---- Roads and sidewalks ----
  const asphalt = asphaltTexture();
  const asphaltH = asphaltTextureH();
  const roadGeoV = new THREE.PlaneGeometry(ROAD_W, LAND.z);
  const roadGeoH = new THREE.PlaneGeometry(LAND.x, ROAD_W);
  for (const x of VX) {
    const tex = asphalt.clone(); tex.needsUpdate = true; tex.repeat.set(1, LAND.z / 24);
    const m = new THREE.Mesh(roadGeoV, new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, LAND.z / 2); m.receiveShadow = true;
    group.add(m);
  }
  for (const z of HZ) {
    const tex = asphaltH.clone(); tex.needsUpdate = true; tex.repeat.set(LAND.x / 24, 1);
    const m = new THREE.Mesh(roadGeoH, new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(LAND.x / 2, 0.021, z); m.receiveShadow = true;
    group.add(m);
  }
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  const walkGeo = new THREE.BoxGeometry(1, 0.12, 1);
  const walks = [];
  for (const x of VX) for (const s of [-1, 1]) walks.push([x + s * (ROAD_W / 2 + SIDEWALK / 2), LAND.z / 2, SIDEWALK, LAND.z, 0]);
  for (const z of HZ) for (const s of [-1, 1]) walks.push([LAND.x / 2, z + s * (ROAD_W / 2 + SIDEWALK / 2), LAND.x, SIDEWALK, 1]);
  const walkMesh = new THREE.InstancedMesh(walkGeo, walkMat, walks.length);
  const dummy = new THREE.Object3D();
  walks.forEach(([a, b, w, d], i) => {
    dummy.position.set(a, 0.06, b);
    dummy.scale.set(w, 1, d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    walkMesh.setMatrixAt(i, dummy.matrix);
  });
  walkMesh.receiveShadow = true;
  group.add(walkMesh);

  // ---- Shared building materials ----
  const winTex = windowTextures(rng);
  const windowMats = [];
  const sideMats = [0xb8bcc4, 0xa8b0ba, 0xcac0ae, 0x9fb4c4].map((tint) => {
    const m = new THREE.MeshLambertMaterial({
      map: winTex.diffuse, emissiveMap: winTex.emissive,
      emissive: 0xffb45e, emissiveIntensity: 0, color: tint,
    });
    windowMats.push(m);
    return m;
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x555a63 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function tower(cx, cz, w, d, h, mat) {
    const mesh = new THREE.Mesh(boxGeo, [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    collide(cx, cz, w, d);
    return mesh;
  }

  // ---- Venues (hand-placed, signed) ----
  const places = {};
  for (const v of VENUES) {
    const [cx, cz, w, d] = v.rect;
    const tall = v.h > 12;
    const mat = tall ? rngPick(rng, sideMats)
      : new THREE.MeshLambertMaterial({ color: v.color });
    const mesh = new THREE.Mesh(boxGeo, tall ? [mat, mat, roofMat, roofMat, mat, mat] : mat);
    mesh.scale.set(w, v.h, d);
    mesh.position.set(cx, v.h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    collide(cx, cz, w, d);
    const awning = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: v.awning }));
    awning.scale.set(Math.min(w, 16), 0.4, 3.4);
    awning.position.set(v.place[0] < cx ? cx - w / 2 - 1 : cx + w / 2 + 1, 3.1, cz);
    if (Math.abs(v.place[0] - cx) < Math.abs(v.place[1] - cz)) {
      awning.scale.set(3.4, 0.4, Math.min(d, 16));
      awning.position.set(cx, 3.1, v.place[1] < cz ? cz - d / 2 - 1 : cz + d / 2 + 1);
    }
    group.add(awning);
    const sign = signSprite(v.name, '#20242e');
    sign.position.set(cx, v.h + 2.6, cz);
    group.add(sign);
    places[v.key] = { name: v.name, x: v.place[0], z: v.place[1] };
  }

  // ---- Generic blocks ----
  const colEdges = [0, ...VX.flatMap((x) => [x - HALF_ROAD, x + HALF_ROAD]), LAND.x];
  const rowEdges = [0, ...HZ.flatMap((z) => [z - HALF_ROAD, z + HALF_ROAD]), LAND.z];
  const cols = [], rows = [];
  for (let i = 0; i < colEdges.length; i += 2) cols.push([colEdges[i], colEdges[i + 1]]);
  for (let i = 0; i < rowEdges.length; i += 2) rows.push([rowEdges[i], rowEdges[i + 1]]);

  const houseBodies = [];
  const houseRoofs = [];
  const houseColors = [];
  const overlaps = (r) => occupied.some((o) => r.minX < o.maxX && r.maxX > o.minX && r.minZ < o.maxZ && r.maxZ > o.minZ);

  for (let ci = 0; ci < cols.length; ci++) for (let ri = 0; ri < rows.length; ri++) {
    const [x0, x1] = cols[ci], [z0, z1] = rows[ri];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const downtown = cx > 240 && cx < 660 && cz > 45 && cz < 495;
    const isPark = ci <= 1 && ri === 0;
    const isBeach = ci === cols.length - 1;
    const isDocks = ri === rows.length - 1 && cx > 290;
    if (isPark || isBeach || isDocks) continue;
    if (downtown) {
      const lots = rng() > 0.4 ? 2 : 1;
      for (let a = 0; a < lots; a++) for (let b = 0; b < 2; b++) {
        if (rng() < 0.18) continue;
        const w = (x1 - x0) / lots - 7, d = (z1 - z0) / 2 - 7;
        const lx = x0 + (a + 0.5) * ((x1 - x0) / lots), lz = z0 + (b + 0.5) * ((z1 - z0) / 2);
        const r = { minX: lx - w / 2, maxX: lx + w / 2, minZ: lz - d / 2, maxZ: lz + d / 2 };
        if (overlaps(r)) continue;
        tower(lx, lz, w, d, rngRange(rng, 18, 52), rngPick(rng, sideMats));
      }
    } else {
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        if (rng() < 0.22) continue;
        const w = rngRange(rng, 13, 17), d = rngRange(rng, 11, 15), h = rngRange(rng, 3.6, 5.2);
        const lx = x0 + (a + 0.5) * ((x1 - x0) / 2) + rngRange(rng, -3, 3);
        const lz = z0 + (b + 0.5) * ((z1 - z0) / 2) + rngRange(rng, -3, 3);
        const r = { minX: lx - w / 2, maxX: lx + w / 2, minZ: lz - d / 2, maxZ: lz + d / 2 };
        if (overlaps(r)) continue;
        houseBodies.push([lx, lz, w, d, h]);
        houseRoofs.push([lx, lz, w, d, h]);
        houseColors.push(rngPick(rng, [0xe8dcc4, 0xd8c8b0, 0xcfd8dc, 0xe6c9c0, 0xd0dcC0, 0xf0e6d2]));
        collide(lx, lz, w, d);
      }
    }
  }

  const houseMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), houseBodies.length);
  houseBodies.forEach(([x, z, w, d, h], i) => {
    dummy.position.set(x, h / 2, z); dummy.scale.set(w, h, d); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix(); houseMesh.setMatrixAt(i, dummy.matrix);
    houseMesh.setColorAt(i, new THREE.Color(houseColors[i]));
  });
  houseMesh.castShadow = true; houseMesh.receiveShadow = true;
  group.add(houseMesh);
  const roofGeo = new THREE.ConeGeometry(0.78, 1, 4);
  const roofMesh = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x8a4f3a }), houseRoofs.length);
  houseRoofs.forEach(([x, z, w, d, h], i) => {
    dummy.position.set(x, h + 1.3, z); dummy.scale.set(w, 2.6, d); dummy.rotation.set(0, Math.PI / 4, 0);
    dummy.updateMatrix(); roofMesh.setMatrixAt(i, dummy.matrix);
  });
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // ---- The park: trees and a pond ----
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6);
  const leafGeo = new THREE.SphereGeometry(1.9, 8, 6);
  const treeSpots = [];
  for (let i = 0; i < 46; i++) {
    const x = rngRange(rng, 12, 200), z = rngRange(rng, 12, 200);
    if (Math.abs(x - 105) < 20 && Math.abs(z - 100) < 16) continue; // the pond
    treeSpots.push([x, z]);
  }
  // Street trees along the avenues.
  for (const x of VX) for (let z = 30; z < LAND.z; z += 62) treeSpots.push([x + HALF_ROAD + 1.6, z + rngRange(rng, -6, 6)]);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6d4c2f }), treeSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x4c7a3e }), treeSpots.length);
  treeSpots.forEach(([x, z], i) => {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, 1.1, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, rngRange(rng, 3.2, 4.4), z);
    const s = rngRange(rng, 0.8, 1.35); dummy.scale.set(s, s, s); dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = leaves.castShadow = true;
  group.add(trunks); group.add(leaves);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(15, 24), new THREE.MeshPhongMaterial({ color: 0x3d7ea6, shininess: 80 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(105, 0.04, 100);
  group.add(pond);

  // ---- Palms on the beach ----
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7d55 });
  const palmLeafMat = new THREE.MeshLambertMaterial({ color: 0x5da85f });
  for (let i = 0; i < 16; i++) {
    const x = rngRange(rng, 700, 748), z = rngRange(rng, 20, 545);
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 5.6, 6), palmTrunkMat);
    trunk.position.y = 2.8; trunk.rotation.z = rngRange(rng, -0.14, 0.14);
    palm.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.6, 4), palmLeafMat);
      frond.position.y = 5.7;
      frond.rotation.set(Math.PI / 2.4, 0, (f / 5) * Math.PI * 2);
      frond.translateY(1.4);
      palm.add(frond);
    }
    palm.position.set(x, 0, z);
    palm.castShadow = true;
    group.add(palm);
  }

  // ---- The docks: warehouses, containers, cranes, the Berth 9 crate ----
  const dockSign = signSprite('South Docks — Berth 9', '#3a3f4a');
  dockSign.position.set(490, 12, 522);
  group.add(dockSign);
  places.docks = { name: 'South Docks, Berth 9', x: 490, z: 512 };
  for (const [wx, wz] of [[380, 530], [600, 530]]) {
    const wh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7e8894 }));
    wh.scale.set(64, 11, 22); wh.position.set(wx, 5.5, wz);
    wh.castShadow = wh.receiveShadow = true;
    group.add(wh);
    collide(wx, wz, 64, 22);
  }
  const containerSpots = [];
  for (let i = 0; i < 42; i++) {
    const x = rngRange(rng, 330, 690), z = rngRange(rng, 502, 548);
    if (Math.abs(x - 490) < 16 && Math.abs(z - 518) < 12) continue; // keep Berth 9 clear
    containerSpots.push([x, z, rng() > 0.6 ? 2 : 1, rngPick(rng, CAR_COLORS)]);
  }
  const contMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), containerSpots.length);
  containerSpots.forEach(([x, z, lvl, color], i) => {
    dummy.rotation.set(0, rng() > 0.5 ? 0 : Math.PI / 2, 0);
    dummy.position.set(x, 1.3 * lvl, z);
    dummy.scale.set(6.1, 2.6 * lvl, 2.44);
    dummy.updateMatrix(); contMesh.setMatrixAt(i, dummy.matrix);
    contMesh.setColorAt(i, new THREE.Color(color));
    collide(x, z, 6.4, 6.4);
  });
  contMesh.castShadow = contMesh.receiveShadow = true;
  group.add(contMesh);
  for (const cx of [420, 560]) {
    const crane = new THREE.Group();
    const legMat = new THREE.MeshLambertMaterial({ color: 0xd8a03c });
    const post = new THREE.Mesh(boxGeo, legMat); post.scale.set(1.6, 17, 1.6); post.position.y = 8.5;
    const jib = new THREE.Mesh(boxGeo, legMat); jib.scale.set(1.2, 1.2, 20); jib.position.set(0, 16.6, 6);
    crane.add(post); crane.add(jib);
    crane.position.set(cx, 0, 528);
    crane.castShadow = true;
    group.add(crane);
    collide(cx, 528, 2.4, 2.4);
  }
  const crate = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xc9a86a }));
  crate.scale.set(1.4, 1.4, 1.4);
  crate.position.set(490, 0.7, 518);
  crate.castShadow = true;
  group.add(crate);

  // ---- Gull Rock Lighthouse on its jetty ----
  const jetty = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7e858f }));
  jetty.scale.set(52, 1.2, 16); jetty.position.set(764, -0.2, 130);
  group.add(jetty);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 3, 10), new THREE.MeshLambertMaterial({ color: 0x6d7278 }));
  rock.position.set(782, 0.4, 130);
  group.add(rock);
  collide(782, 130, 15, 15);
  const towerGroup = new THREE.Group();
  const bandWhite = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
  const bandRed = new THREE.MeshLambertMaterial({ color: 0xc9403d });
  for (let i = 0; i < 4; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6 - i * 0.28, 2.9 - i * 0.28, 3.4, 12), i % 2 ? bandRed : bandWhite);
    band.position.y = 1.7 + i * 3.4;
    band.castShadow = true;
    towerGroup.add(band);
  }
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2, 10),
    new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd98a, emissiveIntensity: 1.6 }));
  lampRoom.position.y = 14.6;
  towerGroup.add(lampRoom);
  const capTop = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.8, 10), bandRed);
  capTop.position.y = 16.5;
  towerGroup.add(capTop);
  const beamGeo = new THREE.ConeGeometry(6, 34, 18, 1, true);
  beamGeo.translate(0, -17, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamPivot = new THREE.Group();
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beamPivot.add(beam);
  beamPivot.position.y = 14.6;
  towerGroup.add(beamPivot);
  towerGroup.position.set(782, 1.6, 130);
  group.add(towerGroup);
  const lhSign = signSprite('Gull Rock', '#20242e');
  lhSign.position.set(782, 21, 130);
  group.add(lhSign);
  places.lighthouse = { name: 'Gull Rock Lighthouse', x: 758, z: 130 };

  // ---- Street lamps (heads glow at dusk) ----
  const lampSpots = [];
  for (const x of VX) for (let z = 24; z < LAND.z; z += 46) lampSpots.push([x - HALF_ROAD - 0.8, z]);
  for (const z of HZ) for (let x = 24; x < LAND.x; x += 46) lampSpots.push([x, z - HALF_ROAD - 0.8]);
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5), new THREE.MeshLambertMaterial({ color: 0x3c4048 }), lampSpots.length);
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffc37a, emissiveIntensity: 0 });
  const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 6), lampHeadMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.position.set(x, 2.7, z); dummy.updateMatrix(); poleMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.5, z); dummy.updateMatrix(); headMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(poleMesh); group.add(headMesh);

  return {
    group, places, colliders,
    windowMats, lampHeadMat, beamPivot, beamMat, waterMat, sun, hemi,
    jetty: { minX: 738, maxX: 790, minZ: 122, maxZ: 138 },
  };
}

/** Circle vs building AABBs: push the circle out; returns true if it hit anything. */
export function collideCircle(colliders, x, z, r) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the nearest face.
        const left = x - c.minX, right = c.maxX - x, top = z - c.minZ, bot = c.maxZ - z;
        const m = Math.min(left, right, top, bot);
        if (m === left) x = c.minX - r; else if (m === right) x = c.maxX + r;
        else if (m === top) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return { x, z, hit };
}

/** Is a point on dry land (the island or the lighthouse jetty)? */
export function onLand(city, x, z) {
  if (x >= 2 && x <= LAND.x - 2 && z >= 2 && z <= LAND.z - 2) return true;
  const j = city.jetty;
  return x >= j.minX && x <= j.maxX && z >= j.minZ && z <= j.maxZ;
}
