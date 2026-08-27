import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestFitPortion,
  combineAtPortions,
  fitError,
  fitPortions,
  isValidTarget,
  targetError,
} from "../lib/fit";
import type { Macros } from "../lib/nutrition";

const m = (
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
): Macros => ({ calories, protein, carbs, fat });

const near = (a: number, b: number, tol = 1e-6) =>
  assert.ok(
    Math.abs(a - b) <= tol,
    `expected ${a} to be within ${tol} of ${b}`,
  );

/* ---------- bestFitPortion ---------- */

test("a recipe whose ratio already matches is eaten at exactly the scale factor", () => {
  const target = m(600, 45, 50, 20);
  // Same macro ratio, a third of the size — eat three of them.
  const basis = m(200, 15, 50 / 3, 20 / 3);
  near(bestFitPortion(basis, target), 3, 1e-9);
});

test("one serving is the answer when the recipe is already the target", () => {
  const target = m(600, 45, 50, 20);
  near(bestFitPortion(target, target), 1, 1e-9);
});

test("portion is clamped to an edible range", () => {
  const target = m(600, 45, 50, 20);
  // Absurdly large recipe: the unclamped optimum is far below 0.25.
  assert.equal(bestFitPortion(m(60000, 4500, 5000, 2000), target), 0.25);
  // Absurdly small one: unclamped optimum is far above 8.
  assert.equal(bestFitPortion(m(6, 0.45, 0.5, 0.2), target), 8);
});

test("macros the target leaves at zero don't constrain the portion", () => {
  // Keto: carbs targeted at 0, so a zero-carb recipe is sized on the rest.
  const target = m(600, 45, 0, 40);
  const basis = m(300, 22.5, 0, 20);
  near(bestFitPortion(basis, target), 2, 1e-9);
});

test("a target of all zeros falls back to one serving rather than dividing by it", () => {
  assert.equal(bestFitPortion(m(600, 45, 50, 20), m(0, 0, 0, 0)), 1);
});

/* ---------- fitError ---------- */

test("fit error is zero exactly when the macro ratio matches", () => {
  const target = m(600, 45, 50, 20);
  near(fitError(target, target), 0, 1e-9);
  // Half-size, same ratio: portioning absorbs it completely.
  near(fitError(m(300, 22.5, 25, 10), target), 0, 1e-9);
});

test("fit error ignores size and measures only ratio", () => {
  const target = m(600, 45, 50, 20);
  const recipe = m(500, 20, 70, 25);
  near(fitError(recipe, target), fitError(m(5000, 200, 700, 250), target), 1e-9);
});

test("a recipe closer to the target ratio scores lower", () => {
  const target = m(600, 45, 50, 20);
  const closer = m(620, 43, 52, 21);
  const further = m(600, 10, 120, 15);
  assert.ok(fitError(closer, target) < fitError(further, target));
});

/* ---------- The claim the README makes about swaps ---------- */

test("the same swap helps one target and hurts another", () => {
  // A carbonara-ish base, and the two candidate versions of its cream line.
  const withCream = m(700, 30, 55, 40);
  const withYogurt = m(560, 38, 56, 22);

  const cuttingFat = m(600, 45, 60, 15);
  const targetingFat = m(600, 30, 20, 42);

  assert.ok(
    fitError(withYogurt, cuttingFat) < fitError(withCream, cuttingFat),
    "the leaner version should fit a fat-cutting target better",
  );
  assert.ok(
    fitError(withCream, targetingFat) < fitError(withYogurt, targetingFat),
    "the richer version should fit a fat-seeking target better",
  );
});

/* ---------- fitPortions: the whole day at once ---------- */

test("a single meal solved as a day agrees with the single-recipe solver", () => {
  const target = m(2000, 150, 200, 65);
  const basis = m(500, 40, 45, 18);
  const [k] = fitPortions([basis], target);
  near(k, bestFitPortion(basis, target), 1e-6);
});

test("two complementary meals combine to hit a day neither could alone", () => {
  const target = m(2000, 150, 200, 65);
  // One protein-heavy and low-carb, one carb-heavy and low-protein.
  const protein = m(400, 55, 10, 12);
  const carb = m(400, 8, 75, 6);

  const portions = fitPortions([protein, carb], target);
  const combined = combineAtPortions([protein, carb], portions);

  const together = targetError(combined, target);
  const proteinAlone = fitError(protein, target);
  const carbAlone = fitError(carb, target);

  assert.ok(
    together < proteinAlone && together < carbAlone,
    `combined day (${together}) should beat either meal alone (${proteinAlone}, ${carbAlone})`,
  );
});

test("solving a day never does worse than the best single meal in it", () => {
  const target = m(2200, 160, 220, 70);
  const meals = [m(500, 40, 45, 18), m(650, 20, 90, 15), m(300, 30, 5, 18)];
  const combined = combineAtPortions(meals, fitPortions(meals, target));
  const best = Math.min(...meals.map((meal) => fitError(meal, target)));
  assert.ok(targetError(combined, target) <= best + 1e-6);
});

test("identical meals split the day evenly between them", () => {
  const target = m(2000, 150, 200, 65);
  const one = m(500, 37.5, 50, 16.25);
  const [a, b] = fitPortions([one, one], target);
  near(a, b, 1e-6);
  // Four servings' worth of the target, split across two dishes.
  near(a + b, 4, 1e-4);
});

test("portions stay inside the requested bounds", () => {
  const target = m(2000, 150, 200, 65);
  // A meal far too large to eat a quarter of, next to a tiny one.
  const portions = fitPortions([m(9000, 700, 900, 300), m(50, 4, 5, 2)], target, {
    min: 0.5,
    max: 3,
  });
  for (const k of portions) {
    assert.ok(k >= 0.5 - 1e-9 && k <= 3 + 1e-9, `portion ${k} out of bounds`);
  }
});

test("an empty day solves to no portions rather than throwing", () => {
  assert.deepEqual(fitPortions([], m(2000, 150, 200, 65)), []);
});

/* ---------- isValidTarget ---------- */

test("targets must be four finite non-negative numbers", () => {
  assert.ok(isValidTarget(m(600, 45, 50, 20)));
  assert.ok(isValidTarget(m(0, 0, 0, 0)));
  assert.ok(!isValidTarget(null));
  assert.ok(!isValidTarget({ calories: 600, protein: 45, carbs: 50 }));
  assert.ok(!isValidTarget({ ...m(600, 45, 50, 20), fat: -1 }));
  assert.ok(!isValidTarget({ ...m(600, 45, 50, 20), fat: NaN }));
  assert.ok(!isValidTarget({ ...m(600, 45, 50, 20), fat: "20" }));
});
