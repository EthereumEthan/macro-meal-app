import { NextRequest, NextResponse } from "next/server";
import {
  Macros,
  SWAP_RULES,
  addMacros,
  emptyMacros,
  lookupNutrition,
  measureToGrams,
  scaleMacros,
} from "@/lib/nutrition";
import { PRICE_PER_100G, matchChain } from "@/lib/prices";
import { bestFitPortion } from "@/lib/fit";

export const maxDuration = 60;

// Nominatim's usage policy requires a User-Agent that identifies the app and
// gives a way to reach whoever runs it. Point this at the deployed URL once
// there is one.
const USER_AGENT =
  "MacroChef/1.0 (https://github.com/whatisabadname/macro-meal-app)";
const ASSUMED_SERVINGS = 4; // TheMealDB doesn't publish serving counts

interface PlanRequest {
  meal: string;
  location?: string;
  coords?: { lat: number; lon: number };
  macros: Macros;
}

interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strInstructions: string;
  strSource: string | null;
  [key: string]: string | null;
}

interface RecipeIngredient {
  name: string;
  measure: string;
}

async function searchRecipe(query: string): Promise<MealDbMeal | null> {
  const search = async (q: string): Promise<MealDbMeal[]> => {
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
  };

  // Try the full query first, then fall back to individual words and pick
  // the candidate whose name matches the most query words. The dish noun is
  // usually last ("beef tacos" -> "tacos"), so search words in reverse.
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

function extractIngredients(meal: MealDbMeal): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) continue;
    out.push({ name, measure: meal[`strMeasure${i}`]?.trim() ?? "" });
  }
  return out;
}

function computeMacros(ingredients: RecipeIngredient[]): {
  perServing: Macros;
  matched: number;
} {
  const total = emptyMacros();
  let matched = 0;
  for (const ing of ingredients) {
    const nutrition = lookupNutrition(ing.name);
    const grams = measureToGrams(ing.measure, ing.name);
    if (nutrition && grams !== null) {
      addMacros(total, nutrition.per100g, grams);
      matched++;
    }
  }
  return { perServing: scaleMacros(total, 1 / ASSUMED_SERVINGS), matched };
}

interface Store {
  name: string;
  area: string;
  carries: string;
  /** Chain price level vs national average, used to estimate basket cost */
  multiplier: number;
}

