import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  FOOD_FAMILY,
  familyAlternatives,
  foodMacros,
  lookupNutrition,
  measureToGrams,
  registerFood,
  resetRuntimeFoods,
  staticFoodKeys,
} from "../lib/nutrition";
import { PRICE_PER_100G } from "../lib/prices";

beforeEach(() => resetRuntimeFoods());

/* ---------- lookupNutrition ---------- */

test("the longest matching key wins, so qualifiers beat bare nouns", () => {
  assert.equal(lookupNutrition("2 cups chicken stock")?.key, "chicken stock");
  assert.equal(lookupNutrition("1 cup heavy cream")?.key, "heavy cream");
  assert.equal(lookupNutrition("400ml coconut milk")?.key, "coconut milk");
  assert.equal(lookupNutrition("200 g chicken breast")?.key, "chicken breast");
  assert.equal(lookupNutrition("1 lb ground beef")?.key, "ground beef");
});

test("an unrecognizable ingredient matches nothing rather than guessing", () => {
  assert.equal(lookupNutrition("2 tbsp za'atar"), null);
  assert.equal(lookupNutrition("1 cup farro"), null);
});

test("matches from the built-in table are labelled as such", () => {
  assert.equal(lookupNutrition("1 cup rice")?.source, "table");
});

/* ---------- The runtime (USDA) registry ---------- */

test("a registered food fills a gap the built-in table left", () => {
  assert.equal(lookupNutrition("1 cup farro"), null);
  registerFood("farro", { calories: 340, protein: 14, carbs: 71, fat: 2.5 });
  const hit = lookupNutrition("1 cup farro");
  assert.equal(hit?.key, "farro");
  assert.equal(hit?.source, "external");
  assert.equal(hit?.per100g.protein, 14);
});

test("a registered food can never displace a curated one", () => {
  // Even an exact collision with a table key is refused outright...
  registerFood("rice", { calories: 1, protein: 1, carbs: 1, fat: 1 });
  assert.equal(lookupNutrition("1 cup rice")?.per100g.calories, 365);

  // ...and a longer runtime key still loses to any static match, because the
  // static table is searched to exhaustion first.
  registerFood("jasmine rice", { calories: 1, protein: 1, carbs: 1, fat: 1 });
  const hit = lookupNutrition("1 cup jasmine rice");
  assert.equal(hit?.key, "rice");
  assert.equal(hit?.source, "table");
});

test("resetting the registry actually clears it", () => {
  registerFood("farro", { calories: 340, protein: 14, carbs: 71, fat: 2.5 });
  resetRuntimeFoods();
  assert.equal(lookupNutrition("1 cup farro"), null);
});

/* ---------- measureToGrams ---------- */

const grams = (measure: string, name: string) => measureToGrams(measure, name);

test("weight and volume units convert to grams", () => {
  assert.equal(grams("1 lb", "chicken breast"), 453.6);
  assert.equal(grams("500 g", "chicken breast"), 500);
  assert.equal(grams("2 kg", "potato"), 2000);
  assert.equal(grams("8 oz", "cheddar"), 226.8);
  assert.equal(grams("300ml", "milk"), 300);
  assert.equal(grams("1 liter", "stock"), 1000);
});

test("fractions are read in every form a recipe writes them", () => {
  const near = (measure: string, expected: number) =>
    assert.ok(
      Math.abs((grams(measure, "beef") ?? NaN) - expected) < 1e-6,
      `${measure} gave ${grams(measure, "beef")}, expected ${expected}`,
    );
  near("1/2 lb", 226.8);
  near("½ lb", 226.8);
  near("1 1/2 lb", 680.4);
  near("1½ lb", 680.4);
  near("2.5 lb", 1134);
});

test("cup measures use the ingredient's own density, not water's", () => {
  // Flour is famously light for its volume; oil is heavy.
  assert.equal(grams("1 cup", "flour"), 125);
  assert.equal(grams("1 cup", "olive oil"), 218);
  assert.equal(grams("1 cup", "spinach"), 30);
  // A cup of something with no density listed falls back to water.
  assert.equal(grams("1 cup", "chicken stock"), 240);
});

