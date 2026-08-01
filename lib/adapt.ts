/**
 * Turning a scraped ingredient list into macros, and rewriting it toward a
 * macro target. Kept out of the route handler so it can be exercised without
 * a network round trip.
 */

import {
  Macros,
  SWAP_RULES,
  SwapRule,
  emptyMacros,
  lookupNutrition,
  measureToGrams,
  scaleMacros,
} from "./nutrition";
import { bestFitPortion, fitError } from "./fit";

/* ---------- Trivial-ingredient detection (salt, pepper, water...) ---------- */

const LEADING_AMOUNT =
  /^[\d\s/.,½¼¾⅓⅔⅛()-]*\s*(cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pinch(es)? of|dash(es)? of|pinch(es)?|dash(es)?|grams?|g\b|kgs?|ozs?|ounces?|lbs?|pounds?|ml|liters?|litres?|cans? of|cans?)?\s*(of\s+)?/i;

const TRIVIAL_PATTERNS: RegExp[] = [
  /^(fine |sea |kosher |table |coarse |flaky |iodized |pink |himalayan )*salt\b/i,
  /^(fresh(ly)? |ground |cracked |black |white |red |cayenne |crushed )*pepper(corns?)?( flakes)?\b/i,
  /^(cold |warm |hot |boiling |ice(d)? )*water\b/i,
  /^ice( cubes?)?\b/i,
  /salt (and|&) (freshly ground |ground |black )*pepper/i,
  /^baking (powder|soda)\b/i,
  /^(a )?(pinch|dash) of/i,
  /to taste/i,
];

export function isTrivial(ingredientText: string): boolean {
  const stripped = ingredientText
    .toLowerCase()
    .replace(LEADING_AMOUNT, "")
    .trim();
  return TRIVIAL_PATTERNS.some(
    (re) => re.test(stripped) || re.test(ingredientText.toLowerCase()),
  );
}

/* ---------- Ingredient text -> grams ---------- */

