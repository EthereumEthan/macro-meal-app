// Approximate nutrition data per 100g, used to estimate recipe macros.
// Values are rough averages from USDA data — estimates, not lab facts.

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// [kcal, protein g, carbs g, fat g] per 100g
const N: Record<string, [number, number, number, number]> = {
  "chicken breast": [165, 31, 0, 3.6],
  "chicken thigh": [209, 26, 0, 11],
  chicken: [190, 29, 0, 8],
  "lean ground turkey": [150, 27, 0, 4],
  turkey: [189, 29, 0, 7],
  "ground beef": [250, 26, 0, 15],
  "beef mince": [250, 26, 0, 15],
  "minced beef": [250, 26, 0, 15],
  steak: [271, 25, 0, 19],
  beef: [250, 26, 0, 15],
  "pork tenderloin": [143, 26, 0, 3.5],
  "pork belly": [518, 9, 0, 53],
  pork: [242, 27, 0, 14],
  "turkey bacon": [226, 29, 1, 12],
  bacon: [541, 37, 1, 42],
  lamb: [294, 25, 0, 21],
  salmon: [208, 20, 0, 13],
  tuna: [132, 28, 0, 1.3],
  cod: [82, 18, 0, 0.7],
  "white fish": [96, 21, 0, 1],
  shrimp: [99, 24, 0.2, 0.3],
  prawns: [99, 24, 0.2, 0.3],
  tofu: [76, 8, 1.9, 4.8],
  egg: [143, 13, 1, 10],
  butter: [717, 1, 0, 81],
  "light butter": [359, 1, 0, 40],
  "olive oil": [884, 0, 0, 100],
  "vegetable oil": [884, 0, 0, 100],
  "sesame oil": [884, 0, 0, 100],
  "coconut oil": [892, 0, 0, 100],
  oil: [884, 0, 0, 100],
  "heavy cream": [340, 2, 3, 36],
  "double cream": [340, 2, 3, 36],
  "evaporated milk": [78, 7, 11, 0.2],
  "half and half": [131, 3, 4, 12],
  cream: [292, 2.2, 3.7, 30],
  "skim milk": [34, 3.4, 5, 0.1],
  milk: [61, 3.2, 4.8, 3.3],
  "greek yogurt": [59, 10, 3.6, 0.4],
  yogurt: [61, 3.5, 4.7, 3.3],
  "sour cream": [198, 2.4, 4.6, 19],
  "light cream cheese": [201, 7, 8, 15],
  "cream cheese": [342, 6, 4, 34],
  parmesan: [431, 38, 4, 29],
  "reduced-fat cheese": [280, 27, 2, 18],
  "reduced-fat cheddar": [280, 27, 2, 18],
  cheddar: [403, 25, 1, 33],
  mozzarella: [280, 28, 3, 17],
  feta: [264, 14, 4, 21],
  cheese: [380, 25, 2, 31],
  "chickpea pasta": [333, 22, 56, 3.8],
  "whole-wheat pasta": [352, 14, 71, 2.5],
  fettuccine: [371, 13, 75, 1.5],
  spaghetti: [371, 13, 75, 1.5],
  linguine: [371, 13, 75, 1.5],
  penne: [371, 13, 75, 1.5],
  macaroni: [371, 13, 75, 1.5],
  lasagne: [371, 13, 75, 1.5],
  pasta: [371, 13, 75, 1.5],
  "cauliflower rice": [25, 2, 5, 0.3],
  // Spiralized vegetable "noodles" — the low-carb answer to a pasta dish
  "zucchini noodles": [17, 1.2, 3.1, 0.3],
  "courgette noodles": [17, 1.2, 3.1, 0.3],
  "rice noodles": [360, 6, 80, 0.6],
  noodles: [380, 13, 71, 4],
  "brown rice": [370, 7.9, 77, 2.9],
  rice: [365, 7, 80, 0.7],
  quinoa: [368, 14, 64, 6],
  flour: [364, 10, 76, 1],
  breadcrumbs: [395, 13, 72, 5],
  "bread crumbs": [395, 13, 72, 5],
  bread: [265, 9, 49, 3.2],
  "low-carb tortilla": [190, 15, 35, 5],
  tortilla: [310, 8, 50, 8],
  potato: [77, 2, 17, 0.1],
  "sweet potato": [86, 1.6, 20, 0.1],
  "monk fruit sweetener": [0, 0, 100, 0],
  sugar: [387, 0, 100, 0],
  honey: [304, 0.3, 82, 0],
  "maple syrup": [260, 0, 67, 0],
  onion: [40, 1.1, 9, 0.1],
  garlic: [149, 6, 33, 0.5],
  ginger: [80, 1.8, 18, 0.8],
  "tomato puree": [38, 1.6, 9, 0.2],
  "tomato sauce": [32, 1.5, 7, 0.2],
  "tomato paste": [82, 4.3, 19, 0.5],
  "chopped tomatoes": [18, 0.9, 3.9, 0.2],
  tomato: [18, 0.9, 3.9, 0.2],
  "light coconut milk": [96, 1, 2, 10],
  "coconut milk": [230, 2.3, 6, 24],
  "light mayonnaise": [360, 1, 8, 35],
  mayonnaise: [680, 1, 1, 75],
  avocado: [160, 2, 9, 15],
  "black beans": [132, 8.9, 24, 0.5],
  "kidney beans": [127, 8.7, 23, 0.5],
  chickpeas: [164, 8.9, 27, 2.6],
  lentils: [116, 9, 20, 0.4],
  beans: [127, 9, 23, 0.5],
  broccoli: [34, 2.8, 7, 0.4],
  spinach: [23, 2.9, 3.6, 0.4],
  kale: [49, 4.3, 9, 0.9],
  mushroom: [22, 3.1, 3.3, 0.3],
  "bell pepper": [26, 1, 6, 0.3],
  zucchini: [17, 1.2, 3.1, 0.3],
  courgette: [17, 1.2, 3.1, 0.3],
  cucumber: [15, 0.7, 3.6, 0.1],
  carrot: [41, 0.9, 10, 0.2],
  celery: [16, 0.7, 3, 0.2],
  peas: [81, 5, 14, 0.4],
  corn: [86, 3.3, 19, 1.4],
  cabbage: [25, 1.3, 6, 0.1],
  lettuce: [15, 1.4, 2.9, 0.2],
  "soy sauce": [53, 8, 5, 0.6],
  "fish sauce": [35, 5, 4, 0],
  "oyster sauce": [51, 1.4, 11, 0.3],
  "peanut butter": [588, 25, 20, 50],
  peanuts: [567, 26, 16, 49],
  cashews: [553, 18, 30, 44],
  almonds: [579, 21, 22, 50],
  "chicken stock": [4, 0.4, 0.4, 0.1],
  "beef stock": [4, 0.4, 0.4, 0.1],
  stock: [4, 0.4, 0.4, 0.1],
  broth: [4, 0.4, 0.4, 0.1],
  wine: [83, 0.1, 2.6, 0],
  "lemon juice": [22, 0.4, 6.9, 0.2],
  lemon: [29, 1.1, 9, 0.3],
  lime: [30, 0.7, 11, 0.2],
  cornstarch: [381, 0.3, 91, 0.1],
  cornflour: [381, 0.3, 91, 0.1],
};

