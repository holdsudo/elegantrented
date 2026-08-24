/**
 * Walking around the atelier.
 *
 * Two input schemes over one movement model. On a desktop the visitor clicks to
 * take the mouse and walks with WASD; on a phone a thumb-stick appears under the
 * left thumb and the right half of the screen looks around. Both feed the same
 * velocity, so the room only has to be tuned once.
 *
 * Deliberate choices worth naming:
 *
 * - Movement is accelerated and damped, not teleported. Instant velocity in a
 *   first-person view reads as sliding on ice, and a boutique should feel like
 *   walking on stone.
 * - Pointer lock is offered, never required. It is refused outright by some
 *   browsers and is hostile inside an iframe, so dragging to look always works
 *   as well and is the only scheme on touch.
 * - Pitch is clamped short of vertical. Letting the camera roll past the poles
 *   inverts the controls and there is nothing on the ceiling worth seeing.
 */

import type * as THREE from "three";

export type ControlsOptions = {
  /** Half-extents of the walkable floor. */
  bounds: { x: number; z: number };
  /** Circles on the floor the visitor cannot walk into. */
  obstacles: { x: number; z: number; radius: number }[];
  /** Damp everything down for someone who asked for less motion. */
  reducedMotion: boolean;
};

const EYE_HEIGHT = 1.62;
const ACCELERATION = 26;
const DAMPING = 9;
const MAX_SPEED = 2.7;
const LOOK_SENSITIVITY = 0.0022;
const TOUCH_LOOK_SENSITIVITY = 0.0038;
const PITCH_LIMIT = Math.PI / 2 - 0.12;

type TouchState = {
  /** The thumb that is driving movement, and where it started. */
  moveId: number | null;
  moveOrigin: { x: number; y: number };
  moveVector: { x: number; y: number };
  /** The thumb that is looking. */
  lookId: number | null;
  lookLast: { x: number; y: number };
};

export type Controls = {
  update: (delta: number) => void;
  dispose: () => void;
  /** True while the pointer is locked, for the HUD to reflect. */
  isLocked: () => boolean;
  /** Normalised thumb-stick offset, so the HUD can draw it. Null when idle. */
  stick: () => { x: number; y: number } | null;
  requestLock: () => void;
  releaseLock: () => void;
  /** Drop the visitor back at the entrance, facing the aisle. */
  reset: () => void;
};

