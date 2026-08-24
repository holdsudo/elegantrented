/**
 * Building a gown out of geometry.
 *
 * The shop has no photography yet, and a showroom full of grey rectangles would
 * be worse than no showroom. So each gown is *made* — swept from the silhouette
 * its own description describes, in its own colourway, hung on a tailor's form.
 *
 * When a real photograph does exist for a gown, the plinth shows that instead
 * (see `atelier.ts`). Nothing here has to change for that to happen; this is the
 * floor, not the ceiling.
 *
 * Everything is built from primitives and disposed explicitly — a walkable room
 * holds every gown in memory at once, so leaking a geometry per gown per visit
 * would be felt.
 */

import type * as THREE from "three";
import {
  bodiceTop,
  silhouetteProfile,
  type GarmentSpec,
  type ProfilePoint
} from "@/lib/garment";

/** Physical size of a gown on its form, in metres. */
const GOWN_HEIGHT = 1.42;
/** What profile radius 1.0 means in metres — a full ballgown hem. */
const GOWN_RADIUS = 0.54;
/**
 * How far the hem sits off the plinth.
 *
 * Almost nothing: a gown on a display form breaks at the floor, and lifting it
 * even a few centimetres exposes the stand's stem and foot underneath, which
 * instantly reads as a short dress on a pole rather than as a gown.
 */
const HEM_LIFT = 0.02;
/**
 * The form is cut slightly narrower than the gown's bodice.
 *
 * If the two are the same width the linen punches through the cloth at the
 * waist as a bright ring. The form only needs to be visible above the neckline,
 * so everywhere else it gives way to the garment.
 */
const FORM_SCALE = 0.84;

/**
 * Resample the six or seven landmark points into a smooth outline.
 *
 * A lathe swept through the raw landmarks reads as a stack of cones. Cloth does
 * not have corners, so the profile is run through a Catmull-Rom spline first and
 * the sweep follows the curve instead of the control points.
 */
function smoothProfile(
  three: typeof THREE,
  points: ProfilePoint[],
  steps: number
): THREE.Vector2[] {
  const curve = new three.CatmullRomCurve3(
    points.map((point) => new three.Vector3(point.radius, point.height, 0)),
    false,
    "catmullrom",
    0.5
  );

  return curve.getPoints(steps).map((point) => {
    // A radius that dips below zero on an overshooting spline turns the mesh
    // inside out, so the curve is clamped rather than trusted.
    return new three.Vector2(Math.max(point.x, 0.02) * GOWN_RADIUS, point.y * GOWN_HEIGHT);
  });
}

/**
 * Push the folds into the sweep.
 *
 * A lathe is perfectly round; cloth is not. Each vertex is nudged in and out
 * along its own radius by a sine wave running around the body, with a second,
 * finer wave beating against it so the folds do not repeat mechanically. The
 * amplitude grows toward the hem, because that is where fabric has slack to
 * gather — a bodice is fitted and stays smooth.
 */
function foldGeometry(geometry: THREE.BufferGeometry, spec: GarmentSpec) {
  const position = geometry.attributes.position;
  const phase = spec.seed * Math.PI * 2;

  // Tulle gathers in many shallow folds; satin falls in a few deep ones.
  const depth = spec.fabric === "tulle" ? 0.018 : spec.fabric === "satin" ? 0.032 : 0.024;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);

    const radius = Math.hypot(x, z);
    if (radius < 0.001) continue;

    const theta = Math.atan2(z, x);
    const heightFraction = Math.min(Math.max(y / (GOWN_HEIGHT * bodiceTop(spec)), 0), 1);

    // Slack accumulates downward: none at the shoulder, all of it at the hem.
    const slack = (1 - heightFraction) ** 1.6;

    const primary = Math.sin(theta * spec.folds + phase);
    const secondary = Math.sin(theta * (spec.folds * 1.7) + phase * 2.3) * 0.4;

    // Folds gather OUTWARD only.
    //
    // A centred wave pushes half its vertices inward, and inward is where the
    // dress form is — the linen then punches through the cloth as a ring of
    // white teeth around the hip. It is also simply wrong: fabric drapes away
    // from the body it hangs on, it does not pass through it. So the wave is
    // remapped from [-1,1] to [0,1] and only ever adds.
    const wave = (primary + secondary) / 1.4;
    const offset = (wave * 0.5 + 0.5) * depth * slack;

    const scaled = (radius + offset) / radius;
    position.setX(index, x * scaled);
    position.setZ(index, z * scaled);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** The cloth itself. Sheen is what separates velvet from satin at a glance. */