// Typical weight in grams of one whole item, for count-style measures ("2 eggs")
const UNIT_WEIGHTS: Record<string, number> = {
  egg: 50,
  onion: 110,
  tomato: 120,
  carrot: 60,
  potato: 170,
  "sweet potato": 130,
  "bell pepper": 120,
  zucchini: 200,
  courgette: 200,
  lemon: 65,
  lime: 65,
  avocado: 150,
  garlic: 5,
  mushroom: 18,
  tortilla: 45,
};

const DEFAULT_ITEM_WEIGHT = 80;

// Grams per US cup for ingredients that are much lighter or heavier than
// water (the 240g default). Keyed to nutrition-table keys.
const CUP_WEIGHTS: Record<string, number> = {
  flour: 125,
  cornstarch: 128,
  cornflour: 128,
  breadcrumbs: 60,
  "bread crumbs": 60,
  parmesan: 100,
  cheddar: 113,
  "reduced-fat cheddar": 113,
  mozzarella: 113,
  cheese: 113,
  feta: 150,
  sugar: 200,
  "monk fruit sweetener": 200,
  rice: 185,
  "brown rice": 185,
  quinoa: 170,
  pasta: 100,
  macaroni: 100,
  penne: 100,
  noodles: 100,
  "rice noodles": 100,
  "cauliflower rice": 110,
  "zucchini noodles": 124,
  "courgette noodles": 124,
  oats: 90,
  spinach: 30,
  kale: 20,
  lettuce: 47,
  broccoli: 90,
  mushroom: 70,
  onion: 160,
  carrot: 128,
  celery: 100,
  "bell pepper": 150,
  peas: 145,
  corn: 165,
  cabbage: 90,
  potato: 150,
  "sweet potato": 130,
  tomato: 180,
  "black beans": 180,
  "kidney beans": 180,
  chickpeas: 165,
  lentils: 200,
  beans: 180,
  honey: 340,
  "maple syrup": 315,
  "peanut butter": 258,
  peanuts: 145,
  cashews: 140,
  almonds: 140,
  butter: 227,
  "light butter": 227,
  "olive oil": 218,
  "vegetable oil": 218,
  "sesame oil": 218,
  "coconut oil": 218,
  oil: 218,
  "greek yogurt": 245,
  yogurt: 245,
  "sour cream": 230,
  mayonnaise: 220,
  "light mayonnaise": 220,
  avocado: 150,
};

