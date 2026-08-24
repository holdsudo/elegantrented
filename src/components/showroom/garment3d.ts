/**
 * Building a gown out of geometry.
 *
 * The shop has no photography yet, and a showroom full of grey rectangles would
 * be worse than no showroom. So each gown is *made* — from the silhouette its
 * own description describes, in its own colourway, hung on a tailor's form.
 *
 * The geometry itself lives in `cloth.ts`, and the reason it earns its own
 * module is exactly what was wrong with the first version: these were lathes,
 * and a lathe is a vase. Circular in section, mirror-symmetric, folded by a sine
 * wave. Everything here now works from an elliptical grid with an irregular
 * fold field, which separates "dress" from "turned object" far more than any
 * amount of lighting ever could.
 *
 * When a real photograph does exist for a gown, the plinth shows that instead.
 * Nothing here has to change for that to happen; this is the floor, not the
 * ceiling.
 */

import type * as THREE from "three";
import { bodiceTop, necklineAt, type GarmentSpec } from "@/lib/garment";
import { buildClothGeometry, buildFormGeometry, DEPTH_RATIO } from "./cloth";

/** Physical size of a gown on its form, in metres. */
const GOWN_HEIGHT = 1.42;
/** What profile radius 1.0 means in metres — a full ballgown hem. */
const GOWN_RADIUS = 0.54;
/**
 * The form is cut inside the gown's own silhouette.
 *
 * Wherever the linen is wider than the cloth it punches through as a bright
 * ring at the hip. The margin needed is not constant — a mermaid draws in to a
 * third of its hem through the thigh while a ballgown never comes near — so the
 * form is simply cut narrow enough to clear the tightest of them.
 */
const FORM_SCALE = 0.7;

/** Fine weave for satins and silks, open weave for tulle and lace. */
export type Weave = { fine: THREE.Texture; open: THREE.Texture };

/** The cloth itself. Sheen is what separates velvet from satin at a glance. */
function clothMaterial(
  three: typeof THREE,
  spec: GarmentSpec,
  weave?: Weave | null
): THREE.MeshPhysicalMaterial {
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

  // The weave. This is what stops satin reading as painted plastic: cloth is
  // threads crossing threads, and at the distance a visitor stops from a plinth
  // that structure is right at the edge of visible, so the travelling highlight
  // breaks into thousands of facets instead of sliding as one sheet.
  if (weave) {
    const open = spec.fabric === "tulle" || spec.fabric === "lace" || spec.fabric === "chiffon";
    material.normalMap = open ? weave.open : weave.fine;
    const depth = spec.fabric === "velvet" ? 0.5 : open ? 0.42 : 0.24;
    material.normalScale = new three.Vector2(depth, depth);
  }

  if (spec.fabric === "satin" || spec.fabric === "beaded") {
    material.clearcoat = spec.sheen;
    material.clearcoatRoughness = 0.12;
  }

  // Deliberately not transparent, even for tulle. Physically a sheer skirt is an
  // opaque lining with gauze gathered over it — you cannot see legs through a
  // ballgown — and technically two stacked depth-writing transparent surfaces
  // cannot be sorted, so they punch holes in each other. Sheerness is expressed
  // by the one genuinely sheer thing: the overlay in buildGarment.
  return material;
}

