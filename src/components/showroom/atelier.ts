/**
 * The atelier — the room the visitor walks into.
 *
 * A long top-lit gallery: stone floor, panelled ivory walls, a coffered ceiling
 * with light coves, and gowns on plinths down both sides of a central aisle.
 * The visitor enters at one end and walks.
 *
 * The lighting is the expensive-looking part, and it is deliberately built from
 * almost no real lights. Ten spotlights would blow past the uniform budget on a
 * phone and halve the frame rate for a result nobody would call better. Instead:
 * one shadow-casting key, one hemisphere fill, emissive coves that cost nothing,
 * painted pools of light on the floor, and — doing most of the work — a
 * procedural environment map, so brass reflects the room and satin catches a
 * highlight that slides as you move. That last one is why the cloth reads as
 * cloth.
 */

import type * as THREE from "three";
import { garmentLabel, garmentSpec, type GarmentSpec } from "@/lib/garment";
import { buildGarment, disposeGarment, type BuiltGarment } from "./garment3d";
import {
  brassSurface,
  marbleSurface,
  plasterSurface,
  weaveSurface,
  type Surface
} from "./textures";

export type ShowroomGown = {
  id: string;
  number: string;
  description: string;
  color: string | null;
  size: string | null;
  price: string;
  /** Set when the shop has a real photograph; the plinth shows it if so. */
  photoUrl: string | null;
  /** Whether it is free on the date the visitor asked about, if they asked. */
  availability: "free" | "taken" | "unknown";
};

/** A gown standing in the room, and where it stands. */
export type Stand = {
  gown: ShowroomGown;
  spec: GarmentSpec;
  position: THREE.Vector3;
  group: THREE.Group;
  built: BuiltGarment | null;
};

export type Atelier = {
  scene: THREE.Scene;
  stands: Stand[];
  /** Half-width and half-length of the walkable floor, in metres. */
  bounds: { x: number; z: number };
  /** Where the visitor arrives, facing down the aisle. */
  entrance: THREE.Vector3;
  dispose: () => void;
};

const HALL_HALF_WIDTH = 4.6;
const AISLE_SPACING = 3.8;
const PLINTH_INSET = 2.5;
const PLINTH_HEIGHT = 0.42;
const PLINTH_RADIUS = 0.62;
const CEILING = 4.4;

/* ------------------------------------------------------------ environment */

/**
 * A room, painted into an equirectangular canvas and pre-filtered into an
 * environment map.
 *
 * This is a cheat and a good one: nothing here is the real geometry, but every
 * reflective surface in the scene samples it, so brass, satin and the polished
 * floor all agree about where the windows and the ceiling coves are.
 */
function buildEnvironment(three: typeof THREE, renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;

  // Vertical gradient: warm bright ceiling, ivory walls, dark floor.
  const sky = context.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0.0, "#FFF6E6");
  sky.addColorStop(0.28, "#F6EADA");
  sky.addColorStop(0.52, "#D9CBB6");
  sky.addColorStop(0.75, "#6E6055");
  sky.addColorStop(1.0, "#2A241F");
  context.fillStyle = sky;
  context.fillRect(0, 0, 512, 256);

  // The ceiling coves, as two bright bands the reflective surfaces can catch.
  context.fillStyle = "rgba(255, 244, 222, 0.95)";
  context.fillRect(0, 34, 512, 14);
  context.fillStyle = "rgba(255, 248, 236, 0.5)";
  context.fillRect(0, 58, 512, 6);

  // Warm pools where the downlights hit, spaced around the room so a moving
  // highlight travels across satin rather than sitting still on it.
  for (let index = 0; index < 8; index += 1) {
    const x = (index / 8) * 512 + 32;
    const glow = context.createRadialGradient(x, 96, 2, x, 96, 54);
    glow.addColorStop(0, "rgba(255, 236, 200, 0.85)");
    glow.addColorStop(1, "rgba(255, 236, 200, 0)");
    context.fillStyle = glow;
    context.fillRect(x - 54, 42, 108, 108);
  }

  const texture = new three.CanvasTexture(canvas);
  texture.mapping = three.EquirectangularReflectionMapping;
  texture.colorSpace = three.SRGBColorSpace;

  const pmrem = new three.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(texture);
  pmrem.dispose();
  texture.dispose();

  return target.texture;
}

