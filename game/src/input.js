// Keyboard and mouse as a sampled state the simulation reads each fixed step.
// One-shot actions (interact, attack, pause…) are latched until consumed.

const keys = new Set();
const latched = new Set();
let mouseDX = 0, mouseDY = 0;
let mouseDown = false;
let pointerLocked = false;

const LATCH = {
  KeyE: 'interact', KeyP: 'pause', KeyM: 'mute', KeyK: 'save',
  Digit1: 'fists', Digit2: 'pistol', KeyR: 'respawn',
};

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    const action = LATCH[e.code];
    if (action) latched.add(action);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouseDown = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouseDown = true; latched.add('attack'); }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
  addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
}

export function lockPointer(canvas) {
  if (pointerLocked) return;
  try {
    const r = canvas.requestPointerLock?.();
    if (r && typeof r.catch === 'function') r.catch(() => { /* no gesture: the next click retries */ });
  } catch { /* pointer lock is a nicety, never a blocker */ }
}

export function isPointerLocked() { return pointerLocked; }

export function down(code) { return keys.has(code); }

export function axis() {
  return {
    x: (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0),
    y: (down('KeyS') || down('ArrowDown') ? 1 : 0) - (down('KeyW') || down('ArrowUp') ? 1 : 0),
  };
}

export function consume(action) {
  if (!latched.has(action)) return false;
  latched.delete(action);
  return true;
}

export function attackHeld() { return mouseDown || keys.has('KeyJ'); }

/** Mouse movement since the last frame; calling this clears the accumulators. */
export function mouseDelta() {
  const d = { x: mouseDX, y: mouseDY };
  mouseDX = 0; mouseDY = 0;
  return d;
}
