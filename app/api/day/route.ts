import { NextRequest, NextResponse } from "next/server";
import type { Macros } from "@/lib/nutrition";
import {
  combineAtPortions,
  fitPortions,
  isValidTarget,
  targetError,
} from "@/lib/fit";
import {
  ASSUMED_SERVINGS,
  ingredientLines,
  instructionSteps,
  searchRecipe,
} from "@/lib/mealdb";
import { consolidate } from "@/lib/shopping";
import type { RecipeResult } from "@/lib/recipe";
import { buildRecipeResult } from "@/lib/recipe";

export const maxDuration = 120;

const MAX_MEALS = 5;

interface DayMealResult {
  query: string;
  recipe: RecipeResult & { lines: string[] };
  /** Servings of this recipe to eat, solved jointly with the other meals. */
  portion: number;
  /** What that portion contributes to the day. */
  macros: Macros;
  cost: number | null;
}

function scale(m: Macros, k: number): Macros {
  return {
    calories: m.calories * k,
    protein: m.protein * k,
    carbs: m.carbs * k,
    fat: m.fat * k,
  };
}

/**
 * Build a day of meals against one daily macro target.
 *
 * The interesting part is that the portions are solved *together*. Adapting
 * each recipe to a quarter of the day and stacking the results gives four
 * separately-compromised meals; solving jointly lets a carb-heavy breakfast be
 * paid for by a leaner dinner, which is how people actually eat.
 *
 * Each recipe is still individually swapped toward the daily *ratio* first —
 * swaps change a recipe's macro ratio, and the ratio is the thing portioning
 * can't fix. Sizing happens afterwards, across the whole day at once.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const queries = Array.isArray(body.meals)
    ? body.meals
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
        .slice(0, MAX_MEALS)
    : [];

  if (queries.length === 0) {
    return NextResponse.json(
      { error: "Name at least one dish for the day." },
      { status: 400 },
    );
  }
  if (!isValidTarget(body.macros)) {
    return NextResponse.json(
      { error: "Daily macro targets are required." },
      { status: 400 },
    );
  }
  const dailyTarget = body.macros;

  // Swapping each recipe toward the day's ratio (rather than its own share of
  // the day) is the right target: portioning handles magnitude later, so what
  // a swap has to fix is the ratio, and that is the same for every meal.
  const ratioTarget = dailyTarget;

  const found = await Promise.all(
    queries.map(async (query) => {
      const meal = await searchRecipe(query);
      if (!meal) return { query, recipe: null };
      const lines = ingredientLines(meal);
      const recipe = await buildRecipeResult(
        {
          title: meal.strMeal,
          imageUrl: meal.strMealThumb ?? null,
          sourceUrl:
            meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
          servings: ASSUMED_SERVINGS,
          lines,
          instructions: instructionSteps(meal),
        },
        ratioTarget,
      );
      return { query, recipe: { ...recipe, lines } };
    }),
  );

  const missing = found.filter((f) => f.recipe === null).map((f) => f.query);
  const usable = found.filter(
    (f): f is { query: string; recipe: RecipeResult & { lines: string[] } } =>
      f.recipe !== null &&
      (f.recipe.adapted?.perServing ?? f.recipe.original.perServing) !== null,
  );

  if (usable.length === 0) {
    return NextResponse.json(
      {
        error: `Couldn't find a usable recipe for ${queries.map((q) => `"${q}"`).join(", ")}. Try common dish names — "carbonara", "beef tacos", "pad thai".`,
      },
      { status: 404 },
    );
  }

  const bases = usable.map(
    (u) =>
      (u.recipe.adapted?.perServing ?? u.recipe.original.perServing) as Macros,
  );
  // Round the solved portions to a quarter serving before reporting them:
  // "1.75 servings" is something a person can actually plate, "1.7382" is not.
  const raw = fitPortions(bases, dailyTarget);
  const portions = raw.map((k) => Math.max(0.25, Math.round(k * 4) / 4));
  const dayMacros = combineAtPortions(bases, portions);

  const meals: DayMealResult[] = usable.map((u, i) => {
    const perServingCost =
      u.recipe.adapted?.costPerServing ??
      (u.recipe.original.recipeCost !== null && u.recipe.servings
        ? u.recipe.original.recipeCost / u.recipe.servings
        : null);
    return {
      query: u.query,
      recipe: u.recipe,
      portion: portions[i],
      macros: scale(bases[i], portions[i]),
      cost:
        perServingCost === null
          ? null
          : Math.round(perServingCost * portions[i] * 100) / 100,
    };
  });

  // The shopping list is for cooking the recipes, so it is sized in whole
  // batches — you can't buy 1.75 servings of chicken. Batches are rounded up
  // from the portions so there is always enough.
  const shopping = consolidate(
    meals.map((m) => ({
      meal: m.recipe.title,
      lines: (
        m.recipe.adapted?.ingredients ?? m.recipe.original.ingredients
      ).map((i) => ({
        text: i.text,
        grams: i.grams,
        matchKey: i.matchKey,
        excluded: i.excluded,
      })),
      scale: Math.max(1, Math.ceil(m.portion / (m.recipe.servings ?? 1))),
    })),
  );

  const notes: string[] = [
    `Portions are solved across all ${meals.length} meal${meals.length === 1 ? "" : "s"} at once, not one at a time — that's what lets a heavier meal be balanced by a lighter one.`,
    `TheMealDB doesn't publish serving counts, so every recipe is assumed to make ${ASSUMED_SERVINGS}.`,
    "The shopping list is sized in whole batches, since you cook a recipe rather than a portion.",
  ];
  if (missing.length > 0) {
    notes.unshift(
      `No recipe found for ${missing.map((m) => `"${m}"`).join(", ")} — the rest of the day was solved without it.`,
    );
  }

  return NextResponse.json({
    day: {
      target: dailyTarget,
      meals,
      totals: dayMacros,
      // Error against the day's target after portioning. Zero is a perfect
      // day; the UI turns this into the same fit language a single meal uses.
      fitError: Math.round(targetError(dayMacros, dailyTarget) * 10000) / 10000,
      missing,
      shopping,
      notes: notes.join(" "),
    },
  });
}
