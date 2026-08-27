/**
 * Turning a scraped ingredient list into macros, and rewriting it toward a
 * macro target. Kept out of the route handler so it can be exercised without
 * a network round trip.
 */

import type { Macros } from "./nutrition";
import {
  emptyMacros,
  foodMacros,
  lookupNutrition,
  measureToGrams,
  scaleMacros,
} from "./nutrition";
import type { SwapCandidate } from "./swaps";
import { candidatesFor } from "./swaps";
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

/* ---------- Ingredient text -> the food it names ---------- */

const PREP_WORDS =
  /\b(chopped|diced|minced|sliced|shredded|grated|crushed|ground|melted|softened|room temperature|packed|drained|rinsed|peeled|seeded|halved|quartered|cubed|julienned|trimmed|boneless|skinless|thinly|roughly|finely|freshly|fresh|dried|frozen|canned|cooked|uncooked|raw|large|small|medium|extra|plus more|for serving|for garnish|divided|optional|to taste)\b/gi;

const MEASURE_PREFIX =
  /^[\d\s/.,½¼¾⅓⅔⅛-]*\s*(cups?|tablespoons?|tbsps?|tbsp|tbls?|teaspoons?|tsps?|tsp|grams?|g|kgs?|kg|ozs?|oz|ounces?|lbs?|pounds?|ml|millilitres?|milliliters?|liters?|litres?|l|cloves?|cans?|tins?|sticks?|slices?|pinch(es)?|dash(es)?|handfuls?|sprigs?|leaves|packages?|packets?|bunch(es)?)?\s*(of\s+)?/i;

/**
 * Reduce an ingredient line to the bare food it names, for an external
 * nutrition lookup: "2 cups finely chopped butternut squash, divided" becomes
 * "butternut squash".
 *
 * Only used for ingredients the built-in table missed, so it can afford to be
 * aggressive. Whatever survives is what gets searched.
 */
