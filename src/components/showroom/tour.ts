/**
 * Moving through the atelier.
 *
 * This is a walkthrough, not a game. The distinction is not decoration — it
 * decides the whole control scheme:
 *
 * - There is no crosshair, and nothing is aimed at. A reticle in the middle of
 *   the screen is the single most game-like object a 3D scene can have, and a
 *   shop does not ask you to aim at a dress.
 * - There are no movement keys and no thumb-stick. You are not piloting a body
 *   around a room; you are being walked down an aisle.
 * - You cannot leave the aisle, get stuck on a plinth, or end up facing a
 *   corner. There is one path through the collection and it is always the
 *   flattering one, the way a shop assistant would walk you through it.
 *
 * What you do instead: scroll (or swipe) to move along the aisle, and click a
 * gown to be taken to it. The camera turns to regard each gown as you arrive
 * and releases it as you move on. Drag gives a little look around, and it drifts
 * back — a glance, not a camera you have to fly.
 */

import type * as THREE from "three";

export type Station = {
  /** Where the visitor stands to see this gown. */
  stop: THREE.Vector3;
  /** What they are looking at when they get there. */
  regard: THREE.Vector3;
  /** The stand's group, for picking. */
  object: THREE.Object3D;
};

export type TourOptions = {
  reducedMotion: boolean;
};

export type Tour = {
  update: (delta: number) => void;
  dispose: () => void;
  /** Which gown the visitor has arrived at, or null between stations. */
  focusIndex: () => number | null;
  /** How far down the aisle they are, 0..1, for the progress rail. */
  progress: () => number;
  /** Walk to a given gown. */
  goTo: (index: number) => void;
  step: (direction: 1 | -1) => void;
  /** True once the visitor has moved at all, so the hint can retire. */
  hasMoved: () => boolean;
};

const EYE = 1.55;
/** How quickly the camera catches up to where it is being sent. */
const GLIDE = 2.4;
/**
 * How far a notch of wheel, or a pixel of swipe, carries you.
 *
 * Tuned so a gown takes roughly six or seven notches to reach rather than one.
 * A walkthrough that crosses the whole collection in a flick is a slideshow;
 * the point is to move at the pace of someone actually looking.
 */
const SCROLL_SCALE = 0.00026;
const SWIPE_SCALE = 0.0009;
/** A glance is bounded — you cannot spin on the spot. */
const LOOK_LIMIT_YAW = 0.62;
const LOOK_LIMIT_PITCH = 0.2;

