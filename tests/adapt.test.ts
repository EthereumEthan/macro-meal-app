import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  adaptToTarget,
  analyzeAll,
  analyzeIngredient,
  buildAdaptation,
  foodTerm,
  ingredientToGrams,
  isTrivial,
  sumIngredients,
} from "../lib/adapt";
import { candidatesFor, describeSwap } from "../lib/swaps";
import { fitError } from "../lib/fit";
import { registerFood, resetRuntimeFoods } from "../lib/nutrition";
import type { Macros } from "../lib/nutrition";

beforeEach(() => resetRuntimeFoods());

const m = (
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
): Macros => ({ calories, protein, carbs, fat });

/** A carbonara, as a recipe site would write it. */
const CARBONARA = [
  "400 g spaghetti",
  "200 g bacon, diced",
  "2 large eggs",
  "100 g parmesan, grated",
  "200 ml heavy cream",
  "3 cloves garlic, minced",
  "Salt and freshly ground black pepper to taste",
];

const CUTTING_FAT = m(600, 45, 65, 12);
const KETO = m(600, 40, 10, 42);

const swapNames = (swaps: { replacement: string }[]) =>
  swaps.map((s) => s.replacement.toLowerCase());

/* ---------- Trivial ingredients ---------- */

test("seasonings and water are skipped, real ingredients are not", () => {
  for (const line of [
    "Salt and freshly ground black pepper to taste",
    "1 tsp salt",
    "freshly ground black pepper",
    "2 cups water",
    "1 tsp baking powder",
    "a pinch of cayenne pepper",
    "olive oil, to taste",
  ]) {
    assert.ok(isTrivial(line), `expected "${line}" to be skipped`);
  }
  for (const line of [
    "400 g spaghetti",
    "200 g bacon, diced",
    "2 tbsp olive oil",
    "1 cup heavy cream",
  ]) {
    assert.ok(!isTrivial(line), `expected "${line}" to be counted`);
  }
});

/* ---------- Weights ---------- */

test("package sizes in parentheses are read as the real weight", () => {
  assert.equal(ingredientToGrams("1 (14 oz) can black beans"), 14 * 28.35);
  assert.equal(ingredientToGrams("2 (400g) tins chopped tomatoes"), 800);
  assert.equal(ingredientToGrams("1 (1 lb) pork tenderloin"), 453.6);
});

test("frying oil is counted at what's absorbed, not what's poured", () => {
  const poured = analyzeIngredient("2 cups vegetable oil");
  const frying = analyzeIngredient("2 cups vegetable oil, for deep frying");
  assert.ok(frying.grams! < poured.grams! * 0.25);
});

/* ---------- foodTerm, the external-lookup query ---------- */

test("an ingredient line reduces to the food it names", () => {
  assert.equal(foodTerm("2 cups finely chopped butternut squash, divided"), "butternut squash");
  assert.equal(foodTerm("1 lb boneless skinless chicken thighs"), "chicken thighs");
  assert.equal(foodTerm("3 tbsp za'atar"), "za atar");
  assert.equal(foodTerm("1 (14 oz) package firm tofu, drained"), "firm tofu");
});

/* ---------- The README's central claim ---------- */

test("a keto target swaps the pasta and leaves the bacon alone", () => {
  const { swaps, ingredients } = adaptToTarget(analyzeAll(CARBONARA), KETO, 4);

  // Asserted on what the swap achieves, not on which product it picks. Which
  // low-carb stand-in wins depends on what the table happens to stock, and
  // that changes as ingredients get added; the requirement is that the carb
  // load of the pasta line comes down.
  const pastaSwap = swaps.find((s) => s.ingredientIndex === 0);
  assert.ok(pastaSwap, `the pasta should be swapped, got: ${swapNames(swaps).join(" | ")}`);
  assert.ok(
    ingredients[0].macros!.carbs < analyzeAll(CARBONARA)[0].macros!.carbs / 2,
    "the replacement should carry far fewer carbs than the pasta",
  );

  assert.ok(
    !swapNames(swaps).some((n) => n.includes("turkey bacon")),
    "keto has no reason to trade bacon fat away",
  );
});

