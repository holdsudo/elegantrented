/**
 * The camera, rather than the eye.
 *
 * Everything in here is an artefact of photography, and that is exactly why it
 * is here. A scene rendered straight is *too* clean to read as real: perfectly
 * even corners, everything in focus at once, no grain, no falloff at the edge of
 * the frame. Those are the tells. A room shot on a real lens has none of that,
 * and adding the imperfections back is most of what separates "3D render" from
 * "photograph of a room".
 *
 * The chain, in the order the light would actually meet it:
 *
 *   1. Ambient occlusion — contact darkening where surfaces meet. The single
 *      biggest tell there is. Without it every object floats a little, however
 *      good its shadow.
 *   2. Depth of field — the gown you have stopped at is sharp and the rest of
 *      the aisle falls off, the way a fast lens at f/2 behaves. This also does
 *      real editorial work: it points at what you are meant to be looking at.
 *   3. Bloom — light coves and satin highlights bleed slightly, because real
 *      glass and a real sensor do that.
 *   4. Vignette and grain — the lens is darker at the corners and the sensor
 *      has noise. Faint enough to be subliminal; removing them makes the image
 *      look plasticky and nobody can quite say why.
 *
 * All of it is gated on device tier: the full chain on a desktop GPU, only the
 * cheap half on a phone, because a beautiful five-frames-a-second walkthrough is
 * not beautiful.
 */

import type * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";

export type Post = {
  render: () => void;
  setSize: (width: number, height: number) => void;
  /**
   * Pull focus to a distance in metres, the way a camera operator would as the
   * subject changes. Smoothed by the caller, not snapped.
   */
  setFocus: (distance: number) => void;
  dispose: () => void;
};

export function createPost(
  three: typeof THREE,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  quality: "high" | "low"
): Post {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());

  composer.addPass(new RenderPass(scene, camera));

  let ao: GTAOPass | null = null;
  let bokeh: BokehPass | null = null;

  if (quality === "high") {
    // Ambient occlusion. The radius is in world units — a boutique is a room of
    // metres, so a radius of about a quarter-metre darkens the seam where a
    // plinth meets the floor and under the hem of a skirt, without smearing
    // shadow across an entire wall.
    ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.updateGtaoMaterial({
      radius: 0.28,
      distanceExponent: 1.4,
      thickness: 0.4,
      scale: 1.0,
      samples: 16,
      screenSpaceRadius: false
    });
    composer.addPass(ao);

    // Depth of field. A modest aperture: enough that the far end of the aisle
    // softens, not so much that the room turns to soup.
    bokeh = new BokehPass(scene, camera, {
      focus: 3.0,
      aperture: 0.0008,
      maxblur: 0.005
    });
    composer.addPass(bokeh);
  }

  // Bloom, kept deliberately tight. A high threshold means only the genuinely
  // bright things bleed — the light coves, the lit archway, a hard highlight
  // sliding across satin — rather than the whole ivory room glowing.
  const bloom = new UnrealBloomPass(
    new three.Vector2(window.innerWidth, window.innerHeight),
    quality === "high" ? 0.13 : 0.1,
    0.6,
    0.94
  );
  composer.addPass(bloom);

  // Set .value, never the uniform object: the material already holds a
  // reference to it, and replacing it silently unbinds the uniform.
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.15;
  vignette.uniforms.darkness.value = 1.16;
  composer.addPass(vignette);

  // Sensor noise. Very slight — at this strength you cannot see it directly,
  // you only notice its absence.
  const film = new FilmPass(quality === "high" ? 0.16 : 0.1, false);
  composer.addPass(film);

  // Tone mapping and colour space, last, once everything is composited.
  composer.addPass(new OutputPass());

  // Size the chain only now that every pass is in it.
  //
  // EffectComposer.setSize forwards the size to the passes it currently holds,
  // so calling it before addPass leaves each pass on whatever dimensions its
  // constructor guessed — which ignore the device pixel ratio. The occlusion
  // and depth-of-field passes then sample their buffers outside the region that
  // was actually rendered, and the garbage shows up as dark wedges and coloured
  // fringes along the edges of the frame.
  composer.setSize(window.innerWidth, window.innerHeight);

  return {
    render() {
      composer.render();
    },
    setSize(nextWidth: number, nextHeight: number) {
      composer.setSize(nextWidth, nextHeight);
      ao?.setSize(nextWidth, nextHeight);
      bloom.setSize(nextWidth, nextHeight);
    },
    setFocus(distance: number) {
      if (!bokeh) return;
      const uniforms = (bokeh.materialBokeh as THREE.ShaderMaterial).uniforms;
      if (uniforms?.focus) uniforms.focus.value = distance;
    },
    dispose() {
      composer.dispose();
      ao?.dispose?.();
      bloom.dispose?.();
      vignette.dispose?.();
      film.dispose?.();
    }
  };
}
