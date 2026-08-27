import { test } from "node:test";
import assert from "node:assert/strict";
import { macrosFromFood } from "../lib/usda";
import type { SearchFood } from "../lib/usda";

const food = (nutrients: Record<string, number>, description = "Test"): SearchFood => ({
  description,
  foodNutrients: Object.entries(nutrients).map(([nutrientNumber, value]) => ({
    nutrientNumber,
    value,
  })),
});

test("the classic kcal row is used when it's there", () => {
  const m = macrosFromFood(
    food({ "208": 340, "203": 14, "205": 71, "204": 2.5 }),
  );
  assert.deepEqual(m, { calories: 340, protein: 14, carbs: 71, fat: 2.5 });
});

test("Atwater energy rows stand in when the kcal row is missing", () => {
  const m = macrosFromFood(food({ "957": 355, "203": 12, "205": 70, "204": 3 }));
  assert.equal(m?.calories, 355);
  const alt = macrosFromFood(food({ "958": 350, "203": 12 }));
  assert.equal(alt?.calories, 350);
});

test("208 wins over the Atwater rows when both are present", () => {
  const m = macrosFromFood(food({ "958": 999, "957": 888, "208": 340 }));
  assert.equal(m?.calories, 340);
});

/**
 * The real shape of "Farro, pearled, dry, raw" as FoodData Central returns it:
 * protein, carbs and fat, and no energy row of any kind. Discarding it would
 * leave a common grain permanently uncountable.
 */
test("a row with macros but no energy has its calories derived", () => {
  const m = macrosFromFood(
    food({ "203": 12.6, "205": 72.1, "204": 3.1 }, "Farro, pearled, dry, raw"),
  );
  // 12.6*4 + 72.1*4 + 3.1*9 = 366.7
  assert.ok(Math.abs(m!.calories - 366.7) < 0.01);
  assert.equal(m?.protein, 12.6);
  assert.equal(m?.carbs, 72.1);
  assert.equal(m?.fat, 3.1);
});

test("missing macros count as zero rather than blocking the row", () => {
  // Olive oil: energy and fat are reported, protein and carbs simply aren't.
  const m = macrosFromFood(food({ "208": 884, "204": 100 }));
  assert.deepEqual(m, { calories: 884, protein: 0, carbs: 0, fat: 100 });
});

test("a row with nothing usable is rejected outright", () => {
  assert.equal(macrosFromFood(food({})), null);
  assert.equal(macrosFromFood({ description: "Nothing" }), null);
  // Only nutrients we don't track — nothing to derive energy from.
  assert.equal(macrosFromFood(food({ "291": 4, "301": 120 })), null);
});

test("a non-numeric nutrient value is ignored, not coerced", () => {
  const broken: SearchFood = {
    foodNutrients: [
      { nutrientNumber: "208", value: undefined },
      { nutrientNumber: "203", value: 20 },
    ],
  };
  const m = macrosFromFood(broken);
  // Energy fell through to being derived from the one macro present.
  assert.equal(m?.calories, 80);
  assert.equal(m?.protein, 20);
});
