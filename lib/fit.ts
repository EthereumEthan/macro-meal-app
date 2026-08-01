import { Macros } from "./nutrition";

const KEYS: (keyof Macros)[] = ["calories", "protein", "carbs", "fat"];

/**
 * Portion (in servings) that best matches all four target macros at once.
 * Minimizes summed squared relative error across calories/protein/carbs/fat,
 * weighting each macro equally regardless of magnitude. Clamped to a sane
 * eating range so a badly-matched recipe never suggests "0.02 servings".
 */
export function bestFitPortion(basis: Macros, target: Macros): number {
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
  return Math.min(Math.max(num / den, 0.25), 8);
}

/**
 * How badly a recipe fits a target *after* it has been optimally portioned.
 *
 * Portioning absorbs magnitude — any recipe can be scaled to hit a calorie
 * number — so what's left is the macro *ratio*, which is the only thing an
 * ingredient swap can actually change. Lower is better; 0 is a perfect ratio
 * match. This is the score the swap search minimizes.
 */
export function fitError(basis: Macros, target: Macros): number {
  const k = bestFitPortion(basis, target);
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