function clothMaterial(three: typeof THREE, spec: GarmentSpec): THREE.MeshPhysicalMaterial {
  const material = new three.MeshPhysicalMaterial({
    color: new three.Color(spec.palette.base),
    roughness: spec.roughness,
    metalness: 0,
    side: three.DoubleSide,
    // Sheen is three's cloth term — the soft rim of light along a fold that
    // makes velvet read as velvet rather than as dark plastic.
    sheen: 1,
    sheenRoughness: Math.min(spec.roughness + 0.2, 1),
    sheenColor: new three.Color(spec.palette.highlight)
  });

  // Satin and beading get a lacquer coat, which is what produces the hard
  // highlight that slides across the fabric as you walk past it.
  if (spec.fabric === "satin" || spec.fabric === "beaded") {
    material.clearcoat = spec.sheen;
    material.clearcoatRoughness = 0.12;
  }

  // Note what is deliberately NOT here: transparency.
  //
  // Tulle and chiffon are sheer, and the obvious move is to make the whole gown
  // translucent. It is wrong twice over. Physically, a tulle skirt is an opaque
  // lining with sheer layers gathered over it — you cannot see the wearer's legs
  // through a ballgown. And technically, two stacked depth-writing transparent
  // surfaces cannot be sorted reliably, so they punch holes in each other and
  // the stand shows through the skirt.
  //
  // So the body of every gown is opaque, and sheerness is expressed by the one
  // thing that is genuinely sheer: the overlay in `buildGarment`.
  return material;
}

/**
 * The tailor's form the gown hangs on.
 *
 * A dress form, not a human figure — a shop displays gowns on a stand, and a
 * mannequin with a face invites the viewer to judge the face. Linen bust, brass
 * neck stem, turned wooden foot.
 */
function dressForm(three: typeof THREE, group: THREE.Group, track: Disposables) {
  const linen = new three.MeshPhysicalMaterial({
    color: new three.Color("#E8E0D2"),
    roughness: 0.85,
    sheen: 0.6,
    sheenColor: new three.Color("#FFFFFF")
  });
  const brass = new three.MeshStandardMaterial({
    color: new three.Color("#B08D57"),
    roughness: 0.32,
    metalness: 0.9
  });
  const walnut = new three.MeshStandardMaterial({
    color: new three.Color("#3A2A1E"),
    roughness: 0.45,
    metalness: 0.05
  });
  track.materials.push(linen, brass, walnut);

  // The torso: shoulder, bust, waist, hip, cut off at the top of the skirt.
  const torsoProfile = [
    [0.2, 0.0],
    [0.21, 0.1],
    [0.185, 0.22],
    [0.168, 0.34],
    [0.196, 0.46],
    [0.204, 0.56],
    [0.17, 0.66],
    [0.11, 0.72]
  ].map(([radius, height]) => new three.Vector2(radius * FORM_SCALE, height));

  const torso = new three.LatheGeometry(torsoProfile, 48);
  track.geometries.push(torso);
  const torsoMesh = new three.Mesh(torso, linen);
  torsoMesh.position.y = 0.74;
  torsoMesh.castShadow = true;
  group.add(torsoMesh);

  // Brass stem down to the foot.
  const stem = new three.CylinderGeometry(0.018, 0.018, 0.74, 12);
  track.geometries.push(stem);
  const stemMesh = new three.Mesh(stem, brass);
  stemMesh.position.y = 0.37;
  group.add(stemMesh);

  const foot = new three.CylinderGeometry(0.17, 0.2, 0.045, 32);
  track.geometries.push(foot);
  const footMesh = new three.Mesh(foot, walnut);
  footMesh.position.y = 0.022;
  footMesh.castShadow = true;
  group.add(footMesh);
}

/** Everything a garment allocates, so it can all be handed back. */
export type Disposables = {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
};

export type BuiltGarment = {
  group: THREE.Group;
  disposables: Disposables;
};

