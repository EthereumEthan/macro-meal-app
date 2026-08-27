import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_LEVELS,
  GOALS,
  PRESETS,
  bmr,
  computeTargets,
  feetInchesToCm,
  lbToKg,
  tdee,
} from "../lib/tdee";
import type { BodyStats } from "../lib/tdee";

const MAN: BodyStats = {
  sex: "male",
  age: 30,
  weightKg: 80,
  heightCm: 180,
  activity: "moderate",
};

const WOMAN: BodyStats = {
  sex: "female",
  age: 30,
  weightKg: 65,
  heightCm: 165,
  activity: "moderate",
};

const near = (a: number, b: number, tol = 1) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

/* ---------- Mifflin-St Jeor ---------- */

test("resting rate matches the published equation", () => {
  // 10(80) + 6.25(180) - 5(30) + 5 = 1780
  near(bmr(MAN), 1780);
  // 10(65) + 6.25(165) - 5(30) - 161 = 1370.25
  near(bmr(WOMAN), 1370.25);
});

test("the male and female forms differ by exactly the published constant", () => {
  const asMale = bmr({ ...WOMAN, sex: "male" });
  near(asMale - bmr(WOMAN), 166);
});

test("maintenance scales the resting rate by the activity multiplier", () => {
  for (const level of ACTIVITY_LEVELS) {
    near(tdee({ ...MAN, activity: level.key }), 1780 * level.multiplier, 0.01);
  }
});

test("moving more never lowers maintenance", () => {
  const values = ACTIVITY_LEVELS.map((l) =>
    tdee({ ...MAN, activity: l.key }),
  );
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] > values[i - 1]);
  }
});

/* ---------- Goals ---------- */

test("each goal shifts calories by its stated share of maintenance", () => {
  const maintenance = tdee(MAN);
  for (const goal of GOALS) {
    const { daily } = computeTargets(MAN, goal.key, "balanced", 3);
    near(daily.calories, maintenance * (1 + goal.adjust), 1);
  }
});

test("a cut is below maintenance and a bulk is above it", () => {
  const cut = computeTargets(MAN, "cut", "balanced", 3).daily.calories;
  const hold = computeTargets(MAN, "maintain", "balanced", 3).daily.calories;
  const gain = computeTargets(MAN, "gain", "balanced", 3).daily.calories;
  assert.ok(cut < hold && hold < gain);
});

/* ---------- Splits ---------- */

test("macro grams add back up to the calorie target", () => {
  for (const preset of PRESETS) {
    for (const goal of GOALS) {
      const { daily } = computeTargets(MAN, goal.key, preset.key, 3);
      const fromMacros =
        daily.protein * 4 + daily.carbs * 4 + daily.fat * 9;
      near(fromMacros, daily.calories, 12);
    }
  }
});

test("keto puts carbs near zero and fat in charge", () => {
  const { daily } = computeTargets(MAN, "maintain", "keto", 3);
  assert.ok(daily.carbs * 4 < daily.calories * 0.1);
  assert.ok(daily.fat * 9 > daily.calories * 0.5);
});

test("the high-carb preset really is the carbiest", () => {
  const carbsFor = (preset: (typeof PRESETS)[number]["key"]) =>
    computeTargets(MAN, "maintain", preset, 3).daily.carbs;
  const all = PRESETS.map((p) => carbsFor(p.key));
  assert.equal(carbsFor("high-carb"), Math.max(...all));
  assert.equal(carbsFor("keto"), Math.min(...all));
});

/* ---------- The protein floor ---------- */

test("protein never falls below the preset's grams-per-kilo floor", () => {
  for (const preset of PRESETS) {
    for (const goal of GOALS) {
      const { daily } = computeTargets(MAN, goal.key, preset.key, 3);
      assert.ok(
        daily.protein >= preset.proteinFloorPerKg * MAN.weightKg - 1,
        `${preset.key}/${goal.key}: ${daily.protein}g is under the floor`,
      );
    }
  }
});

test("a hard cut on a heavy person is where the floor actually bites", () => {
  // A big deficit shrinks the percentage-derived protein below the floor.
  const heavy: BodyStats = { ...MAN, weightKg: 110, activity: "sedentary" };
  const result = computeTargets(heavy, "cut", "keto", 3);
  assert.ok(result.proteinFloorApplied);
  assert.ok(result.daily.protein >= 1.4 * 110 - 1);
});

test("raising protein to the floor still keeps keto keto", () => {
  const heavy: BodyStats = { ...MAN, weightKg: 110, activity: "sedentary" };
  const { daily } = computeTargets(heavy, "cut", "keto", 3);
  // Carbs come out of what's left in the split's own proportions, so the
  // near-zero carb share survives the adjustment.
  assert.ok(daily.carbs * 4 < daily.calories * 0.1);
});

test("the floor is not reported when the split already clears it", () => {
  const result = computeTargets(MAN, "gain", "high-protein", 3);
  assert.equal(result.proteinFloorApplied, false);
});

/* ---------- Per-meal division ---------- */

test("per-meal targets are the day split evenly", () => {
  const result = computeTargets(MAN, "maintain", "balanced", 4);
  near(result.perMeal.calories, result.daily.calories / 4, 1);
  near(result.perMeal.protein, result.daily.protein / 4, 1);
});

test("a nonsensical meal count is treated as one meal, not a division by zero", () => {
  for (const count of [0, -3, 0.2]) {
    const result = computeTargets(MAN, "maintain", "balanced", count);
    assert.ok(Number.isFinite(result.perMeal.calories));
    assert.ok(result.perMeal.calories > 0);
  }
});

test("every target is a whole number, since that's what the form takes", () => {
  const result = computeTargets(WOMAN, "cut", "high-protein", 3);
  for (const value of [
    ...Object.values(result.daily),
    ...Object.values(result.perMeal),
  ]) {
    assert.equal(value, Math.round(value));
  }
});

/* ---------- Units ---------- */

test("imperial input converts to the metric the equation wants", () => {
  near(lbToKg(176), 79.83, 0.01);
  near(feetInchesToCm(5, 11), 180.34, 0.01);
});

test("a 5'11\", 176 lb, 30-year-old man lands on the textbook figure", () => {
  const stats: BodyStats = {
    sex: "male",
    age: 30,
    weightKg: lbToKg(176),
    heightCm: feetInchesToCm(5, 11),
    activity: "sedentary",
  };
  // 10(79.83) + 6.25(180.34) - 5(30) + 5
  near(bmr(stats), 1780.4, 0.5);
});
