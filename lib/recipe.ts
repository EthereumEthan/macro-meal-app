/**
 * The shared middle of the app: everything between "here are some ingredient
 * lines" and "here is a recipe adapted to your macros, priced and portioned".
 *
 * All four routes converge here — a pasted URL, a hand-typed list, a dish name
 * looked up on TheMealDB, and a whole day of meals. They differ only in where
 * the lines come from, so keeping the adaptation, pricing and note-writing in
 * one place is what stops a fix in one mode from missing the other three.
 */

import type { Macros } from "./nutrition";
import { scaleMacros } from "./nutrition";
import type { AnalyzedIngredient, IngredientOverride } from "./adapt";
import {
  analyzeAll,
  buildAdaptation,
  foodTerm,
  sumIngredients,
} from "./adapt";
import { PRICE_PER_100G } from "./prices";
import { resolveMissingFoods } from "./usda";

export interface RecipeInput {
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  /** Published yield. Null means the fit is against the whole recipe. */
  servings: number | null;
  lines: string[];
  instructions: string[];
}

export interface PricedIngredient extends AnalyzedIngredient {
  price: number | null;
}

export interface AdaptOptions {
  overrides?: Record<number, IngredientOverride>;
  vetoed?: string[];
  /** Skip the external lookup — used when a caller already ran it. */
  skipEnrichment?: boolean;
}

/**
 * Attach an estimated cost to each line.
 *
 * Only the curated price table can price a line, so USDA-resolved foods come
 * back priceless rather than guessed at. Better a blank than a number nobody
 * can stand behind.
 */
export function priceIngredients(list: AnalyzedIngredient[]): {
  ingredients: PricedIngredient[];
  recipeCost: number | null;
} {
  let total = 0;
  let anyPriced = false;
  const ingredients = list.map((ing) => {
    const per100g =
      ing.matchKey && ing.matchSource === "table"
        ? PRICE_PER_100G[ing.matchKey]
        : undefined;
    if (per100g === undefined || ing.grams === null || ing.skipped) {
      return { ...ing, price: null };
    }
    // Rounded first, then summed. The total sits on the same page as the
    // lines it came from, and a reader who adds them up has to get this
    // number — a cent of drift from summing full precision reads as a bug.
    const price = Math.round(((per100g * ing.grams) / 100) * 100) / 100;
    total += price;
    anyPriced = true;
    return { ...ing, price };
  });
  return {
    ingredients,
    recipeCost: anyPriced ? Math.round(total * 100) / 100 : null,
  };
}

/**
 * Look up whatever the built-in table missed.
 *
 * Runs before analysis rather than after, because a food registered mid-pass
 * would leave earlier lines scored against a table the later ones didn't see.
 * Returns the terms that resolved so the caller can say so in the notes.
 */
export async function enrichUnmatched(
  lines: string[],
  overrides: Record<number, IngredientOverride> = {},
): Promise<string[]> {
  const firstPass = analyzeAll(lines, overrides);
  const missing = firstPass
    .filter((ing) => !ing.skipped && ing.matchKey === null)
    .map((ing) => foodTerm(ing.text))
    .filter((term) => term.length > 0);
  if (missing.length === 0) return [];
  return resolveMissingFoods(missing);
}

export interface RecipeResult {
  title: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  servings: number | null;
  instructions: string[];
  /** The recipe as written, after any hand edits, before any swaps. */
  original: {
    ingredients: PricedIngredient[];
    totals: Macros;
    perServing: Macros | null;
    recipeCost: number | null;
  };
  adapted: {
    ingredients: PricedIngredient[];
    swaps: ReturnType<typeof buildAdaptation>["swaps"];
    rejected: ReturnType<typeof buildAdaptation>["rejected"];
    totals: Macros;
    perServing: Macros | null;
    fitMultiplier: number;
    fittedMacros: Macros;
    basis: "serving" | "recipe";
    recipeCost: number | null;
    costPerServing: number | null;
    /** Cost of the portion the app is actually telling you to eat. */
    fittedCost: number | null;
  } | null;
  coverage: { matched: number; counted: number; external: number };
  notes: string;
}