/**
 * Build one gown on its form, standing on the floor at the group's origin.
 *
 * The returned group is roughly 2.2 m tall and 1.1 m across at the widest, which
 * is what the plinth spacing in `atelier.ts` is set from.
 */
export function buildGarment(three: typeof THREE, spec: GarmentSpec): BuiltGarment {
  const group = new three.Group();
  const disposables: Disposables = { geometries: [], materials: [] };

  dressForm(three, group, disposables);

  // The gown. Radial segments are generous because the folds are carried in the
  // vertices — too few and the silhouette reads as a polygon at close range,
  // and in a walkable room the visitor gets very close.
  const profile = smoothProfile(three, silhouetteProfile(spec), 64);
  const cloth = new three.LatheGeometry(profile, 96);
  foldGeometry(cloth, spec);
  disposables.geometries.push(cloth);

  const material = clothMaterial(three, spec);
  disposables.materials.push(material);

  const gown = new three.Mesh(cloth, material);
  gown.position.y = HEM_LIFT;
  gown.castShadow = true;
  gown.receiveShadow = true;
  group.add(gown);

  // Tulle is layers. One sweep of it looks like a plastic cone; the second,
  // slightly wider and softer, is what reads as a skirt you could rustle.
  if (spec.fabric === "tulle") {
    const overProfile = smoothProfile(three, silhouetteProfile(spec), 64).map(
      (point) => new three.Vector2(point.x * 1.06, point.y * 0.98)
    );
    const over = new three.LatheGeometry(overProfile, 72);
    foldGeometry(over, { ...spec, folds: Math.round(spec.folds * 0.6), seed: spec.seed + 0.3 });
    disposables.geometries.push(over);

    // The sheer layer, and the only transparent surface on the gown. It does not
    // write depth: it is gauze floating over the lining, so it must never
    // occlude what is behind it, including the rest of itself.
    const overMaterial = material.clone();
    overMaterial.transparent = true;
    overMaterial.opacity = 0.42;
    overMaterial.depthWrite = false;
    overMaterial.roughness = Math.min(spec.roughness + 0.15, 1);
    disposables.materials.push(overMaterial);

    const overlay = new three.Mesh(over, overMaterial);
    overlay.position.y = HEM_LIFT;
    group.add(overlay);
  }

  // Beading is not a texture at this range — it is points of light caught on
  // the bodice. A sparse instanced scatter costs almost nothing and is the
  // difference between "beaded bodice" as a claim and as a thing you can see.
  if (spec.fabric === "beaded") {
    const bead = new three.SphereGeometry(0.008, 6, 5);
    const beadMaterial = new three.MeshStandardMaterial({
      color: new three.Color(spec.palette.accent),
      roughness: 0.1,
      metalness: 0.85
    });
    disposables.geometries.push(bead);
    disposables.materials.push(beadMaterial);

    const count = 220;
    const beads = new three.InstancedMesh(bead, beadMaterial, count);
    const matrix = new three.Matrix4();
    const top = bodiceTop(spec);

    for (let index = 0; index < count; index += 1) {
      // Deterministic scatter, from the gown's own seed — the beading sits in
      // the same places every visit.
      const a = Math.sin(index * 12.9898 + spec.seed * 78.233) * 43758.5453;
      const b = Math.sin(index * 39.3467 + spec.seed * 11.135) * 24634.6345;
      const u = a - Math.floor(a);
      const v = b - Math.floor(b);

      // Bodice only: from the waist to the neckline.
      const heightFraction = 0.72 + v * (top - 0.74);
      const y = heightFraction * GOWN_HEIGHT + HEM_LIFT;
      const theta = u * Math.PI * 2;
      const radius = (0.3 + (1 - heightFraction) * 0.09) * GOWN_RADIUS + 0.004;

      matrix.makeTranslation(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
      beads.setMatrixAt(index, matrix);
    }
    beads.instanceMatrix.needsUpdate = true;
    group.add(beads);
  }

  return { group, disposables };
}

/** Hand back every geometry and material a garment allocated. */
export function disposeGarment(built: BuiltGarment) {
  for (const geometry of built.disposables.geometries) geometry.dispose();
  for (const material of built.disposables.materials) material.dispose();
}