async function geocode(
  location: string,
): Promise<{ lat: number; lon: number } | null> {
  const geoRes = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`,
    {
      headers: { "User-Agent": USER_AGENT },
      // "Austin, TX" resolves to the same point every time, and Nominatim's
      // policy asks clients to cache rather than re-ask.
      next: { revalidate: 2592000 },
    },
  );
  if (!geoRes.ok) {
    console.error("Nominatim error:", geoRes.status, await geoRes.text());
    return null;
  }
  const geo = await geoRes.json();
  if (!Array.isArray(geo) || geo.length === 0) {
    console.error("Nominatim: no results for", location);
    return null;
  }
  return { lat: parseFloat(geo[0].lat), lon: parseFloat(geo[0].lon) };
}

async function findStores(
  coords: { lat: number; lon: number } | undefined,
  location: string | undefined,
): Promise<Store[]> {
  try {
    const point = coords ?? (location ? await geocode(location) : null);
    if (!point) return [];

    // Round the centre to ~1km before building the query. The search radius is
    // 15km, so this doesn't change which stores come back, but it collapses
    // every user in a neighbourhood onto one cache key instead of one per GPS
    // reading.
    const lat = point.lat.toFixed(2);
    const lon = point.lon.toFixed(2);

    // Big-box stores are sparser than corner supermarkets — search ~15km.
    // Target is often tagged department_store, Costco/Sam's as wholesale.
    const query = `[out:json][timeout:20];nwr["shop"~"supermarket|department_store|wholesale"]["name"](around:15000,${lat},${lon});out center 60;`;
    // GET rather than POST so Next's data cache can serve repeats: Overpass is
    // volunteer-run infrastructure and asks clients not to re-query the same
    // area. Store locations move on the order of months.
    const overpassRes = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: 86400 },
      },
    );
    if (!overpassRes.ok) {
      console.error(
        "Overpass error:",
        overpassRes.status,
        await overpassRes.text(),
      );
      return [];
    }
    const data = await overpassRes.json();

    const seenChains = new Set<string>();
    const stores: Store[] = [];
    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const name: string | undefined = tags.name;
      if (!name) continue;
      const chain = matchChain(name);
      if (!chain || seenChains.has(chain.label)) continue;
      seenChains.add(chain.label);
      const parts = [
        tags["addr:housenumber"] && tags["addr:street"]
          ? `${tags["addr:housenumber"]} ${tags["addr:street"]}`
          : tags["addr:street"],
        tags["addr:city"],
      ].filter(Boolean);
      stores.push({
        name: chain.label,
        area: parts.length > 0 ? parts.join(", ") : "near you",
        carries:
          chain.multiplier >= 1.15
            ? "Pricier, but great for specialty swaps like chickpea pasta and organic produce"
            : chain.multiplier <= 0.9
              ? "Usually the cheapest option for staples and proteins"
              : "Full grocery selection — should cover every ingredient on the list",
        multiplier: chain.multiplier,
      });
      if (stores.length >= 6) break;
    }
    return stores;
  } catch (err) {
    console.error("findStores failed:", err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  let body: PlanRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { meal, location, coords, macros } = body;
  if (!meal || !macros || (!coords && !location)) {
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

    const originalIngredients = extractIngredients(recipe);

    // Apply macro-friendly swaps
    const swaps: { original: string; replacement: string; reason: string }[] =
      [];
    const modifiedIngredients: RecipeIngredient[] = originalIngredients.map(
      (ing) => {
        for (const rule of SWAP_RULES) {
          if (rule.pattern.test(ing.name)) {
            swaps.push({
              original: ing.name,
              replacement: rule.replacement,
              reason: rule.reason,
            });
            return { name: rule.replacement, measure: ing.measure };
          }
        }
        return ing;
      },
    );

    const original = computeMacros(originalIngredients);
    const modified = computeMacros(modifiedIngredients);

    // Estimate ingredient prices (national averages; retailers don't
    // publish public price APIs)
    let recipeCost = 0;
    const pricedIngredients = modifiedIngredients.map((ing) => {
      const text = ing.measure ? `${ing.measure} ${ing.name}` : ing.name;
      const nutrition = lookupNutrition(ing.name);
      const grams = measureToGrams(ing.measure, ing.name);
      let price: number | null = null;
      let macrosForItem: Macros | null = null;
      if (nutrition && grams !== null) {
        macrosForItem = {
          calories: (nutrition.per100g.calories * grams) / 100,
          protein: (nutrition.per100g.protein * grams) / 100,
          carbs: (nutrition.per100g.carbs * grams) / 100,
          fat: (nutrition.per100g.fat * grams) / 100,
        };
        if (PRICE_PER_100G[nutrition.key]) {
          price = Math.round(((PRICE_PER_100G[nutrition.key] * grams) / 100) * 100) / 100;
          recipeCost += (PRICE_PER_100G[nutrition.key] * grams) / 100;
        }
      }
      return { text, price, macros: macrosForItem };
    });

    // Find the portion (in servings) that best fits ALL four target macros.
    // A single recipe has a fixed macro ratio, so we can't always hit every
    // target — we pick the scalar k minimizing the summed squared relative
    // error k*(perServing_i / target_i) - 1 across calories/protein/carbs/fat.
    const fitMultiplier = bestFitPortion(modified.perServing, macros);
    const fittedMacros = scaleMacros(modified.perServing, fitMultiplier);
    const fittedCost =
      recipeCost > 0
        ? Math.round((recipeCost / ASSUMED_SERVINGS) * fitMultiplier * 100) / 100
        : null;

    const coverage =
      original.matched < originalIngredients.length
        ? ` Macros estimated from ${original.matched} of ${originalIngredients.length} ingredients (the rest are minor or unmatched).`
        : "";

    const instructions = recipe.strInstructions
      .split(/\r?\n+/)
      .map((s) => s.replace(/^\s*(step\s*\d+[:.)]?)\s*/i, "").trim())
      .filter((s) => s.length > 0);

    const storeList =
      stores.length > 0
        ? stores.map((s) => ({
            name: s.name,
            area: s.area,
            carries: s.carries,
            estCost:
              recipeCost > 0
                ? Math.round(recipeCost * s.multiplier * 100) / 100
                : null,
          }))
        : [
            {
              name: "No big retail stores found nearby",
              area: location ?? "your area",
              carries:
                "Search Google Maps for Walmart, Target, H-E-B, or Kroger near you — any of them will carry these ingredients.",
              estCost: recipeCost > 0 ? Math.round(recipeCost * 100) / 100 : null,
            },
          ];

    return NextResponse.json({
      plan: {
        recipeName: recipe.strMeal,
        imageUrl: recipe.strMealThumb ?? null,
        sourceUrl:
          recipe.strSource ||
          `https://www.themealdb.com/meal/${recipe.idMeal}`,
        servings: ASSUMED_SERVINGS,
        originalMacros: original.perServing,
        swaps,
        ingredients: pricedIngredients,
        instructions,
        modifiedMacros: modified.perServing,
        fitMultiplier: Math.round(fitMultiplier * 100) / 100,
        fittedMacros,
        fittedCost,
        recipeCost: recipeCost > 0 ? Math.round(recipeCost * 100) / 100 : null,
        costPerServing:
          recipeCost > 0
            ? Math.round((recipeCost / ASSUMED_SERVINGS) * 100) / 100
            : null,
        stores: storeList,
        notes:
          `Macros are rough estimates, assuming the recipe makes ${ASSUMED_SERVINGS} servings.` +
          coverage +
          " Prices are estimated from national averages — big retailers don't offer public price APIs, so check the store app for exact prices.",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Something went wrong: ${msg}` },
      { status: 500 },
    );
  }
}