function cupWeightFor(ingredientName: string): number {
  const hit = lookupNutrition(ingredientName);
  if (hit && CUP_WEIGHTS[hit.key] !== undefined) return CUP_WEIGHTS[hit.key];
  return 240;
}

/* ---------- Runtime food registry ---------- */

// Foods resolved at runtime from an external source (USDA FoodData Central,
// see lib/usda.ts) land here, keyed by the plain ingredient term they were
// looked up under. The static table above always wins: it is hand-tuned for
// the way recipes actually name things, and it is what the swap rules and the
// price table are keyed to. This registry is purely the long tail.
const RUNTIME: Record<string, [number, number, number, number]> = {};

export function registerFood(key: string, per100g: Macros): void {
  const k = key.toLowerCase().trim();
  if (!k || k in N) return;
  RUNTIME[k] = [per100g.calories, per100g.protein, per100g.carbs, per100g.fat];
}

/** Drop every runtime-registered food. Tests use this to stay deterministic. */
export function resetRuntimeFoods(): void {
  for (const k of Object.keys(RUNTIME)) delete RUNTIME[k];
}

/** Every key in the built-in table, in declaration order. */
export function staticFoodKeys(): string[] {
  return Object.keys(N);
}

/** Per-100g macros for an exact table key, static or runtime. */
export function foodMacros(key: string): Macros | null {
  const row = N[key] ?? RUNTIME[key];
  if (!row) return null;
  return { calories: row[0], protein: row[1], carbs: row[2], fat: row[3] };
}

/**
 * Find the best (longest) nutrition match inside an ingredient name.
 *
 * Longest-wins is what makes "chicken stock" score as stock rather than as a
 * chunk of chicken breast. The static table is searched first and only falls
 * through to runtime entries when nothing built-in matched at all, so a USDA
 * row can never quietly displace a curated one.
 */
export function lookupNutrition(
  name: string,
): { key: string; per100g: Macros; source: "table" | "external" } | null {
  const lower = name.toLowerCase();
  const pick = (table: Record<string, [number, number, number, number]>) => {
    let best: string | null = null;
    for (const key of Object.keys(table)) {
      if (lower.includes(key) && (!best || key.length > best.length)) {
        best = key;
      }
    }
    return best;
  };

  const staticHit = pick(N);
  const key = staticHit ?? pick(RUNTIME);
  if (!key) return null;
  const [calories, protein, carbs, fat] = staticHit ? N[key] : RUNTIME[key];
  return {
    key,
    per100g: { calories, protein, carbs, fat },
    source: staticHit ? "table" : "external",
  };
}

const FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
};