function writeNotes(
  ingredients: AnalyzedIngredient[],
  servings: number | null,
  externalTerms: string[],
): { notes: string; coverage: RecipeResult["coverage"] } {
  const counted = ingredients.filter((i) => !i.skipped).length;
  const matched = ingredients.filter((i) => i.macros !== null).length;
  const external = ingredients.filter(
    (i) => i.matchSource === "external",
  ).length;

  const parts = [
    `Estimated from ${matched} of ${counted} main ingredients (seasonings like salt, pepper and water are skipped).`,
  ];
  if (external > 0) {
    parts.push(
      `${external} came from USDA FoodData Central rather than the built-in table${
        externalTerms.length > 0 ? ` (${externalTerms.slice(0, 4).join(", ")})` : ""
      }.`,
    );
  }
  if (matched < counted) {
    parts.push(
      `${counted - matched} ingredient${counted - matched === 1 ? "" : "s"} couldn't be identified — set them by hand in the ingredient list to count them.`,
    );
  }
  if (!servings) {
    parts.push(
      "This page doesn't publish a serving count, so portions are given as a share of the whole recipe.",
    );
  }
  parts.push("Values are approximations, not verified nutrition facts.");

  return {
    notes: parts.join(" "),
    coverage: { matched, counted, external },
  };
}

/**
 * Analyze a recipe, adapt it to a target, and price both versions.
 *
 * `target` may be null: a plain nutrition breakdown is a useful answer on its
 * own, and it's what the app shows before anyone has typed a goal.
 */
export async function buildRecipeResult(
  input: RecipeInput,
  target: Macros | null,
  options: AdaptOptions = {},
): Promise<RecipeResult> {
  const overrides = options.overrides ?? {};
  const externalTerms = options.skipEnrichment
    ? []
    : await enrichUnmatched(input.lines, overrides);

  const ingredients = analyzeAll(input.lines, overrides);
  const totals = sumIngredients(ingredients);
  const priced = priceIngredients(ingredients);
  const { notes, coverage } = writeNotes(
    ingredients,
    input.servings,
    externalTerms,
  );

  let adapted: RecipeResult["adapted"] = null;
  if (target && coverage.matched > 0) {
    const result = buildAdaptation(ingredients, target, input.servings, {
      overrides,
      vetoed: options.vetoed,
    });
    const adaptedPriced = priceIngredients(result.ingredients);
    const perServingCost =
      adaptedPriced.recipeCost !== null && input.servings
        ? Math.round((adaptedPriced.recipeCost / input.servings) * 100) / 100
        : null;
    // Without a serving count the portion is a share of the whole recipe, so
    // the whole recipe is the right thing to scale the cost from.
    const costBasis =
      adaptedPriced.recipeCost === null
        ? null
        : (perServingCost ?? adaptedPriced.recipeCost);

    adapted = {
      ingredients: adaptedPriced.ingredients,
      swaps: result.swaps,
      rejected: result.rejected,
      totals: result.totals,
      perServing: result.perServing,
      fitMultiplier: result.fitMultiplier,
      fittedMacros: result.fittedMacros,
      basis: result.basis,
      recipeCost: adaptedPriced.recipeCost,
      costPerServing: perServingCost,
      fittedCost:
        costBasis === null
          ? null
          : Math.round(costBasis * result.fitMultiplier * 100) / 100,
    };
  }

  return {
    title: input.title,
    imageUrl: input.imageUrl,
    sourceUrl: input.sourceUrl,
    servings: input.servings,
    instructions: input.instructions,
    original: {
      ingredients: priced.ingredients,
      totals,
      perServing: input.servings ? scaleMacros(totals, 1 / input.servings) : null,
      recipeCost: priced.recipeCost,
    },
    adapted,
    coverage,
    notes,
  };
}

/* ---------- Request parsing shared by the routes ---------- */

/** Overrides arrive as JSON with string keys; validate and renumber them. */
export function parseOverrides(
  raw: unknown,
): Record<number, IngredientOverride> {
  const out: Record<number, IngredientOverride> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) continue;
    if (!value || typeof value !== "object") continue;
    const o = value as Record<string, unknown>;
    const override: IngredientOverride = {};
    if (typeof o.foodKey === "string" && o.foodKey.trim()) {
      override.foodKey = o.foodKey.trim().toLowerCase();
    }
    if (typeof o.grams === "number" && Number.isFinite(o.grams) && o.grams >= 0) {
      override.grams = o.grams;
    }
    if (o.exclude === true) override.exclude = true;
    if (Object.keys(override).length > 0) out[index] = override;
  }
  return out;
}

export function parseVetoed(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string").slice(0, 200);
}

/**
 * Split a pasted ingredient list into lines.
 *
 * People paste from all sorts of places, so bullets, numbering and blank lines
 * all get stripped. A semicolon-separated single line is also common enough
 * (copying out of a paragraph) to be worth handling.
 */
export function parsePastedLines(text: string): string[] {
  const raw = text.includes("\n") ? text.split(/\r?\n/) : text.split(/;/);
  return raw
    .map((line) =>
      line
        .replace(/^\s*[-*•●▪◦]\s*/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .slice(0, 60);
}