export function foodTerm(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/,.*$/, " ")
    .replace(MEASURE_PREFIX, " ")
    .replace(PREP_WORDS, " ")
    .replace(/[^a-z\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ---------- Ingredient analysis ---------- */

export interface IngredientOverride {
  /** Pin the food this line resolves to (a nutrition-table key). */
  foodKey?: string | null;
  /** Pin the weight, when the parser guessed badly or gave up. */
  grams?: number | null;
  /** Leave this line out of the totals entirely. */
  exclude?: boolean;
}

export interface AnalyzedIngredient {
  text: string;
  skipped: boolean;
  grams: number | null;
  macros: Macros | null;
  /** Which nutrition entry this line matched, so the UI can show its work. */
  matchKey: string | null;
  matchSource: "table" | "external" | null;
  /** True when the user, not the parser, decided this line's food or weight. */
  editedFood: boolean;
  editedGrams: boolean;
  excluded: boolean;
}

function build(
  text: string,
  over: Partial<AnalyzedIngredient>,
): AnalyzedIngredient {
  return {
    text,
    skipped: false,
    grams: null,
    macros: null,
    matchKey: null,
    matchSource: null,
    editedFood: false,
    editedGrams: false,
    excluded: false,
    ...over,
  };
}

export function analyzeIngredient(
  raw: string,
  override?: IngredientOverride,
): AnalyzedIngredient {
  const text = raw.replace(/\s+/g, " ").trim();

  if (override?.exclude) {
    return build(text, { skipped: true, excluded: true });
  }
  // A pinned food means the user has already told us this line counts, so the
  // seasoning heuristic doesn't get to overrule them.
  if (!override?.foodKey && isTrivial(text)) {
    return build(text, { skipped: true });
  }

  const pinnedKey = override?.foodKey ?? null;
  const pinned = pinnedKey ? foodMacros(pinnedKey) : null;
  const hit = pinnedKey
    ? pinned
      ? { key: pinnedKey, per100g: pinned, source: "table" as const }
      : null
    : lookupNutrition(text);

  let grams =
    override?.grams != null && Number.isFinite(override.grams)
      ? override.grams
      : ingredientToGrams(text);

  if (!hit || grams === null) {
    return build(text, {
      grams: grams === null ? null : Math.round(grams),
      matchKey: hit?.key ?? null,
      matchSource: hit?.source ?? null,
      editedFood: pinnedKey !== null,
      editedGrams: override?.grams != null,
    });
  }

  // Frying oil mostly stays in the pan — count ~20% as consumed. A weight the
  // user typed in is taken at face value; they can see the line.
  if (
    override?.grams == null &&
    /oil/i.test(text) &&
    /for (deep[- ])?frying/i.test(text)
  ) {
    grams *= 0.2;
  }

  return build(text, {
    grams: Math.round(grams),
    matchKey: hit.key,
    matchSource: hit.source,
    editedFood: pinnedKey !== null,
    editedGrams: override?.grams != null,
    macros: {
      calories: (hit.per100g.calories * grams) / 100,
      protein: (hit.per100g.protein * grams) / 100,
      carbs: (hit.per100g.carbs * grams) / 100,
      fat: (hit.per100g.fat * grams) / 100,
    },
  });
}

export function analyzeAll(
  lines: string[],
  overrides: Record<number, IngredientOverride> = {},
): AnalyzedIngredient[] {
  return lines.map((line, i) => analyzeIngredient(line, overrides[i]));
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

export interface AppliedSwap {
  id: string;
  ingredientIndex: number;
  original: string;
  replacement: string;
  reason: string;
  source: "rule" | "family";
  /** Fit error before and after this swap, in the order they were applied. */
  errorBefore: number;
  errorAfter: number;
  /** What the swap did to the finished portion, macro by macro. */
  delta: Macros;
}

export interface RejectedSwap {
  id: string;
  ingredientIndex: number;
  original: string;
  replacement: string;
  reason: string;
  source: "rule" | "family";
  /** Why it went unused: it made the fit worse, or the user vetoed it. */
  outcome: "no-improvement" | "vetoed";
  errorBefore: number;
  errorAfter: number;
}

export interface Adaptation {
  ingredients: AnalyzedIngredient[];
  swaps: AppliedSwap[];
  /** Candidates that were considered and passed over, with their scores. */
  rejected: RejectedSwap[];
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function macroDelta(after: Macros, before: Macros): Macros {
  return {
    calories: after.calories - before.calories,
    protein: after.protein - before.protein,
    carbs: after.carbs - before.carbs,
    fat: after.fat - before.fat,
  };
}

/**
 * Greedily swap ingredients toward the user's macro ratio.
 *
 * Every swap is judged, not assumed: a candidate is kept only if it lowers
 * fitError against *this* target. That matters because the substitutions
 * aren't universally good — trading butter for light butter helps someone
 * cutting fat and hurts someone targeting it. Each round applies the single
 * best remaining swap and re-scores, so interacting swaps are measured against
 * the recipe as it actually stands rather than against the original.
 *
 * Candidates the search passed over come back too. A swap that didn't happen
 * is a decision, and the UI presents it as one: the user can see what was on
 * the table, and veto anything that was taken.
 */
export function adaptToTarget(
  base: AnalyzedIngredient[],
  target: Macros,
  servings: number | null,
  options: {
    vetoed?: string[];
    overrides?: Record<number, IngredientOverride>;
  } = {},
): Adaptation {
  const vetoed = new Set(options.vetoed ?? []);
  const overrides = options.overrides ?? {};

  const basisOf = (list: AnalyzedIngredient[]) => {
    const totals = sumIngredients(list);
    return servings ? scaleMacros(totals, 1 / servings) : totals;
  };
  // A swapped line keeps a hand-entered weight but drops a pinned food: the
  // pin named the ingredient, and the swap is replacing that ingredient.
  const overrideFor = (i: number): IngredientOverride | undefined => {
    const o = overrides[i];
    return o?.grams != null ? { grams: o.grams } : undefined;
  };

  const ingredients = [...base];
  const swaps: AppliedSwap[] = [];
  const rejected: RejectedSwap[] = [];
  const settled = new Set<number>();

  for (;;) {
    const startError = fitError(basisOf(ingredients), target);
    let bestError = startError;
    let bestIdx = -1;
    let best: SwapCandidate | null = null;
    let bestAnalyzed: AnalyzedIngredient | null = null;
    const roundRejects: RejectedSwap[] = [];

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (settled.has(i) || ing.skipped || !ing.macros) continue;
      // A pinned food is the user's answer to "what is this line?" — leave it.
      if (ing.editedFood) continue;

      for (const cand of candidatesFor(ing.text, i)) {
        const analyzed = analyzeIngredient(cand.text, overrideFor(i));
        if (!analyzed.macros) continue;
        const trial = [...ingredients];
        trial[i] = analyzed;
        const error = fitError(basisOf(trial), target);

        if (vetoed.has(cand.id)) {
          // Recorded immediately rather than with the round's other
          // pass-overs. A veto is a fact about what the user asked for, and it
          // has to survive the case where the search then picks a *different*
          // substitution for the same line — which settles that line and stops
          // the candidate from ever being offered again.
          if (!rejected.some((x) => x.id === cand.id)) {
            rejected.push({
              id: cand.id,
              ingredientIndex: i,
              original: ing.text,
              replacement: cand.text,
              reason: cand.reason,
              source: cand.source,
              outcome: "vetoed",
              errorBefore: round4(startError),
              errorAfter: round4(error),
            });
          }
          continue;
        }
        if (error < bestError - 1e-9) {
          bestError = error;
          bestIdx = i;
          best = cand;
          bestAnalyzed = analyzed;
        } else {
          roundRejects.push({
            id: cand.id,
            ingredientIndex: i,
            original: ing.text,
            replacement: cand.text,
            reason: cand.reason,
            source: cand.source,
            outcome: "no-improvement",
            errorBefore: round4(startError),
            errorAfter: round4(error),
          });
        }
      }
    }

    if (bestIdx === -1 || !best || !bestAnalyzed) {
      // Nothing helped this round, so the search is finished and every
      // candidate still standing is a genuine pass-over worth reporting.
      for (const r of roundRejects) {
        if (!rejected.some((x) => x.id === r.id)) rejected.push(r);
      }
      break;
    }

    const before = basisOf(ingredients);
    ingredients[bestIdx] = bestAnalyzed;
    const after = basisOf(ingredients);

    swaps.push({
      id: best.id,
      ingredientIndex: bestIdx,
      original: base[bestIdx].text,
      replacement: best.text,
      reason: best.reason,
      source: best.source,
      errorBefore: round4(startError),
      errorAfter: round4(bestError),
      delta: macroDelta(after, before),
    });
    settled.add(bestIdx);
  }

  // A line that got swapped shouldn't also be listed as a missed opportunity,
  // but an explicit veto stays visible so the user can take it back.
  const usedIndexes = new Set(swaps.map((s) => s.ingredientIndex));
  return {
    ingredients,
    swaps,
    rejected: rejected.filter(
      (r) => r.outcome === "vetoed" || !usedIndexes.has(r.ingredientIndex),
    ),
  };
}

/** Everything the route needs to describe an adapted recipe. */
export function buildAdaptation(
  ingredients: AnalyzedIngredient[],
  target: Macros,
  servings: number | null,
  options: {
    vetoed?: string[];
    overrides?: Record<number, IngredientOverride>;
  } = {},
) {
  const {
    ingredients: adaptedIngredients,
    swaps,
    rejected,
  } = adaptToTarget(ingredients, target, servings, options);
  const totals = sumIngredients(adaptedIngredients);
  const basisMacros = servings ? scaleMacros(totals, 1 / servings) : totals;
  // Rounded before the macros are computed from it, not after. The page shows
  // both, and a reader who multiplies the per-serving numbers by the portion
  // has to land on the numbers next to them.
  const fitMultiplier =
    Math.round(bestFitPortion(basisMacros, target) * 100) / 100;
  return {
    swaps,
    rejected,
    ingredients: adaptedIngredients,
    totals,
    perServing: servings ? basisMacros : null,
    fitMultiplier,
    fittedMacros: scaleMacros(basisMacros, fitMultiplier),
    // Without a published yield the fit is against the whole recipe, so the
    // UI has to say "of the whole recipe" rather than "servings".
    basis: servings ? ("serving" as const) : ("recipe" as const),
  };
}