function parseQuantity(measure: string): { qty: number; rest: string } | null {
  let m = measure.trim().toLowerCase();
  let qty = 0;
  let matched = false;

  // unicode fraction, possibly after a whole number: "1½"
  const uni = m.match(/^(\d+)?\s*([½¼¾⅓⅔⅛])/);
  if (uni) {
    qty = (uni[1] ? parseInt(uni[1], 10) : 0) + FRACTIONS[uni[2]];
    m = m.slice(uni[0].length);
    matched = true;
  } else {
    // "1 1/2", "3/4", "2.5", "2"
    const frac = m.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    const simple = m.match(/^(\d+)\s*\/\s*(\d+)/);
    const dec = m.match(/^(\d*\.?\d+)/);
    if (frac) {
      qty = parseInt(frac[1], 10) + parseInt(frac[2], 10) / parseInt(frac[3], 10);
      m = m.slice(frac[0].length);
      matched = true;
    } else if (simple) {
      qty = parseInt(simple[1], 10) / parseInt(simple[2], 10);
      m = m.slice(simple[0].length);
      matched = true;
    } else if (dec) {
      qty = parseFloat(dec[1]);
      m = m.slice(dec[0].length);
      matched = true;
    }
  }

  if (!matched) return null;
  return { qty, rest: m.trim() };
}

const UNIT_GRAMS: [RegExp, number][] = [
  [/^kgs?\b|^kilograms?\b/, 1000],
  [/^g\b|^grams?\b|^gr\b/, 1],
  [/^lbs?\b|^pounds?\b/, 453.6],
  [/^oz\b|^ounces?\b/, 28.35],
  [/^ml\b|^millilit/, 1],
  [/^litres?\b|^liters?\b|^l\b/, 1000],
  [/^cloves?\b/, 5],
  [/^cans?\b|^tins?\b/, 400],
  [/^sticks?\b/, 113],
  [/^slices?\b/, 25],
  [/^pinch|^dash/, 1],
  [/^handful/, 30],
  [/^sprigs?\b|^leaves?\b|^leaf\b/, 2],
];

/**
 * Convert a free-text measure like "1 lb", "2 tbsp", "300ml", "2" into grams.
 * Returns null when the measure is unparseable ("to taste", "garnish").
 */
export function measureToGrams(
  measure: string,
  ingredientName: string,
): number | null {
  if (!measure || /to taste|garnish|topping|serve/i.test(measure)) return null;

  const parsed = parseQuantity(measure);
  if (!parsed) return null;
  const { qty, rest } = parsed;

  // Volume measures scale with the ingredient's density (1 cup = 16 tbsp = 48 tsp)
  if (/^cups?\b/.test(rest)) return qty * cupWeightFor(ingredientName);
  if (/^tbsp?s?\b|^tablespoons?\b|^tbls?\b/.test(rest))
    return (qty * cupWeightFor(ingredientName)) / 16;
  if (/^tsps?\b|^teaspoons?\b/.test(rest))
    return (qty * cupWeightFor(ingredientName)) / 48;

  for (const [re, grams] of UNIT_GRAMS) {
    if (re.test(rest)) return qty * grams;
  }

  // No recognizable unit — treat as a count of whole items ("2 eggs", "1 onion")
  const lower = ingredientName.toLowerCase();
  for (const key of Object.keys(UNIT_WEIGHTS)) {
    if (lower.includes(key)) return qty * UNIT_WEIGHTS[key];
  }
  return qty * DEFAULT_ITEM_WEIGHT;
}

export interface SwapRule {
  pattern: RegExp;
  replacement: string;
  reason: string;
}