export function ingredientToGrams(text: string): number | null {
  // "1 (14 oz) can ..." / "2 (400g) tins ..." — parenthetical package size
  const pkg = text.match(
    /\((\d+(?:\.\d+)?)\s*-?\s*(oz|ounces?|g|grams?|ml|lbs?|pounds?)\.?\)/i,
  );
  if (pkg) {
    const amount = parseFloat(pkg[1]);
    const unit = pkg[2].toLowerCase();
    const grams =
      unit.startsWith("oz") || unit.startsWith("ounce")
        ? amount * 28.35
        : unit.startsWith("lb") || unit.startsWith("pound")
          ? amount * 453.6
          : amount; // g or ml
    const countMatch = text.match(/^(\d+(?:\.\d+)?)\s*\(/);
    const count = countMatch ? parseFloat(countMatch[1]) : 1;
    return count * grams;
  }
  // Otherwise the whole string works as a measure ("2 cups heavy cream")
  return measureToGrams(text, text);
}

/* ---------- Ingredient analysis ---------- */

export interface AnalyzedIngredient {
  text: string;
  skipped: boolean;
  grams: number | null;
  macros: Macros | null;
}

export function analyzeIngredient(raw: string): AnalyzedIngredient {
  const text = raw.replace(/\s+/g, " ").trim();
  if (isTrivial(text)) {
    return { text, skipped: true, grams: null, macros: null };
  }
  const nutrition = lookupNutrition(text);
  let grams = ingredientToGrams(text);
  if (!nutrition || grams === null) {
    return { text, skipped: false, grams: null, macros: null };
  }
  // Frying oil mostly stays in the pan — count ~20% as consumed
  if (/oil/i.test(text) && /for (deep[- ])?frying/i.test(text)) {
    grams *= 0.2;
  }
  return {
    text,
    skipped: false,
    grams: Math.round(grams),
    macros: {
      calories: (nutrition.per100g.calories * grams) / 100,
      protein: (nutrition.per100g.protein * grams) / 100,
      carbs: (nutrition.per100g.carbs * grams) / 100,
      fat: (nutrition.per100g.fat * grams) / 100,
    },
  };
}

export function sumIngredients(list: AnalyzedIngredient[]): Macros {
  const total = emptyMacros();
  for (const ing of list) {
    if (!ing.macros) continue;
    total.calories += ing.macros.calories;
    total.protein += ing.macros.protein;
    total.carbs += ing.macros.carbs;
    total.fat += ing.macros.fat;
  }
  return total;
}

/* ---------- Adapting a recipe to a macro target ---------- */

/**
 * Rewrite one ingredient line in place: "1 cup heavy cream, divided" with the
 * heavy-cream rule becomes "1 cup evaporated milk, divided". The replacement
 * keeps its capitalization only at the start of the line, so it doesn't read
 * as a proper noun mid-sentence.
 */
export function applySwap(text: string, rule: SwapRule): string | null {
  const match = text.match(rule.pattern);
  if (match?.index === undefined) return null;
  const replacement =
    match.index === 0
      ? rule.replacement
      : rule.replacement.charAt(0).toLowerCase() + rule.replacement.slice(1);
  return text.replace(rule.pattern, replacement);
}

export interface AppliedSwap {
  original: string;
  replacement: string;
  reason: string;
}

/**
 * Greedily swap ingredients toward the user's macro ratio.
 *
 * Every swap is judged, not assumed: a candidate is kept only if it lowers
 * fitError against *this* target. That matters because the rules aren't
 * universally good — swapping butter for light butter helps someone cutting
 * fat and hurts someone targeting it. Each round applies the single best
 * remaining swap and re-scores, so interacting swaps are measured against the
 * recipe as it actually stands rather than against the original.
 */
export function adaptToTarget(
  base: AnalyzedIngredient[],
  target: Macros,
  servings: number | null,
): { ingredients: AnalyzedIngredient[]; swaps: AppliedSwap[] } {
  const basisOf = (list: AnalyzedIngredient[]) => {
    const totals = sumIngredients(list);
    return servings ? scaleMacros(totals, 1 / servings) : totals;
  };

  const ingredients = [...base];
  const swaps: AppliedSwap[] = [];
  const swapped = new Set<number>();

  for (;;) {
    let bestError = fitError(basisOf(ingredients), target);
    let bestIdx = -1;
    let bestRule: SwapRule | null = null;
    let bestText = "";

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (swapped.has(i) || ing.skipped || !ing.macros) continue;

      for (const rule of SWAP_RULES) {
        const text = applySwap(ing.text, rule);
        if (text === null) continue;

        // First matching rule wins for a given ingredient, whether or not it
        // turns out to help — same precedence the plan route uses.
        const before = lookupNutrition(ing.text)?.key;
        const after = lookupNutrition(text)?.key;
        const candidate = analyzeIngredient(text);
        if (after && before !== after && candidate.macros) {
          const trial = [...ingredients];
          trial[i] = candidate;
          const error = fitError(basisOf(trial), target);
          if (error < bestError - 1e-9) {
            bestError = error;
            bestIdx = i;
            bestRule = rule;
            bestText = text;
          }
        }
        break;
      }
    }

    if (bestIdx === -1 || !bestRule) break;
    swaps.push({
      original: ingredients[bestIdx].text,
      replacement: bestText,
      reason: bestRule.reason,
    });
    ingredients[bestIdx] = analyzeIngredient(bestText);
    swapped.add(bestIdx);
  }

  return { ingredients, swaps };
}

/** Everything the route needs to describe an adapted recipe. */
export function buildAdaptation(
  ingredients: AnalyzedIngredient[],
  target: Macros,
  servings: number | null,
) {
  const { ingredients: adaptedIngredients, swaps } = adaptToTarget(
    ingredients,
    target,
    servings,
  );
  const totals = sumIngredients(adaptedIngredients);
  const basisMacros = servings ? scaleMacros(totals, 1 / servings) : totals;
  const fitMultiplier = bestFitPortion(basisMacros, target);
  return {
    swaps,
    ingredients: adaptedIngredients,
    totals,
    perServing: servings ? basisMacros : null,
    fitMultiplier: Math.round(fitMultiplier * 100) / 100,
    fittedMacros: scaleMacros(basisMacros, fitMultiplier),
    // Without a published yield the fit is against the whole recipe, so the
    // UI has to say "of the whole recipe" rather than "servings".
    basis: servings ? ("serving" as const) : ("recipe" as const),
  };
}
