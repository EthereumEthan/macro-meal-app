import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseOverrides,
  parsePastedLines,
  parseVetoed,
  priceIngredients,
} from "../lib/recipe";
import { analyzeAll } from "../lib/adapt";

/* ---------- Pasted ingredient lists ---------- */

test("a pasted list splits on newlines and drops the blanks", () => {
  assert.deepEqual(
    parsePastedLines("400 g spaghetti\n\n200 g bacon\n  \n2 eggs\n"),
    ["400 g spaghetti", "200 g bacon", "2 eggs"],
  );
});

test("bullets and numbering are stripped, amounts are not", () => {
  const pasted = [
    "- 400 g spaghetti",
    "• 200 g bacon",
    "1. 2 large eggs",
    "2) 100 g parmesan",
    "* 200 ml heavy cream",
  ].join("\n");
  assert.deepEqual(parsePastedLines(pasted), [
    "400 g spaghetti",
    "200 g bacon",
    "2 large eggs",
    "100 g parmesan",
    "200 ml heavy cream",
  ]);
});

test("a decimal amount is not mistaken for a numbered list", () => {
  assert.deepEqual(parsePastedLines("1.5 cups heavy cream"), [
    "1.5 cups heavy cream",
  ]);
});

test("a single line pasted out of a paragraph splits on semicolons", () => {
  assert.deepEqual(parsePastedLines("400 g spaghetti; 200 g bacon; 2 eggs"), [
    "400 g spaghetti",
    "200 g bacon",
    "2 eggs",
  ]);
});

test("newlines win over semicolons when both are present", () => {
  // A real list whose lines happen to contain semicolons stays line-based.
  assert.deepEqual(parsePastedLines("400 g spaghetti\n200 g bacon; diced"), [
    "400 g spaghetti",
    "200 g bacon; diced",
  ]);
});

test("an absurdly long paste is capped rather than accepted whole", () => {
  const huge = Array.from({ length: 500 }, (_, i) => `${i} g rice`).join("\n");
  assert.equal(parsePastedLines(huge).length, 60);
});

test("empty input produces no lines rather than one empty one", () => {
  assert.deepEqual(parsePastedLines(""), []);
  assert.deepEqual(parsePastedLines("   \n  \n"), []);
});

/* ---------- Untrusted request fields ---------- */

test("overrides are renumbered and type-checked", () => {
  const parsed = parseOverrides({
    "0": { grams: 250 },
    "2": { foodKey: "Skim Milk" },
    "3": { exclude: true },
  });
  assert.deepEqual(parsed[0], { grams: 250 });
  // Food keys are normalized to the table's own casing rules.
  assert.deepEqual(parsed[2], { foodKey: "skim milk" });
  assert.deepEqual(parsed[3], { exclude: true });
});

test("malformed overrides are dropped, not trusted", () => {
  const parsed = parseOverrides({
    "-1": { grams: 100 },
    abc: { grams: 100 },
    "1.5": { grams: 100 },
    "0": { grams: -5 },
    "1": { grams: "200" },
    "2": { grams: NaN },
    "3": { foodKey: "   " },
    "4": { exclude: "yes" },
    "5": null,
    "6": { nonsense: true },
  });
  assert.deepEqual(parsed, {});
});

test("overrides that aren't an object at all are ignored", () => {
  assert.deepEqual(parseOverrides(null), {});
  assert.deepEqual(parseOverrides("nope"), {});
  assert.deepEqual(parseOverrides(42), {});
});

test("vetoed swap ids are filtered to strings and capped", () => {
  assert.deepEqual(parseVetoed(["0|skim milk", 5, null, "1|bacon"]), [
    "0|skim milk",
    "1|bacon",
  ]);
  assert.deepEqual(parseVetoed("not an array"), []);
  assert.equal(parseVetoed(Array(500).fill("x")).length, 200);
});

/* ---------- Pricing ---------- */

test("only curated foods are priced, so nothing is invented", () => {
  const { ingredients, recipeCost } = priceIngredients(
    analyzeAll([
      "400 g chicken breast",
      "2 tbsp za'atar",
      "Salt and pepper to taste",
    ]),
  );
  // $0.99/100g
  assert.ok(Math.abs(ingredients[0].price! - 3.96) < 0.02);
  assert.equal(ingredients[1].price, null, "unmatched foods aren't priced");
  assert.equal(ingredients[2].price, null, "seasonings aren't priced");
  assert.ok(Math.abs(recipeCost! - 3.96) < 0.02);
});

test("a recipe with nothing priceable reports no cost rather than zero", () => {
  const { recipeCost } = priceIngredients(analyzeAll(["2 tbsp za'atar"]));
  assert.equal(recipeCost, null);
});

test("the recipe cost is the sum of its priced lines", () => {
  const { ingredients, recipeCost } = priceIngredients(
    analyzeAll(["400 g chicken breast", "300 g rice", "200 ml heavy cream"]),
  );
  const summed = ingredients.reduce((s, i) => s + (i.price ?? 0), 0);
  assert.ok(Math.abs(recipeCost! - summed) < 0.02);
});