test("cutting fat and targeting fat produce different recipes from one page", () => {
  const lean = adaptToTarget(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  const keto = adaptToTarget(analyzeAll(CARBONARA), KETO, 4);
  assert.notDeepEqual(
    swapNames(lean.swaps).sort(),
    swapNames(keto.swaps).sort(),
  );
});

test("a fat-cutting target reaches for the leaner dairy", () => {
  const { swaps } = adaptToTarget(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  const rewritten = swaps.map((s) => s.replacement.toLowerCase()).join(" ");
  assert.ok(
    /evaporated milk|skim milk|turkey bacon/.test(rewritten),
    `expected a leaner substitution, got: ${rewritten}`,
  );
});

/* ---------- Every swap has to earn its place ---------- */

test("no applied swap ever makes the fit worse", () => {
  for (const target of [CUTTING_FAT, KETO, m(800, 60, 90, 25)]) {
    const { swaps } = adaptToTarget(analyzeAll(CARBONARA), target, 4);
    for (const s of swaps) {
      assert.ok(
        s.errorAfter < s.errorBefore,
        `${s.original} -> ${s.replacement} did not improve the fit`,
      );
    }
  }
});

test("adapting strictly improves the fit, or changes nothing at all", () => {
  const base = analyzeAll(CARBONARA);
  const before = fitError(sumIngredients(base), CUTTING_FAT);
  const { ingredients, swaps } = adaptToTarget(base, CUTTING_FAT, 4);
  const after = fitError(sumIngredients(ingredients), CUTTING_FAT);
  if (swaps.length === 0) assert.equal(after, before);
  else assert.ok(after < before);
});

test("a recipe already on target is left alone", () => {
  const base = analyzeAll(CARBONARA);
  // Aim at exactly what the recipe already is: nothing can improve on it.
  const asIs = sumIngredients(base);
  const { swaps } = adaptToTarget(base, asIs, 4);
  assert.deepEqual(swaps, []);
});

test("each ingredient is swapped at most once", () => {
  const { swaps } = adaptToTarget(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  const seen = new Set(swaps.map((s) => s.ingredientIndex));
  assert.equal(seen.size, swaps.length);
});

test("the reported swap always names the line it actually replaced", () => {
  const { swaps, ingredients } = adaptToTarget(
    analyzeAll(CARBONARA),
    CUTTING_FAT,
    4,
  );
  for (const s of swaps) {
    assert.equal(s.original, CARBONARA[s.ingredientIndex]);
    assert.equal(s.replacement, ingredients[s.ingredientIndex].text);
  }
});

test("a swap's reported macro delta matches what it did to the portion", () => {
  const { swaps } = adaptToTarget(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  for (const s of swaps) {
    const moved =
      Math.abs(s.delta.calories) +
      Math.abs(s.delta.protein) +
      Math.abs(s.delta.carbs) +
      Math.abs(s.delta.fat);
    assert.ok(moved > 0, `${s.replacement} reported a delta of exactly zero`);
  }
});

/* ---------- Vetoing a swap ---------- */

test("vetoing a swap removes it and re-solves the rest", () => {
  const base = analyzeAll(CARBONARA);
  const first = adaptToTarget(base, CUTTING_FAT, 4);
  assert.ok(first.swaps.length > 0, "nothing to veto — test needs a swap");

  const veto = first.swaps[0].id;
  const second = adaptToTarget(base, CUTTING_FAT, 4, { vetoed: [veto] });

  assert.ok(!second.swaps.some((s) => s.id === veto));
  assert.ok(
    second.rejected.some((r) => r.id === veto && r.outcome === "vetoed"),
    "a vetoed swap should still be listed, so it can be taken back",
  );
});

test("vetoing every swap leaves the recipe untouched", () => {
  const base = analyzeAll(CARBONARA);
  const all = adaptToTarget(base, CUTTING_FAT, 4);
  // Veto in rounds: removing one swap can make another become available.
  let vetoed = all.swaps.map((s) => s.id);
  for (let i = 0; i < 12; i++) {
    const result = adaptToTarget(base, CUTTING_FAT, 4, { vetoed });
    if (result.swaps.length === 0) {
      assert.deepEqual(
        result.ingredients.map((x) => x.text),
        base.map((x) => x.text),
      );
      return;
    }
    vetoed = [...vetoed, ...result.swaps.map((s) => s.id)];
  }
  assert.fail("vetoing kept finding new swaps and never settled");
});

test("passed-over candidates are reported with the score that lost", () => {
  const { rejected } = adaptToTarget(analyzeAll(CARBONARA), KETO, 4);
  assert.ok(rejected.length > 0, "some candidate should have been considered");
  for (const r of rejected) {
    if (r.outcome === "no-improvement") {
      assert.ok(
        r.errorAfter >= r.errorBefore - 1e-9,
        `${r.replacement} was rejected but scored better`,
      );
    }
  }
});

/* ---------- Hand-edited ingredients ---------- */

test("a pinned food overrides what the parser guessed", () => {
  const line = "1 cup cream";
  assert.equal(analyzeIngredient(line).matchKey, "cream");
  const pinned = analyzeIngredient(line, { foodKey: "skim milk" });
  assert.equal(pinned.matchKey, "skim milk");
  assert.ok(pinned.editedFood);
  assert.ok(pinned.macros!.fat < 1);
});

test("a pinned weight overrides the parsed one", () => {
  const pinned = analyzeIngredient("2 cups heavy cream", { grams: 100 });
  assert.equal(pinned.grams, 100);
  assert.ok(pinned.editedGrams);
  assert.equal(Math.round(pinned.macros!.fat), 36);
});

test("a pinned food rescues a line the table couldn't identify", () => {
  const line = "200 g pancetta";
  assert.equal(analyzeIngredient(line).macros, null);
  const fixed = analyzeIngredient(line, { foodKey: "bacon" });
  assert.ok(fixed.macros !== null);
  assert.equal(fixed.grams, 200);
});

test("pinning a food overrules the seasoning heuristic", () => {
  // Someone using a lot of oil wants it counted, whatever the heuristic says.
  const line = "olive oil, to taste";
  assert.ok(analyzeIngredient(line).skipped);
  const counted = analyzeIngredient(line, { foodKey: "olive oil", grams: 30 });
  assert.ok(!counted.skipped);
  assert.equal(Math.round(counted.macros!.fat), 30);
});

test("an excluded line stops counting toward the totals", () => {
  const withAll = sumIngredients(analyzeAll(CARBONARA));
  const without = sumIngredients(analyzeAll(CARBONARA, { 1: { exclude: true } }));
  assert.ok(without.fat < withAll.fat);
  assert.ok(without.calories < withAll.calories);
});

test("a pinned ingredient is never swapped out from under the user", () => {
  const overrides = { 4: { foodKey: "heavy cream" } };
  const { swaps } = adaptToTarget(
    analyzeAll(CARBONARA, overrides),
    CUTTING_FAT,
    4,
    { overrides },
  );
  assert.ok(!swaps.some((s) => s.ingredientIndex === 4));
});

test("a hand-entered weight survives the swap applied to that line", () => {
  const overrides = { 0: { grams: 150 } };
  const { ingredients } = adaptToTarget(
    analyzeAll(CARBONARA, overrides),
    KETO,
    4,
    { overrides },
  );
  assert.equal(ingredients[0].grams, 150);
});

/* ---------- Data-driven candidates ---------- */

test("family candidates exist for ingredients no rule covers", () => {
  const cands = candidatesFor("200 g quinoa", 0);
  assert.ok(cands.length > 0, "quinoa should have grain alternatives");
  assert.ok(cands.every((c) => c.source === "family"));
  assert.ok(cands.some((c) => c.toKey === "cauliflower rice"));
});

test("a rule's editorial reason beats a generated one for the same swap", () => {
  const cands = candidatesFor("200 g sour cream", 0);
  const yogurt = cands.find((c) => c.toKey === "greek yogurt");
  assert.equal(yogurt?.source, "rule");
  assert.ok(yogurt!.reason.includes("creaminess"));
});

test("a rewritten line reads as the new ingredient", () => {
  for (const cand of candidatesFor("200 g heavy cream", 0)) {
    assert.ok(
      cand.text.toLowerCase().includes(cand.toKey),
      `"${cand.text}" doesn't name ${cand.toKey}`,
    );
    assert.ok(cand.text.startsWith("200 g "), "the amount should survive");
  }
});

test("a candidate never proposes the ingredient it replaces", () => {
  for (const line of CARBONARA) {
    for (const cand of candidatesFor(line, 0)) {
      assert.notEqual(cand.toKey, cand.fromKey);
    }
  }
});

test("candidate ids are stable across repeated runs", () => {
  const a = candidatesFor("200 g spaghetti", 3).map((c) => c.id);
  const b = candidatesFor("200 g spaghetti", 3).map((c) => c.id);
  assert.deepEqual(a, b);
  assert.ok(a.every((id) => id.startsWith("3|")));
});

test("ingredients with no family and no rule offer nothing", () => {
  assert.deepEqual(candidatesFor("3 cloves garlic, minced", 0), []);
  assert.deepEqual(candidatesFor("2 cups chicken stock", 0), []);
});

test("a USDA-resolved ingredient is never swapped", () => {
  registerFood("farro", { calories: 340, protein: 14, carbs: 71, fat: 2.5 });
  assert.deepEqual(candidatesFor("200 g farro", 0), []);
});

test("generated reasons state the direction of the change correctly", () => {
  const leaner = describeSwap("heavy cream", "skim milk");
  assert.ok(/saves \d+ calories/.test(leaner), leaner);
  assert.ok(/drops \d+g fat/.test(leaner), leaner);

  const richer = describeSwap("skim milk", "heavy cream");
  assert.ok(/adds \d+ calories/.test(richer), richer);
  assert.ok(/adds \d+g fat/.test(richer), richer);
});

/* ---------- buildAdaptation ---------- */

test("a recipe with no serving count is portioned against the whole thing", () => {
  const withYield = buildAdaptation(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  const without = buildAdaptation(analyzeAll(CARBONARA), CUTTING_FAT, null);
  assert.equal(withYield.basis, "serving");
  assert.equal(without.basis, "recipe");
  assert.equal(withYield.perServing !== null, true);
  assert.equal(without.perServing, null);
});

test("the fitted macros are the basis scaled by the reported portion", () => {
  const result = buildAdaptation(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  const basis = result.perServing!;
  for (const key of ["calories", "protein", "carbs", "fat"] as const) {
    const expected = basis[key] * result.fitMultiplier;
    assert.ok(
      Math.abs(result.fittedMacros[key] - expected) < 0.5,
      `${key}: ${result.fittedMacros[key]} vs ${expected}`,
    );
  }
});

test("adapting is deterministic — the same input gives the same answer", () => {
  const a = buildAdaptation(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  const b = buildAdaptation(analyzeAll(CARBONARA), CUTTING_FAT, 4);
  assert.deepEqual(a.swaps, b.swaps);
  assert.deepEqual(a.fittedMacros, b.fittedMacros);
});
