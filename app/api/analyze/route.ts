import { NextRequest, NextResponse } from "next/server";
import {
  Macros,
  addMacros,
  emptyMacros,
  lookupNutrition,
  measureToGrams,
  scaleMacros,
} from "@/lib/nutrition";

export const maxDuration = 60;

// Recipe sites often block generic clients — identify as a normal browser
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/* ---------- JSON-LD recipe extraction ---------- */

interface RecipeNode {
  name?: string;
  image?: unknown;
  recipeIngredient?: string[];
  ingredients?: string[];
  recipeYield?: unknown;
  nutrition?: Record<string, string>;
}

function isRecipeType(t: unknown): boolean {
  if (typeof t === "string") return t.toLowerCase() === "recipe";
  if (Array.isArray(t))
    return t.some((x) => typeof x === "string" && x.toLowerCase() === "recipe");
  return false;
}

function findRecipeNode(node: unknown): RecipeNode | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (isRecipeType(obj["@type"])) return obj as RecipeNode;
    if (obj["@graph"]) return findRecipeNode(obj["@graph"]);
  }
  return null;
}

function extractRecipeFromHtml(html: string): RecipeNode | null {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) {
    try {
      const recipe = findRecipeNode(JSON.parse(match[1].trim()));
      if (recipe?.recipeIngredient || recipe?.ingredients) return recipe;
    } catch {
      // malformed JSON-LD block — try the next one
    }
  }
  return null;
}

function extractImage(image: unknown): string | null {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return extractImage(image[0]);
  if (image && typeof image === "object") {
    const obj = image as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
  }
  return null;
}

function extractServings(yieldValue: unknown): number | null {
  const first = Array.isArray(yieldValue) ? yieldValue[0] : yieldValue;
  if (typeof first === "number" && first > 0) return first;
  if (typeof first === "string") {
    const m = first.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

/** Parse "450 calories" / "12 g" style values from schema.org nutrition */
function parseNutritionNumber(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

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

function isTrivial(ingredientText: string): boolean {
  const stripped = ingredientText
    .toLowerCase()
    .replace(LEADING_AMOUNT, "")
    .trim();
  return TRIVIAL_PATTERNS.some(
    (re) => re.test(stripped) || re.test(ingredientText.toLowerCase()),
  );
}

/* ---------- Ingredient text -> grams ---------- */

function ingredientToGrams(text: string): number | null {
  // "1 (14 oz) can ..." / "2 (400g) tins ..." — parenthetical package size
  const pkg = text.match(
    /\((\d+(?:\.\d+)?)\s*-?\s*(oz|ounces?|g|grams?|ml|lbs?|pounds?)\.?\)/i,
  );
  if (pkg) {
    const amount = parseFloat(pkg[1]);
    const unit = pkg[2].toLowerCase();
    const grams = unit.startsWith("oz") || unit.startsWith("ounce")
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

/* ---------- Route ---------- */

export async function POST(req: NextRequest) {
  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "Please paste a full recipe URL starting with http(s)://" },
      { status: 400 },
    );
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `The site returned an error (${res.status}). It may block automated access — try a different recipe site.` },
        { status: 502 },
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach that URL. Check the link and try again." },
      { status: 502 },
    );
  }

  const recipe = extractRecipeFromHtml(html);
  if (!recipe) {
    return NextResponse.json(
      {
        error:
          "Couldn't find recipe data on that page. Most major recipe sites work (AllRecipes, BBC Good Food, Food Network, Serious Eats...) — blogs without standard recipe markup don't.",
      },
      { status: 422 },
    );
  }

  const rawIngredients = recipe.recipeIngredient ?? recipe.ingredients ?? [];
  const servings = extractServings(recipe.recipeYield);

  const totals = emptyMacros();
  let matched = 0;
  let analyzed = 0;

  const ingredients = rawIngredients.map((raw) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (isTrivial(text)) {
      return { text, skipped: true as const, macros: null, grams: null };
    }
    analyzed++;
    const nutrition = lookupNutrition(text);
    let grams = ingredientToGrams(text);
    if (!nutrition || grams === null) {
      return { text, skipped: false as const, macros: null, grams: null };
    }
    // Frying oil mostly stays in the pan — count ~20% as consumed
    if (/oil/i.test(text) && /for (deep[- ])?frying/i.test(text)) {
      grams *= 0.2;
    }
    matched++;
    const macros: Macros = {
      calories: (nutrition.per100g.calories * grams) / 100,
      protein: (nutrition.per100g.protein * grams) / 100,
      carbs: (nutrition.per100g.carbs * grams) / 100,
      fat: (nutrition.per100g.fat * grams) / 100,
    };
    addMacros(totals, nutrition.per100g, grams);
    return { text, skipped: false as const, macros, grams: Math.round(grams) };
  });

  // Site-reported nutrition (per serving), when the page includes it
  const siteNutrition = recipe.nutrition
    ? {
        calories: parseNutritionNumber(recipe.nutrition.calories),
        protein: parseNutritionNumber(recipe.nutrition.proteinContent),
        carbs: parseNutritionNumber(recipe.nutrition.carbohydrateContent),
        fat: parseNutritionNumber(recipe.nutrition.fatContent),
      }
    : null;
  const hasSiteNutrition =
    siteNutrition &&
    Object.values(siteNutrition).some((v) => v !== null);

  return NextResponse.json({
    analysis: {
      title: recipe.name ?? "Recipe",
      imageUrl: extractImage(recipe.image),
      sourceUrl: url,
      servings,
      ingredients,
      totals,
      perServing: servings ? scaleMacros(totals, 1 / servings) : null,
      siteNutrition: hasSiteNutrition ? siteNutrition : null,
      notes: `Estimated nutrition for ${matched} of ${analyzed} main ingredients (seasonings like salt, pepper, and water are skipped). Values are approximations from a standard nutrition table.`,
    },
  });
}
