import type { Macros } from "./nutrition";

const KEYS: (keyof Macros)[] = ["calories", "protein", "carbs", "fat"];

/** Smallest and largest portion the app will ever tell someone to eat. */
export const MIN_PORTION = 0.25;
export const MAX_PORTION = 8;

/**
 * Portion (in servings) that best matches all four target macros at once.
 * Minimizes summed squared relative error across calories/protein/carbs/fat,
 * weighting each macro equally regardless of magnitude.
 *
 * Unclamped: this is the honest answer to "how much of this is a match", and
 * it's what scoring has to use. `bestFitPortion` clamps it for display.
 */
export function optimalPortion(basis: Macros, target: Macros): number {
  let num = 0;
  let den = 0;
  for (const k of KEYS) {
    if (target[k] > 0 && basis[k] > 0) {
      const r = basis[k] / target[k];
      num += r;
      den += r * r;
    }
  }
  if (den === 0) return 1;
  return num / den;
}

/**
 * The portion to actually recommend, clamped to a sane eating range so a
 * badly-matched recipe never suggests "0.02 servings" or "40 servings".
 */
export function bestFitPortion(basis: Macros, target: Macros): number {
  return Math.min(
    Math.max(optimalPortion(basis, target), MIN_PORTION),
    MAX_PORTION,
  );
}

/**
 * How badly a recipe fits a target *after* it has been optimally portioned.
 *
 * Portioning absorbs magnitude — any recipe can be scaled to hit a calorie
 * number — so what's left is the macro *ratio*, which is the only thing an
 * ingredient swap can actually change. Lower is better; 0 is a perfect ratio
 * match. This is the score the swap search minimizes.
 *
 * Scored at the *unclamped* portion on purpose. Clamping is advice about what
 * is reasonable to eat, and folding it into the score would make an oversized
 * recipe look badly-proportioned when it is merely large — which is exactly
 * the case for a pasted list with no serving count, where the whole recipe is
 * the basis. Swaps would then be chosen to fight the clamp instead of the
 * ratio.
 */
export function fitError(basis: Macros, target: Macros): number {
  const k = optimalPortion(basis, target);
  let err = 0;
  for (const key of KEYS) {
    if (target[key] > 0) {
      const ratio = (k * basis[key]) / target[key];
      err += (ratio - 1) ** 2;
    }
  }
  return err;
}

/** True when every macro in the target is a usable positive number. */
export function isValidTarget(value: unknown): value is Macros {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return KEYS.every(
    (k) => typeof m[k] === "number" && Number.isFinite(m[k]) && (m[k] as number) >= 0,
  );
}

/**
 * Portions for a whole day's worth of meals, solved together.
 *
 * `bestFitPortion` sizes one recipe against one target; a day is the same
 * problem with more unknowns. Given per-serving macros for n recipes and one
 * daily target, find the portions k_1..k_n minimizing the summed squared
 * relative error of the *combined* plate across all four macros.
 *
 * That coupling is the whole point: a day is not four recipes each fitted to a
 * quarter of the target. A carb-heavy breakfast can be paid for by a leaner
 * dinner, and only a joint solve will find that. Two recipes with
 * complementary ratios can land a day on target when neither fits alone.
 *
 * The objective is convex, so cyclic coordinate descent with each portion
 * clamped into an edible range converges to the constrained optimum. Each
 * sweep solves one portion exactly while holding the others fixed.
 *
 * Four macros constrain the solve, so from the fifth meal on — and long before
 * that, whenever two meals have similar macro ratios — many different sets of
 * portions score identically. Plain coordinate descent picks between them
 * arbitrarily, which is how two servings of the same dish come back as "3 and
 * 1". BALANCE resolves those ties toward even portions: it is a light pull
 * toward the day's mean portion, stiff enough to settle a genuine tie and far
 * too weak to overrule the macros when they actually have an opinion.
 */

// As a fraction of each meal's own curvature, so it scales with the problem
// rather than with the size of the numbers in it. Small enough that the
// day route's rounding to quarter-servings swallows any bias it introduces
// on a solve the macros do determine.
const BALANCE = 5e-3;
export function fitPortions(
  bases: Macros[],
  target: Macros,
  opts: { min?: number; max?: number; sweeps?: number } = {},
): number[] {
  const min = opts.min ?? 0.25;
  const max = opts.max ?? 4;
  // Untying a degenerate solve costs roughly 1/BALANCE sweeps; a determined
  // one converges in a handful and exits early on the movement check.
  const sweeps = opts.sweeps ?? 2000;
  if (bases.length === 0) return [];

  // Only macros with a positive target constrain the solution.
  const active = KEYS.filter((k) => target[k] > 0);
  if (active.length === 0) return bases.map(() => 1);

  // a[i][m] = how much of target macro m one serving of recipe i supplies
  const a = bases.map((b) => active.map((m) => b[m] / target[m]));
  const portions = bases.map(() => 1);

  for (let sweep = 0; sweep < sweeps; sweep++) {
    let moved = 0;
    const mean =
      portions.reduce((sum, k) => sum + k, 0) / portions.length;
    for (let j = 0; j < bases.length; j++) {
      // Residual of everything except recipe j, relative to a full target
      let num = 0;
      let den = 0;
      for (let m = 0; m < active.length; m++) {
        let others = -1;
        for (let i = 0; i < bases.length; i++) {
          if (i !== j) others += portions[i] * a[i][m];
        }
        num += a[j][m] * others;
        den += a[j][m] * a[j][m];
      }
      if (den === 0) continue;
      const pull = BALANCE * den;
      const exact = (-num + pull * mean) / (den + pull);
      const next = Math.min(Math.max(exact, min), max);
      moved = Math.max(moved, Math.abs(next - portions[j]));
      portions[j] = next;
    }
    if (moved < 1e-9) break;
  }
  return portions;
}

/** Macros of several recipes combined at the given portions. */
export function combineAtPortions(
  bases: Macros[],
  portions: number[],
): Macros {
  const total: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  bases.forEach((b, i) => {
    const k = portions[i] ?? 0;
    for (const m of KEYS) total[m] += b[m] * k;
  });
  return total;
}

/** Summed squared relative error of an already-sized plate against a target. */
export function targetError(actual: Macros, target: Macros): number {
  let err = 0;
  for (const k of KEYS) {
    if (target[k] > 0) err += (actual[k] / target[k] - 1) ** 2;
  }
  return err;
}