// Macro-friendly ingredient swaps. Replacement names must resolve in the
// nutrition table so modified macros can be computed.
export const SWAP_RULES: SwapRule[] = [
  {
    pattern: /sour cream/i,
    replacement: "Nonfat Greek yogurt",
    reason: "Cuts fat by ~90% and quadruples protein for the same creaminess.",
  },
  {
    pattern: /heavy cream|double cream/i,
    replacement: "Evaporated milk",
    reason: "Keeps the sauce silky with a fraction of the fat and calories.",
  },
  {
    pattern: /ground beef|beef mince|minced beef/i,
    replacement: "Lean ground turkey",
    reason: "Similar texture with roughly 40% fewer calories and much less fat.",
  },
  {
    pattern: /pork belly/i,
    replacement: "Pork tenderloin",
    reason: "One of the leanest cuts — most of the flavor, a tenth of the fat.",
  },
  {
    pattern: /chicken thigh/i,
    replacement: "Chicken breast",
    reason: "Trades some richness for a leaner, higher-protein cut.",
  },
  {
    // Not anchored: these rules also run against whole ingredient lines
    // ("200 g bacon, diced"), where a ^ anchor would never match. The
    // lookbehind stops "turkey bacon" from being swapped into itself.
    pattern: /(?<!turkey )\bbacon\b/i,
    replacement: "Turkey bacon",
    reason: "About 60% less fat per slice.",
  },
  {
    pattern: /butter/i,
    replacement: "Light butter",
    reason: "Half the fat and calories; use the same amount.",
  },
  {
    pattern: /mayonnaise|mayo/i,
    replacement: "Light mayonnaise",
    reason: "Roughly half the calories of full-fat mayo.",
  },
  {
    pattern: /cream cheese/i,
    replacement: "Light cream cheese",
    reason: "Cuts fat by more than half while staying spreadable.",
  },
  {
    pattern: /cheddar|monterey jack|colby/i,
    replacement: "Reduced-fat cheddar",
    reason: "Keeps the protein, drops about a third of the calories.",
  },
  {
    pattern: /fettuccine|spaghetti|linguine|penne|macaroni|\bpasta\b/i,
    replacement: "Chickpea pasta",
    reason: "Nearly double the protein and fewer net carbs than white pasta.",
  },
  {
    pattern: /white rice|jasmine rice|basmati rice/i,
    replacement: "Cauliflower rice",
    reason: "Drops ~340 calories and ~75g carbs per 100g dry rice replaced.",
  },
  {
    pattern: /flour tortilla/i,
    replacement: "Low-carb tortilla",
    reason: "Saves ~15g carbs per tortilla with extra fiber and protein.",
  },
  {
    pattern: /coconut milk/i,
    replacement: "Light coconut milk",
    reason: "Same flavor base with ~60% less fat.",
  },
  {
    pattern: /\bsugar\b/i,
    replacement: "Monk fruit sweetener",
    reason: "Zero-calorie 1:1 sugar substitute.",
  },
  {
    pattern: /whole milk|full[- ]fat milk|^milk$/i,
    replacement: "Skim milk",
    reason: "Same calcium and protein, almost no fat.",
  },
];

export function emptyMacros(): Macros {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function addMacros(total: Macros, per100g: Macros, grams: number): void {
  const f = grams / 100;
  total.calories += per100g.calories * f;
  total.protein += per100g.protein * f;
  total.carbs += per100g.carbs * f;
  total.fat += per100g.fat * f;
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    calories: m.calories * factor,
    protein: m.protein * factor,
    carbs: m.carbs * factor,
    fat: m.fat * factor,
  };
}

/* ---------- Food families, for data-driven swap candidates ---------- */

/**
 * Culinary families whose members can stand in for one another by weight.
 *
 * The hand-written SWAP_RULES above only cover 17 pairs, which leaves plenty
 * of recipes with nothing to try. Grouping the table lets the search generate
 * a candidate for any listed ingredient — every member of its family — and
 * then judge each one against the user's actual target, the same way the rules
 * are judged.
 *
 * Membership is deliberately tight. Nothing here should read as absurd on the
 * page: rice and quinoa trade places, garlic and lettuce do not. Ingredients
 * with no family (aromatics, tomato products, stocks, spices) are never
 * generated as candidates, though a rule may still name one.
 */
