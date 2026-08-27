/**
 * TheMealDB lookups.
 *
 * A free, key-less catalog of a few hundred recipes. Its search is exact-ish
 * and its records have no serving count, so both of those get papered over
 * here rather than in every caller.
 */

export const USER_AGENT =
  "MacroChef/1.0 (https://github.com/whatisabadname/macro-meal-app)";

/** TheMealDB doesn't publish yields, and most of its recipes feed a family. */
export const ASSUMED_SERVINGS = 4;

export interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strInstructions: string;
  strSource: string | null;
  [key: string]: string | null;
}

async function search(q: string): Promise<MealDbMeal[]> {
  const res = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`,
    {
      headers: { "User-Agent": USER_AGENT },
      // The catalog is effectively static, and the word-fallback search
      // fires one request per query word — worth caching hard.
      next: { revalidate: 604800 },
    },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.meals ?? [];
}

/**
 * Find the recipe that best answers a dish name.
 *
 * Try the full query first, then fall back to individual words and pick the
 * candidate whose name matches the most query words. The dish noun is usually
 * last ("beef tacos" -> "tacos"), so search words in reverse.
 */
export async function searchRecipe(query: string): Promise<MealDbMeal | null> {
  const full = await search(query);
  if (full.length > 0) return full[0];

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const candidates = new Map<string, MealDbMeal>();
  for (const word of [...words].reverse()) {
    for (const m of await search(word)) {
      if (!candidates.has(m.idMeal)) candidates.set(m.idMeal, m);
    }
  }
  if (candidates.size === 0) return null;

  let best: MealDbMeal | null = null;
  let bestScore = -1;
  for (const m of candidates.values()) {
    const name = m.strMeal.toLowerCase();
    const score = words.reduce((s, w) => s + (name.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/**
 * TheMealDB stores ingredients in 20 numbered column pairs. Flatten them into
 * the "1 cup heavy cream" lines the rest of the app parses.
 */
export function ingredientLines(meal: MealDbMeal): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) continue;
    const measure = meal[`strMeasure${i}`]?.trim() ?? "";
    out.push(measure ? `${measure} ${name}` : name);
  }
  return out;
}

export function instructionSteps(meal: MealDbMeal): string[] {
  return meal.strInstructions
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(step\s*\d+[:.)]?)\s*/i, "").trim())
    .filter((s) => s.length > 0);
}
