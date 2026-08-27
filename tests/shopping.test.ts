import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byAisle,
  consolidate,
  formatGrams,
  toPlainText,
} from "../lib/shopping";
import type { ShoppingSource } from "../lib/shopping";

const line = (text: string, grams: number | null, matchKey: string | null) => ({
  text,
  grams,
  matchKey,
});

const chickenDinner: ShoppingSource = {
  meal: "Chicken Alfredo",
  lines: [
    line("400 g chicken breast", 400, "chicken breast"),
    line("300 g fettuccine", 300, "fettuccine"),
    line("200 ml heavy cream", 200, "heavy cream"),
    line("2 sprigs of something unidentifiable", null, null),
  ],
};

const chickenLunch: ShoppingSource = {
  meal: "Chicken Salad",
  lines: [
    line("2 chicken breasts", 300, "chicken breast"),
    line("1 head lettuce", 300, "lettuce"),
  ],
};

/* ---------- Merging ---------- */

test("the same food across two meals becomes one line with a summed weight", () => {
  const list = consolidate([chickenDinner, chickenLunch]);
  const chicken = list.items.find((i) => i.id === "food:chicken breast")!;
  assert.equal(chicken.grams, 700);
  assert.deepEqual(chicken.meals, ["Chicken Alfredo", "Chicken Salad"]);
  assert.equal(chicken.lines.length, 2);
  assert.ok(chicken.merged);
});

test("a food that appears once is not marked as merged", () => {
  const list = consolidate([chickenDinner, chickenLunch]);
  assert.equal(list.items.find((i) => i.id === "food:lettuce")!.merged, false);
});

test("unidentified lines are never merged with each other", () => {
  const mystery = line("a mystery ingredient", null, null);
  const list = consolidate([
    { meal: "A", lines: [mystery] },
    { meal: "B", lines: [mystery] },
  ]);
  // Identical text, but nothing confirms they are the same thing.
  assert.equal(list.items.length, 2);
  assert.ok(list.items.every((i) => !i.merged));
});

test("an unidentified line keeps its original wording", () => {
  const list = consolidate([chickenDinner]);
  const unknown = list.items.find((i) => i.id.startsWith("line:"))!;
  assert.equal(unknown.label, "2 sprigs of something unidentifiable");
});

test("a merged item with any unknown weight reports no weight at all", () => {
  const list = consolidate([
    { meal: "A", lines: [line("500 g rice", 500, "rice")] },
    { meal: "B", lines: [line("rice, as needed", null, "rice")] },
  ]);
  const rice = list.items.find((i) => i.id === "food:rice")!;
  assert.equal(rice.grams, null);
  assert.equal(rice.price, null);
});

test("a line the user struck out isn't on the shopping list", () => {
  const list = consolidate([
    {
      meal: "A",
      lines: [
        line("400 g chicken breast", 400, "chicken breast"),
        { ...line("200 ml heavy cream", 200, "heavy cream"), excluded: true },
      ],
    },
  ]);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].id, "food:chicken breast");
});

test("seasonings stay on the list — you still have to own salt", () => {
  const list = consolidate([
    { meal: "A", lines: [line("Salt and pepper to taste", null, null)] },
  ]);
  assert.equal(list.items.length, 1);
});

test("cooking a recipe twice buys twice the ingredients", () => {
  const single = consolidate([chickenDinner]);
  const double = consolidate([{ ...chickenDinner, scale: 2 }]);
  const one = single.items.find((i) => i.id === "food:chicken breast")!;
  const two = double.items.find((i) => i.id === "food:chicken breast")!;
  assert.equal(two.grams, one.grams! * 2);
  assert.ok(Math.abs(two.price! - one.price! * 2) < 0.02);
});

/* ---------- Pricing ---------- */

test("the total is the sum of what could be priced", () => {
  const list = consolidate([chickenDinner, chickenLunch]);
  const summed = list.items.reduce((s, i) => s + (i.price ?? 0), 0);
  assert.ok(Math.abs(list.total! - summed) < 0.02);
});

test("items that can't be priced are counted, not guessed at", () => {
  const list = consolidate([chickenDinner]);
  assert.equal(list.unpriced, 1);
  assert.equal(list.items.find((i) => i.id.startsWith("line:"))!.price, null);
});

test("a list with nothing priceable reports no total rather than zero", () => {
  const list = consolidate([
    { meal: "A", lines: [line("something odd", null, null)] },
  ]);
  assert.equal(list.total, null);
});

test("merged items are priced on the combined weight", () => {
  const list = consolidate([chickenDinner, chickenLunch]);
  const chicken = list.items.find((i) => i.id === "food:chicken breast")!;
  // 700 g at $0.99/100g
  assert.ok(Math.abs(chicken.price! - 6.93) < 0.02);
});

/* ---------- Aisle ordering ---------- */

test("the list is ordered the way a store is walked", () => {
  const list = consolidate([chickenDinner, chickenLunch]);
  const aisles = byAisle(list.items).map(([aisle]) => aisle);
  assert.deepEqual(aisles, [
    "Produce",
    "Meat & Seafood",
    "Dairy & Eggs",
    "Bakery & Grains",
    "Other",
  ]);
});

test("every consolidated item lands in exactly one aisle", () => {
  const list = consolidate([chickenDinner, chickenLunch]);
  const grouped = byAisle(list.items).flatMap(([, items]) => items);
  assert.equal(grouped.length, list.items.length);
});

/* ---------- Formatting ---------- */

test("weights are shown in the unit a shopper reads", () => {
  assert.equal(formatGrams(450), "450 g");
  assert.equal(formatGrams(2000), "2 kg");
  assert.equal(formatGrams(1250), "1.3 kg");
  assert.equal(formatGrams(null), "as needed");
});

test("the exported text lists every item under its aisle", () => {
  const list = consolidate([chickenDinner, chickenLunch]);
  const text = toPlainText(list, {
    title: "Week 1",
    meals: ["Chicken Alfredo", "Chicken Salad"],
  });
  assert.ok(text.startsWith("Week 1"));
  assert.ok(text.includes("MEAT & SEAFOOD"));
  assert.ok(text.includes("Chicken breast — 700 g"));
  for (const item of list.items) {
    assert.ok(text.includes(item.label), `"${item.label}" missing from export`);
  }
});

test("the export says prices are estimates", () => {
  const text = toPlainText(consolidate([chickenDinner]));
  assert.ok(/national averages/.test(text));
});

test("an empty list exports without throwing", () => {
  const text = toPlainText(consolidate([]));
  assert.ok(text.length > 0);
});
