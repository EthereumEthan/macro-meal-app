import { NextRequest, NextResponse } from "next/server";
import { isValidTarget } from "@/lib/fit";
import {
  buildRecipeResult,
  parseOverrides,
  parseVetoed,
} from "@/lib/recipe";

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
  recipeInstructions?: unknown;
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

/** schema.org allows plain strings, HowToStep objects, or sections of them. */
function extractInstructions(value: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === "string") {
      const text = node.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) out.push(text);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (obj.itemListElement) return walk(obj.itemListElement);
      if (typeof obj.text === "string") return walk(obj.text);
      if (typeof obj.name === "string") return walk(obj.name);
    }
  };
  walk(value);
  return out;
}

/** Parse "450 calories" / "12 g" style values from schema.org nutrition */
function parseNutritionNumber(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/* ---------- Route ---------- */

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url : "";
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
        {
          error: `The site returned an error (${res.status}). It may block automated access.`,
          // The paste box is a complete way around a blocked or unmarked page,
          // so every failure here points at it rather than dead-ending.
          canPaste: true,
        },
        { status: 502 },
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach that URL. Check the link and try again.", canPaste: true },
      { status: 502 },
    );
  }

  const recipe = extractRecipeFromHtml(html);
  if (!recipe) {
    return NextResponse.json(
      {
        error:
          "Couldn't find recipe data on that page. Most major recipe sites publish it (AllRecipes, BBC Good Food, Food Network, Serious Eats); blogs often don't.",
        canPaste: true,
      },
      { status: 422 },
    );
  }

  const lines = recipe.recipeIngredient ?? recipe.ingredients ?? [];
  const target = isValidTarget(body.macros) ? body.macros : null;

  const result = await buildRecipeResult(
    {
      title: recipe.name ?? "Recipe",
      imageUrl: extractImage(recipe.image),
      sourceUrl: url,
      servings: extractServings(recipe.recipeYield),
      lines,
      instructions: extractInstructions(recipe.recipeInstructions),
    },
    target,
    {
      overrides: parseOverrides(body.overrides),
      vetoed: parseVetoed(body.vetoed),
    },
  );

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
    siteNutrition && Object.values(siteNutrition).some((v) => v !== null);

  return NextResponse.json({
    recipe: {
      ...result,
      lines,
      siteNutrition: hasSiteNutrition ? siteNutrition : null,
    },
  });
}