export function createControls(
  three: typeof THREE,
  camera: THREE.PerspectiveCamera,
  element: HTMLElement,
  entrance: THREE.Vector3,
  options: ControlsOptions
): Controls {
  let yaw = 0;
  let pitch = 0;
  let locked = false;

  const velocity = new three.Vector3();
  const keys = new Set<string>();

  const touch: TouchState = {
    moveId: null,
    moveOrigin: { x: 0, y: 0 },
    moveVector: { x: 0, y: 0 },
    lookId: null,
    lookLast: { x: 0, y: 0 }
  };

  // Mouse-drag look, for when pointer lock is unavailable or declined.
  let dragging = false;
  let dragLast = { x: 0, y: 0 };

  camera.position.set(entrance.x, EYE_HEIGHT, entrance.z);
  camera.rotation.order = "YXZ";

  /* --------------------------------------------------------------- looking */

  function look(deltaX: number, deltaY: number, sensitivity: number) {
    yaw -= deltaX * sensitivity;
    pitch -= deltaY * sensitivity;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  }

  function onMouseMove(event: MouseEvent) {
    if (locked) {
      look(event.movementX, event.movementY, LOOK_SENSITIVITY);
    } else if (dragging) {
      look(event.clientX - dragLast.x, event.clientY - dragLast.y, LOOK_SENSITIVITY * 1.3);
      dragLast = { x: event.clientX, y: event.clientY };
    }
  }

  function onMouseDown(event: MouseEvent) {
    if (locked || event.button !== 0) return;
    dragging = true;
    dragLast = { x: event.clientX, y: event.clientY };
  }

  function onMouseUp() {
    dragging = false;
  }

  function onLockChange() {
    locked = document.pointerLockElement === element;
    if (!locked) dragging = false;
  }

  /* ---------------------------------------------------------------- keys */

  function onKeyDown(event: KeyboardEvent) {
    keys.add(event.code);
    // The page behind should not scroll while the visitor is walking.
    if (
      ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        event.code
      )
    ) {
      event.preventDefault();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    keys.delete(event.code);
  }

  /* --------------------------------------------------------------- touch */

  function onTouchStart(event: TouchEvent) {
    for (const point of Array.from(event.changedTouches)) {
      const isLeftHalf = point.clientX < window.innerWidth * 0.45;
      if (isLeftHalf && touch.moveId === null) {
        touch.moveId = point.identifier;
        touch.moveOrigin = { x: point.clientX, y: point.clientY };
        touch.moveVector = { x: 0, y: 0 };
      } else if (touch.lookId === null) {
        touch.lookId = point.identifier;
        touch.lookLast = { x: point.clientX, y: point.clientY };
      }
    }
  }

  function onTouchMove(event: TouchEvent) {
    for (const point of Array.from(event.changedTouches)) {
      if (point.identifier === touch.moveId) {
        // The stick saturates at 46 px of travel, which is about a thumb's
        // comfortable reach without shifting grip.
        const dx = point.clientX - touch.moveOrigin.x;
        const dy = point.clientY - touch.moveOrigin.y;
        const distance = Math.hypot(dx, dy);
        const clamped = Math.min(distance, 46) / 46;
        touch.moveVector =
          distance > 0.001
            ? { x: (dx / distance) * clamped, y: (dy / distance) * clamped }
            : { x: 0, y: 0 };
      } else if (point.identifier === touch.lookId) {
        look(
          point.clientX - touch.lookLast.x,
          point.clientY - touch.lookLast.y,
          TOUCH_LOOK_SENSITIVITY
        );
        touch.lookLast = { x: point.clientX, y: point.clientY };
      }
    }
    event.preventDefault();
  }

  function onTouchEnd(event: TouchEvent) {
    for (const point of Array.from(event.changedTouches)) {
      if (point.identifier === touch.moveId) {
        touch.moveId = null;
        touch.moveVector = { x: 0, y: 0 };
      }
      if (point.identifier === touch.lookId) touch.lookId = null;
    }
  }

  /* ------------------------------------------------------------ collision */

  /**
   * Keep the visitor inside the room and out of the plinths.
   *
   * Circle-push rather than a physics engine: if the visitor has ended up inside
   * an obstacle, move them straight back out along the radius. At walking speed
   * on a flat floor this is indistinguishable from real collision, and it cannot
   * tunnel or wedge in a corner the way a naive stop-on-contact test does.
   */
  function resolve(position: THREE.Vector3) {
    position.x = Math.max(-options.bounds.x, Math.min(options.bounds.x, position.x));
    position.z = Math.max(-options.bounds.z, Math.min(options.bounds.z, position.z));

    for (const obstacle of options.obstacles) {
      const dx = position.x - obstacle.x;
      const dz = position.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      if (distance < obstacle.radius && distance > 0.0001) {
        const push = obstacle.radius / distance;
        position.x = obstacle.x + dx * push;
        position.z = obstacle.z + dz * push;
      }
    }
  }

  /* ---------------------------------------------------------------- frame */

  const forward = new three.Vector3();
  const right = new three.Vector3();
  const wish = new three.Vector3();

  function update(delta: number) {
    // A tab that was in the background hands back an enormous delta; stepping
    // the walk by it would fire the visitor through a wall.
    const step = Math.min(delta, 0.05);

    camera.rotation.set(pitch, yaw, 0);

    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    wish.set(0, 0, 0);
    if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward);
    if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward);
    if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);

    if (touch.moveId !== null) {
      wish.addScaledVector(forward, -touch.moveVector.y);
      wish.addScaledVector(right, touch.moveVector.x);
    }

    if (wish.lengthSq() > 0.0001) {
      wish.normalize();
      velocity.addScaledVector(wish, ACCELERATION * step);
    }

    // Exponential damping, frame-rate independent.
    const damp = Math.exp(-DAMPING * step);
    velocity.multiplyScalar(damp);

    const speedCap = options.reducedMotion ? MAX_SPEED * 0.7 : MAX_SPEED;
    if (velocity.length() > speedCap) velocity.setLength(speedCap);

    camera.position.addScaledVector(velocity, step);
    camera.position.y = EYE_HEIGHT;
    resolve(camera.position);
  }

  /* --------------------------------------------------------------- wiring */

  const passive = { passive: false } as AddEventListenerOptions;

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("pointerlockchange", onLockChange);
  window.addEventListener("keydown", onKeyDown, passive);
  window.addEventListener("keyup", onKeyUp);
  element.addEventListener("mousedown", onMouseDown);
  element.addEventListener("touchstart", onTouchStart, passive);
  element.addEventListener("touchmove", onTouchMove, passive);
  element.addEventListener("touchend", onTouchEnd);
  element.addEventListener("touchcancel", onTouchEnd);

  return {
    update,
    isLocked: () => locked,
    stick: () => (touch.moveId !== null ? { ...touch.moveVector } : null),
    requestLock() {
      // Safari rejects the request outside a user gesture and throws; the drag
      // fallback covers it, so a refusal is not worth surfacing.
      try {
        element.requestPointerLock?.();
      } catch {
        /* drag-to-look still works */
      }
    },
    releaseLock() {
      if (document.pointerLockElement === element) document.exitPointerLock();
    },
    reset() {
      camera.position.set(entrance.x, EYE_HEIGHT, entrance.z);
      velocity.set(0, 0, 0);
      yaw = 0;
      pitch = 0;
    },
    dispose() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      element.removeEventListener("mousedown", onMouseDown);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
      if (document.pointerLockElement === element) document.exitPointerLock();
    }
  };
}
