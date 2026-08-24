/**
 * A cloth solver.
 *
 * Everything before this described folds with a formula — a sine wave, then a
 * field of harmonics. Both are wrong in the same way: a formula produces the
 * folds you asked for, evenly, forever. Real cloth folds because it has *more
 * material than it needs* and gravity forces the excess somewhere. The fabric
 * buckles, the buckles collide with each other, and what you get is irregular,
 * unevenly spaced, and merges as it climbs. Nobody can author that convincingly;
 * you have to let it happen.
 *
 * So this is position-based dynamics, run once when the gown is built:
 *
 *   1. Lay out a cloth grid with deliberate excess circumference — a skirt cut
 *      with real fullness, not one stretched tight over a cone.
 *   2. Pin the waist ring where the bodice holds it.
 *   3. Apply gravity, then satisfy distance constraints over and over. Every
 *      edge wants to keep its length; the waist will not let go; gravity pulls
 *      down. The only way the arithmetic can resolve is for the surplus to go
 *      sideways, which is buckling — folds, for free, in the right places.
 *   4. Push anything that ends up inside the dress form back out.
 *
 * The folds this produces are not decorative. They are where that particular
 * skirt, with that much fullness, in that silhouette, actually has nowhere else
 * to put the fabric.
 */

export type DrapeOptions = {
  rings: number;
  columns: number;
  /** Height of ring r, in metres, hem at index 0. */
  heightAt: (ring: number) => number;
  /** Radius the silhouette wants at ring r, in metres. */
  radiusAt: (ring: number) => number;
  /**
   * How much more fabric than the silhouette needs, per ring.
   *
   * 1.0 is a skirt stretched over a cone with nothing to spare, and it will
   * hang perfectly smooth, which is exactly what makes a rendered gown look
   * moulded. Above 1.0 the surplus has to buckle.
   */
  fullnessAt: (ring: number) => number;
  /** How deep the body is relative to how wide. */
  depthRatio: number;
  /**
   * The smallest radius the cloth may occupy at a given height.
   *
   * This is the body AND the understructure. A ballgown does not hold its shape
   * because the silk is stiff — it holds it because there is a petticoat under
   * it. Cloth hung on a form with nothing beneath simply falls straight down,
   * which is correct physics and the wrong dress.
   */
  formRadiusAt: (height: number) => number;
  /**
   * Rings held fixed at their cut position rather than left to hang.
   *
   * The bodice is fitted: it is seamed to shape and does not drape. Only the
   * skirt is free. Letting the whole garment hang from the shoulder produces a
   * sheet thrown over a stand.
   */
  isPinned?: (ring: number) => boolean;
  /** Deterministic 0..1 source, so a gown drapes identically every visit. */
  random: () => number;
  /** Solver effort. More is smoother and slower. */
  iterations?: number;
};

/**
 * Drape a skirt and hand back the settled vertex positions.
 *
 * Layout is [ring][column] with columns wrapping, three floats per particle.
 */