test("spoons are the same density, scaled down", () => {
  assert.equal(grams("16 tbsp", "flour"), 125);
  assert.equal(grams("48 tsp", "flour"), 125);
  assert.equal(grams("1 tbsp", "olive oil"), 218 / 16);
});

test("a bare number is a count of whole items, sized per ingredient", () => {
  assert.equal(grams("2", "eggs"), 100);
  assert.equal(grams("1", "onion"), 110);
  // Sized as three cloves, not three bulbs.
  assert.equal(grams("3", "cloves garlic"), 15);
  // Unknown item, so the generic whole-item weight applies.
  assert.equal(grams("2", "parsnips"), 160);
});

test("unmeasurable amounts return nothing rather than a made-up number", () => {
  assert.equal(grams("to taste", "salt"), null);
  assert.equal(grams("for garnish", "parsley"), null);
  assert.equal(grams("", "parsley"), null);
  assert.equal(grams("a handful", "spinach"), null);
});

/* ---------- Food families ---------- */

test("every food family names keys that exist in the table", () => {
  const known = new Set(staticFoodKeys());
  for (const key of Object.keys(FOOD_FAMILY)) {
    assert.ok(known.has(key), `${key} has a family but no nutrition row`);
  }
});

test("family alternatives exclude the ingredient itself", () => {
  for (const key of Object.keys(FOOD_FAMILY)) {
    assert.ok(
      !familyAlternatives(key).includes(key),
      `${key} was offered as its own replacement`,
    );
  }
});

test("alternatives that resolve to identical macros are not offered", () => {
  // Every dried pasta shape shares one nutrition row, so trading spaghetti for
  // linguine is not a swap and must not be presented as one.
  const alts = familyAlternatives("spaghetti");
  assert.ok(!alts.includes("linguine"));
  assert.ok(!alts.includes("penne"));
  assert.ok(alts.includes("chickpea pasta"));
});

test("families are symmetric — membership goes both ways", () => {
  assert.ok(familyAlternatives("heavy cream").includes("skim milk"));
  assert.ok(familyAlternatives("skim milk").includes("heavy cream"));
});

test("an ingredient with no family generates no candidates", () => {
  // Aromatics and stocks are deliberately unswappable: no target justifies
  // trading garlic for something else.
  assert.deepEqual(familyAlternatives("garlic"), []);
  assert.deepEqual(familyAlternatives("chicken stock"), []);
  assert.deepEqual(familyAlternatives("not a food"), []);
});

/* ---------- Table integrity ---------- */

test("every food has a price, so no basket is silently under-counted", () => {
  for (const key of staticFoodKeys()) {
    assert.ok(
      PRICE_PER_100G[key] !== undefined,
      `${key} has nutrition data but no price`,
    );
  }
});

test("every price points at a real food", () => {
  const known = new Set(staticFoodKeys());
  for (const key of Object.keys(PRICE_PER_100G)) {
    assert.ok(known.has(key), `price for "${key}" matches no nutrition row`);
  }
});

/**
 * Foods whose calories legitimately don't follow from their macros.
 *
 * Sugar alcohols are counted as carbohydrate on a label but pass through
 * largely unmetabolised, which is the entire point of using them. Alcohol
 * carries 7 kcal/g and isn't one of the four macros the app tracks at all, so
 * wine's calories are mostly invisible to this arithmetic.
 */
const ATWATER_EXEMPT = new Set(["monk fruit sweetener", "wine"]);

test("stated calories agree with the macros that make them up", () => {
  const off: string[] = [];
  for (const key of staticFoodKeys()) {
    if (ATWATER_EXEMPT.has(key)) continue;
    const m = foodMacros(key)!;
    const fromMacros = m.protein * 4 + m.carbs * 4 + m.fat * 9;
    // Fibre, alcohol and rounding all drive a wedge between the two, so this
    // is a sanity check for transposed digits, not a precise identity.
    const slack = Math.max(35, m.calories * 0.3);
    if (Math.abs(fromMacros - m.calories) > slack) {
      off.push(
        `${key}: ${m.calories} kcal listed, ${Math.round(fromMacros)} from macros`,
      );
    }
  }
  assert.deepEqual(off, []);
});