/**
 * The tailor's form the gown hangs on.
 *
 * A dress form, not a human figure — a shop displays gowns on a stand, and a
 * mannequin with a face invites the viewer to judge the face.
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

  const torso = buildFormGeometry(three, FORM_SCALE, 0.78);
  track.geometries.push(torso);
  const torsoMesh = new three.Mesh(torso, linen);
  torsoMesh.position.y = 0.72;
  torsoMesh.castShadow = true;
  group.add(torsoMesh);

  const stem = new three.CylinderGeometry(0.016, 0.016, 0.72, 12);
  track.geometries.push(stem);
  const stemMesh = new three.Mesh(stem, brass);
  stemMesh.position.y = 0.36;
  group.add(stemMesh);

  const foot = new three.CylinderGeometry(0.15, 0.185, 0.04, 32);
  track.geometries.push(foot);
  const footMesh = new three.Mesh(foot, walnut);
  footMesh.position.y = 0.02;
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
export function buildGarment(
  three: typeof THREE,
  spec: GarmentSpec,
  weave?: Weave | null
): BuiltGarment {
  const group = new three.Group();
  const disposables: Disposables = { geometries: [], materials: [] };

  dressForm(three, group, disposables);

  const cloth = buildClothGeometry(three, spec, {
    height: GOWN_HEIGHT,
    radius: GOWN_RADIUS
  });
  disposables.geometries.push(cloth);

  const material = clothMaterial(three, spec, weave);
  disposables.materials.push(material);

  const gown = new three.Mesh(cloth, material);
  gown.castShadow = true;
  gown.receiveShadow = true;
  group.add(gown);

  // Tulle is layers. One skirt of it looks like a plastic cone; a second, wider
  // and softer and sheer, is what reads as something you could rustle.
  if (spec.fabric === "tulle") {
    const over = buildClothGeometry(
      three,
      // A different seed drapes the overlay differently, so the two layers
      // cross rather than settling into register — which is the entire visual
      // point of an overlay.
      { ...spec, seed: (spec.seed + 0.41) % 1 },
      {
        height: GOWN_HEIGHT * 0.985,
        radius: GOWN_RADIUS * 1.04,
        rings: 44,
        columns: 80,
        // Gauze carries even more surplus than the lining under it.
        fullnessScale: 1.12
      }
    );
    disposables.geometries.push(over);

    const overMaterial = material.clone();
    overMaterial.transparent = true;
    overMaterial.opacity = 0.42;
    // Gauze floating over a lining: it must never occlude, including itself.
    overMaterial.depthWrite = false;
    overMaterial.roughness = Math.min(spec.roughness + 0.15, 1);
    disposables.materials.push(overMaterial);

    group.add(new three.Mesh(over, overMaterial));
  }

  // Straps, where the gown has them.
  //
  // A neckline curve alone cannot hold a halter up, and an off-shoulder gown is
  // defined by the band that sits below the shoulder rather than by the cut of
  // its bodice. Both are separate pieces on a real garment and both are
  // separate geometry here — small, but they are the whole difference between
  // "strapless gown" and the five different necklines the shop actually writes.
  if (spec.neckline === "halter" || spec.neckline === "offShoulder") {
    const strapMaterial = material.clone();
    strapMaterial.side = three.DoubleSide;
    disposables.materials.push(strapMaterial);

    if (spec.neckline === "halter") {
      // Two straps from the front of the bodice up to the nape.
      const top = necklineAt(spec, 0) * GOWN_HEIGHT;
      for (const side of [-1, 1]) {
        const path = new three.CatmullRomCurve3([
          new three.Vector3(GOWN_RADIUS * 0.22 * side, top - 0.02, GOWN_RADIUS * 0.16),
          new three.Vector3(GOWN_RADIUS * 0.2 * side, top + 0.12, GOWN_RADIUS * 0.05),
          new three.Vector3(GOWN_RADIUS * 0.1 * side, top + 0.2, -GOWN_RADIUS * 0.08)
        ]);
        const strap = new three.TubeGeometry(path, 18, 0.012, 6, false);
        disposables.geometries.push(strap);
        const mesh = new three.Mesh(strap, strapMaterial);
        mesh.castShadow = true;
        group.add(mesh);
      }
    } else {
      // A band around the arms, sitting below the shoulder — a flattened torus
      // rather than a ring, because it follows the same ellipse the body does.
      const band = new three.TorusGeometry(GOWN_RADIUS * 0.42, 0.016, 8, 48);
      disposables.geometries.push(band);
      const mesh = new three.Mesh(band, strapMaterial);
      mesh.rotation.x = Math.PI / 2;
      mesh.scale.z = DEPTH_RATIO;
      mesh.position.y = necklineAt(spec, 0) * GOWN_HEIGHT + 0.055;
      mesh.castShadow = true;
      group.add(mesh);
    }
  }

  // Beading is not a texture at this range — it is points of light caught on the
  // bodice. A sparse instanced scatter costs almost nothing and is the
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

    const count = 260;
    const beads = new three.InstancedMesh(bead, beadMaterial, count);
    const matrix = new three.Matrix4();
    const top = bodiceTop(spec);

    for (let index = 0; index < count; index += 1) {
      // Deterministic scatter from the gown's own seed, so the beading sits in
      // the same places on every visit.
      const a = Math.sin(index * 12.9898 + spec.seed * 78.233) * 43758.5453;
      const b = Math.sin(index * 39.3467 + spec.seed * 11.135) * 24634.6345;
      const u = a - Math.floor(a);
      const v = b - Math.floor(b);

      const heightFraction = 0.7 + v * (top - 0.72);
      const y = heightFraction * GOWN_HEIGHT;
      const theta = u * Math.PI * 2;
      const radius = (0.3 + (1 - heightFraction) * 0.09) * GOWN_RADIUS + 0.005;

      // Follows the same ellipse the bodice does, or the beading floats off the
      // front and back of the gown.
      matrix.makeTranslation(
        Math.cos(theta) * radius,
        y,
        Math.sin(theta) * radius * DEPTH_RATIO
      );
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