export const FOOD_FAMILY: Record<string, string> = {
  // Poultry, sold and cooked interchangeably
  "chicken breast": "poultry",
  "chicken thigh": "poultry",
  chicken: "poultry",
  turkey: "poultry",
  // Red meat and mince — what you brown in a pan for a sauce or a taco
  "ground beef": "red meat",
  "beef mince": "red meat",
  "minced beef": "red meat",
  "lean ground turkey": "red meat",
  steak: "red meat",
  beef: "red meat",
  lamb: "red meat",
  pork: "red meat",
  "pork belly": "red meat",
  "pork tenderloin": "red meat",
  // Cured pork, used for its salt and fat rather than as a portion of meat
  bacon: "cured pork",
  "turkey bacon": "cured pork",
  // Fish and shellfish
  salmon: "seafood",
  tuna: "seafood",
  cod: "seafood",
  "white fish": "seafood",
  shrimp: "seafood",
  prawns: "seafood",
  // Cooking fats, all measured by the spoonful
  butter: "cooking fat",
  "light butter": "cooking fat",
  "olive oil": "cooking fat",
  "vegetable oil": "cooking fat",
  "sesame oil": "cooking fat",
  "coconut oil": "cooking fat",
  oil: "cooking fat",
  // Pourable dairy — what enriches a sauce
  "heavy cream": "pourable dairy",
  "double cream": "pourable dairy",
  "evaporated milk": "pourable dairy",
  "half and half": "pourable dairy",
  cream: "pourable dairy",
  "skim milk": "pourable dairy",
  milk: "pourable dairy",
  "coconut milk": "pourable dairy",
  "light coconut milk": "pourable dairy",
  // Spoonable cultured dairy — dollops and dressings
  "greek yogurt": "cultured dairy",
  yogurt: "cultured dairy",
  "sour cream": "cultured dairy",
  // Cheese. Soft and hard are kept apart: a spread is not a grating cheese.
  "cream cheese": "soft cheese",
  "light cream cheese": "soft cheese",
  feta: "soft cheese",
  parmesan: "hard cheese",
  cheddar: "hard cheese",
  "reduced-fat cheddar": "hard cheese",
  "reduced-fat cheese": "hard cheese",
  mozzarella: "hard cheese",
  cheese: "hard cheese",
  // Dried pasta shapes
  "chickpea pasta": "pasta",
  "whole-wheat pasta": "pasta",
  fettuccine: "pasta",
  spaghetti: "pasta",
  linguine: "pasta",
  penne: "pasta",
  macaroni: "pasta",
  lasagne: "pasta",
  pasta: "pasta",
  noodles: "pasta",
  "rice noodles": "pasta",
  "zucchini noodles": "pasta",
  "courgette noodles": "pasta",
  // Grains and their low-carb stand-ins
  rice: "grain",
  "brown rice": "grain",
  quinoa: "grain",
  "cauliflower rice": "grain",
  // Starchy vegetables served as the base of a plate
  potato: "starchy vegetable",
  "sweet potato": "starchy vegetable",
  // Wrappers
  tortilla: "wrap",
  "low-carb tortilla": "wrap",
  // Crumb coatings
  breadcrumbs: "crumb",
  "bread crumbs": "crumb",
  // Sweeteners, measured 1:1 in most recipes
  sugar: "sweetener",
  "monk fruit sweetener": "sweetener",
  honey: "sweetener",
  "maple syrup": "sweetener",
  // Creamy condiments
  mayonnaise: "creamy condiment",
  "light mayonnaise": "creamy condiment",
  // Pulses
  "black beans": "pulse",
  "kidney beans": "pulse",
  chickpeas: "pulse",
  lentils: "pulse",
  beans: "pulse",
  // Nuts and nut butters are bought by the bag and used by the handful
  peanuts: "nut",
  cashews: "nut",
  almonds: "nut",
  // Leafy greens that wilt into the same dishes
  spinach: "leafy green",
  kale: "leafy green",
  cabbage: "leafy green",
};

// family -> members, built once
const FAMILY_MEMBERS: Record<string, string[]> = {};
for (const [key, family] of Object.entries(FOOD_FAMILY)) {
  (FAMILY_MEMBERS[family] ??= []).push(key);
}

/**
 * Every table key that could plausibly replace `key`, excluding `key` itself
 * and anything that resolves to the same numbers (the pasta shapes are all
 * one nutrition row, so swapping linguine for penne is not a swap).
 */
export function familyAlternatives(key: string): string[] {
  const family = FOOD_FAMILY[key];
  if (!family) return [];
  const mine = foodMacros(key);
  if (!mine) return [];
  return FAMILY_MEMBERS[family].filter((other) => {
    if (other === key) return false;
    const theirs = foodMacros(other);
    if (!theirs) return false;
    return (
      Math.abs(theirs.calories - mine.calories) > 1 ||
      Math.abs(theirs.protein - mine.protein) > 0.5 ||
      Math.abs(theirs.carbs - mine.carbs) > 0.5 ||
      Math.abs(theirs.fat - mine.fat) > 0.5
    );
  });
}
