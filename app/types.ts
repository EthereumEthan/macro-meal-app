/**
 * The shapes the API actually returns, named once.
 *
 * These are the server's own types re-exported, not hand-written copies — a
 * duplicated interface drifts the moment a route changes, and the drift shows
 * up as a blank field on the page rather than a compiler error.
 */

import type { Macros } from "@/lib/nutrition";
import type { PricedIngredient, RecipeResult } from "@/lib/recipe";
import type { ShoppingList } from "@/lib/shopping";

export type { Macros, PricedIngredient, RecipeResult, ShoppingList };
export type { IngredientOverride } from "@/lib/adapt";
export type { AppliedSwap, RejectedSwap } from "@/lib/adapt";

/** A recipe result plus the raw lines it was built from, as the routes send it. */
export type Recipe = RecipeResult & {
  lines: string[];
  siteNutrition?: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  } | null;
};

export interface StoreEstimate {
  name: string;
  area: string;
  carries: string;
  estCost: number | null;
}

/** POST /api/plan */
export interface PlanResponse {
  recipe: Recipe;
  shopping: ShoppingList;
  stores: StoreEstimate[];
  servingsAssumed: boolean;
}

export interface DayMeal {
  query: string;
  recipe: Recipe;
  portion: number;
  macros: Macros;
  cost: number | null;
}

/** POST /api/day */
export interface DayPlan {
  target: Macros;
  meals: DayMeal[];
  totals: Macros;
  fitError: number;
  missing: string[];
  shopping: ShoppingList;
  notes: string;
}

export type Mode = "find" | "link" | "day";