export function drape(options: DrapeOptions): Float32Array {
  const { rings, columns, depthRatio, random } = options;
  const count = rings * columns;

  const position = new Float32Array(count * 3);
  const previous = new Float32Array(count * 3);
  const pinned = new Uint8Array(count);

  const index = (ring: number, column: number) =>
    ring * columns + ((column + columns) % columns);

  /* ------------------------------------------------------------- layout */

  for (let ring = 0; ring < rings; ring += 1) {
    const y = options.heightAt(ring);
    const radius = options.radiusAt(ring);
    const fullness = options.fullnessAt(ring);

    for (let column = 0; column < columns; column += 1) {
      const theta = (column / columns) * Math.PI * 2;

      // Start on the silhouette, with a whisper of noise.
      //
      // A perfectly regular start is a perfectly unstable one: the surplus has
      // no reason to buckle in any particular direction, so it either does not
      // buckle at all or it buckles into a suspiciously even pattern. Real
      // fabric is never laid on perfectly. This is the symmetry break.
      const jitter = 1 + (random() - 0.5) * 0.02 * (fullness - 1 + 0.06);

      const r = radius * jitter;
      const i = index(ring, column) * 3;
      position[i] = Math.cos(theta) * r;
      position[i + 1] = y;
      position[i + 2] = Math.sin(theta) * r * depthRatio;

      previous[i] = position[i];
      previous[i + 1] = position[i + 1];
      previous[i + 2] = position[i + 2];
    }
  }

  // Pin the fitted part. The top ring always, and whatever else the caller
  // considers bodice rather than skirt.
  for (let ring = 0; ring < rings; ring += 1) {
    if (ring !== rings - 1 && !(options.isPinned?.(ring) ?? false)) continue;
    for (let column = 0; column < columns; column += 1) {
      pinned[index(ring, column)] = 1;
    }
  }

  /* --------------------------------------------------------- constraints */

  // Around each ring. This is where the fullness lives: the rest length is the
  // circumference the fabric HAS, not the one the silhouette wants.
  const ringRest = new Float32Array(rings);
  for (let ring = 0; ring < rings; ring += 1) {
    const radius = options.radiusAt(ring);
    const fullness = options.fullnessAt(ring);
    // Mean radius of an ellipse is close enough for a rest length.
    const meanRadius = radius * (1 + depthRatio) * 0.5;
    ringRest[ring] = ((2 * Math.PI * meanRadius) / columns) * fullness;
  }

  // Up each column, the vertical grain. No fullness here — a skirt is gathered
  // around, not up.
  const columnRest = new Float32Array(Math.max(rings - 1, 1));
  for (let ring = 0; ring < rings - 1; ring += 1) {
    const lower = options.heightAt(ring);
    const upper = options.heightAt(ring + 1);
    const dr = options.radiusAt(ring + 1) - options.radiusAt(ring);
    columnRest[ring] = Math.hypot(upper - lower, dr);
  }

  const iterations = options.iterations ?? 10;
  const substeps = 26;
  const gravity = -9.81;
  const dt = 1 / 60;
  // Heavy damping: this is a settle, not an animation. Nobody watches it fall.
  const damping = 0.86;

  const solveDistance = (a: number, b: number, rest: number, stiffness: number) => {
    const ia = a * 3;
    const ib = b * 3;
    const dx = position[ib] - position[ia];
    const dy = position[ib + 1] - position[ia + 1];
    const dz = position[ib + 2] - position[ia + 2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-9) return;

    const difference = (length - rest) / length;
    const wa = pinned[a] ? 0 : 1;
    const wb = pinned[b] ? 0 : 1;
    const total = wa + wb;
    if (total === 0) return;

    const scale = (difference * stiffness) / total;
    if (wa) {
      position[ia] += dx * scale;
      position[ia + 1] += dy * scale;
      position[ia + 2] += dz * scale;
    }
    if (wb) {
      position[ib] -= dx * scale;
      position[ib + 1] -= dy * scale;
      position[ib + 2] -= dz * scale;
    }
  };

  /* -------------------------------------------------------------- solve */

  for (let step = 0; step < substeps; step += 1) {
    // Verlet integration with gravity.
    for (let particle = 0; particle < count; particle += 1) {
      if (pinned[particle]) continue;
      const i = particle * 3;

      const vx = (position[i] - previous[i]) * damping;
      const vy = (position[i + 1] - previous[i + 1]) * damping;
      const vz = (position[i + 2] - previous[i + 2]) * damping;

      previous[i] = position[i];
      previous[i + 1] = position[i + 1];
      previous[i + 2] = position[i + 2];

      position[i] += vx;
      position[i + 1] += vy + gravity * dt * dt;
      position[i + 2] += vz;
    }

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      // Around the rings — the constraint that does the buckling.
      for (let ring = 0; ring < rings; ring += 1) {
        for (let column = 0; column < columns; column += 1) {
          solveDistance(index(ring, column), index(ring, column + 1), ringRest[ring], 0.9);
        }
      }

      // Up the columns.
      for (let ring = 0; ring < rings - 1; ring += 1) {
        for (let column = 0; column < columns; column += 1) {
          solveDistance(index(ring, column), index(ring + 1, column), columnRest[ring], 1);
        }
      }

      // Bend resistance, two apart around the ring.
      //
      // Without it the cloth crumples into noise instead of folding: a fold has
      // a radius because fabric resists being creased, and this is what gives a
      // satin broad soft folds and a tulle many tight ones.
      for (let ring = 0; ring < rings; ring += 1) {
        const rest = ringRest[ring] * 2;
        for (let column = 0; column < columns; column += 1) {
          solveDistance(index(ring, column), index(ring, column + 2), rest, 0.22);
        }
      }

      // Collision with the form. Nothing may end up inside the body.
      for (let particle = 0; particle < count; particle += 1) {
        if (pinned[particle]) continue;
        const i = particle * 3;
        const y = position[i + 1];
        const limit = options.formRadiusAt(y);
        if (limit <= 0) continue;

        // Measured on the ellipse the body actually is, not on a circle.
        const x = position[i];
        const z = position[i + 2] / depthRatio;
        const radius = Math.hypot(x, z);
        if (radius >= limit || radius < 1e-9) continue;

        const push = limit / radius;
        position[i] = x * push;
        position[i + 2] = z * push * depthRatio;
      }

      // The floor. A hem breaks on the surface it stands on rather than
      // passing through it.
      for (let particle = 0; particle < count; particle += 1) {
        if (pinned[particle]) continue;
        const i = particle * 3 + 1;
        if (position[i] < 0) position[i] = 0;
      }
    }
  }

  return position;
}
