/**
 * Filling gaps in the built-in nutrition table from USDA FoodData Central.
 *
 * The static table in lib/nutrition.ts covers the ingredients recipes lean on
 * hardest, and it is what the swap families and the price table are keyed to.
 * It is also finite, so a recipe calling for farro or harissa gets nothing.
 * This module looks those stragglers up once and registers them, which turns
 * "no data" rows into counted ones without moving the curated numbers.
 *
 * FoodData Central is free and public. It works without a key via USDA's
 * shared DEMO_KEY, which is rate-limited per IP — set USDA_API_KEY for a
 * personal one (free, instant, at https://fdc.nal.usda.gov/api-key-signup).
 * Every failure here is soft: a lookup that times out, 429s, or comes back
 * unrecognizable simply leaves the ingredient uncounted, exactly as before.
 */

import type { Macros } from "./nutrition";
import { lookupNutrition, registerFood } from "./nutrition";

const ENDPOINT = "https://api.nal.usda.gov/fdc/v1/foods/search";
const USER_AGENT =
  "MacroChef/1.0 (https://github.com/whatisabadname/macro-meal-app)";

// FoodData Central nutrient numbers, which are stable across data types.
const PROTEIN = "203";
const FAT = "204";
const CARBS = "205";

/**
 * Energy, in the order to trust it.
 *
 * 208 is the classic kcal row, but plenty of Foundation entries omit it and
 * report energy only under the Atwater-factor numbers — and some (farro, for
 * one) carry no energy row at all, just the three macros.
 */
const ENERGY_NUMBERS = ["208", "957", "958"];

const CAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

/** Terms that will never name a food, so they never earn a request. */
const NOT_FOOD =
  /^(and|or|the|of|a|an|some|more|taste|serving|garnish|topping|needed|desired|choice|optional|plus|about|approximately)?$/i;

interface SearchNutrient {
  nutrientNumber?: string;
  nutrientId?: number;
  value?: number;
}

export interface SearchFood {
  description?: string;
  foodNutrients?: SearchNutrient[];
}

function nutrientValue(food: SearchFood, number: string): number | null {
  for (const n of food.foodNutrients ?? []) {
    if (n.nutrientNumber === number && typeof n.value === "number") {
      return n.value;
    }
  }
  return null;
}

/**
 * Foundation and SR Legacy are USDA's analyzed, generic entries — "Rice,
 * brown, long-grain, raw". Branded is excluded on purpose: it is crowdsourced
 * label data full of near-duplicates, and matching a recipe's "flour" to a
 * particular brand's pancake mix would be worse than not matching it at all.
 */
function searchUrl(term: string, apiKey: string): string {
  const params = new URLSearchParams({
    query: term,
    dataType: "Foundation,SR Legacy",
    pageSize: "1",
    api_key: apiKey,
  });
  return `${ENDPOINT}?${params}`;
}

/**
 * Read per-100g macros out of one FoodData Central search result.
 *
 * Energy is the awkward part. Most rows carry it under nutrient 208, some
 * only under the Atwater-factor numbers, and a few — farro among them — carry
 * no energy row at all, just the three macros. Rather than discard a usable
 * row, the calories are derived with the same Atwater factors the label itself
 * is built from. Only a row with no macros *and* no energy is unusable.
 */
export function macrosFromFood(food: SearchFood): Macros | null {
  const protein = nutrientValue(food, PROTEIN);
  const carbs = nutrientValue(food, CARBS);
  const fat = nutrientValue(food, FAT);

  let calories: number | null = null;
  for (const number of ENERGY_NUMBERS) {
    calories = nutrientValue(food, number);
    if (calories !== null) break;
  }

  if (calories === null) {
    if (protein === null && carbs === null && fat === null) return null;
    calories =
      (protein ?? 0) * CAL_PER_G.protein +
      (carbs ?? 0) * CAL_PER_G.carbs +
      (fat ?? 0) * CAL_PER_G.fat;
  }

  return {
    calories,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
  };
}

/**
 * Look one food term up. Returns its per-100g macros, or null for anything
 * that didn't resolve cleanly — FoodData Central reports per 100g throughout,
 * which is already the unit the rest of the app works in.
 */
export async function fetchFoodMacros(term: string): Promise<Macros | null> {
  const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";
  try {
    const res = await fetch(searchUrl(term, apiKey), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      // Generic food composition doesn't change. Cache hard: the DEMO_KEY
      // budget is small, and repeat recipes shouldn't spend any of it.
      next: { revalidate: 2592000 },
    });
    if (!res.ok) {
      if (res.status === 429) {
        console.warn("USDA rate limit reached — set USDA_API_KEY for more.");
      }
      return null;
    }
    const data = (await res.json()) as {
      foods?: SearchFood[];
      error?: { code?: string };
    };
    // The API answers some failures with 200 and an error body.
    if (data.error) return null;
    const food = data.foods?.[0];
    return food ? macrosFromFood(food) : null;
  } catch {
    // Offline, blocked, or slow — the caller degrades to "no data".
    return null;
  }
}

/**
 * Resolve a batch of unmatched food terms and register whatever comes back.
 *
 * Deduplicates first, then caps the batch: one recipe should never fire twenty
 * requests at a volunteer-scale key budget, and the ingredients a recipe leads
 * with are the ones that carry its calories. Anything past the cap stays
 * uncounted and is reported as such in the response notes.
 *
 * Returns the terms that resolved, so the route can say how many gaps closed.
 */
export async function resolveMissingFoods(
  terms: string[],
  limit = 8,
): Promise<string[]> {
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const raw of terms) {
    const term = raw.trim().toLowerCase();
    if (!term || term.length < 3 || NOT_FOOD.test(term)) continue;
    if (seen.has(term)) continue;
    // Something registered by an earlier request in this process already.
    if (lookupNutrition(term)) continue;
    seen.add(term);
    wanted.push(term);
    if (wanted.length >= limit) break;
  }
  if (wanted.length === 0) return [];

  const results = await Promise.all(
    wanted.map(async (term) => {
      const macros = await fetchFoodMacros(term);
      if (!macros) return null;
      registerFood(term, macros);
      return term;
    }),
  );
  return results.filter((t): t is string => t !== null);
}