export function createTour(
  three: typeof THREE,
  camera: THREE.PerspectiveCamera,
  element: HTMLElement,
  entrance: THREE.Vector3,
  stations: Station[],
  options: TourOptions
): Tour {
  /**
   * The rail.
   *
   * The visitor's path is a spline through the stops rather than a straight
   * line down the middle, so the walk weaves gently toward whichever side the
   * next gown is on. That weave is most of why this reads as being shown around
   * a room rather than sliding down a corridor.
   */
  const waypoints: THREE.Vector3[] = [
    new three.Vector3(entrance.x, EYE, entrance.z),
    ...stations.map((station) => new three.Vector3(station.stop.x, EYE, station.stop.z))
  ];

  // Somewhere to end up past the last gown, so the final stop is not the end of
  // the world and the camera has room to settle.
  const last = waypoints[waypoints.length - 1];
  waypoints.push(new three.Vector3(last.x * 0.3, EYE, last.z - 4.2));

  const path = new three.CatmullRomCurve3(waypoints, false, "catmullrom", 0.4);

  /**
   * Where each station sits along the rail, 0..1.
   *
   * These are positions in the curve's own parameter space, not in arc length,
   * which is why every read below uses `getPoint` and never `getPointAt`.
   * `getPointAt` re-parameterises by distance travelled, and because the rail
   * weaves by different amounts between different gowns, distance and index
   * drift apart — the camera would stop short of the gown whose dot was lit.
   * Uniform parameterisation costs a little evenness of speed and buys exact
   * agreement between where you are, what is captioned, and which dot is on.
   */
  const stationAt = stations.map((_, index) => (index + 1) / (waypoints.length - 1));

  let target = 0;
  let current = 0;
  let moved = false;

  // The glance: an offset on top of wherever the rail is pointing.
  let lookYaw = 0;
  let lookPitch = 0;
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let pointerId: number | null = null;

  // Touch has to distinguish a swipe along the aisle from a glance sideways.
  let touchStart = { x: 0, y: 0 };
  let touchAxis: "move" | "look" | null = null;

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

  function advance(amount: number) {
    target = clamp01(target + amount);
    moved = true;
  }

  /* ------------------------------------------------------------- pointer */

  function onWheel(event: WheelEvent) {
    // The page behind must not scroll while the visitor is walking.
    event.preventDefault();
    advance(event.deltaY * SCROLL_SCALE);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    dragging = true;
    pointerId = event.pointerId;
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging || event.pointerId !== pointerId) return;
    lookYaw -= (event.clientX - lastPointer.x) * 0.0022;
    lookPitch -= (event.clientY - lastPointer.y) * 0.0016;
    lookYaw = Math.max(-LOOK_LIMIT_YAW, Math.min(LOOK_LIMIT_YAW, lookYaw));
    lookPitch = Math.max(-LOOK_LIMIT_PITCH, Math.min(LOOK_LIMIT_PITCH, lookPitch));
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp() {
    dragging = false;
    pointerId = null;
  }

  /* --------------------------------------------------------------- touch */

  function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart = { x: touch.clientX, y: touch.clientY };
    lastPointer = { x: touch.clientX, y: touch.clientY };
    touchAxis = null;
  }

  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;

    // Decide once, on the first meaningful movement, whether this gesture is a
    // walk or a glance. Re-deciding mid-gesture makes the room feel unstable.
    if (!touchAxis) {
      const dx = Math.abs(touch.clientX - touchStart.x);
      const dy = Math.abs(touch.clientY - touchStart.y);
      if (dx < 6 && dy < 6) return;
      touchAxis = dy > dx ? "move" : "look";
    }

    if (touchAxis === "move") {
      advance((lastPointer.y - touch.clientY) * SWIPE_SCALE);
    } else {
      lookYaw -= (touch.clientX - lastPointer.x) * 0.0026;
      lookYaw = Math.max(-LOOK_LIMIT_YAW, Math.min(LOOK_LIMIT_YAW, lookYaw));
    }

    lastPointer = { x: touch.clientX, y: touch.clientY };
    event.preventDefault();
  }

  function onTouchEnd() {
    touchAxis = null;
  }

  /* --------------------------------------------------------------- frame */

  const here = new three.Vector3();
  const ahead = new three.Vector3();
  const desired = new three.Vector3();
  const regard = new three.Vector3();

  function nearestStation(): { index: number; weight: number } | null {
    let best = -1;
    let bestDistance = Infinity;

    for (let index = 0; index < stationAt.length; index += 1) {
      const distance = Math.abs(stationAt[index] - current);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    if (best < 0) return null;

    // How completely the camera gives itself to this gown. Full attention at the
    // stop, released smoothly as the visitor moves on, so the head turn is a
    // regard rather than a snap.
    const span = 1 / (waypoints.length - 1);
    const t = clamp01(1 - bestDistance / (span * 0.85));
    return { index: best, weight: t * t * (3 - 2 * t) };
  }

  function update(delta: number) {
    const step = Math.min(delta, 0.05);

    // Ease toward the target rather than jumping to it. This is the difference
    // between gliding and teleporting, and it is the whole feel of the thing.
    const rate = 1 - Math.exp(-GLIDE * step);
    current += (target - current) * rate;

    path.getPoint(clamp01(current), here);
    camera.position.copy(here);

    // Look a little further along the rail than where you are standing.
    path.getPoint(clamp01(current + 0.035), ahead);
    desired.copy(ahead);

    const near = nearestStation();
    if (near) {
      regard.copy(stations[near.index].regard);
      desired.lerp(regard, near.weight);
    }

    camera.lookAt(desired);

    // The glance, applied on top, and drifting back to centre when released so
    // the visitor is never left facing a wall.
    if (!dragging) {
      const settle = 1 - Math.exp(-2.6 * step);
      lookYaw -= lookYaw * settle;
      lookPitch -= lookPitch * settle;
    }
    camera.rotateY(lookYaw);
    camera.rotateX(lookPitch);

    // A trace of rise and fall while moving. Enough to read as walking, far too
    // little to read as a head-bob.
    if (!options.reducedMotion) {
      const speed = Math.abs(target - current);
      camera.position.y += Math.sin(current * 90) * Math.min(speed, 0.05) * 0.35;
    }
  }

  /* --------------------------------------------------------------- wiring */

  const active = { passive: false } as AddEventListenerOptions;

  element.addEventListener("wheel", onWheel, active);
  element.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  element.addEventListener("touchstart", onTouchStart, active);
  element.addEventListener("touchmove", onTouchMove, active);
  element.addEventListener("touchend", onTouchEnd);

  return {
    update,
    progress: () => current,
    hasMoved: () => moved,
    focusIndex() {
      const near = nearestStation();
      // Only claim a gown once the visitor has actually arrived at it.
      return near && near.weight > 0.55 ? near.index : null;
    },
    goTo(index: number) {
      if (index < 0 || index >= stationAt.length) return;
      target = stationAt[index];
      moved = true;
    },
    step(direction: 1 | -1) {
      const near = nearestStation();
      const from = near ? near.index : 0;
      const next = Math.min(stationAt.length - 1, Math.max(0, from + direction));
      target = stationAt[next];
      moved = true;
    },
    dispose() {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
    }
  };
}
