import { NextRequest, NextResponse } from "next/server";
import type { Macros } from "@/lib/nutrition";
import { isValidTarget } from "@/lib/fit";
import {
  ASSUMED_SERVINGS,
  ingredientLines,
  instructionSteps,
  searchRecipe,
} from "@/lib/mealdb";
import { Coords, findStores, storeEstimates } from "@/lib/stores";
import { consolidate } from "@/lib/shopping";
import {
  buildRecipeResult,
  parseOverrides,
  parseVetoed,
} from "@/lib/recipe";

export const maxDuration = 60;

interface PlanRequest {
  meal: string;
  location?: string;
  coords?: Coords;
  macros: Macros;
  overrides?: unknown;
  vetoed?: unknown;
}

export async function POST(req: NextRequest) {
  let body: PlanRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { meal, location, coords, macros } = body;
  if (!meal || !isValidTarget(macros) || (!coords && !location)) {
    return NextResponse.json(
      { error: "meal, macros, and a location (or coordinates) are required" },
      { status: 400 },
    );
  }

  try {
    // Run recipe search and store lookup in parallel
    const [recipe, stores] = await Promise.all([
      searchRecipe(meal),
      findStores(coords, location),
    ]);

    if (!recipe) {
      return NextResponse.json(
        {
          error: `Couldn't find a recipe for "${meal}". Try a simpler or more common dish name (e.g. "carbonara" instead of "creamy bacon carbonara").`,
        },
        { status: 404 },
      );
    }

    const lines = ingredientLines(recipe);
    const result = await buildRecipeResult(
      {
        title: recipe.strMeal,
        imageUrl: recipe.strMealThumb ?? null,
        sourceUrl:
          recipe.strSource || `https://www.themealdb.com/meal/${recipe.idMeal}`,
        servings: ASSUMED_SERVINGS,
        lines,
        instructions: instructionSteps(recipe),
      },
      macros,
      {
        overrides: parseOverrides(body.overrides),
        vetoed: parseVetoed(body.vetoed),
      },
    );

    // The basket is what you'd buy to cook the recipe, which is the whole
    // recipe — not the single portion the fit tells you to eat from it.
    const basketCost = result.adapted?.recipeCost ?? result.original.recipeCost;
    const shopping = consolidate([
      {
        meal: recipe.strMeal,
        lines: (result.adapted?.ingredients ?? result.original.ingredients).map(
          (i) => ({
            text: i.text,
            grams: i.grams,
            matchKey: i.matchKey,
            excluded: i.excluded,
          }),
        ),
      },
    ]);

    return NextResponse.json({
      recipe: { ...result, lines },
      shopping,
      stores: storeEstimates(stores, basketCost, location),
      // TheMealDB has no yield field, so every portion figure downstream rests
      // on this assumption. Say it out loud rather than burying it.
      servingsAssumed: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Something went wrong: ${msg}` },
      { status: 500 },
    );
  }
}