/* ------------------------------------------------------------------ floor */

/** A soft round pool of light, painted rather than cast. */
function lightPoolTexture(three: typeof THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255, 236, 202, 0.92)");
  gradient.addColorStop(0.45, "rgba(255, 234, 198, 0.34)");
  gradient.addColorStop(1, "rgba(255, 236, 205, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ plaque */

/**
 * The little brass card beside each gown, with its number, name and price.
 *
 * Drawn to a canvas at device scale — read from half a metre away, so it has to
 * survive being looked at closely.
 */
function plaqueTexture(three: typeof THREE, gown: ShowroomGown, spec: GarmentSpec) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;

  context.fillStyle = "#F7F1E7";
  context.fillRect(0, 0, 512, 256);

  context.strokeStyle = "#B08D57";
  context.lineWidth = 3;
  context.strokeRect(12, 12, 488, 232);

  context.fillStyle = "#8A6A3B";
  context.font = "600 26px Georgia, 'Times New Roman', serif";
  context.textAlign = "center";
  context.fillText(`No. ${gown.number}`, 256, 62);

  // The description, wrapped by hand — a long gown name must not spill off the
  // brass and a canvas has no text wrapping of its own.
  context.fillStyle = "#1A1511";
  context.font = "italic 34px Georgia, 'Times New Roman', serif";
  const words = gown.description.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > 430 && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const startY = lines.length > 1 ? 108 : 124;
  lines.slice(0, 2).forEach((text, index) => {
    context.fillText(text, 256, startY + index * 40);
  });

  context.fillStyle = "#7A6A59";
  context.font = "20px Helvetica, Arial, sans-serif";
  const detail = [gown.size ? `Size ${gown.size}` : null, garmentLabel(spec)]
    .filter(Boolean)
    .join("   ·   ");
  context.fillText(detail, 256, 190);

  context.fillStyle = "#1A1511";
  context.font = "600 24px Helvetica, Arial, sans-serif";
  context.fillText(gown.price, 256, 224);

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* ------------------------------------------------------------------- room */

type Tracked = {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
};

function buildRoom(
  three: typeof THREE,
  scene: THREE.Scene,
  halfLength: number,
  track: Tracked,
  surfaces: { marble: Surface; plaster: Surface; brass: Surface },
  quality: "high" | "low"
) {
  // The room is deliberately held down.
  //
  // The environment map lights every surface that samples it, and at full
  // strength it lifts the floor and walls to the same brightness as the gowns —
  // an evenly-lit corridor, which is the opposite of a gallery. The room takes a
  // fraction of the environment; the cloth takes all of it. That difference is
  // what makes the gowns read as the lit objects and everything else as the room
  // they are standing in.
  // Marble, not a colour. The roughness map is doing more work here than the
  // colour map: it is the uneven polish that makes a reflection break up as you
  // move, which a uniform roughness value can never do.
  const stone = new three.MeshStandardMaterial({
    map: surfaces.marble.map,
    roughnessMap: surfaces.marble.roughnessMap,
    normalMap: surfaces.marble.normalMap,
    color: new three.Color("#7A736C"),
    roughness: 1,
    metalness: 0.08,
    envMapIntensity: 0.55,
    // Semi-transparent so the mirrored gowns below read through the polish.
    transparent: quality === "high",
    opacity: quality === "high" ? 0.9 : 1
  });
  const wall = new three.MeshStandardMaterial({
    color: new three.Color("#E4DACA"),
    roughnessMap: surfaces.plaster.roughnessMap,
    normalMap: surfaces.plaster.normalMap,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.45
  });
  const trim = new three.MeshStandardMaterial({
    color: new three.Color("#B08D57"),
    roughnessMap: surfaces.brass.roughnessMap,
    normalMap: surfaces.brass.normalMap,
    roughness: 1,
    metalness: 0.92,
    envMapIntensity: 1.3
  });
  // A ceiling faces down, so it catches no key light and samples the dark half
  // of the environment — left alone it renders as a muddy brown lid over the
  // room. Real plaster under a cove reads as *glowing*, so it is given a little
  // emission of its own rather than a light nobody can afford.
  const ceilingMaterial = new three.MeshStandardMaterial({
    color: new three.Color("#F6F0E6"),
    roughness: 0.95,
    emissive: new three.Color("#EFE2CE"),
    emissiveIntensity: 0.2
  });
  const cove = new three.MeshBasicMaterial({ color: new three.Color("#FFF2DC") });
  track.materials.push(stone, wall, trim, ceilingMaterial, cove);

  // Tiling. A marble slab is about two metres; stretching one across a
  // twenty-three metre hall would smear the veins into streaks.
  for (const texture of [surfaces.marble.map, surfaces.marble.roughnessMap, surfaces.marble.normalMap]) {
    if (!texture) continue;
    texture.repeat.set(HALL_HALF_WIDTH, halfLength);
    texture.needsUpdate = true;
  }
  for (const texture of [surfaces.plaster.roughnessMap, surfaces.plaster.normalMap]) {
    if (!texture) continue;
    texture.repeat.set(halfLength * 0.5, CEILING * 0.4);
    texture.needsUpdate = true;
  }

  const floorGeometry = new three.PlaneGeometry(HALL_HALF_WIDTH * 2, halfLength * 2);
  track.geometries.push(floorGeometry);

  const floor = new three.Mesh(floorGeometry, stone);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Two brass inlay lines down the aisle, in place of a runner.
  //
  // There used to be a broad dark strip here, from when the floor was a flat
  // near-black fill and the aisle needed something to separate it. Against real
  // marble it reads as a shadow lying across the room rather than as a path —
  // a large matte rectangle competing with the one surface in the scene worth
  // looking at. Inlay does the same job the right way round: it draws the length
  // of the hall as two catching lines, and it is what an actual gallery floor
  // would have.
  const inlayGeometry = new three.BoxGeometry(0.035, 0.006, halfLength * 2 - 0.6);
  track.geometries.push(inlayGeometry);
  for (const side of [-1, 1]) {
    const inlay = new three.Mesh(inlayGeometry, trim);
    inlay.position.set(side * 1.42, 0.003, 0);
    scene.add(inlay);
  }

  // Ceiling.
  const ceilingGeometry = new three.PlaneGeometry(HALL_HALF_WIDTH * 2, halfLength * 2);
  track.geometries.push(ceilingGeometry);
  const ceiling = new three.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = CEILING;
  scene.add(ceiling);

  // Side walls, plus the two glowing coves that light them.
  const wallGeometry = new three.PlaneGeometry(halfLength * 2, CEILING);
  track.geometries.push(wallGeometry);

  for (const side of [-1, 1]) {
    const panel = new three.Mesh(wallGeometry, wall);
    panel.position.set(side * HALL_HALF_WIDTH, CEILING / 2, 0);
    panel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    panel.receiveShadow = true;
    scene.add(panel);

    const coveGeometry = new three.BoxGeometry(0.1, 0.09, halfLength * 2 - 0.6);
    track.geometries.push(coveGeometry);
    const strip = new three.Mesh(coveGeometry, cove);
    strip.position.set(side * (HALL_HALF_WIDTH - 0.26), CEILING - 0.34, 0);
    scene.add(strip);

    // Brass picture rail, catching the cove light.
    const railGeometry = new three.BoxGeometry(0.05, 0.05, halfLength * 2);
    track.geometries.push(railGeometry);
    const rail = new three.Mesh(railGeometry, trim);
    rail.position.set(side * (HALL_HALF_WIDTH - 0.03), 2.9, 0);
    scene.add(rail);
  }

  // Pilasters down both walls — the rhythm that makes a corridor read as a
  // gallery rather than a hallway.
  const pilasterGeometry = new three.BoxGeometry(0.26, CEILING, 0.26);
  track.geometries.push(pilasterGeometry);
  const pilasterCount = Math.max(2, Math.floor((halfLength * 2) / 3.8));

  // A recessed panel in each bay between the pilasters.
  //
  // Flat walls are the single largest surface in the room and the fastest way to
  // make it look cheap: a plain plane has no edge for light to catch, so it
  // renders as one dead field of cream however good the lighting is. A panel
  // proud of the wall gives every bay a lit edge and a shadowed one, which is
  // the whole reason real rooms are paneled.
  const panelMaterial = new three.MeshStandardMaterial({
    color: new three.Color("#EDE4D5"),
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.5
  });
  track.materials.push(panelMaterial);

  const bay = (halfLength * 2) / pilasterCount;
  const panelGeometry = new three.BoxGeometry(0.05, 2.1, Math.max(bay - 1.1, 0.5));
  track.geometries.push(panelGeometry);

  for (let index = 0; index <= pilasterCount; index += 1) {
    const z = -halfLength + (index / pilasterCount) * halfLength * 2;
    for (const side of [-1, 1]) {
      const pilaster = new three.Mesh(pilasterGeometry, wall);
      pilaster.position.set(side * (HALL_HALF_WIDTH - 0.13), CEILING / 2, z);
      pilaster.receiveShadow = true;
      scene.add(pilaster);

      // One panel per bay, so the last pilaster gets none after it.
      if (index < pilasterCount) {
        const panel = new three.Mesh(panelGeometry, panelMaterial);
        panel.position.set(side * (HALL_HALF_WIDTH - 0.04), 1.55, z + bay / 2);
        panel.receiveShadow = true;
        scene.add(panel);
      }
    }
  }

  // A note on what casts.
  //
  // Only the gowns and their plinths cast shadows. The architecture — cornice,
  // skirting, pilasters, wall panels — receives them and casts nothing. That is
  // not laziness: a single directional key placed above a closed room throws one
  // enormous hard-edged wedge off every long horizontal it meets, and the floor
  // ends up cut in half by a diagonal that reads as a rendering fault rather
  // than as architecture. Real galleries are lit by many soft sources from
  // inside the room, which this scene cannot afford; letting only the subjects
  // cast is the honest approximation, and it is the one that looks right.

  // Skirting and cornice.
  //
  // Every real room has them, no rendered room remembers them, and their
  // absence is felt long before it is noticed: a wall meeting a floor at a
  // perfect right angle with no moulding is the silhouette of a cardboard box.
  // They also give the grazing cove light a horizontal edge to catch, which
  // draws the length of the hall.
  const skirtingGeometry = new three.BoxGeometry(0.09, 0.16, halfLength * 2);
  const corniceGeometry = new three.BoxGeometry(0.13, 0.2, halfLength * 2);
  track.geometries.push(skirtingGeometry, corniceGeometry);

  for (const side of [-1, 1]) {
    const skirting = new three.Mesh(skirtingGeometry, wall);
    skirting.position.set(side * (HALL_HALF_WIDTH - 0.045), 0.08, 0);
    skirting.receiveShadow = true;
    scene.add(skirting);

    const cornice = new three.Mesh(corniceGeometry, wall);
    cornice.position.set(side * (HALL_HALF_WIDTH - 0.065), CEILING - 0.1, 0);
    scene.add(cornice);
  }

  // A coffered ceiling.
  //
  // A flat ceiling is a large, evenly-lit, featureless plane — the surface most
  // likely to give the render away. Beams break it into bays and give the light
  // somewhere to fall off, which is most of why a real ceiling reads as being
  // above you rather than as a lid.
  const beamGeometry = new three.BoxGeometry(HALL_HALF_WIDTH * 2, 0.13, 0.26);
  track.geometries.push(beamGeometry);
  const beams = Math.max(2, Math.round((halfLength * 2) / 2.4));
  for (let index = 0; index <= beams; index += 1) {
    const beam = new three.Mesh(beamGeometry, wall);
    beam.position.set(0, CEILING - 0.065, -halfLength + (index / beams) * halfLength * 2);
    // Beams do not cast. A hard directional key striking a row of ceiling
    // beams throws diagonal bars down the walls, which reads as a fault rather
    // than as architecture — real coves light the ceiling from below and the
    // beams are the thing lit, not the thing shadowing.
    beam.castShadow = false;
    scene.add(beam);
  }

  // End walls, so the room is closed and the visitor cannot see the void.
  const endGeometry = new three.PlaneGeometry(HALL_HALF_WIDTH * 2, CEILING);
  track.geometries.push(endGeometry);

  const farWall = new three.Mesh(endGeometry, wall);
  farWall.position.set(0, CEILING / 2, -halfLength);
  farWall.receiveShadow = true;
  scene.add(farWall);

  // A lit archway at the end of the gallery.
  //
  // Without it the far wall sits past the fog and reads as a hole in the world —
  // the room appears to stop existing rather than to end. A warm panel gives the
  // aisle somewhere to arrive, and gives the eye a reason to walk toward it.
  const archMaterial = new three.MeshBasicMaterial({
    color: new three.Color("#F6E3C4"),
    transparent: true,
    opacity: 0.92
  });
  track.materials.push(archMaterial);

  const archGeometry = new three.PlaneGeometry(1.9, 2.9);
  track.geometries.push(archGeometry);
  const arch = new three.Mesh(archGeometry, archMaterial);
  arch.position.set(0, 1.62, -halfLength + 0.06);
  scene.add(arch);

  // Its brass surround, which is what stops it reading as a flat rectangle of
  // light and starts it reading as a doorway into the next room.
  const surroundGeometry = new three.PlaneGeometry(2.16, 3.16);
  track.geometries.push(surroundGeometry);
  const surround = new three.Mesh(surroundGeometry, trim);
  surround.position.set(0, 1.62, -halfLength + 0.03);
  scene.add(surround);

  const nearWall = new three.Mesh(endGeometry, wall);
  nearWall.position.set(0, CEILING / 2, halfLength);
  nearWall.rotation.y = Math.PI;
  scene.add(nearWall);
}

/* ------------------------------------------------------------------ build */

export function buildAtelier(
  three: typeof THREE,
  renderer: THREE.WebGLRenderer,
  gowns: ShowroomGown[],
  quality: "high" | "low"
): Atelier {
  const scene = new three.Scene();
  const track: Tracked = { geometries: [], materials: [], textures: [] };

  // The hall grows with the collection, with enough room at the near end to
  // arrive in and at the far end to not feel walled in.
  const rows = Math.ceil(Math.max(gowns.length, 2) / 2);
  const halfLength = Math.max(11, (rows * AISLE_SPACING) / 2 + 6);

  scene.background = new three.Color("#161210");
  // Warm haze rather than darkness, reaching well past the far wall. Fog that
  // saturates before the end of the room turns the far end black, which reads as
  // an unfinished scene instead of as distance.
  scene.fog = new three.Fog(new three.Color("#3B312A"), 9, halfLength * 3.4);

  const environment = buildEnvironment(three, renderer);
  scene.environment = environment;

  // Surfaces are generated once and shared. On a low-tier device the marble
  // colour map is the only one worth its cost — the normal and roughness detail
  // is invisible at the resolution and framerate a phone is running at, and the
  // generation itself is a noticeable pause on a slow CPU.
  const surfaces = {
    marble: marbleSurface(three, quality === "high" ? 1024 : 512),
    plaster: plasterSurface(three, quality === "high" ? 512 : 256),
    brass: brassSurface(three, 256)
  };

  // One weave, shared by every gown in the room. The lathe's UVs run 0..1 both
  // ways, so the repeat is what sets the actual thread count on the cloth.
  const fineWeave = weaveSurface(three, true, quality === "high" ? 512 : 256);
  const openWeave = weaveSurface(three, false, quality === "high" ? 512 : 256);
  for (const surface of [fineWeave, openWeave]) {
    surface.normalMap?.repeat.set(6, 9);
  }
  const weave = { fine: fineWeave.normalMap!, open: openWeave.normalMap! };

  buildRoom(three, scene, halfLength, track, surfaces, quality);

  // The two real lights. The key casts the shadows that ground the gowns on
  // their plinths; the hemisphere keeps the shadow side from going black.
  const key = new three.DirectionalLight(new three.Color("#FFF1DC"), 2.6);
  key.position.set(3.4, CEILING + 3, halfLength * 0.35);
  key.target.position.set(0, 0.9, -halfLength * 0.25);
  if (quality === "high") {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = halfLength * 3;
    key.shadow.camera.left = -HALL_HALF_WIDTH - 2;
    key.shadow.camera.right = HALL_HALF_WIDTH + 2;
    key.shadow.camera.top = halfLength + 2;
    key.shadow.camera.bottom = -halfLength - 2;
    // A lathe is a curved surface sampled against a shadow map covering the
    // whole hall, which is exactly the case that produces banded self-shadowing.
    // The normal bias does the real work here; the depth bias alone leaves
    // stripes wrapped around the gowns.
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.06;
  }
  scene.add(key);
  scene.add(key.target);

  scene.add(
    new three.HemisphereLight(new three.Color("#FFF6E8"), new three.Color("#2A211A"), 0.38)
  );

  // Painted pools under each plinth, in place of a spotlight each.
  const poolTexture = lightPoolTexture(three);
  track.textures.push(poolTexture);
  const poolMaterial = new three.MeshBasicMaterial({
    map: poolTexture,
    transparent: true,
    blending: three.AdditiveBlending,
    depthWrite: false
  });
  const poolGeometry = new three.PlaneGeometry(3.2, 3.2);
  track.materials.push(poolMaterial);
  track.geometries.push(poolGeometry);

  // Shared plinth parts — one geometry, one material, however many gowns.
  // A chamfered plinth, swept rather than a plain cylinder.
  //
  // Nothing manufactured has a perfectly sharp arris — it would chip, and it
  // would be unpleasant to touch, so everything real is eased. That eased edge
  // catches a thin line of light, and it is one of the most reliable cues that
  // an object was made rather than computed. A cylinder has none.
  const plinthProfile = [
    [0, 0],
    [PLINTH_RADIUS * 1.06 - 0.02, 0],
    [PLINTH_RADIUS * 1.06, 0.022],
    [PLINTH_RADIUS * 1.008, PLINTH_HEIGHT - 0.03],
    [PLINTH_RADIUS - 0.012, PLINTH_HEIGHT - 0.008],
    [PLINTH_RADIUS - 0.034, PLINTH_HEIGHT],
    [0, PLINTH_HEIGHT]
  ].map(([radius, height]) => new three.Vector2(radius, height));
  const plinthGeometry = new three.LatheGeometry(plinthProfile, 56);
  const plinthMaterial = new three.MeshStandardMaterial({
    color: new three.Color("#EAE1D2"),
    roughness: 0.55,
    metalness: 0.04,
    envMapIntensity: 0.5
  });
  const plaqueGeometry = new three.PlaneGeometry(0.46, 0.23);
  track.geometries.push(plinthGeometry, plaqueGeometry);
  track.materials.push(plinthMaterial);

  const stands: Stand[] = [];

  gowns.forEach((gown, index) => {
    const spec = garmentSpec(gown);

    // Alternating sides, walking away from the entrance.
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const z = halfLength - 5 - row * AISLE_SPACING;
    const x = side * PLINTH_INSET;

    const group = new three.Group();
    group.position.set(x, 0, z);
    // Turn each gown a little toward the aisle so the visitor meets it
    // three-quarters on rather than side-on.
    group.rotation.y = side > 0 ? -Math.PI / 5 : Math.PI / 5;

    const plinth = new three.Mesh(plinthGeometry, plinthMaterial);
    // The lathe is built from the floor up, unlike a cylinder which is centred.
    plinth.position.y = 0;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const pool = new three.Mesh(poolGeometry, poolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.008;
    group.add(pool);

    // The gown itself, standing on the plinth.
    const built = buildGarment(three, spec, weave);
    built.group.position.y = PLINTH_HEIGHT;
    group.add(built.group);

    // The brass card, angled up toward someone standing in front of it.
    const plaqueTex = plaqueTexture(three, gown, spec);
    track.textures.push(plaqueTex);
    const plaqueMaterial = new three.MeshStandardMaterial({
      map: plaqueTex,
      roughness: 0.42,
      metalness: 0.12
    });
    track.materials.push(plaqueMaterial);
    const plaque = new three.Mesh(plaqueGeometry, plaqueMaterial);
    plaque.position.set(0, PLINTH_HEIGHT + 0.02, PLINTH_RADIUS * 0.72);
    plaque.rotation.x = -Math.PI / 2.6;
    group.add(plaque);

    scene.add(group);

    // The reflection, as a mirrored twin rather than a mirror.
    //
    // A boutique floor that does not carry the dresses standing on it is one of
    // the clearest signs a room is not real. The obvious implementation is a
    // Reflector — re-render the scene from the mirrored camera — but that plane
    // is necessarily coplanar with the floor it replaces, and the two z-fight
    // into hard-edged wedges across the stone.
    //
    // Flipping a copy of the stand through the floor plane is exact, costs one
    // extra draw instead of an extra scene render, and cannot fight with
    // anything because it is nowhere near the surface. It is also what the
    // reflection physically *is* for a flat mirror.
    if (quality === "high") {
      const reflection = group.clone(true);
      reflection.scale.y = -1;

      reflection.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;

        const source = mesh.material as THREE.Material;
        const faded = source.clone();
        faded.transparent = true;
        faded.opacity = 0.26;
        // Never occlude: this is an image lying under a polished surface, not
        // an object, so it must not write depth or take part in sorting fights.
        faded.depthWrite = false;
        // Mirroring inverts the winding, so back faces become front ones.
        faded.side = three.DoubleSide;
        mesh.material = faded;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        track.materials.push(faded);
      });

      // Drawn before the floor, which then blends over it as polish.
      reflection.renderOrder = -1;
      scene.add(reflection);
    }

    stands.push({ gown, spec, position: new three.Vector3(x, 0, z), group, built });
  });

  const builtGarments = stands.map((stand) => stand.built).filter(Boolean) as BuiltGarment[];

  return {
    scene,
    stands,
    bounds: { x: HALL_HALF_WIDTH - 0.5, z: halfLength - 0.5 },
    entrance: new three.Vector3(0, 0, halfLength - 1.8),
    dispose() {
      for (const garment of builtGarments) disposeGarment(garment);
      for (const geometry of track.geometries) geometry.dispose();
      for (const material of track.materials) material.dispose();
      for (const texture of track.textures) texture.dispose();
      surfaces.marble.dispose();
      surfaces.plaster.dispose();
      surfaces.brass.dispose();
      fineWeave.dispose();
      openWeave.dispose();
      environment.dispose();
      scene.clear();
    }
  };
}

/**
 * How close the visitor has to be for a gown to be theirs to open.
 *
 * The plinths stand 2.5 m off the centre line, so anything tighter than that
 * only registers once the visitor has left the aisle and walked right up to the
 * gown — and the card then flickers on and off as they drift. This is set wide
 * enough that standing in the middle of the aisle and turning to face a gown is
 * enough to claim it, which is what someone walking a shop floor actually does.
 */
export const REACH = 3.6;
/** Plinths are solid; this is what the walker collides with. */
export const PLINTH_COLLISION_RADIUS = PLINTH_RADIUS + 0.35;
